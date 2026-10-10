// INTENT: автоматические напоминания Kotrol (GSD kotrol-reminders-auto, план v6, GATE B 4/5 APPROVE).
// Обязанности: тик каждые 15 мин; due-напоминания за N дней до срока + repeat при молчании;
// claim-стейт-машина в reminder_log (partial unique, fencing по claim_token), SMTP вне транзакции.
// НЕ отвечает за: ручные напоминания (series/issues remind API), настройки UI (instance_config).
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { getSmtpConfig, sendMail, absoluteAppUrl } from "@/lib/email";

// ── Настройки (читаются каждый тик из instance_config, дефолты если нет) ──
export type ReminderSettings = {
  days_before: number;      // за сколько дней до срока
  repeat_hours: number;     // повтор при молчании (после due/repeat)
  send_hour_msk: number;    // час начала отправок МСК
  automatic_enabled: boolean;
};
const DEFAULTS: ReminderSettings = { days_before: 2, repeat_hours: 48, send_hour_msk: 9, automatic_enabled: false };

const TICK_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const CLAIM_STALE_MS = 30 * 60 * 1000;
const SMTP_TIMEOUT_MS = 30_000;
const BATCH_LIMIT = 15;
const TICK_BUDGET_MS = 45_000;
const LOCK_KEY = 771001; // kotrol_reminder_v1 (фиксированный int для advisory lock)
const MSK = "Europe/Moscow";

let timer: ReturnType<typeof setInterval> | null = null;
let running = false;

// ── прямое pg-соединение (single client) через postgres-протокол supabase service-role ──
async function withPg<T>(fn: (client: any) => Promise<T>): Promise<T> {
  // dynamic import чтобы не тащить в бандл edge
  const { Client } = await import("pg");
  const host = process.env.SUPABASE_DB_HOST || "daiko-minutia-supabase-db-1";
  const client = new Client({
    host, port: Number(process.env.SUPABASE_DB_PORT || 5432),
    database: process.env.POSTGRES_DB || "minutia",
    user: "postgres", password: process.env.POSTGRES_PASSWORD,
    connectionTimeoutMillis: 10_000, statement_timeout: 30_000, idle_in_transaction_session_timeout: 120_000,
  });
  await client.connect();
  try { return await fn(client); } finally { await client.end().catch(() => {}); }
}

function mskNow(): Date { return new Date(Date.now() + (3 * 60 + new Date().getTimezoneOffset()) * 60_000); }
function mskHour(d: Date): number { return d.getHours(); }
function mskDateStr(d: Date): string { return d.toISOString().slice(0, 10); }

async function loadSettings(admin: any): Promise<ReminderSettings> {
  const keys = ["reminder_days_before", "reminder_repeat_hours", "reminder_send_hour_msk", "reminder_automatic_enabled"];
  const { data } = await admin.from("instance_config").select("key, value").in("key", keys);
  const m = new Map((data ?? []).map((r: any) => [r.key, r.value]));
  const num = (k: string, d: number) => { const v = Number(m.get(k)); return Number.isFinite(v) && v > 0 ? v : d; };
  return {
    days_before: num("reminder_days_before", DEFAULTS.days_before),
    repeat_hours: num("reminder_repeat_hours", DEFAULTS.repeat_hours),
    send_hour_msk: Math.min(23, Math.max(0, num("reminder_send_hour_msk", DEFAULTS.send_hour_msk))),
    automatic_enabled: m.get("reminder_automatic_enabled") === true || m.get("reminder_automatic_enabled") === "true",
  };
}

type Claim = { id: string; issue_id: string; kind: "due" | "repeat"; recipient_email: string | null; attempts: number; claim_token: string; issue_title: string; owner_name: string | null };

