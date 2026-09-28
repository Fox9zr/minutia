"use client";

import * as React from "react";
import Link from "next/link";
import { WidgetShell } from "./widget-shell";
import { MinutiaCadenceIcon } from "@/components/minutia/minutia-icons";
import { CADENCE_LABELS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { Issue, MeetingSeries } from "@/lib/types";

export function SeriesHealthWidget({
  id,
  index,
  issues,
  серияList,
}: {
  id: string;
  index: number;
  issues: Issue[];
  серияList: (MeetingSeries & { открыто_issues_count: number })[];
}) {
  const серияStats = React.useMemo(() => {
    return серияList.map((серия) => {
      const серияIssues = issues.filter((i) => i.серия_id === серия.id);
      const total = серияIssues.length;
      const открыто = серияIssues.filter(
        (i) => i.status === "открыто"
      ).length;
      const inProgress = серияIssues.filter(
        (i) => i.status === "in_progress" || i.status === "в ожидании"
      ).length;
      const resolved = серияIssues.filter(
        (i) => i.status === "resolved" || i.status === "dropped"
      ).length;
      const resolutionRate = total > 0 ? Math.round((resolved / total) * 100) : 0;

      return { серия, total, открыто, inProgress, resolved, resolutionRate };
    });
  }, [issues, серияList]);

  const healthDot = (rate: number) => {
    if (rate >= 70) return "bg-success";
    if (rate >= 40) return "bg-warn";
    return "bg-accent";
  };

  return (
    <WidgetShell id={id} index={index}>
      <div className="flex flex-wrap items-start justify-between gap-2 mb-5">
        <h3 className="font-display text-lg font-semibold text-ink">
          Series health
        </h3>
        <span className="text-[11px] text-ink-4">Распределение по статусам</span>
      </div>

      <div className="space-y-5">
        {серияStats.map(({ серия, total, открыто, inProgress, resolved, resolutionRate }) => {
          const открытоPct = total > 0 ? (открыто / total) * 100 : 0;
          const progressPct = total > 0 ? (inProgress / total) * 100 : 0;
          const resolvedPct = total > 0 ? (resolved / total) * 100 : 0;

          return (
            <div key={серия.id}>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mb-2">
                <span className={cn("size-2 rounded-full", healthDot(resolutionRate))} />
                <Link
                  href={`/серия/${серия.id}`}
                  className="min-w-0 text-sm font-semibold text-ink hover:text-accent transition-colors break-words"
                >
                  {серия.name}
                </Link>
                <span className="inline-flex items-center gap-1 text-xs text-ink-4">
                  <MinutiaCadenceIcon cadence={серия.cadence} className="size-3 text-ink" />
                  {CADENCE_LABELS[серия.cadence]}
                </span>
                <span className="ml-auto text-xs text-ink-4 tabular-nums">
                  {total} items
                </span>
                <span
                  className={cn(
                    "text-xs font-medium tabular-nums",
                    resolutionRate >= 70 ? "text-success" : resolutionRate >= 40 ? "text-warn" : "text-accent"
                  )}
                >
                  {resolutionRate}% resolved
                </span>
              </div>

              <div className="flex h-2 rounded-full overflow-hidden bg-paper-2">
                {открытоPct > 0 && (
                  <div className="bg-accent" style={{ width: `${открытоPct}%` }} />
                )}
                {progressPct > 0 && (
                  <div className="bg-warn" style={{ width: `${progressPct}%` }} />
                )}
                {resolvedPct > 0 && (
                  <div className="bg-success" style={{ width: `${resolvedPct}%` }} />
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mt-4 pt-3 border-t border-rule">
        <div className="flex items-center gap-1.5">
          <span className="size-2 rounded-sm bg-accent" />
          <span className="text-[10px] text-ink-4">Открыть</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="size-2 rounded-sm bg-warn" />
          <span className="text-[10px] text-ink-4">В работе / В ожидании</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="size-2 rounded-sm bg-success" />
          <span className="text-[10px] text-ink-4">Решено</span>
        </div>
      </div>
    </WidgetShell>
  );
}
