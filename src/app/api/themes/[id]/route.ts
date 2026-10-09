import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { canManageThemes } from "../route";

// ---------------------------------------------------------------------------
// PATCH  /api/themes/[id]  — правка/деактивация/сортировка темы
// DELETE /api/themes/[id]  — удаление темы
// ---------------------------------------------------------------------------

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
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
  const patch: Record<string, unknown> = {};
  if (typeof body?.group_name === "string") patch.group_name = body.group_name.trim();
  if (typeof body?.topic_name === "string") patch.topic_name = body.topic_name.trim();
  if (typeof body?.is_active === "boolean") patch.is_active = body.is_active;
  if (typeof body?.sort_order === "number" && Number.isFinite(body.sort_order)) {
    patch.sort_order = Math.trunc(body.sort_order);
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Нет изменений" }, { status: 400 });
  }
  const { data, error } = await supabase
    .from("theme_catalog")
    .update(patch)
    .eq("id", id)
    .select()
    .single();
  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "Такая тема уже есть в этой группе" }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ theme: data });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
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
  const { error } = await supabase.from("theme_catalog").delete().eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
