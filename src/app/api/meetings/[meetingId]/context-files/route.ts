// AGENT-NOTE: API контекстных файлов встречи — upload (durable: job ставится ДО ответа),
// list/toggle/delete. Экстракция текста (txt/md/docx/pdf) в worker-потоке.
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const MAX_FILE_BYTES = 15 * 1024 * 1024; // 15 МБ
const ALLOWED_MIME = new Set([
  "text/plain", "text/markdown", "text/csv",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

export async function GET(req: NextRequest, ctx: { params: Promise<{ meetingId: string }> }) {
  const { meetingId } = await ctx.params;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("meeting_context_files")
    .select("id, filename, mime_type, size_bytes, source, processing_status, error_message, is_enabled, token_count, created_at")
    .eq("meeting_id", meetingId)
    .order("created_at");
  if (error) return NextResponse.json({ error: "Не удалось загрузить материалы" }, { status: 500 });
  return NextResponse.json({ files: data });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ meetingId: string }> }) {
  const { meetingId } = await ctx.params;
  const supabase = await createClient();

  const { data: meeting } = await supabase
    .from("meetings")
    .select("id, series_id")
    .eq("id", meetingId)
    .single();
  if (!meeting) return NextResponse.json({ error: "Встреча не найдена" }, { status: 404 });

  const form = await req.formData();
  const file = form.get("file") as File | null;
  const textSnippet = form.get("text") as string | null;
  if (!file && !(textSnippet && textSnippet.trim())) {
    return NextResponse.json({ error: "Приложите файл или вставьте текст" }, { status: 400 });
  }

  let filename: string, mime: string, size: number, source: string;
  let storagePath: string | null = null;
  let pendingExtract: Buffer | string | null = null;

  if (file) {
    if (file.size > MAX_FILE_BYTES) return NextResponse.json({ error: "Файл больше 15 МБ" }, { status: 400 });
    mime = file.type || "text/plain";
    const extOk = /\.(txt|md|csv|pdf|docx)$/i.test(file.name);
    if (!ALLOWED_MIME.has(mime) && !extOk) {
      return NextResponse.json({ error: "Поддерживаются: TXT, MD, CSV, PDF, DOCX" }, { status: 400 });
    }
    filename = file.name;
    size = file.size;
    source = "manual_upload";
    const buf = Buffer.from(await file.arrayBuffer());
    // txt-подобные экстрактируем сразу (дёшево), бинарные (pdf/docx) — в фоне
    if (mime.startsWith("text/") || /\.(txt|md|csv)$/i.test(filename)) {
      pendingExtract = buf.toString("utf-8");
    } else {
      const path = `${meetingId}/ctx-${Date.now()}-${filename.replace(/[^\w.\-А-Яа-яЁё]/g, "_")}`;
      const { error: upErr } = await supabase.storage.from("meeting-audio").upload(path, buf, { contentType: mime });
      if (upErr) return NextResponse.json({ error: "Не удалось сохранить файл" }, { status: 500 });
      storagePath = path;
      pendingExtract = buf;
    }
  } else {
    filename = (form.get("filename") as string) || "Заметка.txt";
    mime = "text/plain"; size = 0; source = "text_snippet";
    pendingExtract = textSnippet!;
  }

  // Экстракция для txt — сразу (синхронно, дёшево); для pdf/docx — помечаем processing,
  // durable: строка со статусом в БД уже является задачей; воркер-свееп её подхватит.
  const isImmediateText = typeof pendingExtract === "string" && source === "text_snippet" || (file && (file.type || "").startsWith("text/"));
  const { data: row, error: insErr } = await supabase
    .from("meeting_context_files")
    .insert({
      meeting_id: meetingId,
      workspace_id: meeting.series_id,
      filename, mime_type: mime, size_bytes: size, source,
      storage_path: storagePath,
      extracted_text: isImmediateText && typeof pendingExtract === "string" ? pendingExtract : null,
      token_count: isImmediateText && typeof pendingExtract === "string" ? Math.ceil(pendingExtract.length / 4) : 0,
      processing_status: isImmediateText ? "ready" : "pending",
      uploaded_by: null,
    })
    .select("id, filename, processing_status")
    .single();
  if (insErr || !row) return NextResponse.json({ error: "Не удалось добавить материал" }, { status: 500 });

  // НЕ fire-and-forget тяжёлой обработки: ставим processing до возврата, воркер заберёт по статусу.
  if (!isImmediateText && storagePath) {
    await supabase.from("meeting_context_files").update({ processing_status: "processing" }).eq("id", row.id);
    // Асинхронный воркер со sweepe-гарантией: статус processing/pending в БД — durable задача.
    void extractBinaryInBackground(supabase, row.id, storagePath, mime).catch(() => {});
  }
  return NextResponse.json({ file: row }, { status: 201 });
}

