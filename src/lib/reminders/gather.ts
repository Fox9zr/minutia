import type { Issue, Priority } from "@/lib/types";
import {
  absenceForName,
  isAbsentOn,
  mskTodayISO,
  type AbsenceLookup,
} from "./absence";

export type OwnerReminder = {
  ownerUserId: string | null;
  ownerName: string | null;
  ownerEmail: string | null;
  issues: Issue[];
  /** ISO date (YYYY-MM-DD) the owner is absent until, set only while absent. */
  absentUntil: string | null;
};

export type ReminderContext = {
  seriesName: string;
  appUrl: string;
};

export type ReminderProfile = {
  email: string;
  name: string | null;
  absentUntil?: string | null;
};

/** Optional reminder context: who is currently absent (Phase 2 v2 P1). */
export type GatherOptions = {
  absence?: AbsenceLookup;
  todayISO?: string;
};

const PRIORITY_RANK: Record<Priority, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

function isOpen(issue: Issue): boolean {
  return (
    issue.status !== "resolved" &&
    issue.status !== "dropped" &&
    issue.status !== "cancelled"
  );
}

function sortIssues(issues: Issue[]): Issue[] {
  return [...issues].sort((a, b) => {
    const byPriority = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
    return byPriority !== 0 ? byPriority : a.issue_number - b.issue_number;
  });
}

// A profile-level absence (if the owner is a system user with one) takes
// precedence over the directory lookup; otherwise fall back to people_directory.
function resolveAbsentUntil(
  profileAbsentUntil: string | null | undefined,
  absence: AbsenceLookup | undefined,
  ownerName: string | null | undefined,
  todayISO: string
): string | null {
  if (isAbsentOn(profileAbsentUntil, todayISO)) {
    return (profileAbsentUntil as string).slice(0, 10);
  }
  return absenceForName(absence, ownerName, todayISO);
}

export function gatherOwnerReminders(
  issues: Issue[],
  profilesById: Record<string, ReminderProfile>,
  options: GatherOptions = {}
): OwnerReminder[] {
  const todayISO = options.todayISO ?? mskTodayISO();
  const groups = new Map<string, OwnerReminder>();

  for (const issue of issues.filter(isOpen)) {
    let key: string;
    let group: OwnerReminder;

    if (issue.owner_user_id) {
      key = issue.owner_user_id;
      const profile = profilesById[issue.owner_user_id];
      group = groups.get(key) ?? {
        ownerUserId: issue.owner_user_id,
        ownerName: profile?.name ?? issue.owner_name,
        ownerEmail: profile?.email ?? null,
        issues: [],
        absentUntil: resolveAbsentUntil(
          profile?.absentUntil,
          options.absence,
          profile?.name ?? issue.owner_name,
          todayISO
        ),
      };
    } else if (issue.owner_name && issue.owner_name.trim()) {
      key = `name:${issue.owner_name}`;
      group = groups.get(key) ?? {
        ownerUserId: null,
        ownerName: issue.owner_name,
        ownerEmail: null,
        issues: [],
        absentUntil: resolveAbsentUntil(
          null,
          options.absence,
          issue.owner_name,
          todayISO
        ),
      };
    } else {
      key = "unassigned";
      group = groups.get(key) ?? {
        ownerUserId: null,
        ownerName: null,
        ownerEmail: null,
        issues: [],
        absentUntil: null,
      };
    }

    group.issues.push(issue);
    groups.set(key, group);
  }

  return [...groups.values()]
    .map((group) => ({ ...group, issues: sortIssues(group.issues) }))
    .sort((a, b) => {
      if (!a.ownerName && b.ownerName) return 1;
      if (a.ownerName && !b.ownerName) return -1;
      return (a.ownerName ?? "").localeCompare(b.ownerName ?? "");
    });
}
