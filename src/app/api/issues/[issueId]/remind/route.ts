import { NextResponse, type NextRequest } from "next/server";
import { absoluteAppUrl, getSmtpConfig, sendMail } from "@/lib/email";
import { resolveSenderFrom, isDeliverableSender } from "@/lib/email-sender";
import { getInstanceConfigMap } from "@/lib/instance-config";
import {
  formatOwnerEmail,
  gatherOwnerReminders,
  type ReminderContext,
  type ReminderProfile,
} from "@/lib/reminders";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import type { Issue } from "@/lib/types";

// per-user rate limit buckets (in-memory; single instance)
const remindRateLimit = new Map<string, number[]>();

// Single-issue reminder: emails the owner of one issue (works for owners without
// accounts via people_directory lookup by full_name).
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ issueId: string }> }
) {
  const { issueId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  }

  // Rate limit: max 5 single-issue reminders per user per minute (review finding R2)
  const now = Date.now();
  const windowStart = now - 60_000;
  for (const [ts] of remindRateLimit.get(user.id) ?? []) {
    // prune below
  }
  const hits = (remindRateLimit.get(user.id) ?? []).filter((ts) => ts > windowStart);
  if (hits.length >= 5) {
    return NextResponse.json(
      { error: "Слишком много напоминаний. Подождите минуту." },
      { status: 429 }
    );
  }
  hits.push(now);
  remindRateLimit.set(user.id, hits);

  const { data: issue } = await supabase
    .from("issues")
    .select("id, issue_number, title, series_id, owner_user_id, owner_name, status, priority")
    .eq("id", issueId)
    .single();
  if (!issue) {
    return NextResponse.json({ error: "Поручение не найдено" }, { status: 404 });
  }
  if (!issue.owner_user_id && !issue.owner_name?.trim()) {
    return NextResponse.json({ error: "У поручения нет ответственного" }, { status: 400 });
  }

  const { data: series } = await supabase
    .from("meeting_series")
    .select("id, name")
    .eq("id", issue.series_id)
    .single();

  const admin = createServiceRoleClient();

  const profilesById: Record<string, ReminderProfile> = {};
  if (issue.owner_user_id) {
    const { data: profile } = await admin
      .from("profiles")
      .select("id, email, name")
      .eq("id", issue.owner_user_id)
      .maybeSingle();
    if (profile) {
      profilesById[profile.id] = { email: profile.email, name: profile.name };
    }
  }

  const owners = gatherOwnerReminders([issue as unknown as Issue], profilesById);
  const owner = owners[0];
  if (!owner) {
    return NextResponse.json({ error: "Не удалось определить ответственного" }, { status: 400 });
  }

  // People directory fallback for owners without accounts
  if (!owner.ownerEmail && owner.ownerName) {
    const { data: dirRow } = await admin
      .from("people_directory")
      .select("email")
      .eq("full_name", owner.ownerName.trim())
      .maybeSingle();
    if (dirRow?.email) owner.ownerEmail = dirRow.email;
  }

  // No silent demo-email fallback (review finding R2): require a real address
  if (!owner.ownerEmail) {
    return NextResponse.json(
      { error: "У ответственного нет email в справочнике — добавьте его в «Справочнике»" },
      { status: 400 }
    );
  }
  const targetEmail = owner.ownerEmail;

  const smtp = await getSmtpConfig();
  const configMap = await getInstanceConfigMap(["smtp_from"]);
  const sender = resolveSenderFrom(
    configMap.smtp_from,
    process.env.EMAIL_FROM,
    process.env.SMTP_ADMIN_EMAIL
  );
  if (!smtp || !isDeliverableSender(sender)) {
    return NextResponse.json(
      { error: "Отправка писем не настроена (SMTP)" },
      { status: 400 }
    );
  }

  const ctx: ReminderContext = {
    seriesName: series?.name ?? "Серия встреч",
    appUrl: absoluteAppUrl(request.url, `/series/${issue.series_id}`),
  };
  const email = formatOwnerEmail(owner, ctx);

  await sendMail({
    to: targetEmail,
    subject: email.subject,
    text: email.text,
    html: email.html,
    from: sender ?? undefined,
  });

  return NextResponse.json({ ok: true, sentTo: targetEmail });
}
