import { NextResponse, type NextRequest } from "next/server";
import { Agent } from "undici";
import { createClient } from "@/lib/supabase/server";

// INTENT: voice input proxy — browser audio (webm) → self-hosted GigaAM STT → text.
// Auth token stays server-side; self-signed SSL handled by undici agent.

const GIGAAM_URL = process.env.GIGAAM_URL || "https://10.10.64.67:8085";
const GIGAAM_AUTH = process.env.GIGAAM_AUTH || "Bearer gigastt-internal";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Аудиофайл не получен" }, { status: 400 });
  }
  if (file.size > 30 * 1024 * 1024) {
    return NextResponse.json({ error: "Аудио больше 30 МБ" }, { status: 413 });
  }

  const upstream = new FormData();
  upstream.append("file", file, "recording.webm");
  upstream.append("model", "v3_e2e_ctc");
  upstream.append("response_format", "text");

  const agent = new Agent({ connect: { rejectUnauthorized: false } });

  try {
    const resp = await fetch(`${GIGAAM_URL}/api/v1/audio/transcriptions`, {
      method: "POST",
      headers: { Authorization: GIGAAM_AUTH },
      body: upstream,
      // @ts-expect-error - undici dispatcher not in fetch types
      dispatcher: agent,
      signal: AbortSignal.timeout(120_000),
    });
    if (!resp.ok) {
      const body = await resp.text().catch(() => "");
      return NextResponse.json(
        { error: `Распознавание не удалось (${resp.status}): ${body.slice(0, 200)}` },
        { status: 502 }
      );
    }
    const text = (await resp.text()).trim();
    return NextResponse.json({ text });
  } catch (e) {
    return NextResponse.json(
      { error: "STT недоступен: " + (e instanceof Error ? e.message : "ошибка сети") },
      { status: 502 }
    );
  }
}
