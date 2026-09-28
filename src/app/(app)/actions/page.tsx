"use client";

import * as React from "react";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { Check, ChevronDown } from "lucide-react";
import { useIssues, useUpdateIssueStatus } from "@/lib/hooks/use-issues";
import { useSeries } from "@/lib/hooks/use-серия";
import { useProfile } from "@/lib/hooks/use-profile";
import { PRIORITY_CONFIG } from "@/lib/constants";
import { EmptyState } from "@/components/minutia";
import { IssueKey } from "@/components/minutia/issue-key";
import { PrefetchIssueLink } from "@/components/minutia/prefetch-issue-link";
import { Skeleton } from "@/components/ui/skeleton";
import type { Issue } from "@/lib/types";
import { isOverdue } from "@/lib/issue-utils";
import { isMyActionIssue } from "@/lib/my-actions";
import { formatShortDate } from "@/lib/date-utils";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sortByPriorityThenDue(a: Issue, b: Issue): number {
  const pDiff =
    PRIORITY_CONFIG[a.priority].order - PRIORITY_CONFIG[b.priority].order;
  if (pDiff !== 0) return pDiff;
  const aDue = a.due_date ? new Date(a.due_date).getTime() : Infinity;
  const bDue = b.due_date ? new Date(b.due_date).getTime() : Infinity;
  return aDue - bDue;
}

// ---------------------------------------------------------------------------
// Section (collapsible group)
// ---------------------------------------------------------------------------

interface SectionProps {
  title: string;
  count: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

function Section({
  title,
  count,
  defaultOpen = true,
  children,
}: SectionProps) {
  const [открыто, setOpen] = React.useState(defaultOpen);

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex items-center gap-2 mb-3 group cursor-pointer"
      >
        <ChevronDown
          className={`size-3.5 text-ink-3 transition-transform duration-200 ${
            открыто ? "" : "-rotate-90"
          }`}
        />
        <h2 className="text-xs font-mono font-medium uppercase tracking-wider text-ink-3">
          {title}
        </h2>
        <span className="text-xs font-mono text-ink-4 tabular-nums">{count}</span>
      </button>

      <AnimatePresence initial={false}>
        {открыто && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.2, 0.8, 0.2, 1] }}
            className="overflow-hidden"
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Compact action row with one-click complete
// ---------------------------------------------------------------------------

