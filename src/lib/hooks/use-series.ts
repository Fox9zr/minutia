"use client";

import * as React from "react";
import {
  useQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { applyOptimistic, patch } from "@/lib/optimistic";
import { patchSeriesFields, isListCache } from "@/lib/optimistic-updates";
import { isActiveStatus, isEffectiveOverdue } from "@/lib/workflow";
import type { MeetingSeries, SeriesParticipantRole, SeriesWithMeetings, IssueStatus, Issue } from "@/lib/types";
import type { CreateSeriesInput } from "@/lib/schemas";

type SeriesListRow = MeetingSeries & { open_issues_count: number };

// ---------------------------------------------------------------------------
// Query key factory
// ---------------------------------------------------------------------------
export const seriesKeys = {
  all: ["series"] as const,
  tree: ["series", "tree"] as const,
  detail: (id: string) => ["series", id] as const,
  role: (id: string) => ["series", id, "participant-role"] as const,
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ---------------------------------------------------------------------------
// useSeries - all series for the current user with open issue counts
// ---------------------------------------------------------------------------
export function useSeries(enabled = true) {
  const supabase = createClient();

  return useQuery<(MeetingSeries & { open_issues_count: number })[]>({
    queryKey: seriesKeys.all,
    enabled,
    queryFn: async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Не авторизован");

      const { data, error } = await supabase
        .from("meeting_series")
        .select("*, issues(count)")
        .order("updated_at", { ascending: false });

      if (error) throw error;

      // Map the aggregated count into a flat field
      return (data ?? []).map((s: any) => ({
        ...s,
        open_issues_count: s.issues?.[0]?.count ?? 0,
      }));
    },
  });
}

// ---------------------------------------------------------------------------
// useSeriesTree - series with per-row hierarchy counters for the theme tree.
//
// Unlike useSeries (which returns only a raw issue count), this hook pulls the
// minimal per-issue fields needed to evaluate the effective deadline, so the
// tree can show open-issue and overdue counters per series without N+1
// queries. Grouping into theme groups happens in the caller (lib/theme-groups).
// ---------------------------------------------------------------------------
export interface SeriesTreeRow {
  id: string;
  name: string;
  description: string | null;
  cadence: MeetingSeries["cadence"];
  theme_group: string;
  theme_subtopic: string;
  updated_at: Date;
  meetings_count: number;
  open_issues_count: number;
  overdue_count: number;
}

type TreeIssue = {
  status: IssueStatus;
  due_date: string | null;
  hold_until: string | null;
  hold_reason: string | null;
};

export function useSeriesTree(enabled = true) {
  const supabase = createClient();

  return useQuery<SeriesTreeRow[]>({
    queryKey: seriesKeys.tree,
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("meeting_series")
        .select(
          "id, name, description, cadence, theme_group, theme_subtopic, updated_at, meetings(count), issues(status, due_date, hold_until, hold_reason)"
        )
        .order("name", { ascending: true });

      if (error) throw error;

      return (data ?? []).map((s: any): SeriesTreeRow => {
        const issues: TreeIssue[] = (s.issues ?? []) as TreeIssue[];
        const open = issues.filter((i) => isActiveStatus(i.status));
        // due_date arrives as an ISO string over the wire; workflow helpers
        // accept the Date-typed Issue shape but only ever call new Date(), so a
        // narrowing cast is safe here.
        const overdue = open.filter((i) => isEffectiveOverdue(i as unknown as Issue));
        return {
          id: s.id,
          name: s.name,
          description: s.description ?? null,
          cadence: s.cadence,
          theme_group: s.theme_group ?? "",
          theme_subtopic: s.theme_subtopic ?? "",
          updated_at: s.updated_at,
          meetings_count: s.meetings?.[0]?.count ?? 0,
          open_issues_count: open.length,
          overdue_count: overdue.length,
        };
      });
    },
  });
}

