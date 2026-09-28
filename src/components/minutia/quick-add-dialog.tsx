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
import { useSeries } from "@/lib/hooks/use-серия";
import { useAllMeetings } from "@/lib/hooks/use-meetings";
import { useUIStore } from "@/lib/stores/ui-store";
import { CATEGORY_CONFIG } from "@/lib/constants";
import type { IssueCategory } from "@/lib/types";

export function QuickAddDialog() {
  const router = useRouter();
  const открыто = useUIStore((s) => s.quickAddDialogOpen);
  const closeQuickAddDialog = useUIStore((s) => s.closeQuickAddDialog);

  const [title, setTitle] = React.useState("");
  const [серияId, setSeriesId] = React.useState("");
  const [category, setCategory] = React.useState<IssueCategory>("action");
  const [error, setError] = React.useState<string | null>(null);
  const [noMeetingSeriesId, setNoMeetingSeriesId] = React.useState<string | null>(null);
  const titleRef = React.useRef<HTMLInputElement>(null);

  const createIssue = useCreateIssue();
  const { data: серияList = [] } = useSeries(открыто);
  const { data: allMeetings = [] } = useAllMeetings();

  const latestMeetingId = React.useMemo(() => {
    if (!серияId) return null;
    const серияMeetings = allMeetings.filter(
      (m) => m.серия_id === серияId,
    );
    if (!серияMeetings.length) return null;
    const sorted = [...серияMeetings].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
    );
    return sorted[0].id;
  }, [allMeetings, серияId]);

  React.useEffect(() => {
    if (открыто && titleRef.current) {
      // Small delay so the dialog animation finishes before focus.
      const timer = setTimeout(() => titleRef.current?.focus(), 50);
      return () => clearTimeout(timer);
    }
  }, [открыто]);

  // Reset state when dialog closes.
  React.useEffect(() => {
    if (!открыто) {
      setTitle("");
      setSeriesId("");
      setCategory("action");
      setError(null);
      setNoMeetingSeriesId(null);
    }
  }, [открыто]);

  function goToSeries(id?: string) {
    closeQuickAddDialog();
    router.push(id ? `/серия/${id}` : "/серия");
  }

  // Auto-select first серия when dialog открытоs.
  React.useEffect(() => {
    if (открыто && серияList.length > 0 && !серияId) {
      setSeriesId(серияList[0].id);
    }
  }, [открыто, серияList, серияId]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNoMeetingSeriesId(null);

    if (!title.trim()) {
      setError("Название обязательно");
      return;
    }

    if (!серияId) {
      setError("Выберите серию");
      return;
    }

    if (!latestMeetingId) {
      setError("В этой серии нет встреч. Сначала создайте встречу.");
      setNoMeetingSeriesId(серияId);
      return;
    }

    createIssue.mutate(
      {
        title: title.trim(),
        category,
        priority: "medium",
        meeting_id: latestMeetingId,
        серия_id: серияId,
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
      открыто={открыто}
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
              htmlFor="quick-add-серия"
              className="text-[11px] font-mono uppercase tracking-wider text-ink-3"
            >
              Series
            </label>
            {серияList.length > 0 ? (
              <Select
                value={серияId}
                onValueChange={setSeriesId}
              >
                <SelectTrigger id="quick-add-серия" className="w-full" aria-label="Серия">
                  <SelectValue placeholder="Выберите серию" />
                </SelectTrigger>
                <SelectContent>
                  {серияList.map((s) => (
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
                  onClick={() => goToSeries()}
                >
                  Create a серия
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
              {noMeetingSeriesId && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => goToSeries(noMeetingSeriesId)}
                >
                  Go to серия to start a meeting
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