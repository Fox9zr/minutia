// INTENT: Kotrol TG-бот (Phase 6b, план v8). Long polling, inbox-стейт-машина,
// привязка по одноразовому коду, кнопки через tg_callback_refs (callback_data = a<seq>),
// FSM (force_reply, таймаут 15 мин), доставка at-least-once с unknown-статусом.
// Запуск: node scripts/tg-bot.mjs (env: TG_BOT_TOKEN, POSTGRES_PASSWORD, ...)
import { Client } from "pg";

const TG_TOKEN = process.env.TG_BOT_TOKEN;
const API = `https://api.telegram.org/bot${TG_TOKEN}`;
const POLL_TIMEOUT_S = 25;
const FSM_TIMEOUT_MS = 15 * 60 * 1000;
const MAX_SEND_ATTEMPTS = 3;
const ACK_MAX = 5;
const CLEANUP_INTERVAL_MS = 30 * 60 * 1000;

if (!TG_TOKEN) { console.error("TG_BOT_TOKEN missing"); process.exit(1); }

const pgCfg = {
  host: process.env.SUPABASE_DB_HOST || "daiko-minutia-supabase-db-1",
  port: Number(process.env.SUPABASE_DB_PORT || 5432),
  database: process.env.POSTGRES_DB || "minutia",
  user: "postgres", password: process.env.POSTGRES_PASSWORD,
};

async function tg(method, params) {
  const res = await fetch(`${API}/${method}`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params), signal: AbortSignal.timeout(30_000),
  });
  const j = await res.json().catch(() => ({}));
  if (!j.ok) { const e = new Error(`TG ${method}: ${j.error_code} ${j.description}`); e.tg_error = j.error_code; throw e; }
  return j.result;
}

// ── offset state (durable, из непрерывного префикса tg_update_log) ──
async function loadOffset(pg) {
  // max update_id такой, что все <= него записаны (записываем последовательно, так что это просто max)
  const { rows } = await pg.query("SELECT COALESCE(MAX(update_id),0) AS m FROM tg_update_log");
  return Number(rows[0].m);
}

async function persistUpdate(pg, u) {
  const r = await pg.query(
    "INSERT INTO tg_update_log (update_id, tg_payload, status) VALUES ($1,$2,'received') ON CONFLICT (update_id) DO NOTHING RETURNING update_id",
    [u.update_id, JSON.stringify(u)]
  );
  return r.rowCount > 0;
}

async function claimUpdate(pg, updateId) {
  const { rows } = await pg.query(
    `UPDATE tg_update_log SET status='processing', fencing_token=gen_random_uuid(), claimed_at=now(), attempts=attempts+1
     WHERE update_id=$1 AND (status='received' OR (status='processing' AND claimed_at < now() - interval '10 minutes'))
     RETURNING fencing_token`,
    [updateId]
  );
  return rows[0]?.fencing_token || null;
}

async function finishUpdate(pg, updateId, token, status, error = null) {
  const r = await pg.query(
    "UPDATE tg_update_log SET status=$3, error=$4, fencing_token=NULL WHERE update_id=$1 AND fencing_token=$2",
    [updateId, token, status, error]
  );
  return r.rowCount > 0; // false => lease перехвачен, caller должен откатиться
}

async function ackLater(pg, updateId, kind, payload) {
  await pg.query(
    "INSERT INTO tg_ack_pending (update_id, kind, payload) VALUES ($1,$2,$3) ON CONFLICT (update_id) DO NOTHING",
    [updateId, kind, JSON.stringify(payload)]
  );
}

// ── привязка ──
async function activeLink(pg, tgUserId) {
  const { rows } = await pg.query(
    "SELECT user_id, tg_chat_id FROM tg_users WHERE tg_user_id=$1 AND unlinked_at IS NULL", [tgUserId]
  );
  return rows[0] || null;
}

