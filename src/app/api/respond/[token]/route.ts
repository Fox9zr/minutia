import { NextResponse, type NextRequest } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { createClient } from "@/lib/supabase/server";

// INTENT: accept an issue via emailed token (no login). Public by design.
// GET  /api/respond/[token]        → issue preview (no sensitive data)
// POST /api/respond/[token] {action:"accept"}  → accepted_at = now
// POST /api/respond/[token] {action:"propose", due_date, note} → proposed_due_date/note

const TOKEN_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function loadToken(token: string) {
  const admin = createServiceRoleClient();
  const { data: row } = await admin
    .from("issue_response_tokens")
    .select("id, issue_id, expires_at, used_at")
    .eq("token", token)
    .maybeSingle();
  if (!row) return { error: "Ссылка недействительна", status: 404 as const };
  if (row.expires_at && new Date(row.expires_at).getTime() < Date.now())
    return { error: "Срок действия ссылки истёк", status: 410 as const };
  return { row, admin };
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  if (!TOKEN_RE.test(token)) return NextResponse.json({ error: "Некорректная ссылка" }, { status: 400 });

  const res = await loadToken(token);
  if ("error" in res) return NextResponse.json({ error: res.error }, { status: res.status });

  const { data: issue } = await res.admin
    .from("issues")
    .select("issue_number, title, owner_name, status, priority, due_date, accepted_at, proposed_due_date")
    .eq("id", res.row.issue_id)
    .single();
  if (!issue) return NextResponse.json({ error: "Поручение не найдено" }, { status: 404 });

  return NextResponse.json({ issue, alreadyUsed: !!res.row.used_at });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  if (!TOKEN_RE.test(token)) return NextResponse.json({ error: "Некорректная ссылка" }, { status: 400 });

  const res = await loadToken(token);
  if ("error" in res) return NextResponse.json({ error: res.error }, { status: res.status });
  const { admin, row } = res;

  const body = await request.json().catch(() => ({}));
  const action = body?.action;

  if (action === "accept") {
    const nowIso = new Date().toISOString();
    const { error } = await admin
      .from("issues")
      .update({ accepted_at: nowIso, status: "accepted" })
      .eq("id", row.issue_id);
    if (error) return NextResponse.json({ error: "Не удалось зафиксировать" }, { status: 500 });
    await admin.from("task_events").insert({
      issue_id: row.issue_id,
      event: "accepted",
      actor: "respond-link",
      payload: { to: "accepted" },
    });
    await admin.from("issue_response_tokens").update({ used_at: new Date().toISOString() }).eq("id", row.id);
    return NextResponse.json({ ok: true, message: "Принято зафиксировано. Спасибо!" });
  }

if (action === "resolve") {
    // status goes to "under_review", review_deadline = now + 48h
    // if body.note exists, log it as an artifact in task_events or issue note
    const { data: st } = await admin.from("instance_config").select("value").eq("key", "review_sla_hours").maybeSingle();
    const slaHours = parseInt(st?.value || "48", 10);
    const deadline = new Date(Date.now() + slaHours * 3600000).toISOString();
    
    const note = body?.note || null;
    const { error } = await admin
      .from("issues")
      .update({ status: "under_review", review_deadline: deadline })
      .eq("id", row.issue_id);
    if (error) return NextResponse.json({ error: "Не удалось зафиксировать" }, { status: 500 });
    
    await admin.from("task_events").insert({
      issue_id: row.issue_id,
      event: "status_changed",
      actor: "respond-link",
      payload: { to: "under_review", note },
    });
    // We don't mark token used so they can click other links? Actually, yes we do mark it used.
    await admin.from("issue_response_tokens").update({ used_at: new Date().toISOString() }).eq("id", row.id);
    return NextResponse.json({ ok: true, message: "Переведено на проверку." });
  }

  if (action === "rework") {
    const note = body?.note || null;
    const { error } = await admin
      .from("issues")
      .update({ status: "rework" }) // "rework" is added in enum
      .eq("id", row.issue_id);
    if (error) return NextResponse.json({ error: "Не удалось зафиксировать" }, { status: 500 });
    
    await admin.from("task_events").insert({
      issue_id: row.issue_id,
      event: "status_changed",
      actor: "respond-link",
      payload: { to: "rework", note },
    });
    await admin.from("issue_response_tokens").update({ used_at: new Date().toISOString() }).eq("id", row.id);
    return NextResponse.json({ ok: true, message: "Возвращено на доработку." });
  }

  if (action === "propose") {
    const due = body?.due_date;
    const note = typeof body?.note === "string" ? body.note.slice(0, 500) : "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(due ?? "")))
      return NextResponse.json({ error: "Укажите дату в формате ГГГГ-ММ-ДД" }, { status: 400 });
    const { error } = await admin
      .from("issues")
      .update({ proposed_due_date: due, proposed_note: note || null })
      .eq("id", row.issue_id);
    if (error) return NextResponse.json({ error: "Не удалось сохранить предложение" }, { status: 500 });
    await admin.from("task_events").insert({
      issue_id: row.issue_id,
      event: "due_proposed",
      actor: "respond-link",
      payload: { due, note },
    });
    await admin.from("issue_response_tokens").update({ used_at: new Date().toISOString() }).eq("id", row.id);
    return NextResponse.json({ ok: true, message: "Предложение отправлено. Ответственный за серию увидит его в карточке поручения." });
  }

  return NextResponse.json({ error: "Неизвестное действие" }, { status: 400 });
}

