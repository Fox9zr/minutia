"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

// ---------------------------------------------------------------------------
// Управляемый справочник тем (theme_catalog) — клиентский доступ.
//   useThemeCatalog()     — все темы (включая неактивные), для UI управления
//   useThemePickerGroups() — только активные, сгруппированные (для выбора темы)
// ---------------------------------------------------------------------------

export interface ThemeCatalogRow {
  id: number;
  group_name: string;
  topic_name: string;
  is_active: boolean;
  sort_order: number;
}

export const themeKeys = {
  all: ["theme-catalog"] as const,
};

export function useThemeCatalog(enabled = true) {
  const supabase = createClient();
  return useQuery<ThemeCatalogRow[]>({
    queryKey: themeKeys.all,
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("theme_catalog")
        .select("id, group_name, topic_name, is_active, sort_order")
        .order("group_name", { ascending: true })
        .order("sort_order", { ascending: true })
        .order("topic_name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as ThemeCatalogRow[];
    },
  });
}

export interface ThemeGroupView {
  group_name: string;
  topics: ThemeCatalogRow[];
}

/** Group catalog rows by group_name, preserving sort_order. */
export function groupThemes(rows: ThemeCatalogRow[] | undefined): ThemeGroupView[] {
  const map = new Map<string, ThemeCatalogRow[]>();
  for (const r of rows ?? []) {
    const arr = map.get(r.group_name) ?? [];
    arr.push(r);
    map.set(r.group_name, arr);
  }
  return [...map.entries()].map(([group_name, topics]) => ({
    group_name,
    topics: [...topics].sort(
      (a, b) => a.sort_order - b.sort_order || a.topic_name.localeCompare(b.topic_name, "ru")
    ),
  }));
}

/** Active group names only (for series theme pickers). */
export function activeGroupNames(rows: ThemeCatalogRow[] | undefined): string[] {
  const set = new Set<string>();
  for (const r of rows ?? []) if (r.is_active) set.add(r.group_name);
  return [...set].sort((a, b) => a.localeCompare(b, "ru"));
}

/** Active topic names within a group (for series topic pickers). */
export function activeTopicNames(
  rows: ThemeCatalogRow[] | undefined,
  group: string | null | undefined
): string[] {
  const g = (group ?? "").trim();
  return (rows ?? [])
    .filter((r) => r.is_active && r.group_name === g)
    .sort((a, b) => a.sort_order - b.sort_order || a.topic_name.localeCompare(b.topic_name, "ru"))
    .map((r) => r.topic_name);
}

export function useThemeMutations() {
  const supabase = createClient();
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: themeKeys.all });

  const create = useMutation({
    mutationFn: async (input: { group_name: string; topic_name: string; sort_order?: number }) => {
      const { data, error } = await supabase
        .from("theme_catalog")
        .insert({
          group_name: input.group_name.trim(),
          topic_name: input.topic_name.trim(),
          sort_order: input.sort_order ?? 0,
          is_active: true,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: invalidate,
  });

  const update = useMutation({
    mutationFn: async (input: {
      id: number;
      group_name?: string;
      topic_name?: string;
      is_active?: boolean;
      sort_order?: number;
    }) => {
      const { id, ...patch } = input;
      const { data, error } = await supabase
        .from("theme_catalog")
        .update(patch)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: async (id: number) => {
      const { error } = await supabase.from("theme_catalog").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  return { create, update, remove };
}
