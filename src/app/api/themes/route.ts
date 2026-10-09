import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// ---------------------------------------------------------------------------
// Управляемый справочник тем (theme_catalog) — API.
//   GET  /api/themes        — все темы (включая неактивные) для управления
//   POST /api/themes        — добавить тему (group_name, topic_name)
// Права записи зеркалят RLS theme_catalog_write: глобальный админ ИЛИ
// управляющий хотя бы одной серией (owner/facilitator).
// ---------------------------------------------------------------------------

type Supabase = Awaited<ReturnType<typeof createClient>>;

export async function canManageThemes(
  supabase: Supabase,
  userId: string
): Promise<boolean> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();
  if (profile?.role === "admin") return true;

  const { data: owned } = await supabase
    .from("meeting_series")
    .select("id")
    .eq("owner_id", userId)
    .limit(1);
  if (owned && owned.length > 0) return true;

  const { data: part } = await supabase
    .from("series_participants")
    .select("series_id")
    .eq("user_id", userId)
    .in("role", ["owner", "facilitator"])
    .limit(1);
  return !!(part && part.length > 0);
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  }
  const { data, error } = await supabase
    .from("theme_catalog")
    .select("id, group_name, topic_name, is_active, sort_order, created_at, updated_at")
    .order("group_name", { ascending: true })
    .order("sort_order", { ascending: true })
    .order("topic_name", { ascending: true });
  if (error) {
    return NextResponse.json({ error: "Не удалось загрузить справочник тем" }, { status: 500 });
  }
  return NextResponse.json({ themes: data });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  }
  if (!(await canManageThemes(supabase, user.id))) {
    return NextResponse.json(
      { error: "Только менеджеры могут изменять справочник тем" },
      { status: 403 }
    );
  }
  const body = await request.json().catch(() => null);
  const group_name = typeof body?.group_name === "string" ? body.group_name.trim() : "";
  const topic_name = typeof body?.topic_name === "string" ? body.topic_name.trim() : "";
  const sort_order =
    typeof body?.sort_order === "number" && Number.isFinite(body.sort_order)
      ? Math.trunc(body.sort_order)
      : 0;
  if (!group_name || !topic_name) {
    return NextResponse.json({ error: "Укажите группу и тему" }, { status: 400 });
  }
  const { data, error } = await supabase
    .from("theme_catalog")
    .insert({ group_name, topic_name, sort_order, is_active: true })
    .select()
    .single();
  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "Такая тема уже есть в этой группе" }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ theme: data }, { status: 201 });
}