async function handleStart(pg, msg) {
  const chatId = msg.chat.id;
  if (msg.chat.type !== "private") return;
  const code = (msg.text || "").split(" ")[1];
  if (!code) {
    await tg("sendMessage", { chat_id: chatId, text: "Kotrol: пришлите код привязки из письма (вид: /start ABCD-...). Отвязка: /stop" });
    return;
  }
  const { createHash } = await import("node:crypto");
  const hash = createHash("sha256").update(code.trim()).digest("hex");
  await pg.query("BEGIN"); // post-deploy fix: код гасится в ТОЙ ЖЕ транзакции, что и привязка
  const { rows } = await pg.query(
    `UPDATE tg_link_codes SET used_at=now()
     WHERE code_hash=$1 AND used_at IS NULL AND expires_at > now()
     RETURNING user_id`,
    [hash]
  );
  if (rows.length === 0) {
    await pg.query("ROLLBACK");
    await tg("sendMessage", { chat_id: chatId, text: "Код недействителен или уже использован. Запросите новое письмо." });
    return;
  }
  const userId = rows[0].user_id;
  try {
    await pg.query(
      `INSERT INTO tg_users (user_id, tg_user_id, tg_chat_id, tg_username, linked_at, audit)
       VALUES ($1,$2,$3,$4,now(),$5)
       ON CONFLICT (user_id) DO UPDATE SET tg_user_id=$2, tg_chat_id=$3, tg_username=$4, linked_at=now(), unlinked_at=NULL,
         audit = tg_users.audit || $5::jsonb`,
      [userId, msg.from.id, chatId, msg.from.username || null, JSON.stringify([{ ev: "link", at: new Date().toISOString() }])]
    );
    await pg.query("UPDATE profiles SET notify_channel='tg' WHERE id=$1 AND notify_channel='email'", [userId]);
    await pg.query("COMMIT");
  } catch (e) { await pg.query("ROLLBACK"); throw e; }
  await tg("sendMessage", { chat_id: chatId, text: "✅ Привязано. Уведомления по поручениям будут приходить сюда.\nМои задачи: /tasks • Отвязка: /stop (мгновенно, вернёт email-рассылку)" });
}

async function handleStop(pg, msg) {
  const link = await activeLink(pg, msg.from.id);
  if (!link) { await tg("sendMessage", { chat_id: msg.chat.id, text: "Аккаунт не привязан." }); return; }
  await pg.query("BEGIN");
  try {
    await pg.query(
      `UPDATE tg_users SET unlinked_at=now(), audit = audit || $2::jsonb WHERE user_id=$1 AND unlinked_at IS NULL`,
      [link.user_id, JSON.stringify([{ ev: "unlink_self", at: new Date().toISOString() }])]
    );
    // критично (r10-gemini): каскад — иначе чёрная дыра уведомлений
    await pg.query("UPDATE profiles SET notify_channel='email' WHERE id=$1", [link.user_id]);
    await pg.query("COMMIT");
  } catch (e) { await pg.query("ROLLBACK"); throw e; }
  await tg("sendMessage", { chat_id: msg.chat.id, text: "✅ Отвязано. Уведомления вернутся на email." });
}

// ── кнопки ──
const BUTTONS = {
  assigned: [["✅ Принято, срок верный", "a:accept"], ["✏️ Предложить корректировку", "a:propose"]],
  accepted: [["🛠 В работу", "a:start"], ["✏️ Скорректировать", "a:propose"]],
  in_progress: [["✔️ Решено", "a:resolve"], ["⏸ В ожидании", "a:pending"]],
  rework: [["🛠 В работу", "a:start"], ["✔️ Решено", "a:resolve"]],
};

async function issueKeyboard(pg, issueId, status, chatId, userId) {
  const labels = BUTTONS[status] || [];
  const btns = [];
  for (const [label, action] of labels) {
    const { rows } = await pg.query(
      "INSERT INTO tg_callback_refs (issue_id, action, chat_id, user_id, expires_at) VALUES ($1,$2,$3,$4, now() + interval '30 days') RETURNING seq",
      [issueId, action.replace("a:", ""), chatId, userId]
    );
    btns.push([{ text: label, callback_data: "a" + rows[0].seq }]);
  }
  return { inline_keyboard: btns };
}

function btns(list) { return list.map(([text, cb]) => [{ text, callback_data: cb }]).filter(Boolean) && list.map(x=>[x]); }