function ActionRow({
  issue,
  серияName,
  done,
  index,
  onComplete,
}: {
  issue: Issue;
  серияName?: string;
  done: boolean;
  index: number;
  onComplete: (issue: Issue, opts: { onError: () => void }) => void;
}) {
  const prefersReduced = useReducedMotion();
  const [marked, setMarked] = React.useState(false);
  const checked = done || marked;
  const overdue = isOverdue(issue);

  return (
    <motion.div
      initial={{ opacity: 0, x: -16 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.04, duration: 0.28, ease: [0.2, 0.8, 0.2, 1] }}
      className="group flex h-12 items-center gap-3 rounded-lg px-3 transition-colors hover:bg-paper-2"
    >
      <button
        type="button"
        aria-label={done ? "Completed" : "Отметить выполненным"}
        disabled={checked}
        onClick={() => {
          if (checked) return;
          setMarked(true);
          onComplete(issue, { onError: () => setMarked(false) });
        }}
        className={cn(
          "flex size-5 shrink-0 items-center justify-center rounded-full border-2 outline-none transition-colors",
          "focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-paper",
          checked
            ? "border-success bg-success text-white"
            : "border-rule-strong text-transparent hover:border-accent hover:text-accent"
        )}
      >
        <motion.span
          initial={prefersReduced ? false : { scale: checked ? 1 : 0.4, opacity: checked ? 1 : 0 }}
          animate={{ scale: checked ? 1 : 0.4, opacity: checked ? 1 : 1 }}
          transition={{ duration: prefersReduced ? 0 : 0.2, ease: "easeOut" }}
        >
          <Check className="size-3" strokeWidth={3} />
        </motion.span>
      </button>

      <PrefetchIssueLink
        issueId={issue.id}
        className={cn(
          "min-w-0 flex-1 truncate text-sm transition-colors",
          checked ? "text-ink-4 line-through" : "text-ink group-hover:text-accent"
        )}
      >
        {issue.title}
      </PrefetchIssueLink>

      <div className="flex shrink-0 items-center gap-2.5 text-xs">
        <IssueKey issue={issue} className="h-5 px-1.5 text-[10px]" />
        {серияName && (
          <span className="hidden max-w-[140px] truncate text-ink-4 sm:inline">
            {серияName}
          </span>
        )}
        {issue.due_date && (
          <span
            className={cn(
              "font-mono tabular-nums",
              overdue && !checked ? "text-accent font-medium" : "text-ink-4"
            )}
          >
            {overdue && !checked ? "Overdue" : formatShortDate(issue.due_date)}
          </span>
        )}
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------

function ActionsSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-4 w-64" />
      <div className="space-y-3 mt-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full rounded-md" />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// My Actions page
// ---------------------------------------------------------------------------

export default function MyActionsPage() {
  const { data: issues, isLoading: issuesLoading } = useIssues();
  const { data: серияList, isLoading: серияLoading } = useSeries();
  const { data: profile, isLoading: profileLoading } = useProfile();
  const updateStatus = useUpdateIssueStatus();

  // Build серия name map
  const серияMap = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const s of серияList ?? []) {
      map.set(s.id, s.name);
    }
    return map;
  }, [серияList]);

  // Filter issues assigned to the current user
  const myIssues = React.useMemo(() => {
    if (!issues || !profile) return [];
    return issues.filter((issue) => isMyActionIssue(issue, profile));
  }, [issues, profile]);

  // Group into sections
  const { needsAttention, в ожидании, completed } = React.useMemo(() => {
    const needsAttention: Issue[] = [];
    const в ожидании: Issue[] = [];
    const completed: Issue[] = [];

    for (const issue of myIssues) {
      if (issue.status === "resolved" || issue.status === "dropped") {
        completed.push(issue);
      } else if (issue.status === "в ожидании") {
        в ожидании.push(issue);
      } else {
        // открыто + in_progress
        needsAttention.push(issue);
      }
    }

    needsAttention.sort(sortByPriorityThenDue);
    в ожидании.sort(sortByPriorityThenDue);
    completed.sort(
      (a, b) =>
        new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
    );

    return { needsAttention, в ожидании, completed };
  }, [myIssues]);

  // Counts for summary line
  const открытоCount = needsAttention.length;
  const в ожиданииCount = в ожидании.length;
  const overdueCount = React.useMemo(
    () => myIssues.filter(isOverdue).length,
    [myIssues],
  );

  // Handlers
  function handleComplete(issue: Issue, opts: { onError: () => void }) {
    updateStatus.mutate(
      {
        issueId: issue.id,
        серияId: issue.серия_id,
        oldStatus: issue.status,
        newStatus: "resolved",
      },
      { onError: opts.onError }
    );
  }

  const isLoading = issuesLoading || серияLoading || profileLoading;
  const isEmpty = !isLoading && myIssues.length === 0;

  function renderActionRow(issue: Issue, globalIndex: number, done: boolean) {
    return (
      <ActionRow
        key={issue.id}
        issue={issue}
        серияName={серияMap.get(issue.серия_id)}
        done={done}
        index={globalIndex}
        onComplete={handleComplete}
      />
    );
  }

  return (
    <div className="min-h-screen bg-paper">
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        {/* Header */}
        <div>
          <h1 className="font-display text-3xl font-semibold text-ink tracking-tight">
            My Actions
          </h1>
          {!isLoading && myIssues.length > 0 && (
            <p className="mt-1.5 text-sm text-ink-2">
              {открытоCount > 0 && <span>{открытоCount} OPEN</span>}
              {в ожиданииCount > 0 && (
                <span>
                  {открытоCount > 0 ? " · " : ""}
                  {в ожиданииCount} PENDING
                </span>
              )}
              {overdueCount > 0 && (
                <span className="text-accent">
                  {открытоCount > 0 || в ожиданииCount > 0 ? " · " : ""}
                  {overdueCount} OVERDUE
                </span>
              )}
            </p>
          )}
        </div>

        {/* Loading skeleton */}
        {isLoading && (
          <div className="mt-8">
            <ActionsSkeleton />
          </div>
        )}

        {/* Empty state */}
        {isEmpty && <EmptyState variant="no-actions" />}

        {/* Main content */}
        {!isLoading && !isEmpty && (
          <div className="mt-6 space-y-8">
            {/* Needs Attention */}
            {needsAttention.length > 0 && (
              <Section
                title="Требует внимания"
                count={needsAttention.length}
                defaultOpen={true}
              >
                <div className="space-y-0.5">
                  {needsAttention.map((issue, index) =>
                    renderActionRow(issue, index, false),
                  )}
                </div>
              </Section>
            )}

            {/* Pending */}
            {в ожидании.length > 0 && (
              <Section
                title="В ожидании"
                count={в ожидании.length}
                defaultOpen={true}
              >
                <div className="space-y-0.5">
                  {в ожидании.map((issue, index) =>
                    renderActionRow(issue, needsAttention.length + index, false),
                  )}
                </div>
              </Section>
            )}

            {/* Completed (collapsed by default) */}
            {completed.length > 0 && (
              <Section
                title="Завершено"
                count={completed.length}
                defaultOpen={false}
              >
                <div className="space-y-0.5">
                  {completed.map((issue, index) =>
                    renderActionRow(
                      issue,
                      needsAttention.length + в ожидании.length + index,
                      true,
                    ),
                  )}
                </div>
              </Section>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
