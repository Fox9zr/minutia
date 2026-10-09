"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronRight, AlertTriangle, CalendarDays, ListChecks } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { CADENCE_LABELS } from "@/lib/constants";
import { MinutiaCadenceIcon } from "@/components/minutia/minutia-icons";
import { groupByTheme } from "@/lib/theme-groups";
import type { SeriesTreeRow } from "@/lib/hooks/use-series";

// ---------------------------------------------------------------------------
// ThemeTree (Phase 2 v2 P0.3) — «свёрнутое дерево плюсиками»:
//   Группа → Серия → (счётчики). Collapsed by default, except groups that hold
//   at least one overdue assignment (those open so the red flag is visible).
// ---------------------------------------------------------------------------

function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if ([2, 3, 4].includes(mod10) && ![12, 13, 14].includes(mod100)) return few;
  return many;
}

export function ThemeTree({
  series,
  className,
}: {
  series: SeriesTreeRow[];
  className?: string;
}) {
  const groups = React.useMemo(() => groupByTheme(series), [series]);

  // Seed the collapsed set once per group-key signature: everything collapsed
  // except groups that carry overdue work.
  const signature = groups.map((g) => g.key).join("\u0001");
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set());
  const [seeded, setSeeded] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (seeded === signature) return;
    setExpanded(
      new Set(groups.filter((g) => g.series.some((s) => s.overdue_count > 0)).map((g) => g.key))
    );
    setSeeded(signature);
  }, [signature, seeded, groups]);

  const toggle = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <div className={cn("space-y-3", className)}>
      {groups.map((group) => {
        const isOpen = expanded.has(group.key);
        const seriesCount = group.series.length;
        const meetingsCount = group.series.reduce((sum, s) => sum + s.meetings_count, 0);
        const openCount = group.series.reduce((sum, s) => sum + s.open_issues_count, 0);
        const overdueCount = group.series.reduce((sum, s) => sum + s.overdue_count, 0);

        return (
          <div
            key={group.key}
            className="overflow-hidden rounded-lg bg-card shadow-[var(--shadow-raised)]"
          >
            <button
              type="button"
              onClick={() => toggle(group.key)}
              aria-expanded={isOpen}
              className="flex w-full items-center gap-3 px-4 py-3 text-left outline-none transition-colors hover:bg-paper-2 focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset"
            >
              <ChevronRight
                className={cn(
                  "size-4 shrink-0 text-ink-4 transition-transform duration-150",
                  isOpen && "rotate-90"
                )}
              />
              <span className="flex-1 min-w-0">
                <span className="block truncate font-display text-base font-medium text-ink">
                  {group.label}
                </span>
                <span className="mt-0.5 block text-xs text-ink-3">
                  {seriesCount} {plural(seriesCount, "серия", "серии", "серий")}
                  {" · "}
                  {meetingsCount} {plural(meetingsCount, "встреча", "встречи", "встреч")}
                  {" · "}
                  {openCount} {plural(openCount, "открытое поручение", "открытых поручения", "открытых поручений")}
                </span>
              </span>
              {overdueCount > 0 && (
                <Badge
                  variant="secondary"
                  className="shrink-0 gap-1 text-[11px] text-danger"
                  aria-label={`Просрочено: ${overdueCount}`}
                >
                  <span
                    className="size-1.5 rounded-full bg-danger"
                    aria-hidden="true"
                  />
                  {overdueCount}
                </Badge>
              )}
            </button>

            {isOpen && (
              <div className="divide-y divide-rule border-t border-rule">
                {group.series.map((s) => (
                  <Link
                    key={s.id}
                    href={`/series/${s.id}`}
                    className="group flex items-center gap-3 px-4 py-3 pl-10 outline-none transition-colors hover:bg-paper-2 focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset"
                  >
                    <span className="flex-1 min-w-0">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium text-ink group-hover:text-accent">
                          {s.name}
                        </span>
                        {s.theme_subtopic && (
                          <span className="shrink-0 rounded-full bg-paper-2 px-2 py-0.5 text-[10px] font-medium text-ink-3">
                            {s.theme_subtopic}
                          </span>
                        )}
                      </span>
                      <span className="mt-1 flex flex-wrap items-center gap-3 text-xs text-ink-3">
                        <span className="inline-flex items-center gap-1">
                          <MinutiaCadenceIcon cadence={s.cadence} className="size-3 text-ink-4" />
                          {CADENCE_LABELS[s.cadence]}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <CalendarDays className="size-3 text-ink-4" />
                          {s.meetings_count} {plural(s.meetings_count, "встреча", "встречи", "встреч")}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <ListChecks className="size-3 text-ink-4" />
                          {s.open_issues_count} {plural(s.open_issues_count, "открыто", "открыто", "открыто")}
                        </span>
                      </span>
                    </span>
                    {s.overdue_count > 0 && (
                      <Badge
                        variant="secondary"
                        className="shrink-0 gap-1 text-[11px] text-danger"
                        aria-label={`Просрочено: ${s.overdue_count}`}
                      >
                        <AlertTriangle className="size-3" />
                        {s.overdue_count}
                      </Badge>
                    )}
                  </Link>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