async function handleTasks(pg, msg) {
  const link = await activeLink(pg, msg.from.id);
  if (!link) { await tg("sendMessage", { chat_id: msg.chat.id, text: "Сначала привяжите аккаунт: /start <код из письма>." }); return; }
  const { rows } = await pg.query(
    `SELECT i.id, i.issue_number, i.title, i.status, i.due_date, s.tg_allowed
     FROM issues i JOIN meeting_series s ON s.id = i.series_id
     WHERE i.owner_user_id=$1 AND i.status IN ('assigned','accepted','in_progress','rework')
     ORDER BY i.due_date ASC NULLS LAST LIMIT 10`,
    [link.user_id]
  );
  if (rows.length === 0) { await tg("sendMessage", { chat_id: msg.chat.id, text: "Активных поручений нет 🎉" }); return; }
  for (const it of rows) {
    if (!it.tg_allowed) continue; // sensitive-серия без opt-in — кнопок не даём (v1: показываем только список)
    const kb = await issueKeyboard(pg, it.id, it.status, msg.chat.id, link.user_id);
    await tg("sendMessage", {
      chat_id: msg.chat.id,
      text: `#${it.issue_number ?? ""} ${it.title}\nСтатус: ${it.status}${it.due_date ? `\nСрок: ${it.due_date.toISOString().slice(0,10)}` : ""}`,
      reply_markup: kb,
    });
  }
}

// ── callback ──
async function handleCallback(pg, cq) {
  await tg("answerCallbackQuery", { callback_query_id: cq.id }).catch(() => {}); // ранний ack (снятие спиннера)
  const link = await activeLink(pg, cq.from.id);
  if (!link) { await tg("sendMessage", { chat_id: cq.message.chat.id, text: "⚠️ Нет доступа. Привяжите аккаунт: /start <код>" }); return; }
  const seq = Number(String(cq.data || "").replace(/^a/, ""));
  if (!Number.isFinite(seq)) return;
  const { rows } = await pg.query(
    `SELECT r.*, i.status AS issue_status, i.owner_user_id
     FROM tg_callback_refs r JOIN issues i ON i.id = r.issue_id
     WHERE r.seq=$1 AND r.used_at IS NULL AND r.expires_at > now()`,
    [seq]
  );
  const ref = rows[0];
  if (!ref) {
    await tg("sendMessage", { chat_id: cq.message.chat.id, text: "⚠️ Статус уже изменён или кнопка устарела. /tasks — актуальный список." });
    return;
  }
  if (ref.chat_id && String(ref.chat_id) !== String(cq.message.chat.id)) return; // пересланная кнопка (text vs number!)
  if (ref.user_id && ref.user_id !== link.user_id) return; // чужая кнопка (post-deploy fix)
  if (ref.owner_user_id !== link.user_id) {
    await tg("sendMessage", { chat_id: cq.message.chat.id, text: "⚠️ Нет доступа к этой задаче." });
    return;
  }

  const action = ref.action;
  if (action === "resolve") {
    // FSM: запросить артефакт
    const prompt = await tg("sendMessage", {
      chat_id: cq.message.chat.id,
      text: `Задача #${ref.issue_id.slice(0,8)}: пришлите ссылку на результат или комментарий для Вероники (ответьте РЕПЛАЕМ на это сообщение). /cancel — отмена. Таймаут 15 мин.`,
      reply_markup: { force_reply: true, selective: true },
    });
    await pg.query(
      `INSERT INTO tg_fsm (chat_id, state, expires_at) VALUES ($1,$2, now() + interval '15 minutes')
       ON CONFLICT (chat_id) DO UPDATE SET state=$2, expires_at=now() + interval '15 minutes'`,
      [cq.message.chat.id, JSON.stringify({ issue_id: ref.issue_id, kind: "resolve", prompt_message_id: prompt.message_id })]
    );
    await pg.query("UPDATE tg_callback_refs SET used_at=now() WHERE seq=$1", [seq]);
    await tg("editMessageText", { chat_id: cq.message.chat.id, message_id: cq.message.message_id, text: "⏳ Ожидаю артефакт…" }).catch(() => {});
    return;
  }

  // прямые переходы
  const map = { accept: "accepted", start: "in_progress", pending: "pending", propose: null };
  if (action === "propose") {
    const prompt = await tg("sendMessage", {
      chat_id: cq.message.chat.id,
      text: `Предложите новый срок для задачи (ответьте РЕПЛАЕМ, формат: ДД.ММ.ГГГГ + комментарий). /cancel — отмена.`,
      reply_markup: { force_reply: true, selective: true },
    });
    await pg.query(
      `INSERT INTO tg_fsm (chat_id, state, expires_at) VALUES ($1,$2, now() + interval '15 minutes')
       ON CONFLICT (chat_id) DO UPDATE SET state=$2, expires_at=now() + interval '15 minutes'`,
      [cq.message.chat.id, JSON.stringify({ issue_id: ref.issue_id, kind: "propose", prompt_message_id: prompt.message_id })]
    );
    await pg.query("UPDATE tg_callback_refs SET used_at=now() WHERE seq=$1", [seq]);
    return;
  }

  const newStatus = map[action];
  if (!newStatus) return;
  const { rowCount } = await pg.query(
    "UPDATE issues SET status=$2, updated_at=now() WHERE id=$1 AND status=$3",
    [ref.issue_id, newStatus, ref.issue_status]
  ); // CAS: 0 => статус уже менялся
  if (rowCount === 0) {
    await tg("sendMessage", { chat_id: cq.message.chat.id, text: "⚠️ Статус уже изменён." });
  } else {
    await pg.query("INSERT INTO task_events (issue_id, event, actor, payload) VALUES ($1,'status_changed','tg-bot',$2)",
      [ref.issue_id, JSON.stringify({ to: newStatus })]);
    await tg("editMessageText", { chat_id: cq.message.chat.id, message_id: cq.message.message_id, text: `✓ ${newStatus} ${new Date().toISOString().slice(11,16)}` }).catch(() => {});
  }
  await pg.query("UPDATE tg_callback_refs SET used_at=now() WHERE seq=$1", [seq]);
}

