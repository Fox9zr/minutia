import type { Issue } from "@/lib/types";
import { PRIORITY_CONFIG } from "@/lib/constants";
import { isActiveStatus, isEffectiveOverdue } from "@/lib/workflow";

export function formatIssueKey(issue: Pick<Issue, "issue_number">): string {
  return `OIL-${issue.issue_number}`;
}

export function parseIssueKey(value: string): number | null {
  const match = /^OIL-(\d+)$/i.exec(value.trim());
  if (!match) return null;
  const issueNumber = Number(match[1]);
  return Number.isSafeInteger(issueNumber) && issueNumber > 0
    ? issueNumber
    : null;
}

export function isOpen(issue: Issue): boolean {
  return isActiveStatus(issue.status);
}

// Overdue is judged against the EFFECTIVE deadline (hold-until extends it), so a
// paused task is never nagged as overdue before it is due back.
export function isOverdue(issue: Issue): boolean {
  return isEffectiveOverdue(issue);
}

// Manual drag order (positive sort_order) wins; issues that have never been
// dragged share sort_order 0 and fall back to priority, then newest-first, so
// the board keeps its priority ordering until a user deliberately reorders.
export const byManualOrder = (a: Issue, b: Issue) =>
  a.sort_order - b.sort_order ||
  (PRIORITY_CONFIG[a.priority]?.order ?? 99) -
    (PRIORITY_CONFIG[b.priority]?.order ?? 99) ||
  new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
