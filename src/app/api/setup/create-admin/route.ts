import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { requireSetupToken } from "@/lib/setup-token";

const createAdminSchema = z.object({
  email: z.string().email("Некорректный адрес эл. почты"),
  password: z.string().min(8, "Пароль должен содержать не менее 8 символов"),
  name: z.string().min(1, "Укажите имя").max(100),
});

export async function POST(request: NextRequest) {
  const setupAuth = requireSetupToken(request);
  if (!setupAuth.authorized) {
    return NextResponse.json(
      { error: setupAuth.error },
      { status: setupAuth.status }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Некорректное тело JSON" }, { status: 400 });
  }

  const parsed = createAdminSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  const supabase = createServiceRoleClient();

  const { data: setupConfig, error: setupError } = await supabase
    .from("instance_config")
    .select("value")
    .eq("key", "setup_completed")
    .single();

  if (setupError) {
    return NextResponse.json(
      { error: "Не удалось проверить статус настройки" },
      { status: 500 }
    );
  }

  if (setupConfig?.value === "true") {
    return NextResponse.json(
      { error: "Настройка уже завершена" },
      { status: 409 }
    );
  }

  const { data: existingAdmins, error: checkError } = await supabase
    .from("profiles")
    .select("id")
    .eq("role", "admin")
    .limit(1);

  if (checkError) {
    return NextResponse.json(
      { error: "Не удалось проверить текущих администраторов" },
      { status: 500 }
    );
  }

  if (existingAdmins && existingAdmins.length > 0) {
    return NextResponse.json(
      { error: "Аккаунт администратора уже существует" },
      { status: 409 }
    );
  }

  const { email, password, name } = parsed.data;

  const { data: authData, error: authError } =
    await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

  if (authError) {
    return NextResponse.json(
      { error: authError.message },
      { status: 500 }
    );
  }

  const userId = authData.user.id;

  const { error: profileError } = await supabase
    .from("profiles")
    .update({ name, role: "admin" })
    .eq("id", userId);

  if (profileError) {
    return NextResponse.json(
      { error: "Пользователь создан, но не удалось назначить роль администратора:" + profileError.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    user_id: userId,
    email,
    role: "admin",
  });
}
