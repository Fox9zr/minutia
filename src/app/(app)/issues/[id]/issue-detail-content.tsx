"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { motion } from "motion/react";
import Link from "next/link";
import { toast } from "sonner";
import { VoiceInput } from "@/components/minutia/voice-input";
import {
  ArrowLeft,
  Bell,
  Check,
  Pencil,
  Trash2,
  Calendar as CalendarIcon,
} from "lucide-react";
import {
  useIssue,
  useUpdateIssue,
  useUpdateIssueStatus,
  useDeleteIssue,
  useAddIssueUpdate,
  useAssignIssue,
  useAcceptIssue,
  useSetHold,
  issueKeys,
} from "@/lib/hooks/use-issues";
import { applyOptimistic, patch } from "@/lib/optimistic";
import { removeIssue, isListCache } from "@/lib/optimistic-updates";
import {
  beginPendingDelete,
  undoPendingDelete,
  isPendingDelete,
  markCommitting,
} from "@/lib/pending-delete";
import { StatusChip } from "@/components/minutia/status-chip";
import { CategoryBadge } from "@/components/minutia/category-badge";
import { IssueKey } from "@/components/minutia/issue-key";
import { MemberCombobox } from "@/components/minutia/member-combobox";
import { splitEvidence } from "@/lib/parse-evidence";
import { PriorityIndicator } from "@/components/minutia/priority-indicator";
import { MaterialLinksSection } from "@/components/minutia/material-links";
import { TimelineNode } from "@/components/minutia/timeline-node";
import { TaskHistory } from "@/components/minutia/task-history";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { daysBetween, toLocalISODate } from "@/lib/date-utils";
import { PRIORITIES, STATUS_CONFIG } from "@/lib/constants";
import { effectiveDueDate, isOnHold } from "@/lib/workflow";
import type { Issue, IssueStatus, Priority, IssueUpdate, Meeting } from "@/lib/types";

// Mirrors the priority color tokens in priority-indicator.tsx.
const priorityDotColor: Record<Priority, string> = {
  critical: "bg-accent",
  high: "bg-ink",
  medium: "bg-ink-3",
  low: "bg-ink-4",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(date: Date | string): string {
  return new Date(date).toLocaleDateString("ru-RU", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatISODate(date: Date | string): string {
  // A picked Date is at local midnight; format from local fields so it is not
  // shifted back a day in timezones ahead of UTC. Stored strings are already
  // date-only, so slice them directly without re-parsing.
  return typeof date === "string" ? date.slice(0, 10) : toLocalISODate(date);
}

function sourceBadgeLabel(source: string): string {
  const map: Record<string, string> = {
    manual: "Вручную",
    transcript: "Транскрибация",
    email: "Email",
    api: "API",
    ai_suggested: "Предложено ИИ",
    calendar_auto_draft: "Черновик в календаре",
  };
  return map[source] ?? source;
}

// ---------------------------------------------------------------------------
// Inline editable field
// ---------------------------------------------------------------------------

function InlineEditText({
  value,
  onSave,
  className,
  as: Tag = "span",
  placeholder,
  multiline,
}: {
  value: string;
  onSave: (v: string) => void;
  className?: string;
  as?: "span" | "h1" | "p";
  placeholder?: string;
  multiline?: boolean;
}) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(value);
  const inputRef = React.useRef<HTMLInputElement | HTMLTextAreaElement>(null);

  React.useEffect(() => {
    setDraft(value);
  }, [value]);

  React.useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  function commit() {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== value) {
      onSave(trimmed);
    } else {
      setDraft(value);
    }
    setEditing(false);
  }

  function cancel() {
    setDraft(value);
    setEditing(false);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !multiline) {
      e.preventDefault();
      commit();
    }
    if (e.key === "Escape") {
      e.preventDefault();
      cancel();
    }
  }

  if (editing) {
    if (multiline) {
      return (
        <textarea
          ref={inputRef as React.RefObject<HTMLTextAreaElement>}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={handleKeyDown}
          className={cn(
            "w-full bg-transparent border border-rule rounded-md px-2 py-1 focus:outline-none focus:border-ink-3 resize-y",
            className
          )}
          rows={3}
          placeholder={placeholder}
          aria-label={placeholder}
        />
      );
    }
    return (
      <input
        ref={inputRef as React.RefObject<HTMLInputElement>}
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={handleKeyDown}
        className={cn(
          "w-full bg-transparent border border-rule rounded-md px-2 py-0.5 focus:outline-none focus:border-ink-3",
          className
        )}
        placeholder={placeholder}
        aria-label={placeholder}
      />
    );
  }

  const displayValue = value || placeholder || "Нажмите для редактирования";

  if (Tag === "h1") {
    return (
      <div className="mb-3 flex items-start gap-2">
        <h1 className={cn(!value && "text-ink-4 italic", className)}>
          {displayValue}
        </h1>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => setEditing(true)}
          aria-label={`Edit ${placeholder ?? "field"}`}
          className="mt-0.5 size-7 shrink-0 text-ink-3 hover:text-ink"
        >
          <Pencil className="size-3.5" />
        </Button>
      </div>
    );
  }

  return (
    <Tag
      className={cn(
        "cursor-pointer hover:bg-paper-2 rounded px-1 -mx-1 transition-colors",
        !value && "text-ink-4 italic",
        className
      )}
      onClick={() => setEditing(true)}
      tabIndex={0}
      onKeyDown={(e: React.KeyboardEvent) => {
        if (e.key === "Enter") setEditing(true);
      }}
      role="button"
      aria-label={`Edit ${placeholder ?? "field"}`}
    >
      {displayValue}
    </Tag>
  );
}

