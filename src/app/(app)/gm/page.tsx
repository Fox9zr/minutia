"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
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
import { themeGroupLabel, UNGROUPED_THEME_LABEL } from "@/lib/theme-groups";
import { formatShortDate } from "@/lib/date-utils";
import type { Issue, IssueStatus } from "@/lib/types";

// GM screen (Phase 2 v2): the reviewer confirms "under_review" work before it
// becomes "resolved". Confirming stamps closed_at/closed_by and logs a "closed"
// event; returning sends it back to "in_progress".
export default function GmReviewPage() {
  const { data: issues, isLoading } = useIssues();
  const { data: seriesList } = useSeries();
  const updateStatus = useUpdateIssueStatus();

  // Phase 2 v2 P1: кто сейчас отсутствует (people_directory.absent_until >= сегодня).
  // Такой ответственный помечается в дайджесте; соисполнители (co_owners) здесь
  // намеренно НЕ выводятся — только главный ответственный.
  const { data: directory } = useQuery<{
    people: { full_name: string; absent_until: string | null }[];
  }>({
    queryKey: ["directory"],
    queryFn: async () => {
      const res = await fetch("/api/directory");
      if (!res.ok) return { people: [] };
      return res.json();
    },
  });

  const absentByName = React.useMemo(() => {
    const today = new Date(
      Date.now() + (3 * 60 + new Date().getTimezoneOffset()) * 60_000
    )
      .toISOString()
      .slice(0, 10);
    const map = new Map<string, string>();
    for (const p of directory?.people ?? []) {
      if (p.absent_until && p.absent_until.slice(0, 10) >= today) {
        map.set(
          p.full_name.trim().toLowerCase().replace(/\s+/g, " "),
          p.absent_until.slice(0, 10)
        );
      }
    }
    return map;
  }, [directory]);

  function absenceFor(name: string | null | undefined): string | null {
    if (!name) return null;
    return (
      absentByName.get(name.trim().toLowerCase().replace(/\s+/g, " ")) ?? null
    );
  }

  const seriesMap = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const s of seriesList ?? []) map.set(s.id, s.name);
    return map;
  }, [seriesList]);

  // series id → its theme group label ('' → "Без группы").
  const seriesThemeMap = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const s of seriesList ?? []) map.set(s.id, themeGroupLabel(s.theme_group));
    return map;
  }, [seriesList]);

  const reviewIssues = React.useMemo(
    () => (issues ?? []).filter((i) => i.status === "under_review"),
    [issues]
  );

  // Group review issues into the theme hierarchy: theme group → series → issues.
  const grouped = React.useMemo(() => {
    const byTheme = new Map<string, Map<string, Issue[]>>();
    for (const issue of reviewIssues) {
      const theme = seriesThemeMap.get(issue.series_id) ?? UNGROUPED_THEME_LABEL;
      const seriesBucket = byTheme.get(theme) ?? new Map<string, Issue[]>();
      const arr = seriesBucket.get(issue.series_id) ?? [];
      arr.push(issue);
      seriesBucket.set(issue.series_id, arr);
      byTheme.set(theme, seriesBucket);
    }
    return [...byTheme.entries()]
      .sort((a, b) => {
        const au = a[0] === UNGROUPED_THEME_LABEL;
        const bu = b[0] === UNGROUPED_THEME_LABEL;
        if (au !== bu) return au ? 1 : -1;
        return a[0].localeCompare(b[0], "ru");
      })
      .map(([theme, seriesBucket]) => ({
        theme,
        series: [...seriesBucket.entries()].sort((a, b) =>
          (seriesMap.get(a[0]) ?? "").localeCompare(seriesMap.get(b[0]) ?? "", "ru")
        ),
      }));
  }, [reviewIssues, seriesMap, seriesThemeMap]);

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
            {grouped.map((group) => (
              <div key={group.theme} className="space-y-5">
                <h2 className="font-display text-lg font-medium text-ink">
                  {group.theme}
                </h2>
                {group.series.map(([seriesId, list]) => (
                  <div key={seriesId}>
                    <h3 className="mb-2 text-[11px] font-medium uppercase tracking-[0.1em] text-ink-4">
                      {seriesMap.get(seriesId) ?? "Серия"}
                    </h3>
                    <div className="space-y-3">
                  {list.map((issue) => {
                    const due = effectiveDueDate(issue);
                    const overdue = isEffectiveOverdue(issue);
                    const absent = absenceFor(issue.owner_name);
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
                              {absent && (
                                <span
                                  className="text-amber-700"
                                  title="Ответственный отсутствует"
                                >
                                  Ответственный отсутствует до {absent.slice(8, 10)}.{absent.slice(5, 7)}
                                </span>
                              )}
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
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
