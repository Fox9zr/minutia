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

  // Translit demo fallback (same as series remind)
  const translitMap: Record<string, string> = {а:'a',б:'b',в:'v',г:'g',д:'d',е:'e',ё:'e',ж:'zh',з:'z',и:'i',й:'y',к:'k',л:'l',м:'m',н:'n',о:'o',п:'p',р:'r',с:'s',т:'t',у:'u',ф:'f',х:'h',ц:'ts',ч:'ch',ш:'sh',щ:'sch',ъ:'',ы:'y',ь:'',э:'e',ю:'yu',я:'ya'};
  const translit = (str: string) => str.toLowerCase().split('').map(ch => translitMap[ch] ?? ch).join('');
  const targetEmail = owner.ownerEmail || (owner.ownerName ? translit(owner.ownerName)
    .replace(/[^a-z ]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter((p: string) => p.length > 1)
    .slice(0, 2)
    .join('.') + '@demo.tps.by' : null);
  if (!targetEmail) {
    return NextResponse.json({ error: "Не удалось определить email ответственного" }, { status: 400 });
  }

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
