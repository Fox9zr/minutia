import type { IssueCategory, IssueStatus, Priority, MeetingStatus, Cadence, TaskEventType } from "./types";

export const ISSUE_CATEGORIES = ["action", "decision", "info", "risk", "blocker"] as const;
// Full type-level union (includes legacy open/dropped so old rows still render).
export const ISSUE_STATUSES = [
  "open",
  "assigned",
  "accepted",
  "in_progress",
  "pending",
  "under_review",
  "resolved",
  "dropped",
  "cancelled",
] as const;
// What the pickers offer — the Phase 2 v2 workflow order. Legacy values are
// deliberately absent so users can never *set* them again.
export const SELECTABLE_ISSUE_STATUSES = [
  "assigned",
  "accepted",
  "in_progress",
  "pending",
  "under_review",
  "resolved",
  "cancelled",
] as const;
// Active = not a terminal state. Resolved/cancelled/dropped are closed.
export const ACTIVE_ISSUE_STATUSES = [
  "open",
  "assigned",
  "accepted",
  "in_progress",
  "pending",
  "under_review",
] as const;
export const CLOSED_ISSUE_STATUSES = ["resolved", "cancelled", "dropped"] as const;
export const PRIORITIES = ["low", "medium", "high", "critical"] as const;
export const MEETING_STATUSES = ["upcoming", "live", "completed"] as const;
export const CADENCES = ["daily", "weekly", "biweekly", "monthly", "adhoc"] as const;

export const CADENCE_LABELS: Record<Cadence, string> = {
  daily: "Ежедневно",
  weekly: "Еженедельно",
  biweekly: "Раз в две недели",
  monthly: "Ежемесячно",
  adhoc: "Разовая",
};

export const STATUS_CONFIG: Record<IssueStatus, { label: string; color: string }> = {
  open: { label: "Открыто", color: "ink" },
  assigned: { label: "Назначено", color: "ink" },
  accepted: { label: "Принято", color: "accent" },
  in_progress: { label: "В работе", color: "accent" },
  pending: { label: "Ожидает", color: "warn" },
  under_review: { label: "На проверке", color: "warn" },
  resolved: { label: "Завершено", color: "success" },
  cancelled: { label: "Отменено", color: "ink-3" },
  dropped: { label: "Исключено", color: "ink-3" },
};

// Human-readable labels for the Phase 2 v2 task_events history log.
export const TASK_EVENT_LABELS: Record<TaskEventType, string> = {
  created: "Создано",
  assigned: "Назначено",
  accepted: "Принято исполнителем",
  due_proposed: "Предложен новый срок",
  due_changed: "Изменён срок",
  status_changed: "Смена статуса",
  hold: "Приостановлено",
  resumed: "Возобновлено",
  closed: "Закрыто",
  reopened: "Переоткрыто",
  split: "Разделено",
  comment: "Комментарий",
};

export const CATEGORY_CONFIG: Record<
  IssueCategory,
  { label: string; glyph: string; shortcut: string }
> = {
  action: { label: "Действие", glyph: "●", shortcut: "a" },
  decision: { label: "Решение", glyph: "◆", shortcut: "d" },
  info: { label: "Информация", glyph: "ℹ", shortcut: "i" },
  risk: { label: "Риск", glyph: "▲", shortcut: "r" },
  blocker: { label: "Блокер", glyph: "■", shortcut: "b" },
};

export const PRIORITY_CONFIG: Record<Priority, { label: string; order: number }> = {
  critical: { label: "Критический", order: 0 },
  high: { label: "Высокий", order: 1 },
  medium: { label: "Средний", order: 2 },
  low: { label: "Low", order: 3 },
};
