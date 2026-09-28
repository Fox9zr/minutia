import type { IssueCategory, IssueStatus, Priority, MeetingStatus, Cadence } from "./types";

export const ISSUE_CATEGORIES = ["action", "decision", "info", "risk", "blocker"] as const;
export const ISSUE_STATUSES = ["open", "in_progress", "pending", "resolved", "dropped"] as const;
export const PRIORITIES = ["low", "medium", "high", "critical"] as const;
export const MEETING_STATUSES = ["upcoming", "live", "completed"] as const;
export const CADENCES = ["daily", "weekly", "biweekly", "monthly", "adhoc"] as const;

export const CADENCE_LABELS: Record<Cadence, string> = {
  daily: "Ежедневно",
  weekly: "Еженедельно",
  biweekly: "Раз в две недели",
  monthly: "Ежемесячно",
  adhoc: "Ad hoc",
};

export const STATUS_CONFIG: Record<IssueStatus, { label: string; color: string }> = {
  open: { label: "Открыто", color: "ink" },
  in_progress: { label: "В работе", color: "accent" },
  pending: { label: "В ожидании", color: "warn" },
  resolved: { label: "Решено", color: "success" },
  dropped: { label: "Исключено", color: "ink-3" },
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