export async function runReminderTick(nowOverride?: { hour?: number; date?: string }): Promise<{ due: number; repeat: number; skipped: number; failed: number }> {
  const out = { due: 0, repeat: 0, skipped: 0, failed: 0 };
  const admin = createServiceRoleClient();
  const st = await loadSettings(admin);
  if (!st.automatic_enabled) return out;
  const now = mskNow();
  const hour = nowOverride?.hour ?? mskHour(now);
  const today = nowOverride?.date ?? mskDateStr(now);
  if (hour < st.send_hour_msk) return out; // ночная защита

  await withPg(async (pg) => {
    // cleanup: зависший pending с attempts>=5 → failed_final
    await pg.query(
      "UPDATE reminder_log SET status='failed_final', updated_at=now() WHERE status='pending' AND attempts>=$1 AND updated_at < now() - interval '30 minutes'",
      [MAX_ATTEMPTS]
    );

    // xact-лок держится весь тик (claim → SMTP → REPEAT → COMMIT); при падении соединения транзакция откатывается
    await pg.query("BEGIN");
    const got = await pg.query("SELECT pg_try_advisory_xact_lock($1) AS ok", [LOCK_KEY]);
    if (!got.rows[0].ok) { await pg.query("ROLLBACK"); return; }

    const cutoff = new Date(Date.now() - CLAIM_STALE_MS).toISOString();
    // DUE-кандидаты: открытые поручения с due_date <= today+days_before, без записи для актуального значения срока
    const dueQ = `
      WITH cand AS (
        SELECT i.id, i.title, i.owner_name, i.owner_user_id, i.due_date
        FROM issues i
        WHERE i.status IN ('open','assigned','accepted','in_progress','pending','rework')
          AND i.due_date IS NOT NULL
          -- Phase 6b: TG-канал (notify_channel='tg') шлёт отдельный kotrol-tg бот; email их не дублирует
          AND NOT EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = i.owner_user_id AND p.notify_channel = 'tg'
          )
          AND EXISTS (
            SELECT 1 FROM reminder_matrix m
            WHERE m.status = i.status AND m.recipient = 'executor' AND m.enabled = true
          )
          -- Phase 2 v2 P1: пока ответственный отсутствует (people_directory.absent_until
          -- >= сегодня), его напоминания откладываются: кандидат не берётся в тик.
          AND NOT EXISTS (
            SELECT 1 FROM people_directory pd
            WHERE pd.full_name = i.owner_name
              AND pd.absent_until IS NOT NULL
              AND pd.absent_until >= (now() AT TIME ZONE $2)::date
          )
          AND i.due_date <= ((now() AT TIME ZONE $2)::date + make_interval(days => $3))
          AND NOT EXISTS (
            SELECT 1 FROM reminder_log rl
            WHERE rl.issue_id = i.id AND rl.kind = 'due'
              AND rl.due_date_value = i.due_date
              AND (rl.status IN ('sent','failed_final')
                OR (rl.status = 'pending' AND rl.updated_at >= now() - interval '30 minutes'))
          )
        ORDER BY i.due_date ASC LIMIT $1
      )
      INSERT INTO reminder_log (issue_id, kind, due_date_value, status, attempts, claim_token, updated_at)
      SELECT c.id, 'due', c.due_date, 'pending', 1, gen_random_uuid(), now() FROM cand c
      ON CONFLICT (issue_id, due_date_value) WHERE kind = 'due'
      DO UPDATE SET status='pending', attempts = reminder_log.attempts + 1,
             claim_token = gen_random_uuid(), updated_at = now()
      WHERE reminder_log.status = 'failed' AND reminder_log.attempts < $4 AND reminder_log.updated_at < $5
         OR (reminder_log.status = 'pending' AND reminder_log.attempts < $4 AND reminder_log.updated_at < $5)
      RETURNING id, issue_id, kind, attempts, claim_token`;
    // NOTE: NOT EXISTS выше уже исключает любые записи для актуального due_date, поэтому
    // конфликтная ветка UPSERT достижима только в гонке двух тиков — она безопасно пере-claim'ает.
    const dueClaims = (await pg.query(dueQ, [BATCH_LIMIT, MSK, st.days_before, MAX_ATTEMPTS, cutoff])).rows;

    // REPEAT-кандидаты: открытые, не принято, актуальный sent due-log, прошло repeat_hours
    const repQ = `
      WITH cand AS (
        SELECT i.id, i.title, i.owner_name, i.owner_user_id,
               COALESCE(
                 (SELECT MAX(rl2.sent_at) FROM reminder_log rl2 WHERE rl2.issue_id=i.id AND rl2.kind='repeat' AND rl2.status='sent'),
                 (SELECT MAX(rl1.sent_at) FROM reminder_log rl1 WHERE rl1.issue_id=i.id AND rl1.kind='due' AND rl1.status='sent' AND rl1.due_date_value=i.due_date)
               ) AS base_at
        FROM issues i
        WHERE i.status IN ('open','assigned','accepted','in_progress','pending','rework')
          AND i.accepted_at IS NULL
          AND NOT EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = i.owner_user_id AND p.notify_channel = 'tg'
          )
          AND EXISTS (
            SELECT 1 FROM reminder_matrix m
            WHERE m.status = i.status AND m.recipient = 'executor' AND m.enabled = true
          )
          -- Phase 2 v2 P1: отсутствующего ответственного не беспокоим повторами.
          AND NOT EXISTS (
            SELECT 1 FROM people_directory pd
            WHERE pd.full_name = i.owner_name
              AND pd.absent_until IS NOT NULL
              AND pd.absent_until >= (now() AT TIME ZONE $2)::date
          )
          AND EXISTS (SELECT 1 FROM reminder_log d WHERE d.issue_id=i.id AND d.kind='due' AND d.status='sent' AND d.due_date_value=i.due_date)
      ),
      elig AS (
        SELECT * FROM cand WHERE base_at IS NOT NULL
          AND (base_at AT TIME ZONE $2) + make_interval(hours => $3) <= (now() AT TIME ZONE $2)
          AND NOT EXISTS (SELECT 1 FROM reminder_log r WHERE r.issue_id=cand.id AND r.kind='repeat'
              AND r.send_date_msk = (now() AT TIME ZONE $2)::date
              AND (r.status IN ('sent','failed_final')
                OR (r.status = 'pending' AND r.updated_at >= now() - interval '30 minutes')))
        LIMIT $1
      )
      INSERT INTO reminder_log (issue_id, kind, due_date_value, recipient_email, status, attempts, claim_token, updated_at)
      SELECT e.id, 'repeat', NULL, NULL, 'pending', 1, gen_random_uuid(), now() FROM elig e
      ON CONFLICT (issue_id, send_date_msk) WHERE kind = 'repeat'
      DO UPDATE SET status='pending', attempts = reminder_log.attempts + 1,
             claim_token = gen_random_uuid(), updated_at = now()
      WHERE reminder_log.status = 'failed' AND reminder_log.attempts < $4 AND reminder_log.updated_at < $5
         OR (reminder_log.status = 'pending' AND reminder_log.attempts < $4 AND reminder_log.updated_at < $5)
      RETURNING id, issue_id, kind, attempts, claim_token`;
    const repClaims = (await pg.query(repQ, [BATCH_LIMIT, MSK, st.repeat_hours, MAX_ATTEMPTS, cutoff])).rows;
    // COMMIT перенесён в finally: лок держится на SMTP-отправку и REPEAT-этап (single-instance guard)

    // (лока держится до COMMIT в конце тика; при исключении соединение закроется → транзакция откатится автоматически)
    // email-резолв: справочник → user profile
    const claims: Claim[] = [];
    for (const row of [...dueClaims, ...repClaims]) {
      const { data: iss } = await admin.from("issues").select("title, owner_name, owner_user_id").eq("id", row.issue_id).single();
      let email: string | null = null;
      const oname = iss?.owner_name ?? null;
      if (iss?.owner_user_id) {
        const { data: prof } = await admin.from("profiles").select("email").eq("id", iss.owner_user_id).maybeSingle();
        email = prof?.email ?? null;
      }
      if (!email && oname) {
        const { data: dir } = await admin.from("people_directory").select("email").ilike("full_name", oname).limit(1);
        email = dir?.[0]?.email ?? null;
      }
      if (!email) {
        await pg.query("UPDATE reminder_log SET status='skipped_no_email', recipient_email=NULL, updated_at=now() WHERE id=$1 AND claim_token=$2", [row.id, row.claim_token]);
        out.skipped++;
        continue;
      }
      claims.push({ id: row.id, issue_id: row.issue_id, kind: row.kind, recipient_email: email, attempts: row.attempts, claim_token: row.claim_token, issue_title: iss?.title ?? "", owner_name: oname });
    }

    // отправка вне транзакции, бюджет тика, re-check актуальности
    const tickStart = Date.now();
    for (const c of claims) {
      if (Date.now() - tickStart > TICK_BUDGET_MS) break;
      try {
        // re-check: issue всё ещё открыт и срок не изменился
        const { data: iss } = await admin.from("issues").select("status, due_date").eq("id", c.issue_id).single();
        if (!iss || !["open", "assigned", "accepted", "in_progress", "pending", "rework"].includes(iss.status)) {
          await pg.query("UPDATE reminder_log SET status='skipped_cancelled', updated_at=now() WHERE id=$1 AND claim_token=$2", [c.id, c.claim_token]);
          continue;
        }
        const smtp = await getSmtpConfig();
        if (!smtp) throw new Error("SMTP не настроен");
        // Phase 6b: приглашение в TG (одноразовый код), если ещё не привязан и не отписывался
        let tgInvite = "";
        try {
          const { data: iu } = await admin.from("issues").select("owner_user_id").eq("id", c.issue_id).single();
          if (iu?.owner_user_id) {
            const { data: tu } = await admin.from("tg_users").select("unlinked_at, audit").eq("user_id", iu.owner_user_id).limit(1);
            const rec = tu?.[0];
            const optedOut = rec && rec.unlinked_at && JSON.stringify(rec.audit ?? {}).includes("unlink");
            if (!rec || (!rec.unlinked_at && !optedOut)) {
              const { randomBytes, createHash } = await import("node:crypto");
              const code = "KOT-" + randomBytes(6).toString("hex").toUpperCase();
              const hash = createHash("sha256").update(code).digest("hex");
              await pg.query("INSERT INTO tg_link_codes (code_hash, user_id, expires_at) VALUES ($1,$2, now() + interval '7 days')", [hash, iu.owner_user_id]);
              tgInvite = `\n\n— — —\nПолучать напоминания в Telegram: откройте @kotrol_tasks_bot и отправьте:\n/start ${code}\n(код действует 7 дней)`;
            }
          }
        } catch (e: any) { console.error("TG invite fail:", e?.message ?? e); }
        const bodyText = `Здравствуйте${c.owner_name ? ", " + c.owner_name : ""}!\n\n${c.kind === "due" ? "Приближается срок поручения" : "Напоминаем о поручении"}: «${c.issue_title}».\nПроверьте статус в системе: ${process.env.SITE_URL || "https://kotrol.alexkot.dev"}${tgInvite}\n\n— Kotrol`;
        await sendMail({
          to: c.recipient_email!,
          subject: `Напоминание: «${c.issue_title}»`,
          text: bodyText,
          html: `<p>${bodyText.replaceAll("\n", "<br/>")}</p>`,
        });
        await pg.query("UPDATE reminder_log SET status='sent', sent_at=now(), recipient_email=$1, updated_at=now() WHERE id=$2 AND claim_token=$3", [c.recipient_email, c.id, c.claim_token]);
        if (c.kind === "due") out.due++; else out.repeat++;
      } catch (e: any) {
        await pg.query("UPDATE reminder_log SET status='failed', error=$1, recipient_email=$2, updated_at=now() WHERE id=$3 AND claim_token=$4", [String(e?.message ?? e).slice(0, 500), c.recipient_email, c.id, c.claim_token]);
        out.failed++;
      }
    }
    await pg.query("COMMIT").catch(() => pg.query("ROLLBACK"));
  });
  return out;
}

// ── запуск из instrumentation.ts ──
export function startReminderScheduler() {
  if (timer) return;
  timer = setInterval(async () => {
    if (running) return;
    running = true;
    try { await runReminderTick(); }
    catch (e) { console.error("[reminders] tick failed:", e); }
    finally { running = false; }
  }, TICK_MS);
  timer.unref?.();
  console.log("[reminders] scheduler started (15m)");
}
