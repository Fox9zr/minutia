import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { mintUpgradeTicket } from "@/lib/billing/upgrade-ticket";
import { extractCheckoutUrl } from "@/lib/billing/checkout-response";

export const runtime = "nodejs";

export async function POST() {
  const secret = process.env.UPGRADE_SIGNING_SECRET;
  const checkoutUrl = process.env.UPGRADE_CHECKOUT_URL;
  // Dormant on OSS self-host: the feature simply does not exist unless configured.
  if (!secret || !checkoutUrl) {
    return NextResponse.json({ error: "Не найдено" }, { status: 404 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  }

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("current_organization_id, email")
    .eq("id", user.id)
    .single<{ current_organization_id: string | null; email: string | null }>();
  if (error || !profile?.current_organization_id) {
    return NextResponse.json({ error: "Требуется рабочее пространство" }, { status: 409 });
  }

  const { data: org } = await supabase
    .from("organizations")
    .select("name")
    .eq("id", profile.current_organization_id)
    .single<{ name: string }>();

  const ticket = mintUpgradeTicket({
    userId: user.id,
    organizationId: profile.current_organization_id,
    organizationName: org?.name ?? "Мое рабочее пространство",
    email: profile.email ?? user.email ?? "",
    secret,
  });

  // Server-to-server: POST the signed ticket to the configured checkout endpoint
  // and return only the URL that endpoint returns. Identity never touches the browser.
  const res = await fetch(checkoutUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ticket }),
  });
  const url = extractCheckoutUrl(res.ok, await res.json().catch(() => null));
  if (!url) {
    return NextResponse.json({ error: "Оформление недоступно" }, { status: 502 });
  }
  return NextResponse.json({ url });
}
