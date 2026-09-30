import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export type DirectoryPerson = {
  id: string;
  full_name: string;
  email: string;
  position: string;
  absent_until: string | null;
  active: boolean;
};

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  }
  const { data, error } = await supabase
    .from("people_directory")
    .select("id, full_name, email, position, absent_until, active")
    .order("full_name", { ascending: true });
  if (error) {
    return NextResponse.json({ error: "Не удалось загрузить справочник" }, { status: 500 });
  }
  return NextResponse.json({ people: data });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  }
  const body = await request.json().catch(() => null);
  const full_name = typeof body?.full_name === "string" ? body.full_name.trim() : "";
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const position = typeof body?.position === "string" ? body.position.trim() : "";
  if (!full_name) {
    return NextResponse.json({ error: "Укажите ФИО" }, { status: 400 });
  }
  const { data, error } = await supabase
    .from("people_directory")
    .upsert({ full_name, email, position, active: true }, { onConflict: "full_name" })
    .select()
    .single();
  if (error) {
    return NextResponse.json({ error: "Не удалось сохранить: " + error.message }, { status: 500 });
  }
  return NextResponse.json({ person: data });
}

export async function PATCH(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  }
  const body = await request.json().catch(() => null);
  const id = typeof body?.id === "string" ? body.id : "";
  if (!id) {
    return NextResponse.json({ error: "Не указана запись" }, { status: 400 });
  }
  const patch: Record<string, unknown> = {};
  if (typeof body.email === "string") patch.email = body.email.trim().toLowerCase();
  if (typeof body.position === "string") patch.position = body.position.trim();
  if (typeof body.full_name === "string" && body.full_name.trim()) patch.full_name = body.full_name.trim();
  if (typeof body.active === "boolean") patch.active = body.active;
  if (body.absent_until === null || typeof body.absent_until === "string") patch.absent_until = body.absent_until;
  const { data, error } = await supabase
    .from("people_directory")
    .update(patch)
    .eq("id", id)
    .select()
    .single();
  if (error) {
    return NextResponse.json({ error: "Не удалось обновить: " + error.message }, { status: 500 });
  }
  return NextResponse.json({ person: data });
}

export async function DELETE(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  }
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Не указана запись" }, { status: 400 });
  }
  const { error } = await supabase.from("people_directory").delete().eq("id", id);
  if (error) {
    return NextResponse.json({ error: "Не удалось удалить: " + error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