// ---------------------------------------------------------------------------
// useSeriesDetail - single series with its meetings
// ---------------------------------------------------------------------------
export function useSeriesDetail(id: string) {
  const supabase = createClient();
  const validId = UUID_PATTERN.test(id);

  return useQuery<SeriesWithMeetings | null>({
    queryKey: seriesKeys.detail(id),
    enabled: !!id,
    queryFn: async () => {
      if (!validId) return null;

      const { data, error } = await supabase
        .from("meeting_series")
        .select("*, meetings(*), issues(count)")
        .eq("id", id)
        .maybeSingle();

      if (error) throw error;
      if (!data) return null;

      return {
        ...data,
        open_issues_count: (data as any).issues?.[0]?.count ?? 0,
      } as unknown as SeriesWithMeetings;
    },
  });
}

// ---------------------------------------------------------------------------
// useSeriesParticipantRole - current user's role in a series
// ---------------------------------------------------------------------------
export function useSeriesParticipantRole(seriesId: string) {
  const supabase = createClient();

  return useQuery<SeriesParticipantRole | null>({
    queryKey: seriesKeys.role(seriesId),
    enabled: !!seriesId,
    queryFn: async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Не авторизован");

      const { data, error } = await supabase
        .from("series_participants")
        .select("role")
        .eq("series_id", seriesId)
        .eq("user_id", user.id)
        .maybeSingle();

      if (error) throw error;
      return (data?.role ?? null) as SeriesParticipantRole | null;
    },
  });
}

// ---------------------------------------------------------------------------
// useSeriesRealtime - refresh series detail when meeting state changes
// ---------------------------------------------------------------------------
export function useSeriesRealtime(seriesId: string) {
  const queryClient = useQueryClient();

  React.useEffect(() => {
    if (!seriesId) return;

    const supabase = createClient();
    const refresh = () => {
      void queryClient.invalidateQueries({ queryKey: seriesKeys.all });
      void queryClient.invalidateQueries({ queryKey: seriesKeys.detail(seriesId) });
      void queryClient.invalidateQueries({ queryKey: ["meetings", seriesId] });
    };

    const channel = supabase
      .channel(`series:${seriesId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "meeting_series",
          filter: `id=eq.${seriesId}`,
        },
        refresh
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "meetings",
          filter: `series_id=eq.${seriesId}`,
        },
        refresh
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [queryClient, seriesId]);
}

// ---------------------------------------------------------------------------
// useCreateSeries
// ---------------------------------------------------------------------------
export function useCreateSeries() {
  const supabase = createClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateSeriesInput) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Не авторизован");

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("current_organization_id")
        .eq("id", user.id)
        .single();

      if (profileError) throw profileError;

      const { data, error } = await supabase
        .from("meeting_series")
        .insert({
          ...input,
          owner_id: user.id,
          organization_id: profile.current_organization_id,
        })
        .select()
        .single();

      if (error) throw error;
      return data as MeetingSeries;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: seriesKeys.all });
    },
  });
}

// ---------------------------------------------------------------------------
// useUpdateSeries
// ---------------------------------------------------------------------------
export function useUpdateSeries() {
  const supabase = createClient();
  const queryClient = useQueryClient();

  return useMutation<
    MeetingSeries,
    Error,
    Partial<CreateSeriesInput> & { id: string },
    { rollback: () => void }
  >({
    mutationFn: async ({ id, ...input }) => {
      const { data, error } = await supabase
        .from("meeting_series")
        .update(input)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data as MeetingSeries;
    },
    onMutate: ({ id, ...input }) =>
      applyOptimistic(queryClient, [
        // List rows (array caches only, never the detail/role sub-caches).
        patch<SeriesListRow[]>(
          { queryKey: seriesKeys.all, predicate: isListCache },
          patchSeriesFields(id, input as Partial<SeriesListRow>)
        ),
        // Detail cache, exact key so the participant-role sub-key is untouched.
        patch<SeriesWithMeetings | null>(
          { queryKey: seriesKeys.detail(id), exact: true },
          (old) => (old ? { ...old, ...input } : old)
        ),
      ]),
    onError: (_err, _vars, context) => context?.rollback(),
    onSettled: (_data, _error, variables) => {
      queryClient.invalidateQueries({ queryKey: seriesKeys.all });
      queryClient.invalidateQueries({
        queryKey: seriesKeys.detail(variables.id),
      });
    },
  });
}

// ---------------------------------------------------------------------------
// useDeleteSeries
// ---------------------------------------------------------------------------
export function useDeleteSeries() {
  const supabase = createClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("meeting_series")
        .delete()
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: seriesKeys.all });
    },
  });
}