// ── FSM-ответ (message, reply на prompt) ──
async function handleFsmReply(pg, msg) {
  const { rows } = await pg.query("SELECT state, expires_at FROM tg_fsm WHERE chat_id=$1", [msg.chat.id]);
  const fsm = rows[0];
  if (!fsm || new Date(fsm.expires_at).getTime() < Date.now()) {
    await pg.query("DELETE FROM tg_fsm WHERE chat_id=$1 AND expires_at < now()", [msg.chat.id]);
    return false;
  }
  const st = fsm.state;
  if (!msg.reply_to_message || msg.reply_to_message.message_id !== st.prompt_message_id) {
    await tg("sendMessage", { chat_id: msg.chat.id, text: "⚠️ Ответьте реплаем на сообщение-запрос бота. /tasks — список задач." });
    return true;
  }
  const text = (msg.text || "").slice(0, 2000);
  if (st.kind === "resolve") {
    const { data: cfg } = await pg.query("SELECT value FROM instance_config WHERE key='review_sla_hours' LIMIT 1").catch(() => ({ rows: [] }));
    const sla = 48;
    const deadline = new Date(Date.now() + sla * 3600000).toISOString();
    const { rowCount } = await pg.query(
      "UPDATE issues SET status='under_review', review_deadline=$2, updated_at=now() WHERE id=$1 AND status IN ('in_progress','rework')",
      [st.issue_id, deadline]
    );
    if (rowCount) {
      await pg.query("INSERT INTO task_events (issue_id, event, actor, payload) VALUES ($1,'status_changed','tg-bot',$2)",
        [st.issue_id, JSON.stringify({ to: "under_review", artifact: text })]);
    }
    await tg("sendMessage", { chat_id: msg.chat.id, text: rowCount ? "✅ Передано на проверку Веронике. Материал приложен." : "⚠️ Статус уже изменён." });
  } else if (st.kind === "propose") {
    await pg.query("UPDATE issues SET proposed_note=$2 WHERE id=$1", [st.issue_id, text]).catch(() => {});
    await tg("sendMessage", { chat_id: msg.chat.id, text: "✅ Предложение отправлено Инне на подтверждение." });
  }
  await pg.query("DELETE FROM tg_fsm WHERE chat_id=$1", [msg.chat.id]);
  return true;
}

