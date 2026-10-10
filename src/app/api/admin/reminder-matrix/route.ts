import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/supabase/admin-auth";
import { rejectCrossOrigin } from "@/lib/request-origin";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

// Phase 6b: UI матрицы напоминаний для админа (Инны).
// GET  — вся матрица + счётчик привязанных TG-пользователей.
// PUT  — правка строки (remind_before_days / repeat_hours / enabled).

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("reminder_matrix")
    .select("id, status, recipient, remind_before_days, repeat_hours, enabled, preset_id")
    .order("status");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // сводка TG-канала для той же страницы настроек
  const { count: tgLinked } = await supabase
    .from("tg_users")
    .select("user_id", { count: "exact", head: true })
    .is("unlinked_at", null);

  return NextResponse.json({
    matrix: data ?? [],
    tg: { linked: tgLinked ?? 0 },
  });
}

export async function PUT(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const originErr = rejectCrossOrigin(request);
  if (originErr) return originErr;

  let body: {
    id?: string;
    remind_before_days?: number | null;
    repeat_hours?: number | null;
    enabled?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};
  if (body.remind_before_days !== undefined) {
    if (body.remind_before_days !== null && (body.remind_before_days < 0 || body.remind_before_days > 30)) {
      return NextResponse.json({ error: "remind_before_days must be 0..30" }, { status: 400 });
    }
    patch.remind_before_days = body.remind_before_days;
  }
  if (body.repeat_hours !== undefined) {
    if (body.repeat_hours !== null && (body.repeat_hours < 1 || body.repeat_hours > 720)) {
      return NextResponse.json({ error: "repeat_hours must be 1..720" }, { status: 400 });
    }
    patch.repeat_hours = body.repeat_hours;
  }
  if (body.enabled !== undefined) patch.enabled = body.enabled;
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "nothing to update" }, { status: 400 });
  }

  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("reminder_matrix")
    .update(patch)
    .eq("id", body.id)
    .select("id, status, recipient, remind_before_days, repeat_hours, enabled")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ row: data });
}
