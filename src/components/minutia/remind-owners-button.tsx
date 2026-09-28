"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Bell, BellRing, Check, Loader2 } from "lucide-react";

interface RemindOwnersButtonProps {
  серияId: string;
}

type State = "idle" | "sending" | "done" | "error";

export function RemindOwnersButton({ серияId }: RemindOwnersButtonProps) {
  const [state, setState] = React.useState<State>("idle");
  const [message, setMessage] = React.useState<string>("");
  const timeoutRef = React.useRef<ReturnType<typeof setTimeout>>(null);

  React.useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  function flash(next: State, label: string) {
    setState(next);
    setMessage(label);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      setState("idle");
      setMessage("");
    }, 2500);
  }

  async function handleClick() {
    if (state === "sending") return;
    setState("sending");
    setMessage("");

    try {
      const res = await fetch(`/api/серия/${серияId}/remind`, {
        method: "POST",
      });
      const data = await res.json();

      if (!res.ok) {
        if (res.status === 400) {
          flash("done", "Нет тем для напоминания");
          return;
        }
        flash("error", "Не удалось отправить");
        return;
      }

      if (data.channel === "clipboard") {
        try {
          await navigator.clipboard.writeText(data.payload.markdown);
        } catch {
          // Clipboard unavailable (e.g. headless browser without permission)
        }
        flash("done", `Copied ${data.ownerCount} reminders`);
      } else {
        flash("done", `Sent to ${data.ownerCount} owners via ${data.channel}`);
      }
    } catch {
      flash("error", "Не удалось отправить");
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="outline"
        size="sm"
        onClick={handleClick}
        disabled={state === "sending"}
        className="h-9"
        aria-label="Напомнить ответственным"
      >
        {state === "sending" ? (
          <Loader2 className="size-4 animate-spin" data-icon="inline-start" />
        ) : state === "done" ? (
          <Check className="size-4 text-success" data-icon="inline-start" />
        ) : state === "error" ? (
          <BellRing className="size-4 text-danger" data-icon="inline-start" />
        ) : (
          <Bell className="size-4" data-icon="inline-start" />
        )}
        <span className="hidden sm:inline">Напомнить ответственным</span>
      </Button>
      {message && (
        <span
          role="status"
          className="text-xs text-ink-2 whitespace-nowrap"
        >
          {message}
        </span>
      )}
    </div>
  );
}
