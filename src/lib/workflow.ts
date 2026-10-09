import type { Issue, IssueStatus, TaskEventType } from "./types";

// ---------------------------------------------------------------------------
// Phase 2 v2 workflow helpers — shared by every surface that reads status.
//
// Target model (agreed 29.09):
//   Назначено (assigned) → Принято (accepted) → В работе (in_progress)
//   → Ожидает (pending) → На проверке (under_review)
//   → Завершено (resolved, GM-confirmed) | Отменено (cancelled)
// "Приостановлено" is a branch, not a status: it is expressed by hold_reason /
// hold_until on top of whatever status the issue is in.
// ---------------------------------------------------------------------------

const CLOSED: ReadonlySet<IssueStatus> = new Set([
  "resolved",
  "cancelled",
  "dropped",
]);

/** Terminal state (done or abandoned) — excluded from "open work" views. */
export function isClosedStatus(status: IssueStatus): boolean {
  return CLOSED.has(status);
}

/** Still live: counts toward workload, reminders, outstanding lists. */
export function isActiveStatus(status: IssueStatus): boolean {
  return !isClosedStatus(status);
}

export function isClosedIssue(issue: Pick<Issue, "status">): boolean {
  return isClosedStatus(issue.status);
}

export function isActiveIssue(issue: Pick<Issue, "status">): boolean {
  return isActiveStatus(issue.status);
}

/** An active issue that is currently parked on a hold with a return date. */
export function isOnHold(
  issue: Pick<Issue, "status" | "hold_until" | "hold_reason">
): boolean {
  return (
    isActiveStatus(issue.status) &&
    (!!issue.hold_until || !!issue.hold_reason?.trim())
  );
}

/**
 * Effective deadline (эффективный срок): the date the task is actually judged
 * against. While an issue is on hold until `hold_until`, the deadline extends
 * to that return date if it is later than the nominal `due_date`. Otherwise it
 * is simply the nominal due date.
 */
export function effectiveDueDate(
  issue: Pick<Issue, "due_date" | "hold_until" | "hold_reason" | "status">
): Date | null {
  const due = issue.due_date ? new Date(issue.due_date) : null;
  if (!isActiveStatus(issue.status)) return due;
  if (!issue.hold_until) return due;
  const hold = new Date(issue.hold_until);
  if (Number.isNaN(hold.getTime())) return due;
  if (!due || hold.getTime() > due.getTime()) return hold;
  return due;
}

export function isEffectiveOverdue(
  issue: Pick<Issue, "due_date" | "hold_until" | "hold_reason" | "status">
): boolean {
  if (isClosedStatus(issue.status)) return false;
  const due = effectiveDueDate(issue);
  if (!due) return false;
  return due.getTime() < Date.now();
}

// ---------------------------------------------------------------------------
// History (task_events) — derive the event type from a status transition so
// every writer (client hooks, GM screen, respond route) logs consistently.
// ---------------------------------------------------------------------------
export function statusTransitionEvent(
  from: IssueStatus,
  to: IssueStatus
): TaskEventType {
  if (to === "accepted") return "accepted";
  if (to === "assigned") return "assigned";
  if (to === "resolved") return "closed";
  if (isClosedStatus(from) && isActiveStatus(to)) return "reopened";
  if (to === "pending" && from !== "pending") return "status_changed";
  return "status_changed";
}