async function tgReminderTick(pg) {
  // 1. Наполнение очереди: due_pre + repeat по матрице (только tg-юзеры, tg_allowed серии)
  await pg.query(`
    INSERT INTO tg_reminder_queue (issue_id, recipient_user_id, kind, scheduled_for, status)
    SELECT DISTINCT i.id, i.owner_user_id, 'due_pre', ((now() AT TIME ZONE 'Europe/Moscow')::date), 'scheduled'
    FROM issues i
    JOIN reminder_matrix m ON m.status = i.status AND m.recipient = 'executor' AND m.enabled = true
    JOIN meeting_series s ON s.id = i.series_id AND s.tg_allowed = true
    JOIN profiles p ON p.id = i.owner_user_id AND p.notify_channel = 'tg'
    JOIN tg_users tu ON tu.user_id = i.owner_user_id AND tu.unlinked_at IS NULL
    WHERE i.status IN ('open','assigned','accepted','rework')
      AND i.due_date IS NOT NULL
      AND i.due_date <= ((now() AT TIME ZONE 'Europe/Moscow')::date + make_interval(days => COALESCE(m.remind_before_days, 2)))
      AND NOT EXISTS (SELECT 1 FROM reminder_log rl WHERE rl.issue_id=i.id AND rl.channel='tg' AND rl.kind='due' AND rl.due_date_value=i.due_date AND rl.status='sent')
    ON CONFLICT DO NOTHING`);
  // 2. Отправка: claim по одному, линеаризация 'sending' → вызов → финал
  for (let n = 0; n < 10; n++) {
    const { rows } = await pg.query(`
      UPDATE tg_reminder_queue SET status='sending', fencing_token=gen_random_uuid(), updated_at=now(), attempts=attempts+1
      WHERE id = (SELECT id FROM tg_reminder_queue WHERE status='scheduled' AND scheduled_for <= CURRENT_DATE ORDER BY scheduled_for LIMIT 1 FOR UPDATE SKIP LOCKED)
      RETURNING id, issue_id, recipient_user_id, kind, fencing_token`);
    if (rows.length === 0) break;
    const q = rows[0];
    let ok = false, permanent = false;
    try {
      const { rows: iss } = await pg.query(
        `SELECT i.title, i.issue_number, i.due_date, i.status, tu.tg_chat_id
         FROM issues i JOIN tg_users tu ON tu.user_id = i.owner_user_id AND tu.unlinked_at IS NULL
         WHERE i.id = $1`, [q.issue_id]);
      if (iss[0] && iss[0].tg_chat_id) {
        await tg("sendMessage", { chat_id: iss[0].tg_chat_id, text: `⏰ Напоминание [Kotrol]\n#${iss[0].issue_number} ${iss[0].title}\nСрок: ${(iss[0].due_date ? new Date(iss[0].due_date).toISOString().slice(0,10) : '—')}\nЗадачи: /tasks` });
        ok = true;
      } else permanent = true;
    } catch (e) { if (e.tg_error === 403 || e.tg_error === 400) { permanent = true;
      // каскад (r10-gemini): авто-отвязка + возврат на email, иначе чёрная дыра
      await pg.query("UPDATE tg_users SET unlinked_at=now() WHERE tg_user_id IS NOT NULL AND user_id=$1 AND unlinked_at IS NULL", [q.recipient_user_id]);
      await pg.query("UPDATE profiles SET notify_channel='email' WHERE id=$1", [q.recipient_user_id]);
    } }
    await pg.query("UPDATE tg_reminder_queue SET status=$2, updated_at=now() WHERE id=$1 AND fencing_token=$3",
      [q.id, ok ? 'sent' : (permanent ? 'failed' : 'scheduled'), q.fencing_token]);
    if (ok) await pg.query(
      `INSERT INTO reminder_log (issue_id, channel, kind, due_date_value, status, attempts, claim_token, sent_at, updated_at)
       VALUES ($1,'tg','due',(SELECT due_date FROM issues WHERE id=$1),'sent',1,gen_random_uuid(),now(),now())
       ON CONFLICT DO NOTHING`, [q.issue_id]);
  }
}

