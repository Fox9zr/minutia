import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { callAi } from "@/lib/ai/call";
import { hasAiConfigured } from "@/lib/ai/config";
import { requireAiAccess } from "@/lib/ai/access";
import {
  summarizeCarryover,
  parseCarryoverBriefing,
  type CarryoverIssue,
  type CarryoverSummary,
} from "@/lib/ai/carryover";

const PROMPT_VERSION = "carryover-briefing-v1";
const SYSTEM_PROMPT = "Вы составляете краткие вводные сводки по перенесенным вопросам перед встречей. Возвращайте только корректный JSON.";

function buildPrompt(input: {
  seriesName: string;
  meetingTitle: string;
  summary: CarryoverSummary;
}) {
  const items = input.summary.issues.slice(0, 12).map((issue) => ({
    issue: issue.issue_number,
    title: issue.title,
    category: issue.category,
    status: issue.status,
    owner: issue.owner_name ?? null,
    due_date: issue.due_date,
    overdue: issue.overdue,
    days_open: issue.days_open,
  }));

  return [
    "Составьте вводную сводку перенесенных вопросов для серии регулярных встреч Minutia.",
    "Фасилитатор изучает это до начала встречи, чтобы выявить упущенные задачи.",
    "",
    "ВЫХОДНОЙ КОНТРАКТ",
    'Return only a single JSON object: {"briefing_markdown": "...", "overdue_count": N, "no_owner_count": N}.',
    "Не используйте разметку markdown. Не добавляйте текст до или после JSON.",
    "",
    "briefing_markdown rules:",
    "- 3 to 6 sentences of concise markdown.",
    "- Lead with the count of open items and how many are overdue.",
    "- Name up to 5 highest-priority items with their owner and due date.",
    "- Call out items with no owner explicitly.",
    "- Flag items open a long time as stale.",
    "Не добавляйте вымышленных ответственных, даты или решения. Используйте только предоставленные данные.",
    "",
    `Series: ${input.seriesName}`,
    `Upcoming meeting: ${input.meetingTitle}`,
    `Totals: ${input.summary.total} open, ${input.summary.overdue_count} overdue, ${input.summary.no_owner_count} without an owner, ${input.summary.stale_count} stale.`,
    "",
    "Открытые задачи (ранжированы, сначала просроченные):",
    JSON.stringify(items),
  ].join("\n");
}

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ meetingId: string }> }
) {
  const requestId = crypto.randomUUID();
  const { meetingId } = await params;

  const aiDenied = await requireAiAccess();
  if (aiDenied) {
    return NextResponse.json(
      { error: (await aiDenied.json()).error, request_id: requestId },
      { status: aiDenied.status }
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Не авторизован", request_id: requestId }, { status: 401 });
  }

  if (!(await hasAiConfigured())) {
    return NextResponse.json(
      { error: "Сводка по перенесенным задачам не настроена.", request_id: requestId },
      { status: 503 }
    );
  }

  const { data: meeting, error } = await supabase
    .from("meetings")
    .select("*, series:meeting_series!inner(name)")
    .eq("id", meetingId)
    .single();
  if (error || !meeting) {
    return NextResponse.json({ error: "Встреча не найдена", request_id: requestId }, { status: 404 });
  }

  const { data: issues, error: issuesError } = await supabase
    .from("issues")
    .select("issue_number,title,category,status,priority,owner_name,due_date,created_at")
    .eq("series_id", meeting.series_id)
    .not("status", "in", "(resolved,dropped)")
    .order("due_date", { ascending: true, nullsFirst: false })
    .limit(30);
  if (issuesError) {
    return NextResponse.json(
      { error: "Не удалось загрузить перенесенные задачи.", request_id: requestId },
      { status: 500 }
    );
  }

  const summary = summarizeCarryover((issues ?? []) as CarryoverIssue[], new Date());

  // Nothing open means nothing to brief: skip the provider call entirely.
  if (summary.total === 0) {
    return NextResponse.json({
      briefing_markdown: "",
      overdue_count: 0,
      no_owner_count: 0,
      issues_count: 0,
      model: null,
      prompt_version: PROMPT_VERSION,
      request_id: requestId,
    });
  }

  const prompt = buildPrompt({
    seriesName: meeting.series?.name ?? "Серия без названия",
    meetingTitle: meeting.title,
    summary,
  });

  let providerData: unknown;
  let model: string;
  try {
    ({ data: providerData, model } = await callAi({ system: SYSTEM_PROMPT, prompt }));
  } catch {
    return NextResponse.json(
      { error: "Сбой запроса к провайдеру ИИ.", request_id: requestId },
      { status: 502 }
    );
  }

  let parsed;
  try {
    parsed = parseCarryoverBriefing(providerData);
  } catch {
    return NextResponse.json(
      { error: "Провайдер ИИ вернул некорректную сводку.", request_id: requestId },
      { status: 502 }
    );
  }

  // Counts come from our deterministic summary, not the model's claims.
  return NextResponse.json({
    briefing_markdown: parsed.briefing_markdown,
    overdue_count: summary.overdue_count,
    no_owner_count: summary.no_owner_count,
    issues_count: summary.total,
    model,
    prompt_version: PROMPT_VERSION,
    request_id: requestId,
  });
}
