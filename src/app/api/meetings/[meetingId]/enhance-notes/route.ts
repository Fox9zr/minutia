import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getTextFromOpenRouter } from "@/lib/ai/ask-series-answer";
import { callAi } from "@/lib/ai/call";
import { hasAiConfigured } from "@/lib/ai/config";
import { requireAiAccess } from "@/lib/ai/access";

const PROMPT_VERSION = "ai-notes-v1";
const SYSTEM_PROMPT = "Вы — точный редактор протоколов встреч. Возвращайте только корректный JSON.";

const requestSchema = z.object({
  mode: z.enum(["preview"]).default("preview"),
});

const notesSchema = z.object({
  summary: z.array(z.string()).default([]),
  action_items: z.array(z.string()).default([]),
  decisions: z.array(z.string()).default([]),
  risks: z.array(z.string()).default([]),
  blockers: z.array(z.string()).default([]),
  follow_ups: z.array(z.string()).default([]),
  open_questions: z.array(z.string()).default([]),
});

type AiNotes = z.infer<typeof notesSchema>;

function section(title: string, items: string[]) {
  if (items.length === 0) return "";
  return [`## ${title}`, ...items.map((item) => `- ${item}`)].join("\n");
}

function toMarkdown(notes: AiNotes) {
  return [
    section("Summary", notes.summary),
    section("Поручения", notes.action_items),
    section("Decisions", notes.decisions),
    section("Risks", notes.risks),
    section("Blockers", notes.blockers),
    section("Follow-ups", notes.follow_ups),
    section("Открытые вопросы", notes.open_questions),
  ].filter(Boolean).join("\n\n");
}

function buildPrompt(input: {
  title: string;
  seriesName: string;
  attendees: string[];
  notes: string;
  transcript: string | null;
  issues: { title: string; status: string; owner_name: string | null; category: string }[];
  decisions: { title: string; rationale: string | null }[];
}) {
  return [
    "Вы оптимизируете протоколы регулярных встреч для Kotrol — журнала нерешенных вопросов.",
    "Return strict JSON with these array fields: summary, action_items, decisions, risks, blockers, follow_ups, open_questions.",
    "Верните только JSON-объект. Не оборачивайте в разметку markdown и не добавляйте комментариев.",
    "Each field must be an array of concise strings. Use [] when there is no evidence for a field.",
    "Do not invent owners, dates, or decisions. If uncertain, put the uncertainty in open_questions.",
    "Формулируйте кратко и с указанием ответственных.",
    "",
    `Series: ${input.seriesName}`,
    `Meeting: ${input.title}`,
    `Attendees: ${input.attendees.join(", ") || "Unknown"}`,
    "",
    "Черновые заметки:",
    input.notes || "(empty)",
    "",
    "Transcript:",
    input.transcript || "(not provided)",
    "",
    "Текущий открытый контекст:",
    JSON.stringify({ issues: input.issues, decisions: input.decisions }),
  ].join("\n");
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ meetingId: string }> }
) {
  const requestId = crypto.randomUUID();
  const { meetingId } = await params;

  try {
    requestSchema.parse(await request.json());
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
      { error: "Создание заметок с помощью ИИ не настроено.", request_id: requestId },
      { status: 503 }
    );
  }

  const { data: meeting, error } = await supabase
    .from("meetings")
    .select("*, series:meeting_series!inner(name), issues:issues!raised_in_meeting_id(title,status,owner_name,category), decisions(title,rationale)")
    .eq("id", meetingId)
    .single();

  if (error || !meeting) {
    return NextResponse.json({ error: "Встреча не найдена", request_id: requestId }, { status: 404 });
  }

  const rawNotes = meeting.raw_notes_markdown || meeting.notes_markdown || "";
  if (!rawNotes.trim() && !meeting.transcript_raw?.trim()) {
    return NextResponse.json(
      { error: "Добавьте заметки или расшифровку перед обработкой.", request_id: requestId },
      { status: 400 }
    );
  }

  const prompt = buildPrompt({
    title: meeting.title,
    seriesName: meeting.series?.name ?? "Серия без названия",
    attendees: meeting.attendees ?? [],
    notes: rawNotes,
    transcript: meeting.transcript_raw,
    issues: meeting.issues ?? [],
    decisions: meeting.decisions ?? [],
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

  let parsed: AiNotes;
  try {
    parsed = notesSchema.parse(JSON.parse(getTextFromOpenRouter(providerData)));
  } catch {
    return NextResponse.json(
      { error: "Провайдер ИИ вернул некорректные заметки.", request_id: requestId },
      { status: 502 }
    );
  }

  const aiNotes = toMarkdown(parsed);
  const generatedAt = new Date().toISOString();

  const { error: updateError } = await supabase
    .from("meetings")
    .update({
      raw_notes_markdown: rawNotes,
      ai_notes_markdown: aiNotes,
      ai_notes_generated_at: generatedAt,
      ai_notes_model: model,
      ai_notes_prompt_version: PROMPT_VERSION,
    })
    .eq("id", meetingId);

  if (updateError) {
    return NextResponse.json(
      { error: "Не удалось сохранить заметки ИИ.", request_id: requestId },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ai_notes: parsed,
    ai_notes_markdown: aiNotes,
    model,
    prompt_version: PROMPT_VERSION,
    generated_at: generatedAt,
    request_id: requestId,
  });
}