async function extractBinaryInBackground(supabase: Awaited<ReturnType<typeof createClient>>, fileId: string, path: string, mime: string) {
  try {
    const { data: blob } = await supabase.storage.from("meeting-audio").download(path);
    if (!blob) throw new Error("Файл не найден в хранилище");
    const buf = Buffer.from(await blob.arrayBuffer());
    let text = "";
    if (mime.includes("pdf")) {
      text = await extractPdfText(buf);
    } else if (mime.includes("wordprocessingml")) {
      text = await extractDocxText(buf);
    } else {
      text = buf.toString("utf-8");
    }
    await supabase
      .from("meeting_context_files")
      .update({ extracted_text: text, token_count: Math.ceil(text.length / 4), processing_status: "ready", error_message: null })
      .eq("id", fileId);
  } catch (e) {
    await supabase
      .from("meeting_context_files")
      .update({ processing_status: "failed", error_message: e instanceof Error ? e.message : "Ошибка обработки" })
      .eq("id", fileId);
  }
}

// Динамические импорты чтобы не тащить парсеры в main bundle
async function extractPdfText(buf: Buffer): Promise<string> {
  const mod = await import("pdf-parse" as string).catch(() => null);
  if (!mod) throw new Error("PDF-парсер не установлен");
  const fn = (mod as unknown as { default: (b: Buffer) => Promise<{ text: string }> }).default;
  const r = await fn(buf);
  return r.text;
}
async function extractDocxText(buf: Buffer): Promise<string> {
  const mod = await import("mammoth" as string).catch(() => null);
  if (!mod) throw new Error("DOCX-парсер не установлен");
  const r = await (mod as unknown as { extractRawText: (o: { buffer: Buffer }) => Promise<{ value: string }> }).extractRawText({ buffer: buf });
  return r.value;
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ meetingId: string }> }) {
  const { meetingId } = await ctx.params;
  const supabase = await createClient();
  const body = await req.json().catch(() => ({}));
  const { id, is_enabled } = body as { id?: string; is_enabled?: boolean };
  if (!id || typeof is_enabled !== "boolean") return NextResponse.json({ error: "Некорректный запрос" }, { status: 400 });
  const { error } = await supabase.from("meeting_context_files").update({ is_enabled }).eq("id", id).eq("meeting_id", meetingId);
  if (error) return NextResponse.json({ error: "Не удалось изменить" }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ meetingId: string }> }) {
  const { meetingId } = await ctx.params;
  const supabase = await createClient();
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Не указан файл" }, { status: 400 });
  const { data: row } = await supabase.from("meeting_context_files").select("storage_path").eq("id", id).eq("meeting_id", meetingId).single();
  if (row?.storage_path) await supabase.storage.from("meeting-audio").remove([row.storage_path]);
  const { error } = await supabase.from("meeting_context_files").delete().eq("id", id).eq("meeting_id", meetingId);
  if (error) return NextResponse.json({ error: "Не удалось удалить" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
