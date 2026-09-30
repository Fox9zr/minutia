"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCreateIssue } from "@/lib/hooks/use-issues";
import { useСерии } from "@/lib/hooks/use-series";
import { useAllMeetings } from "@/lib/hooks/use-meetings";
import { useUIStore } from "@/lib/stores/ui-store";
import { CATEGORY_CONFIG } from "@/lib/constants";
import type { IssueCategory } from "@/lib/types";

export function QuickAddDialog() {
  const router = useRouter();
  const open = useUIStore((s) => s.quickAddDialogOpen);
  const closeQuickAddDialog = useUIStore((s) => s.closeQuickAddDialog);

  const [title, setTitle] = React.useState("");
  const [seriesId, setСерииId] = React.useState("");
  const [category, setCategory] = React.useState<IssueCategory>("action");
  const [error, setError] = React.useState<string | null>(null);
  const [noMeetingСерииId, setNoMeetingСерииId] = React.useState<string | null>(null);
  const titleRef = React.useRef<HTMLInputElement>(null);

  const createIssue = useCreateIssue();
  const { data: seriesList = [] } = useСерии(open);
  const { data: allMeetings = [] } = useAllMeetings();

  const latestMeetingId = React.useMemo(() => {
    if (!seriesId) return null;
    const seriesMeetings = allMeetings.filter(
      (m) => m.series_id === seriesId,
    );
    if (!seriesMeetings.length) return null;
    const sorted = [...seriesMeetings].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
    );
    return sorted[0].id;
  }, [allMeetings, seriesId]);

  React.useEffect(() => {
    if (open && titleRef.current) {
      // Small delay so the dialog animation finishes before focus.
      const timer = setTimeout(() => titleRef.current?.focus(), 50);
      return () => clearTimeout(timer);
    }
  }, [open]);

  // Reset state when dialog closes.
  React.useEffect(() => {
    if (!open) {
      setTitle("");
      setСерииId("");
      setCategory("action");
      setError(null);
      setNoMeetingСерииId(null);
    }
  }, [open]);

  function goToСерии(id?: string) {
    closeQuickAddDialog();
    router.push(id ? `/series/${id}` : "/series");
  }

  // Auto-select first series when dialog opens.
  React.useEffect(() => {
    if (open && seriesList.length > 0 && !seriesId) {
      setСерииId(seriesList[0].id);
    }
  }, [open, seriesList, seriesId]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNoMeetingСерииId(null);

    if (!title.trim()) {
      setError("Название обязательно");
      return;
    }

    if (!seriesId) {
      setError("Выберите серию");
      return;
    }

    if (!latestMeetingId) {
      setError("В этой серии нет встреч. Сначала создайте встречу.");
      setNoMeetingСерииId(seriesId);
      return;
    }

    createIssue.mutate(
      {
        title: title.trim(),
        category,
        priority: "medium",
        meeting_id: latestMeetingId,
        series_id: seriesId,
      },
      {
        onSuccess: () => {
          closeQuickAddDialog();
        },
        onError: () => {
          setError("Не удалось создать задачу. Повторите попытку.");
        },
      },
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) closeQuickAddDialog();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-lg">
            Quick add issue
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label
              htmlFor="quick-add-title"
              className="text-[11px] font-mono uppercase tracking-wider text-ink-3"
            >
              Issue title
            </label>
            <Input
              id="quick-add-title"
              ref={titleRef}
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Что необходимо отслеживать?"
              aria-label="Тема вопроса"
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  closeQuickAddDialog();
                }
              }}
            />
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="quick-add-series"
              className="text-[11px] font-mono uppercase tracking-wider text-ink-3"
            >
              Серии
            </label>
            {seriesList.length > 0 ? (
              <Select
                value={seriesId}
                onValueChange={setСерииId}
              >
                <SelectTrigger id="quick-add-series" className="w-full" aria-label="Серия">
                  <SelectValue placeholder="Выберите серию" />
                </SelectTrigger>
                <SelectContent>
                  {seriesList.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <div className="flex items-center justify-between gap-3 rounded-md border border-dashed border-border px-3 py-2.5">
                <p className="text-sm text-ink-3">Серии пока не созданы.</p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => goToСерии()}
                >
                  Create a series
                </Button>
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="quick-add-category"
              className="text-[11px] font-mono uppercase tracking-wider text-ink-3"
            >
              Category
            </label>
            <Select
              value={category}
              onValueChange={(v) => setCategory(v as IssueCategory)}
            >
              <SelectTrigger id="quick-add-category" className="w-full" aria-label="Категория">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(CATEGORY_CONFIG).map(([key, config]) => (
                  <SelectItem key={key} value={key}>
                    {config.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {error && (
            <div role="alert" className="space-y-2">
              <p className="text-sm text-destructive">{error}</p>
              {noMeetingСерииId && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => goToСерии(noMeetingСерииId)}
                >
                  Go to series to start a meeting
                </Button>
              )}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={closeQuickAddDialog}
            >
              Cancel
            </Button>
            <Button type="submit" variant="accent" size="sm" disabled={createIssue.isPending}>
              {createIssue.isPending ? "Adding..." : "Добавить проблему"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}