"use client";

import * as React from "react";
import { Mic, MicOff, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

// INTENT: reusable voice-input button (GigaAM STT via /api/transcribe).
// States: idle → recording (pulse) → transcribing (spinner) → done (✓) / error (red).
// Voice is augmentation: the target textarea always stays manually editable.

type VoiceInputProps = {
  onText: (text: string) => void;
  className?: string;
  disabled?: boolean;
};

export function VoiceInput({ onText, className, disabled }: VoiceInputProps) {
  const [state, setState] = React.useState<"idle" | "recording" | "transcribing" | "done" | "error">("idle");
  const [error, setError] = React.useState<string | null>(null);
  const mediaRecorderRef = React.useRef<MediaRecorder | null>(null);
  const chunksRef = React.useRef<Blob[]>([]);
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopEverything = React.useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    const rec = mediaRecorderRef.current;
    if (rec && rec.state !== "inactive") {
      rec.onstop = null;
      rec.stop();
    }
    mediaRecorderRef.current = null;
    rec?.stream.getTracks().forEach((t) => t.stop());
  }, []);

  React.useEffect(() => stopEverything, [stopEverything]);

  const transcribe = React.useCallback(
    async (blob: Blob) => {
      setState("transcribing");
      setError(null);
      try {
        const fd = new FormData();
        fd.append("file", blob, "recording.webm");
        const resp = await fetch("/api/transcribe", {
          method: "POST",
          body: fd,
          signal: AbortSignal.timeout(150_000),
        });
        const json = await resp.json();
        if (!resp.ok || !json.text) {
          throw new Error(json.error || "Пустой результат");
        }
        onText(json.text);
        setState("done");
        setTimeout(() => setState("idle"), 1500);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Ошибка распознавания");
        setState("error");
        setTimeout(() => setState("idle"), 3500);
      }
    },
    [onText]
  );

  const start = React.useCallback(async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      chunksRef.current = [];
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      mediaRecorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        if (blob.size > 0) void transcribe(blob);
        else setState("idle");
      };
      mediaRecorder.start();
      mediaRecorderRef.current = mediaRecorder;
      setState("recording");
      // hard cap: 3 minutes per recording
      timerRef.current = setTimeout(() => {
        if (mediaRecorderRef.current?.state === "recording") {
          mediaRecorderRef.current.stop();
        }
      }, 180_000);
    } catch {
      setError("Микрофон недоступен (нужен HTTPS и доступ к микрофону)");
      setState("error");
      setTimeout(() => setState("idle"), 4000);
    }
  }, [transcribe]);

  const toggle = React.useCallback(() => {
    if (state === "recording") {
      stopEverythingButAllowOnstop();
    } else if (state === "idle") {
      void start();
    }
    function stopEverythingButAllowOnstop() {
      if (timerRef.current) clearTimeout(timerRef.current);
      const rec = mediaRecorderRef.current;
      if (rec && rec.state === "recording") rec.stop(); // onstop fires → transcribe
      mediaRecorderRef.current = null;
    }
  }, [state, start]);

  const label =
    state === "recording" ? "Идёт запись… нажмите для остановки"
    : state === "transcribing" ? "Распознаём…"
    : state === "done" ? "Готово"
    : error ?? "Голосовой ввод";

  return (
    <span className={cn("inline-flex items-center gap-1.5", className)} title={label}>
      <button
        type="button"
        onClick={toggle}
        disabled={disabled || state === "transcribing"}
        aria-label={label}
        className={cn(
          "inline-flex items-center justify-center size-7 rounded-md border border-rule text-ink-3 transition-colors",
          state === "idle" && "hover:bg-muted hover:text-ink",
          state === "recording" && "text-red-500 border-red-500/60 animate-pulse bg-red-500/10",
          state === "transcribing" && "text-ink-4",
          state === "done" && "text-green-600 border-green-600/50",
          state === "error" && "text-red-600 border-red-600/60"
        )}
      >
        {state === "transcribing" ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : state === "recording" ? (
          <MicOff className="size-3.5" />
        ) : (
          <Mic className="size-3.5" />
        )}
      </button>
      {error && <span className="text-xs text-red-600 max-w-56 truncate">{error}</span>}
    </span>
  );
}