// ── основной цикл ──
async function processUpdate(pg, u) {
  const fresh = await persistUpdate(pg, u);
  const cq = u.callback_query;
  if (cq) await tg("answerCallbackQuery", { callback_query_id: cq.id }).catch(() => {});
  if (!fresh) return; // дубль апдейта — ack уже отправили

  const token = await claimUpdate(pg, u.update_id);
  if (!token) return; // чужой lease

  let result = "done", err = null;
  try {
    if (u.message) {
      const m = u.message;
      if (m.chat.type !== "private") { result = "done"; }
      else if (m.text?.startsWith("/start")) await handleStart(pg, m);
      else if (m.text?.startsWith("/stop")) await handleStop(pg, m);
      else if (m.text?.startsWith("/tasks")) await handleTasks(pg, m);
      else if (m.text?.startsWith("/cancel")) { await pg.query("DELETE FROM tg_fsm WHERE chat_id=$1", [m.chat.id]); await tg("sendMessage", { chat_id: m.chat.id, text: "Отменено." }); }
      else if (await handleFsmReply(pg, m)) { /* обработано FSM */ }
      else await tg("sendMessage", { chat_id: m.chat.id, text: "Команды: /tasks — мои поручения. Привязка: /start <код>. Отвязка: /stop." });
    } else if (cq) {
      await handleCallback(pg, cq);
    }
  } catch (e) { result = "failed"; err = String(e).slice(0, 500); console.error("update fail", e); }
  const ok = await finishUpdate(pg, u.update_id, token, result, err);
  if (!ok) console.warn("fencing: lease перехвачен, update", u.update_id);
}

async function ackRetryLoop(pg) {
  const { rows } = await pg.query("SELECT * FROM tg_ack_pending WHERE attempts < $1 LIMIT 10", [ACK_MAX]);
  for (const a of rows) {
    try {
      const p = a.payload;
      if (a.kind === "edit") await tg("editMessageText", p);
      await pg.query("DELETE FROM tg_ack_pending WHERE update_id=$1", [a.update_id]);
    } catch (e) {
      await pg.query("UPDATE tg_ack_pending SET attempts=attempts+1 WHERE update_id=$1", [a.update_id]);
    }
  }
}

async function cleanupLoop(pg) {
  await pg.query("DELETE FROM tg_link_codes WHERE expires_at < now() - interval '7 days'");
  await pg.query("DELETE FROM tg_fsm WHERE expires_at < now()");
  await pg.query("DELETE FROM tg_callback_refs WHERE expires_at < now() - interval '7 days'");
  await pg.query("DELETE FROM tg_update_log WHERE status IN ('done','failed') AND claimed_at < now() - interval '7 days'");
}

async function main() {
  const pg = new Client({ ...pgCfg });
  await pg.connect();
  let offset = await loadOffset(pg);
  console.log("[kotrol-tg] started, offset =", offset);

  setInterval(() => ackRetryLoop(pg).catch(e => console.error("ack", e)), 30_000);
  setInterval(() => cleanupLoop(pg).catch(e => console.error("cleanup", e)), CLEANUP_INTERVAL_MS);
  setInterval(() => tgReminderTick(pg).catch(e => console.error("tg-tick", e)), 15 * 60 * 1000);
  tgReminderTick(pg).catch(e => console.error("tg-tick init", e));

  while (true) {
    try {
      const updates = await tg("getUpdates", { offset: offset + 1, timeout: POLL_TIMEOUT_S, allowed_updates: ["message", "callback_query"] });
      for (const u of updates) {
        await processUpdate(pg, u); // последовательная обработка = непрерывный префикс
        offset = Math.max(offset, u.update_id); // сдвигаем ТОЛЬКО после успешной записи в БД (post-deploy fix)
      }
    } catch (e) {
      console.error("poll error", e.message);
      await new Promise(r => setTimeout(r, 3000));
    }
  }
}

main().catch(e => { console.error("fatal", e); process.exit(1); });
