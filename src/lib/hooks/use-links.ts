"use client";

// Kotrol «Материалы» — именованные ссылки на файлы/документы (Яндекс.Диск и др.),
// привязанные к встрече (meetingId) или поручению (issueId). Links-only, Phase 2
// decision: файлы не храним, храним структурированную ссылку + название.

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import type { MaterialLink } from "@/lib/types";

export const linkKeys = {
  all: ["links"] as const,
  forMeeting: (meetingId: string) => ["links", "meeting", meetingId] as const,
  forIssue: (issueId: string) => ["links", "issue", issueId] as const,
};

export interface LinkTarget {
  seriesId: string;
  meetingId?: string;
  issueId?: string;
}

export function useLinks(target: LinkTarget | null) {
  const supabase = createClient();
  return useQuery<MaterialLink[]>({
    queryKey:
      target?.meetingId
        ? linkKeys.forMeeting(target.meetingId)
        : linkKeys.forIssue(target?.issueId ?? ""),
    enabled: !!target && !!(target.meetingId || target.issueId),
    queryFn: async () => {
      if (!target) return [];
      let q = supabase.from("links").select("*");
      q = target.meetingId
        ? q.eq("meeting_id", target.meetingId)
        : q.eq("issue_id", target.issueId!);
      const { data, error } = await q.order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as MaterialLink[];
    },
  });
}

function targetFilter(target: LinkTarget) {
  return target.meetingId
    ? { meeting_id: target.meetingId }
    : { issue_id: target.issueId! };
}

export function useAddLink() {
  const supabase = createClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      target,
      title,
      url,
    }: {
      target: LinkTarget;
      title: string;
      url: string;
    }) => {
      const normalized = /^https?:\/\//i.test(url) ? url : `https://${url}`;
      const { data, error } = await supabase
        .from("links")
        .insert({
          series_id: target.seriesId,
          ...targetFilter(target),
          title: title.trim() || normalized.replace(/^https?:\/\//, "").slice(0, 80),
          url: normalized,
        })
        .select()
        .single();
      if (error) throw error;
      return data as MaterialLink;
    },
    onSuccess: (link) => {
      queryClient.invalidateQueries({ queryKey: linkKeys.all });
      toast.success("Материал добавлен");
      void link;
    },
    onError: (error: Error) => {
      toast.error("Не удалось добавить ссылку", { description: error.message });
    },
  });
}

export function useDeleteLink() {
  const supabase = createClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("links").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: linkKeys.all });
    },
    onError: (error: Error) => {
      toast.error("Не удалось удалить ссылку", { description: error.message });
    },
  });
}
