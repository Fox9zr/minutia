"use client";

import * as React from "react";
import { ShieldCheck, Check, RotateCcw, X } from "lucide-react";
import { toast } from "sonner";
import { useIssues, useUpdateIssueStatus } from "@/lib/hooks/use-issues";
import { useSeries } from "@/lib/hooks/use-series";
import { IssueKey } from "@/components/minutia/issue-key";
import { PrefetchIssueLink } from "@/components/minutia/prefetch-issue-link";
import { StatusChip } from "@/components/minutia/status-chip";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/minutia";
import { PRIORITY_CONFIG } from "@/lib/constants";
import { effectiveDueDate, isEffectiveOverdue } from "@/lib/workflow";
import { formatShortDate } from "@/lib/date-utils";
import type { Issue, IssueStatus } from "@/lib/types";

// GM screen (Phase 2 v2): the reviewer confirms "under_review" work before it
// becomes "resolved". Confirming stamps closed_at/closed_by and logs a "closed"
// event; returning sends it back to "in_progress".
export default function GmReviewPage() {
  const { data: issues, isLoading } = useIssues();
  const { data: seriesList } = useSeries();
  const updateStatus = useUpdateIssueStatus();

  const seriesMap = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const s of seriesList ?? []) map.set(s.id, s.name);
    return map;
  }, [seriesList]);

  const reviewIssues = React.useMemo(
    () => (issues ?? []).filter((i) => i.status === "under_review"),
    [issues]
  );

  const grouped = React.useMemo(() => {
    const map = new Map<string, Issue[]>();
    for (const issue of reviewIssues) {
      const arr = map.get(issue.series_id) ?? [];
      arr.push(issue);
      map.set(issue.series_id, arr);
    }
    return [...map.entries()].sort((a, b) =>
      (seriesMap.get(a[0]) ?? "").localeCompare(seriesMap.get(b[0]) ?? "")
    );
  }, [reviewIssues, seriesMap]);

  function act(issue: Issue, newStatus: IssueStatus) {
    updateStatus.mutate(
      {
        issueId: issue.id,
        seriesId: issue.series_id,
        oldStatus: issue.status,
        newStatus,
      },
      {
        onSuccess: () =>
          toast(
            newStatus === "resolved"
              ? "Поручение подтверждено и завершено"
              : "Поручение возвращено в работу"
          ),
      }
    );
  }

  return (
    <div className="min-h-full bg-paper">
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-6 flex items-center gap-3">
          <span className="flex size-9 items-center justify-center rounded-lg bg-accent-soft text-accent">
            <ShieldCheck className="size-5" />
          </span>
          <div>
            <h1 className="font-display text-2xl font-semibold text-ink">
              Проверка руководителя
            </h1>
            <p className="text-sm text-ink-3">
              Поручения, отправленные исполнителями на проверку. Подтвердите
              завершение или верните в работу.
            </p>
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : reviewIssues.length === 0 ? (
          <EmptyState variant="no-actions" />
        ) : (
          <div className="space-y-8">
            {grouped.map(([seriesId, list]) => (
              <div key={seriesId}>
                <h2 className="mb-2 text-[11px] font-medium uppercase tracking-[0.1em] text-ink-4">
                  {seriesMap.get(seriesId) ?? "Серия"}
                </h2>
                <div className="space-y-3">
                  {list.map((issue) => {
                    const due = effectiveDueDate(issue);
                    const overdue = isEffectiveOverdue(issue);
                    return (
                      <div
                        key={issue.id}
                        className="rounded-md border border-rule bg-card p-4 shadow-[var(--shadow-raised)]"
                      >
                        <div className="flex items-start gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="mb-1 flex items-center gap-2">
                              <IssueKey issue={issue} />
                              <span
                                className="text-[11px] font-mono"
                                title="Приоритет"
                              >
                                {PRIORITY_CONFIG[issue.priority]?.label}
                              </span>
                            </div>
                            <PrefetchIssueLink
                              issueId={issue.id}
                              className="block text-left font-sans font-medium text-ink hover:text-ink-2"
                            >
                              {issue.title}
                            </PrefetchIssueLink>
                            <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-ink-3">
                              <StatusChip status={issue.status} readonly />
                              {issue.owner_name && <span>{issue.owner_name}</span>}
                              {due && (
                                <span
                                  className={overdue ? "text-accent font-mono" : "font-mono"}
                                >
                                  {overdue && "Просрочено: "}
                                  {formatShortDate(due)}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            className="text-xs"
                            disabled={updateStatus.isPending}
                            onClick={() => act(issue, "resolved")}
                          >
                            <Check className="size-3.5" />
                            Подтвердить и завершить
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-xs"
                            disabled={updateStatus.isPending}
                            onClick={() => act(issue, "in_progress")}
                          >
                            <RotateCcw className="size-3.5" />
                            Вернуть в работу
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-xs text-danger hover:bg-danger-soft"
                            disabled={updateStatus.isPending}
                            onClick={() => act(issue, "cancelled")}
                          >
                            <X className="size-3.5" />
                            Отменить
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
