import { NextResponse, type NextRequest } from "next/server";
import { absoluteAppUrl, sendMail } from "@/lib/email";
import { SENDER_NOT_CONFIGURED_MESSAGE } from "@/lib/email-sender";
import { buildSeriesBrief, type BriefIssue } from "@/lib/brief";
import { extractEmails } from "@/lib/meeting-notes-email";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import type { Issue } from "@/lib/types";

function isEmailUnconfigured(message: string): boolean {
  return (
    message === SENDER_NOT_CONFIGURED_MESSAGE ||
    message.toLowerCase().includes("not configured")
  );
}

async function ensureSeriesShareToken(
  admin: ReturnType<typeof createServiceRoleClient>,
  серияId: string,
  userId: string
): Promise<string> {
  const { data: existing } = await admin
    .from("guest_shares")
    .select("token, expires_at")
    .eq("resource_type", "серия")
    .eq("resource_id", серияId)
    .eq("created_by", userId)
    .order("created_at", { ascending: false });

  const now = Date.now();
  const live = (existing ?? []).find(
    (row) => !row.expires_at || new Date(row.expires_at).getTime() > now
  );
  if (live) return live.token;

  const token = crypto.randomUUID();
  const { error } = await admin.from("guest_shares").insert({
    token,
    resource_type: "серия",
    resource_id: серияId,
    permissions: "view",
    created_by: userId,
    expires_at: null,
  });
  if (error) throw new Error(error.message);
  return token;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ серияId: string }> }
) {
  const { серияId } = await params;
  const dryRun = new URL(request.url).searchParams.get("dry") === "1";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  }

  const { data: серия } = await supabase
    .from("meeting_серия")
    .select("id, name, cadence, owner_id, default_attendees")
    .eq("id", серияId)
    .single();

  if (!серия) {
    return NextResponse.json({ error: "Серия не найдена" }, { status: 404 });
  }

  const admin = createServiceRoleClient();

  const { data: membership } = await admin
    .from("серия_participants")
    .select("role")
    .eq("серия_id", серияId)
    .eq("user_id", user.id)
    .maybeSingle();

  const canManage =
    серия.owner_id === user.id ||
    membership?.role === "owner" ||
    membership?.role === "facilitator";

  if (!canManage) {
    return NextResponse.json(
      { error: "Только владельцы и ведущие серии могут отправлять брифы." },
      { status: 403 }
    );
  }

  const recipients = extractEmails(серия.default_attendees ?? []);
  const token = await ensureSeriesShareToken(admin, серияId, user.id);
  const guestUrl = absoluteAppUrl(request.url, `/share/${token}`);

  if (dryRun) {
    return NextResponse.json({ guestUrl, recipients: recipients.length });
  }

  if (recipients.length === 0) {
    return NextResponse.json({ error: "no_recipient_emails", guestUrl }, { status: 422 });
  }

  const { data: серияIssues } = await admin
    .from("issues")
    .select("*")
    .eq("серия_id", серияId);

  const открытоIssues = ((серияIssues ?? []) as Issue[]).filter(
    (issue) => issue.status !== "resolved" && issue.status !== "dropped"
  );
  const ownerIds = [
    ...new Set(
      открытоIssues.map((issue) => issue.owner_user_id).filter((v): v is string => !!v)
    ),
  ];

  const emailByOwnerId: Record<string, string> = {};
  if (ownerIds.length > 0) {
    const { data: profiles } = await admin
      .from("profiles")
      .select("id, email")
      .in("id", ownerIds);
    for (const profile of profiles ?? []) {
      if (profile.email) emailByOwnerId[profile.id] = profile.email;
    }
  }

  const briefIssues: BriefIssue[] = открытоIssues.map((issue) => ({
    ...issue,
    ownerEmail: issue.owner_user_id ? emailByOwnerId[issue.owner_user_id] ?? null : null,
  }));

  const { data: nextMeetingRow } = await admin
    .from("meetings")
    .select("title, date")
    .eq("серия_id", серияId)
    .in("status", ["upcoming", "live"])
    .order("date", { ascending: true })
    .limit(1)
    .maybeSingle();

  const briefs = buildSeriesBrief({
    серия: { name: серия.name, cadence: серия.cadence },
    nextMeeting: nextMeetingRow ?? null,
    открытоIssues: briefIssues,
    recipients,
    guestUrl,
    instanceUrl: absoluteAppUrl(request.url, "/"),
  });

  let sent = 0;
  try {
    for (const brief of briefs) {
      await sendMail({
        to: brief.email,
        subject: brief.subject,
        text: brief.text,
        html: brief.html,
      });
      sent += 1;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Не удалось отправить бриф";
    if (sent === 0 && isEmailUnconfigured(message)) {
      return NextResponse.json({ error: "email_unconfigured", guestUrl }, { status: 409 });
    }
    return NextResponse.json({ error: message, sent, guestUrl }, { status: 500 });
  }

  return NextResponse.json({ sent, guestUrl });
}
