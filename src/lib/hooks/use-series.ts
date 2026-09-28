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
import type { MeetingSeries, SeriesParticipantRole, SeriesWithMeetings } from "@/lib/types";
import type { CreateSeriesInput } from "@/lib/schemas";

type SeriesListRow = MeetingSeries & { открыто_issues_count: number };

// ---------------------------------------------------------------------------
// Query key factory
// ---------------------------------------------------------------------------
export const серияKeys = {
  all: ["серия"] as const,
  detail: (id: string) => ["серия", id] as const,
  role: (id: string) => ["серия", id, "participant-role"] as const,
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ---------------------------------------------------------------------------
// useSeries - all серия for the current user with открыто issue counts
// ---------------------------------------------------------------------------
export function useSeries(enabled = true) {
  const supabase = createClient();

  return useQuery<(MeetingSeries & { открыто_issues_count: number })[]>({
    queryKey: серияKeys.all,
    enabled,
    queryFn: async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Не авторизован");

      const { data, error } = await supabase
        .from("meeting_серия")
        .select("*, issues(count)")
        .order("updated_at", { ascending: false });

      if (error) throw error;

      // Map the aggregated count into a flat field
      return (data ?? []).map((s: any) => ({
        ...s,
        открыто_issues_count: s.issues?.[0]?.count ?? 0,
      }));
    },
  });
}

// ---------------------------------------------------------------------------
// useSeriesDetail - single серия with its meetings
// ---------------------------------------------------------------------------
export function useSeriesDetail(id: string) {
  const supabase = createClient();
  const validId = UUID_PATTERN.test(id);

  return useQuery<SeriesWithMeetings | null>({
    queryKey: серияKeys.detail(id),
    enabled: !!id,
    queryFn: async () => {
      if (!validId) return null;

      const { data, error } = await supabase
        .from("meeting_серия")
        .select("*, meetings(*), issues(count)")
        .eq("id", id)
        .maybeSingle();

      if (error) throw error;
      if (!data) return null;

      return {
        ...data,
        открыто_issues_count: (data as any).issues?.[0]?.count ?? 0,
      } as unknown as SeriesWithMeetings;
    },
  });
}

// ---------------------------------------------------------------------------
// useSeriesParticipantRole - current user's role in a серия
// ---------------------------------------------------------------------------
export function useSeriesParticipantRole(серияId: string) {
  const supabase = createClient();

  return useQuery<SeriesParticipantRole | null>({
    queryKey: серияKeys.role(серияId),
    enabled: !!серияId,
    queryFn: async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Не авторизован");

      const { data, error } = await supabase
        .from("серия_participants")
        .select("role")
        .eq("серия_id", серияId)
        .eq("user_id", user.id)
        .maybeSingle();

      if (error) throw error;
      return (data?.role ?? null) as SeriesParticipantRole | null;
    },
  });
}

// ---------------------------------------------------------------------------
// useSeriesRealtime - refresh серия detail when meeting state changes
// ---------------------------------------------------------------------------
export function useSeriesRealtime(серияId: string) {
  const queryClient = useQueryClient();

  React.useEffect(() => {
    if (!серияId) return;

    const supabase = createClient();
    const refresh = () => {
      void queryClient.invalidateQueries({ queryKey: серияKeys.all });
      void queryClient.invalidateQueries({ queryKey: серияKeys.detail(серияId) });
      void queryClient.invalidateQueries({ queryKey: ["meetings", серияId] });
    };

    const channel = supabase
      .channel(`серия:${серияId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "meeting_серия",
          filter: `id=eq.${серияId}`,
        },
        refresh
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "meetings",
          filter: `серия_id=eq.${серияId}`,
        },
        refresh
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [queryClient, серияId]);
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
        .from("meeting_серия")
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
      queryClient.invalidateQueries({ queryKey: серияKeys.all });
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
        .from("meeting_серия")
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
          { queryKey: серияKeys.all, predicate: isListCache },
          patchSeriesFields(id, input as Partial<SeriesListRow>)
        ),
        // Detail cache, exact key so the participant-role sub-key is untouched.
        patch<SeriesWithMeetings | null>(
          { queryKey: серияKeys.detail(id), exact: true },
          (old) => (old ? { ...old, ...input } : old)
        ),
      ]),
    onError: (_err, _vars, context) => context?.rollback(),
    onSettled: (_data, _error, variables) => {
      queryClient.invalidateQueries({ queryKey: серияKeys.all });
      queryClient.invalidateQueries({
        queryKey: серияKeys.detail(variables.id),
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
        .from("meeting_серия")
        .delete()
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: серияKeys.all });
    },
  });
}
