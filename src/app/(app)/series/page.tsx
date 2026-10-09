"use client";

import * as React from "react";
import { useSeriesTree } from "@/lib/hooks/use-series";
import { EmptyState } from "@/components/minutia/empty-state";
import { CreateSeriesDialog } from "@/components/minutia/create-series-dialog";
import { ThemeTree } from "@/components/minutia/theme-tree";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus } from "lucide-react";

// ---------------------------------------------------------------------------
// Series list — Phase 2 v2 P0.3 hierarchy: sessions are grouped into top-level
// theme groups rendered as a collapsed tree («дерево плюсиками»). Counters show
// meetings / open assignments per group and per series; groups holding overdue
// work open by default so the red flag is never hidden.
// ---------------------------------------------------------------------------
export default function SeriesListPage() {
  const { data: series, isLoading } = useSeriesTree();
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const mounted = React.useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );
  const showLoading = !mounted || isLoading;

  return (
    <div className="min-h-full bg-paper">
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="font-display text-2xl font-semibold text-ink">
              Series
            </h1>
            <p className="mt-1 text-sm text-ink-3">
              Темы и серии встреч, сгруппированные по направлениям.
            </p>
          </div>
          <Button variant="accent" onClick={() => setDialogOpen(true)}>
            <Plus className="size-4" data-icon="inline-start" />
            Создать серию
          </Button>
        </div>

        {/* Loading state */}
        {showLoading && (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="bg-card rounded-lg px-4 py-3 shadow-[var(--shadow-raised)]"
              >
                <Skeleton className="h-5 w-1/3 mb-2" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            ))}
          </div>
        )}

        {/* Empty state */}
        {mounted && !isLoading && series && series.length === 0 && (
          <EmptyState variant="no-series" onAction={() => setDialogOpen(true)} />
        )}

        {/* Theme tree */}
        {mounted && !isLoading && series && series.length > 0 && (
          <ThemeTree series={series} />
        )}
      </div>

      <CreateSeriesDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </div>
  );
}
