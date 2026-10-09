"use client";

import { cn } from "@/lib/utils";
import { STATUS_CONFIG, TASK_EVENT_LABELS } from "@/lib/constants";
import type { IssueStatus, TaskEvent } from "@/lib/types";

// Phase 2 v2 — renders public.task_events (the accept-cycle history log).
// Distinct from the free-text issue_updates timeline: this is the auditable
// record of who moved the issue and when.

function formatStamp(value: Date | string): string {
  return new Date(value).toLocaleString("ru-RU", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function statusLabel(status: unknown): string {
  if (typeof status !== "string") return "";
  return STATUS_CONFIG[status as IssueStatus]?.label ?? status;
}

/** One-line human summary of an event's payload. */
function eventDetail(event: TaskEvent): string | null {
  const p = (event.payload ?? {}) as Record<string, unknown>;
  const from = p.from;
  const to = p.to;
  switch (event.event) {
    case "status_changed":
    case "accepted":
    case "closed":
    case "reopened":
    case "assigned":
      if (from && to) return `${statusLabel(from)} → ${statusLabel(to)}`;
      if (to) return statusLabel(to);
      return null;
    case "due_proposed":
      return p.due ? `на ${String(p.due)}` : null;
    case "due_changed":
      if (p.from || p.to) return `${String(p.from ?? "—")} → ${String(p.to ?? "—")}`;
      return null;
    case "hold": {
      const reason = typeof p.reason === "string" ? p.reason : "";
      const until = p.until ? ` до ${String(p.until)}` : "";
      return `${reason}${until}`.trim() || null;
    }
    default:
      return null;
  }
}

const EVENT_DOT: Record<string, string> = {
  created: "bg-ink",
  assigned: "bg-ink",
  accepted: "bg-accent",
  due_proposed: "bg-warn",
  due_changed: "bg-warn",
  status_changed: "bg-ink-3",
  hold: "bg-warn",
  resumed: "bg-accent",
  closed: "bg-success",
  reopened: "bg-accent",
  split: "bg-ink-3",
  comment: "bg-ink-4",
};

export function TaskHistory({
  events,
  className,
}: {
  events: TaskEvent[];
  className?: string;
}) {
  if (!events || events.length === 0) return null;

  const sorted = [...events].sort(
    (a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  return (
    <section className={cn("", className)}>
      <h2 className="font-display text-lg font-medium text-ink mb-4">
        История изменений
      </h2>
      <ol className="relative space-y-4 border-l border-rule pl-5">
        {sorted.map((event) => {
          const detail = eventDetail(event);
          const label = TASK_EVENT_LABELS[event.event] ?? event.event;
          return (
            <li key={event.id} className="relative">
              <span
                className={cn(
                  "absolute -left-[26px] top-1 size-2.5 rounded-full shadow-[0_0_0_4px_var(--paper)]",
                  EVENT_DOT[event.event] ?? "bg-ink-3"
                )}
                aria-hidden="true"
              />
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <span className="text-sm font-medium text-ink">{label}</span>
                {detail && (
                  <span className="text-sm text-ink-2">{detail}</span>
                )}
              </div>
              <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-ink-4 font-mono">
                <span>{formatStamp(event.created_at)}</span>
                {event.actor && <span>· {event.actor}</span>}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
