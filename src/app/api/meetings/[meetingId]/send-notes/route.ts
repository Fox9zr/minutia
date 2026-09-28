import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { absoluteAppUrl, sendMail } from "@/lib/email";
import { buildMeetingNotesEmail, extractEmails } from "@/lib/meeting-notes-email";
import { createClient } from "@/lib/supabase/server";
import { userManagesSeries } from "@/lib/серия/manage-access";
import type { Decision, Issue, Meeting, MeetingSeries } from "@/lib/types";

const schema = z.object({
  recipients: z.array(z.string().email()).max(50).optional(),
});

type MeetingPayload = Meeting & {
  серия: Pick<MeetingSeries, "id" | "name" | "default_attendees">;
  issues: Issue[];
  decisions: Decision[];
};

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ meetingId: string }> }
) {
  const { meetingId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  const { data: meeting, error: meetingError } = await supabase
    .from("meetings")
    .select("*, серия:meeting_серия!inner(id, name, default_attendees), issues:issues!raised_in_meeting_id(*), decisions(*)")
    .eq("id", meetingId)
    .single();

  if (meetingError || !meeting) {
    return NextResponse.json({ error: "Встреча не найдена" }, { status: 404 });
  }

  const payload = meeting as MeetingPayload;

  const canManage = await userManagesSeries(payload.серия_id, user.id);
  if (!canManage) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (payload.status !== "completed") {
    return NextResponse.json(
      { error: "Заметки встречи можно отправить только после ее завершения." },
      { status: 400 }
    );
  }

  const { data: серияIssues, error: issuesError } = await supabase
    .from("issues")
    .select("*")
    .eq("серия_id", payload.серия_id);

  if (issuesError) {
    return NextResponse.json({ error: issuesError.message }, { status: 500 });
  }

  const recipients = parsed.data.recipients?.length
    ? parsed.data.recipients
    : extractEmails([...(payload.attendees ?? []), ...(payload.серия.default_attendees ?? [])]);

  if (recipients.length === 0) {
    return NextResponse.json(
      { error: "Укажите хотя бы один email участника перед отправкой заметок." },
      { status: 400 }
    );
  }

  const allIssues = (серияIssues ?? []) as Issue[];
  const resolvedIssues = allIssues.filter(
    (issue) =>
      issue.resolved_in_meeting_id === meetingId &&
      (issue.status === "resolved" || issue.status === "dropped")
  );
  const raisedIds = new Set((payload.issues ?? []).map((issue) => issue.id));
  const carriedIssues = allIssues.filter(
    (issue) =>
      !raisedIds.has(issue.id) &&
      issue.resolved_in_meeting_id !== meetingId &&
      issue.status !== "resolved" &&
      issue.status !== "dropped"
  );

  const appUrl = absoluteAppUrl(request.url);
  const email = buildMeetingNotesEmail({
    meeting: payload,
    серияName: payload.серия.name,
    raisedIssues: payload.issues ?? [],
    resolvedIssues,
    carriedIssues,
    decisions: payload.decisions ?? [],
    appUrl,
  });

  try {
    await sendMail({
      to: recipients,
      subject: email.subject,
      text: email.text,
      html: email.html,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Не удалось отправить протокол встречи" },
      { status: 500 }
    );
  }

  return NextResponse.json({ sent: recipients.length });
}
