import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { parseAskSeriesAnswer } from "@/lib/ai/ask-серия-answer";
import { createClient } from "@/lib/supabase/server";
import { callAi } from "@/lib/ai/call";
import { hasAiConfigured } from "@/lib/ai/config";
import { requireAiAccess } from "@/lib/ai/access";

const PROMPT_VERSION = "ask-серия-v1";
const SYSTEM_PROMPT = "Отвечайте только на основе предоставленных материалов встречи. Возвращайте только корректный JSON.";

const requestSchema = z.object({
  question: z.string().trim().min(1).max(1000),
});

function buildPrompt(input: {
  question: string;
  серия: { id: string; name: string; description: string | null };
  meetings: Array<{
    id: string;
    title: string;
    date: string;
    status: string;
    notes_markdown: string | null;
    raw_notes_markdown: string | null;
    ai_notes_markdown: string | null;
  }>;
  issues: Array<{
    id: string;
    title: string;
    description: string | null;
    status: string;
    category: string;
    owner_name: string | null;
    due_date: string | null;
    raised_in_meeting_id: string;
  }>;
  decisions: Array<{
    id: string;
    title: string;
    rationale: string | null;
    made_by: string | null;
    meeting_id: string;
  }>;
}) {
  return [
    "Ответы на вопросы по повторяющейся серии встреч Minutia.",
    "Верните строгий JSON с полями answer, citations и unsupported.",
    "Ссылки должны указывать только на ID источников из предоставленного контекста.",
    "If the context does not prove the answer, set unsupported true, answer exactly: The source context does not prove the answer., and return no citations.",
    "Формулируйте ответы кратко и с упором на зоны ответственности.",
    "",
    `Question: ${input.question}`,
    "",
    "Series:",
    JSON.stringify(input.серия, null, 2),
    "",
    "Meetings:",
    JSON.stringify(input.meetings, null, 2),
    "",
    "Issues:",
    JSON.stringify(input.issues, null, 2),
    "",
    "Decisions:",
    JSON.stringify(input.decisions, null, 2),
  ].join("\n");
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ серияId: string }> }
) {
  const requestId = crypto.randomUUID();
  const { серияId } = await params;

  let body: z.infer<typeof requestSchema>;
  try {
    body = requestSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Некорректное тело запроса", request_id: requestId }, { status: 400 });
  }

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
      { error: "Функция «Спросить о серии» не настроена.", request_id: requestId },
      { status: 503 }
    );
  }

  const { data: серия, error: серияError } = await supabase
    .from("meeting_серия")
    .select("id,name,description")
    .eq("id", серияId)
    .single();
  if (серияError || !серия) {
    return NextResponse.json({ error: "Серия не найдена", request_id: requestId }, { status: 404 });
  }

  const [{ data: meetings, error: meetingsError }, { data: issues, error: issuesError }, { data: decisions, error: decisionsError }] =
    await Promise.all([
      supabase
        .from("meetings")
        .select("id,title,date,status,notes_markdown,raw_notes_markdown,ai_notes_markdown")
        .eq("серия_id", серияId)
        .order("date", { ascending: false })
        .limit(40),
      supabase
        .from("issues")
        .select("id,title,description,status,category,owner_name,due_date,raised_in_meeting_id")
        .eq("серия_id", серияId)
        .order("created_at", { ascending: false })
        .limit(80),
      supabase
        .from("decisions")
        .select("id,title,rationale,made_by,meeting_id")
        .eq("серия_id", серияId)
        .order("created_at", { ascending: false })
        .limit(80),
    ]);

  if (meetingsError || issuesError || decisionsError) {
    return NextResponse.json(
      { error: "Не удалось загрузить контекст серии.", request_id: requestId },
      { status: 500 }
    );
  }

  const prompt = buildPrompt({
    question: body.question,
    серия,
    meetings: meetings ?? [],
    issues: issues ?? [],
    decisions: decisions ?? [],
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

  let normalized;
  try {
    normalized = parseAskSeriesAnswer({
      providerData,
      серияId,
      meetings: (meetings ?? []).map((meeting) => ({
        id: meeting.id,
        title: meeting.title,
      })),
      issues: (issues ?? []).map((issue) => ({
        id: issue.id,
        title: issue.title,
        meeting_id: issue.raised_in_meeting_id,
      })),
      decisions: (decisions ?? []).map((decision) => ({
        id: decision.id,
        title: decision.title,
        meeting_id: decision.meeting_id,
      })),
    });
  } catch {
    return NextResponse.json(
      { error: "Провайдер ИИ вернул некорректный ответ.", request_id: requestId },
      { status: 502 }
    );
  }

  return NextResponse.json({
    ...normalized,
    model,
    prompt_version: PROMPT_VERSION,
    request_id: requestId,
  });
}