// ---------------------------------------------------------------------------
// Co-owners editor (Phase 2 v2 P1): свободный список соисполнителей строкой
// через запятую. Главный ответственный — отдельное поле (MemberCombobox выше);
// здесь только соисполнители.
// ---------------------------------------------------------------------------

function CoOwnersEditor({
  value,
  onSave,
}: {
  value: string;
  onSave: (v: string) => void;
}) {
  const [draft, setDraft] = React.useState(value);
  React.useEffect(() => {
    setDraft(value);
  }, [value]);
  const dirty = draft.trim() !== value.trim();

  function commit() {
    if (dirty) onSave(draft.trim());
  }

  return (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      <input
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          }
        }}
        placeholder="через запятую"
        aria-label="Соисполнители, через запятую"
        className="w-full max-w-md rounded-md border border-rule bg-transparent px-2 py-0.5 text-sm text-ink-2 focus:border-ink-3 focus:outline-none"
      />
      {dirty && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 text-xs"
          onClick={commit}
        >
          Сохранить
        </Button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Issue Detail Content
// ---------------------------------------------------------------------------

interface IssueDetailContentProps {
  issueId: string;
}

export function IssueDetailContent({ issueId }: IssueDetailContentProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: issue, isLoading, isError } = useIssue(issueId);
  const updateIssue = useUpdateIssue();
  const updateIssueStatus = useUpdateIssueStatus();
  const deleteIssue = useDeleteIssue();
  const addUpdate = useAddIssueUpdate();
  const assignIssue = useAssignIssue();
  const acceptIssue = useAcceptIssue();
  const setHold = useSetHold();
  const [showUpdateForm, setShowUpdateForm] = React.useState(false);
  const [remindPending, setRemindPending] = React.useState(false);
  const [updateNote, setUpdateNote] = React.useState("");
  const [dueOpen, setDueOpen] = React.useState(false);
  const [showHoldForm, setShowHoldForm] = React.useState(false);
  const [holdReasonDraft, setHoldReasonDraft] = React.useState("");
  const [holdUntilDraft, setHoldUntilDraft] = React.useState("");
  const updateInputRef = React.useRef<HTMLTextAreaElement>(null);

  const statusCycle: IssueStatus[] = [
    "assigned",
    "in_progress",
    "under_review",
    "pending",
    "resolved",
  ];

  React.useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      switch (e.key) {
        case "c":
          e.preventDefault();
          setShowUpdateForm(true);
          break;
        case "Escape":
          e.preventDefault();
          router.back();
          break;
        case "r":
          if (issue) {
            e.preventDefault();
            handleStatusChange("resolved");
          }
          break;
        case "d":
          if (issue) {
            e.preventDefault();
            handleStatusChange("cancelled");
          }
          break;
        case "v":
          if (issue) {
            e.preventDefault();
            handleStatusChange("under_review");
          }
          break;
        case "s":
          if (issue) {
            e.preventDefault();
            const currentIdx = statusCycle.indexOf(issue.status);
            const nextStatus = statusCycle[(currentIdx + 1) % statusCycle.length];
            handleStatusChange(nextStatus);
          }
          break;
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [issue]);

  React.useEffect(() => {
    if (showUpdateForm) updateInputRef.current?.focus();
  }, [showUpdateForm]);

  // Loading skeleton
  if (isLoading) {
    return (
      <div className="min-h-full bg-paper">
        <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
          <Skeleton className="h-5 w-20 mb-6" />
          <Skeleton className="h-8 w-80 mb-3" />
          <div className="flex gap-3 mb-4">
            <Skeleton className="h-5 w-16 rounded-full" />
            <Skeleton className="h-5 w-16 rounded-full" />
            <Skeleton className="h-5 w-20 rounded-full" />
          </div>
          <Skeleton className="h-4 w-48 mb-2" />
          <Skeleton className="h-4 w-36 mb-8" />
          <Skeleton className="h-px w-full mb-6" />
          <Skeleton className="h-6 w-40 mb-4" />
          <div className="space-y-6">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        </div>
      </div>
    );
  }

  // 404
  if (!issue || isError) {
    return (
      <div className="min-h-full bg-paper flex flex-col items-center justify-center gap-4">
        <p className="text-sm text-ink-3">Задача не найдена.</p>
        <Link
          href="/"
          className="text-sm text-ink-2 hover:text-ink transition-colors underline underline-offset-2"
        >
          Back to OIL Board
        </Link>
      </div>
    );
  }

  // Derived data
  const raisedIn = issue.raised_in_meeting;
  const effectiveDue = effectiveDueDate(issue);
  const onHold = isOnHold(issue);
  const updates = [...(issue.updates ?? [])].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
  const durationDays = daysBetween(
    issue.created_at,
    new Date()
  );
  const meetingsTouched = new Set(updates.map((u) => u.meeting_id).filter(Boolean))
    .size;

  // Handlers
  function handleStatusChange(newStatus: IssueStatus) {
    if (!issue) return;
    updateIssueStatus.mutate({
      issueId: issue.id,
      seriesId: issue.series_id,
      oldStatus: issue.status,
      newStatus,
    });
  }

  function handleFieldSave(field: string, value: string | null) {
    if (!issue) return;
    updateIssue.mutate({ issueId: issue.id, [field]: value });
  }

  function handlePriorityChange(value: string) {
    handleFieldSave("priority", value);
  }

  function handleDueDateSelect(date: Date | undefined) {
    const val = date ? formatISODate(date) : null;
    handleFieldSave("due_date", val);
    setDueOpen(false);
  }

  function handleAccept() {
    if (!issue) return;
    acceptIssue.mutate({ issueId: issue.id, seriesId: issue.series_id });
  }

  function handleStartHold() {
    if (!issue) return;
    setHold.mutate({
      issueId: issue.id,
      seriesId: issue.series_id,
      reason: holdReasonDraft.trim(),
      until: holdUntilDraft || null,
    });
    setShowHoldForm(false);
    setHoldReasonDraft("");
    setHoldUntilDraft("");
  }

  function handleResume() {
    if (!issue) return;
    setHold.mutate({
      issueId: issue.id,
      seriesId: issue.series_id,
      reason: "",
      until: null,
    });
  }

  async function handleSubmitUpdate() {
    if (!issue || !updateNote.trim()) return;
    await addUpdate.mutateAsync({
      issueId: issue.id,
      note: updateNote.trim(),
      oldStatus: issue.status,
      newStatus: issue.status,
    });
    setUpdateNote("");
    setShowUpdateForm(false);
  }

  function handleDelete() {
    if (!issue) return;
    const id = issue.id;
    // Re-entrancy guard: a double-click (client navigation isn't instant) must
    // not spawn a second toast + second commit for the same issue.
    if (isPendingDelete(id)) return;

    function commit() {
      if (!isPendingDelete(id)) return;
      markCommitting(id);
      deleteIssue.mutate(id);
    }

    beginPendingDelete(id);
    void applyOptimistic(queryClient, [
      patch<Issue[]>({ queryKey: issueKeys.all, predicate: isListCache }, removeIssue(id)),
    ]);
    router.push("/dashboard");
    toast("Задача удалена", {
      duration: 5000,
      action: {
        label: "Отменить",
        onClick: () => {
          if (undoPendingDelete(id)) {
            queryClient.invalidateQueries({ queryKey: issueKeys.all });
          }
        },
      },
      onAutoClose: commit,
      onDismiss: commit,
    });
  }

  return (
    <div className="min-h-full bg-paper">
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-6 flex items-center justify-between gap-4">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => router.back()}
            className="-ml-2 text-ink-3 hover:text-ink"
          >
            <ArrowLeft className="size-4" />
            Back
          </Button>
          <IssueKey issue={issue} className="shrink-0" />
        </div>

        {/* Title (inline editable) */}
        <InlineEditText
          value={issue.title}
          onSave={(v) => handleFieldSave("title", v)}
          className="font-display text-xl font-semibold text-ink block mb-3"
          as="h1"
          placeholder="Тема вопроса"
        />

        {/* Badges row */}
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <CategoryBadge category={issue.category} />
          <PriorityIndicator priority={issue.priority} />
          <StatusChip
            status={issue.status}
            onChange={handleStatusChange}
          />
          {issue.status === "assigned" && (
            <Button
              variant="outline"
              size="sm"
              className="text-xs"
              disabled={acceptIssue.isPending}
              onClick={handleAccept}
            >
              <Check className="size-3.5" />
              {acceptIssue.isPending ? "Принимаем…" : "Принять поручение"}
            </Button>
          )}
        </div>

        {/* Meta details */}
        <div className="space-y-2 mb-6">
          {/* Owner */}
          <div className="flex items-center gap-2 text-sm">
            <span className="text-ink-3 w-28 shrink-0 whitespace-nowrap">Ответственный</span>
            <MemberCombobox
              ownerName={issue.owner_name}
              onAssign={(payload) =>
                assignIssue.mutate({
                  issueId: issue.id,
                  owner_user_id: payload.owner_user_id,
                  owner_name: payload.owner_name,
                })
              }
            />
          </div>

          {/* Co-owners (соисполнители) */}
          <div className="flex items-center gap-2 text-sm">
            <span className="text-ink-3 w-28 shrink-0 whitespace-nowrap">Соисполнители</span>
            <CoOwnersEditor
              value={issue.co_owners ?? ""}
              onSave={(v) => handleFieldSave("co_owners", v)}
            />
          </div>

          {/* Accepted badge */}
          {issue.accepted_at && (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-ink-3 w-28 shrink-0 whitespace-nowrap">Подтверждено</span>
              <span className="text-xs font-medium text-green-700 bg-green-600/10 rounded px-1.5 py-0.5">
                ✓ Принято {new Date(issue.accepted_at).toLocaleDateString("ru-RU")}
              </span>
            </div>
          )}
          {issue.proposed_due_date && (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-ink-3 w-28 shrink-0 whitespace-nowrap">Предложение</span>
              <span className="text-xs text-amber-700 bg-amber-500/10 rounded px-1.5 py-0.5">
                исполнитель просит срок до {new Date(issue.proposed_due_date).toLocaleDateString("ru-RU")}
                {issue.proposed_note ? ` — «${issue.proposed_note}»` : ""}
              </span>
              <Button
                variant="outline"
                size="xs"
                className="text-xs"
                onClick={() => { handleFieldSave("due_date", formatISODate(new Date(issue.proposed_due_date!))); handleFieldSave("proposed_due_date", null); }}
              >
                Применить
              </Button>
              <Button
                variant="ghost"
                size="xs"
                className="text-xs"
                onClick={() => handleFieldSave("proposed_due_date", null)}
              >
                Отклонить
              </Button>
            </div>
          )}

          {/* Due date */}
          <div className="flex items-center gap-2 text-sm">
            <span className="text-ink-3 w-28 shrink-0 whitespace-nowrap">Срок</span>
            <Popover open={dueOpen} onOpenChange={setDueOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label="Срок выполнения"
                  className={cn(
                    "h-7 justify-start px-2 text-left font-mono text-xs font-normal hover:bg-paper-3 focus-visible:ring-1 focus-visible:ring-accent",
                    !issue.due_date && "text-ink-4"
                  )}
                >
                  <CalendarIcon className="mr-1.5 size-3.5" />
                  {issue.due_date ? formatDate(issue.due_date) : "Срок не задан"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={issue.due_date ? new Date(issue.due_date) : undefined}
                  defaultMonth={issue.due_date ? new Date(issue.due_date) : undefined}
                  onSelect={handleDueDateSelect}
                />
                {issue.due_date && (
                  <div className="border-t border-rule p-1.5 flex justify-end">
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={() => handleDueDateSelect(undefined)}
                      className="text-xs text-danger hover:bg-danger-soft hover:text-danger"
                    >
                      Clear date
                    </Button>
                  </div>
                )}
              </PopoverContent>
            </Popover>
          </div>

          {/* Эффективный срок: отличается от номинального, пока идёт приостановка */}
          {effectiveDue &&
            (!issue.due_date ||
              new Date(effectiveDue).getTime() !==
                new Date(issue.due_date).getTime()) && (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-ink-3 w-28 shrink-0 whitespace-nowrap">
                  Эффективный срок
                </span>
                <span className="text-xs font-mono text-warn">
                  {formatDate(effectiveDue)} (с учётом приостановки)
                </span>
              </div>
            )}

          {/* Приостановка */}
          {onHold && (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-ink-3 w-28 shrink-0 whitespace-nowrap">
                Приостановлено
              </span>
              <span className="text-xs text-warn bg-warn-soft rounded px-1.5 py-0.5">
                {issue.hold_reason?.trim() || "без причины"}
                {issue.hold_until ? ` · до ${formatDate(issue.hold_until)}` : ""}
              </span>
              <Button
                variant="ghost"
                size="xs"
                className="text-xs"
                disabled={setHold.isPending}
                onClick={handleResume}
              >
                Возобновить
              </Button>
            </div>
          )}

          {/* Priority */}
          <div className="flex items-center gap-2 text-sm">
            <span className="text-ink-3 w-28 shrink-0 whitespace-nowrap">Приоритет</span>
            <Select value={issue.priority} onValueChange={handlePriorityChange}>
              <SelectTrigger
                size="sm"
                aria-label="Приоритет"
                className="h-7 w-auto gap-1.5 border-transparent bg-transparent px-1.5 py-0.5 text-sm text-ink hover:border-rule focus:border-ink-3 focus-visible:ring-1 focus-visible:ring-accent"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PRIORITIES.map((p) => (
                  <SelectItem key={p} value={p}>
                    <span
                      className={cn("size-2 rounded-full", priorityDotColor[p])}
                      aria-hidden="true"
                    />
                    {{ low: "Низкий", medium: "Средний", high: "Высокий", critical: "Критический" }[p] ?? p}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Source */}
          <div className="flex items-center gap-2 text-sm">
            <span className="text-ink-3 w-28 shrink-0 whitespace-nowrap">Источник</span>
            <span className="text-xs bg-paper-2 text-ink-2 px-2 py-0.5 rounded-full">
              {sourceBadgeLabel(issue.source)}
            </span>
          </div>

          {/* Raised in meeting */}
          {raisedIn && (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-ink-3 w-28 shrink-0 whitespace-nowrap">Создано в</span>
              <Link
                href={`/series/${issue.series_id}/meetings/${raisedIn.id}`}
                className="text-sm text-ink hover:text-accent transition-colors underline underline-offset-2"
              >
                {raisedIn.title}
              </Link>
            </div>
          )}

          {/* Duration and meetings touched */}
          <div className="flex items-center gap-4 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-ink-3 w-28 shrink-0 whitespace-nowrap">Длительность</span>
              <span className="text-xs font-mono text-ink-2">
                {durationDays} дн.
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-ink-3 w-28 shrink-0 whitespace-nowrap">С изменениями</span>
            <span className="text-xs font-mono text-ink-2">
              {meetingsTouched} встреч с изменениями
            </span>
          </div>
        </div>

        {/* Description (inline editable) */}
        <div className="mb-8">
          <h2 className="text-xs font-mono font-medium text-ink-3 uppercase tracking-wider mb-2">
            Описание
          </h2>
          <InlineEditText
            value={splitEvidence(issue.description).main}
            onSave={(v) => handleFieldSave("description", v)}
            className="text-sm text-ink-2 leading-relaxed"
            as="p"
            placeholder="Нет описания. Нажмите, чтобы добавить."
            multiline
          />
          {(() => {
            const { quotes } = splitEvidence(issue.description);
            if (quotes.length === 0) return null;
            return (
              <details className="mt-3 group" open>
                <summary className="cursor-pointer select-none text-[11px] font-medium uppercase tracking-wider text-ink-3 hover:text-accent transition-colors">
                  🔎 Источник · дословные цитаты ({quotes.length})
                </summary>
                <div className="mt-2 space-y-2">
                  {quotes.map((q, i) => (
                    <blockquote key={i} className="border-l-2 border-accent/60 pl-3 py-1 text-sm italic text-ink-2">
                      «{q.text}»
                      {q.speaker && (
                        <footer className="mt-1 text-[11px] not-italic text-ink-4">— {q.speaker}, встреча (запись)</footer>
                      )}
                    </blockquote>
                  ))}
                </div>
              </details>
            );
          })()}
        </div>

        {/* Приостановка (hold) — ветка, не статус */}
        {issue.status !== "resolved" &&
          issue.status !== "cancelled" &&
          issue.status !== "dropped" &&
          !onHold && (
            <div className="mb-8">
              {!showHoldForm ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="text-sm"
                  onClick={() => setShowHoldForm(true)}
                >
                  Приостановить
                </Button>
              ) : (
                <div className="border border-rule rounded-md p-3 space-y-3 max-w-md">
                  <input
                    value={holdReasonDraft}
                    onChange={(e) => setHoldReasonDraft(e.target.value)}
                    placeholder="Причина приостановки"
                    aria-label="Причина приостановки"
                    className="w-full bg-transparent border border-rule rounded-md px-2 py-1 text-sm focus:outline-none focus:border-ink-3"
                  />
                  <input
                    type="date"
                    value={holdUntilDraft}
                    onChange={(e) => setHoldUntilDraft(e.target.value)}
                    aria-label="Вернуться к рассмотрению"
                    className="w-full bg-transparent border border-rule rounded-md px-2 py-1 text-sm focus:outline-none focus:border-ink-3"
                  />
                  <div className="flex items-center justify-end gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs"
                      onClick={() => setShowHoldForm(false)}
                    >
                      Отмена
                    </Button>
                    <Button
                      size="sm"
                      className="text-xs"
                      disabled={setHold.isPending}
                      onClick={handleStartHold}
                    >
                      {setHold.isPending ? "Сохраняем…" : "Приостановить"}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

        {/* Материалы: именованные ссылки на файлы (Яндекс.Диск и т.п.) */}
        <MaterialLinksSection
          target={{ seriesId: issue.series_id, issueId: issue.id }}
          canManage
          className="mb-8"
        />

        {/* Lifecycle Timeline */}
        {updates.length > 0 && (
          <section className="mb-8">
            <h2 className="font-display text-lg font-medium text-ink mb-4">
              Lifecycle timeline
            </h2>
            <div className="relative">
              {updates.map((update, i) => {
                const isLast = i === updates.length - 1;
                const isResolved = update.new_status === "resolved" && i === 0;

                return (
                  <TimelineUpdateNode
                    key={update.id}
                    update={update}
                    index={i}
                    isFirst={isLast}
                    isLast={i === 0}
                    isResolved={isResolved}
                  />
                );
              })}
            </div>
          </section>
        )}

        {/* История изменений (task_events) — аудит accept-цикла */}
        <TaskHistory events={issue.task_events ?? []} className="mb-8" />

        {/* Add update */}
        <div className="mb-8 flex flex-wrap items-center gap-2">
          {!showUpdateForm ? (
            <Button
              variant="outline"
              className="text-sm"
              onClick={() => setShowUpdateForm(true)}
            >
              Добавить комментарий
              <kbd className="ml-2 text-[10px] text-ink-4 bg-paper-2 border border-rule rounded px-1 py-0.5">
                C
              </kbd>
            </Button>
          ) : null}
          {issue.owner_user_id || issue.owner_name?.trim() ? (
            <Button
              variant="outline"
              className="text-sm"
              disabled={remindPending || issue.status === "resolved" || issue.status === "cancelled" || issue.status === "dropped"}
              onClick={async () => {
                setRemindPending(true);
                try {
                  const res = await fetch(`/api/issues/${issue.id}/remind`, { method: "POST" });
                  const json = await res.json();
                  if (!res.ok) throw new Error(json.error ?? "Не удалось отправить");
                  toast(`Напоминание отправлено: ${json.sentTo}`);
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Не удалось отправить напоминание");
                } finally {
                  setRemindPending(false);
                }
              }}
            >
              <Bell className="size-3.5" />
              {remindPending ? "Отправляем…" : "Напомнить"}
            </Button>
          ) : null}
          {showUpdateForm ? (
            <div className="border border-rule rounded-md p-3 space-y-3 w-full">
              <textarea
                ref={updateInputRef}
                value={updateNote}
                onChange={(e) => setUpdateNote(e.target.value)}
                placeholder="Какой статус по этому вопросу?"
                className="w-full bg-transparent text-sm text-ink placeholder:text-ink-4 resize-none focus:outline-none"
                rows={3}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSubmitUpdate();
                  }
                  if (e.key === "Escape") {
                    setUpdateNote("");
                    setShowUpdateForm(false);
                  }
                }}
              />
              <div className="flex items-center justify-between">
                <span className="text-xs text-ink-4 flex items-center gap-2">
                  <VoiceInput onText={(t) => setUpdateNote((prev) => (prev ? prev + " " + t : t))} />
                  Enter — отправить, Esc — отмена
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs"
                    onClick={() => {
                      setUpdateNote("");
                      setShowUpdateForm(false);
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    className="text-xs"
                    onClick={handleSubmitUpdate}
                    disabled={!updateNote.trim() || addUpdate.isPending}
                  >
                    {addUpdate.isPending ? "Saving..." : "Добавить статус"}
                  </Button>
                </div>
              </div>
            </div>
          ) : null}
        </div>

        {/* Divider before danger zone */}
        <div className="border-t border-rule pt-6">
          {/* Delete */}
          <Button
            variant="outline"
            className="text-danger border-danger/30 hover:bg-danger-soft text-sm"
            onClick={handleDelete}
          >
            <Trash2 className="size-3.5" />
            Удалить поручение
          </Button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Timeline update node (uses Motion stagger, inlined here to control animation)
// ---------------------------------------------------------------------------

function statusBadgeStyle(status: string): string {
  switch (status) {
    case "resolved":
      return "text-success bg-success-soft";
    case "in_progress":
      return "text-accent bg-accent-soft";
    case "dropped":
    case "cancelled":
      return "text-ink-3 bg-paper-2";
    default:
      return "text-ink bg-paper-2";
  }
}

function TimelineUpdateNode({
  update,
  index,
  isFirst,
  isLast,
  isResolved,
}: {
  update: IssueUpdate;
  index: number;
  isFirst: boolean;
  isLast: boolean;
  isResolved: boolean;
}) {
  const hasStatusChange =
    update.previous_status &&
    update.new_status &&
    update.previous_status !== update.new_status;
  const displayStatus = update.new_status ?? update.previous_status;
  const isRaised = !update.previous_status;

  function nodeColor(): string {
    if (isResolved) return "bg-success";
    if (displayStatus === "in_progress") return "bg-accent";
    if (displayStatus === "dropped" || displayStatus === "cancelled") return "bg-ink-4";
    if (isRaised) return "bg-ink";
    return "bg-ink-3";
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.4,
        delay: index * 0.09,
        ease: [0.2, 0.8, 0.2, 1],
      }}
      className="relative pl-8 pb-8"
    >
      {/* Vertical line */}
      {!isLast && (
        <div
          className="absolute left-[3.5px] top-3 bottom-0 w-px bg-rule"
          aria-hidden="true"
        />
      )}

      {/* Node circle */}
      {isResolved ? (
        <div
          className="absolute left-0 top-[2px] flex items-center justify-center size-[14px] rounded-full bg-success shadow-[0_0_0_4px_var(--paper)]"
          aria-label="Решено"
        >
          <Check className="size-2.5 text-white" strokeWidth={3} />
        </div>
      ) : (
        <div
          className={cn("absolute left-0 top-1 size-[9px] rounded-full shadow-[0_0_0_4px_var(--paper)]", nodeColor())}
          aria-hidden="true"
        />
      )}

      {/* Label row: meeting + status badge */}
      <div className="flex items-center gap-2.5 mb-1.5">
        <span className="text-[11px] font-mono uppercase tracking-wider text-ink-3 font-medium">
          {formatDate(update.created_at)}
        </span>
        {hasStatusChange && displayStatus && (
          <span
            className={cn(
              "text-[11px] font-mono font-medium px-2 py-0.5 rounded",
              statusBadgeStyle(displayStatus)
            )}
          >
            {STATUS_CONFIG[displayStatus].label}
          </span>
        )}
        {!hasStatusChange && !update.previous_status && (
          <span className="text-[11px] font-mono font-medium px-2 py-0.5 rounded text-ink bg-paper-2">
            Создано
          </span>
        )}
      </div>

      {/* Body */}
      {update.note && (
        <p className="font-display text-base leading-relaxed text-ink">
          {update.note}
        </p>
      )}

      {/* Resolved conclusion card */}
      {isResolved && update.note && (
        <div className="mt-2 px-4 py-3 bg-success-soft border border-success rounded-lg">
          <p className="text-sm italic text-success">
            Resolved after {update.note.length > 0 ? "this update" : "status change"}.
          </p>
        </div>
      )}
    </motion.div>
  );
}
