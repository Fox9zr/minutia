import type { MeetingSeries } from "./types";

// ---------------------------------------------------------------------------
// Phase 2 v2 P0.3 — theme hierarchy.
//
// A series belongs to exactly one top-level theme group. The SSOT is the plain
// text column meeting_series.theme_group (no separate groups table); the set of
// available groups is simply the distinct non-empty values across series.
// theme_subtopic optionally narrows a series within its group.
//
// This module is the single place that decides how series bucket into groups,
// so the series tree, the GM screen and the dashboard all agree.
// ---------------------------------------------------------------------------

export const UNGROUPED_THEME_LABEL = "Без группы";

/** Canonical group label for a series' theme_group ('' → ungrouped bucket). */
export function themeGroupLabel(themeGroup: string | null | undefined): string {
  const value = (themeGroup ?? "").trim();
  return value === "" ? UNGROUPED_THEME_LABEL : value;
}

/** True for the synthetic "ungrouped" bucket (always sorted last). */
export function isUngroupedTheme(themeGroup: string | null | undefined): boolean {
  return (themeGroup ?? "").trim() === "";
}

/** A group of series sharing the same theme_group. */
export interface ThemeGroup<T> {
  /** Canonical label; unique per group. */
  key: string;
  /** Display label. */
  label: string;
  ungrouped: boolean;
  series: T[];
}

/**
 * Group any series-like rows by theme_group. Groups are sorted alphabetically
 * (ungrouped last); series are sorted by name within each group.
 */
export function groupByTheme<
  T extends { theme_group?: string | null; name: string },
>(series: readonly T[]): ThemeGroup<T>[] {
  const map = new Map<string, ThemeGroup<T>>();
  for (const s of series) {
    const label = themeGroupLabel(s.theme_group);
    const existing = map.get(label);
    if (existing) {
      existing.series.push(s);
    } else {
      map.set(label, {
        key: label,
        label,
        ungrouped: isUngroupedTheme(s.theme_group),
        series: [s],
      });
    }
  }
  const groups = [...map.values()];
  for (const g of groups) {
    g.series.sort((a, b) => a.name.localeCompare(b.name, "ru"));
  }
  groups.sort((a, b) => {
    if (a.ungrouped !== b.ungrouped) return a.ungrouped ? 1 : -1;
    return a.label.localeCompare(b.label, "ru");
  });
  return groups;
}

/** Distinct non-empty theme groups across the given series, alphabetical. */
export function distinctThemeGroups(
  series: readonly Pick<MeetingSeries, "theme_group">[]
): string[] {
  const set = new Set<string>();
  for (const s of series) {
    const value = (s.theme_group ?? "").trim();
    if (value) set.add(value);
  }
  return [...set].sort((a, b) => a.localeCompare(b, "ru"));
}
