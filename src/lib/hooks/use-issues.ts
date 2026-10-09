"use client";

import { useEffect, useRef } from "react";
import {
  useQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { isFeatureGatingEnabled } from "@/lib/feature-access";
import { isPendingDelete, clearPendingDelete } from "@/lib/pending-delete";
import { STATUS_CONFIG, ACTIVE_ISSUE_STATUSES } from "@/lib/constants";
import { isClosedStatus, statusTransitionEvent } from "@/lib/workflow";
import type {
  Issue,
  IssueWithUpdates,
  IssueStatus,
  IssueUpdate,
  TaskEvent,
  TaskEventType,
} from "@/lib/types";
import type { CreateIssueInput } from "@/lib/schemas";

type SupabaseClient = ReturnType<typeof createClient>;

// Append-only history writer. Best-effort: a failed history insert must never
// abort the user's actual action, so callers fire-and-forget / or await and
// ignore the error deliberately.
export async function logTaskEvent(
  supabase: SupabaseClient,
  params: {
    issueId: string;
    event: TaskEventType;
    actor?: string;
    payload?: Record<string, unknown>;
  }
): Promise<void> {
  try {
    await supabase.from("task_events").insert({
      issue_id: params.issueId,
      event: params.event,
      actor: params.actor ?? "",
      payload: params.payload ?? {},
    });
  } catch {
    // history is non-critical; never surface a write failure to the user
  }
}

// ---------------------------------------------------------------------------
// Query key factory
// ---------------------------------------------------------------------------
export const issueKeys = {
  all: ["issues"] as const,
  list: (seriesId?: string) =>
    seriesId ? (["issues", seriesId] as const) : (["issues"] as const),
  detail: (id: string) => ["issues", "detail", id] as const,
  taskEvents: (id: string) => ["issues", "task-events", id] as const,
};

type IssueListSnapshot = [readonly unknown[], Issue[] | undefined][];
type IssueListRow = Issue & { issue_updates?: { count: number }[] | null };

function issueListQueriesOnly(query: { state: { data: unknown } }) {
  return Array.isArray(query.state.data);
}

function getIssueListSnapshots(
  queryClient: ReturnType<typeof useQueryClient>
): IssueListSnapshot {
  return queryClient.getQueriesData<Issue[]>({
    queryKey: issueKeys.all,
    predicate: issueListQueriesOnly,
  });
}

function restoreIssueListSnapshots(
  queryClient: ReturnType<typeof useQueryClient>,
  snapshots: IssueListSnapshot
) {
  for (const [queryKey, data] of snapshots) {
    queryClient.setQueryData(queryKey, data);
  }
}

function updateCachedIssueLists(
  queryClient: ReturnType<typeof useQueryClient>,
  updater: (issue: Issue) => Issue
) {
  queryClient.setQueriesData<Issue[]>(
    {
      queryKey: issueKeys.all,
      predicate: issueListQueriesOnly,
    },
    (old) => old?.map(updater)
  );
}

// ---------------------------------------------------------------------------
// useIssues - list issues, optionally filtered by series
// ---------------------------------------------------------------------------
export function useIssues(seriesId?: string, enabled = true) {
  const supabase = createClient();

  return useQuery<Issue[]>({
    queryKey: issueKeys.list(seriesId),
    enabled,
    queryFn: async () => {
      let query = supabase.from("issues").select("*, issue_updates(count)");
      query = seriesId
        ? query
            .eq("series_id", seriesId)
            .order("sort_order", { ascending: true })
            .order("created_at", { ascending: false })
        : query.order("created_at", { ascending: false });

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? [])
        // Hide issues in the grace-window delete state so the 2s meeting poll
        // (which refetches this query) cannot resurrect a row the user just
        // deleted while its Undo toast is still up. See src/lib/pending-delete.
        .filter((row: IssueListRow) => !isPendingDelete(row.id))
        .map((row: IssueListRow) => ({
          ...row,
          update_count: row.issue_updates?.[0]?.count ?? 0,
          issue_updates: undefined,
        })) as Issue[];
    },
  });
}

// ---------------------------------------------------------------------------
// useIssue - single issue with updates and meeting context
// ---------------------------------------------------------------------------
export function useIssue(id: string) {
  const supabase = createClient();

  return useQuery<IssueWithUpdates>({
    queryKey: issueKeys.detail(id),
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("issues")
        .select("*, updates:issue_updates(*), task_events(*), raised_in_meeting:meetings!raised_in_meeting_id(*)")
        .eq("id", id)
        .single();

      if (error) throw error;
      return data as unknown as IssueWithUpdates;
    },
  });
}

// ---------------------------------------------------------------------------
// useTaskEvents - the Phase 2 v2 history log (public.task_events) for one issue
// ---------------------------------------------------------------------------
export function useTaskEvents(issueId: string) {
  const supabase = createClient();

  return useQuery<TaskEvent[]>({
    queryKey: issueKeys.taskEvents(issueId),
    enabled: !!issueId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("task_events")
        .select("*")
        .eq("issue_id", issueId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as TaskEvent[];
    },
  });
}

export const ITEM_LIMIT = 25;
export const ITEM_LIMIT_MESSAGE =
  "Для этого аккаунта исчерпан лимит элементов.";

/**
 * Returns the count of active issues (status NOT IN resolved, dropped) for the
 * given organization, or null if the count could not be determined.
 */
export async function countActiveIssuesForOrg(
  supabase: ReturnType<typeof createClient>,
  organizationId: string
): Promise<number | null> {
  // Fetch series IDs belonging to the org.
  const { data: seriesRows, error: seriesError } = await supabase
    .from("meeting_series")
    .select("id")
    .eq("organization_id", organizationId);

  if (seriesError) return null;
  const seriesIds = (seriesRows ?? []).map((s) => s.id as string);
  if (seriesIds.length === 0) return 0;

  const { count, error: countError } = await supabase
    .from("issues")
    .select("id", { count: "exact", head: true })
    .in("series_id", seriesIds)
    .in("status", [...ACTIVE_ISSUE_STATUSES]);

  if (countError) return null;
  return count ?? 0;
}

// ---------------------------------------------------------------------------
// useCreateIssue
// ---------------------------------------------------------------------------
export function useCreateIssue() {
  const supabase = createClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateIssueInput & { meeting_id: string; series_id: string }) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Не авторизован");

      const { data: profile } = isFeatureGatingEnabled()
        ? await supabase
            .from("profiles")
            .select("has_full_access, current_organization_id")
            .eq("id", user.id)
            .single()
        : { data: null };

      if (profile && !profile.has_full_access && profile.current_organization_id) {
        const activeCount = await countActiveIssuesForOrg(
          supabase,
          profile.current_organization_id
        );
        if (activeCount !== null && activeCount >= ITEM_LIMIT) {
          throw new Error(ITEM_LIMIT_MESSAGE);
        }
      }

      const { data, error } = await supabase
        .from("issues")
        .insert({
          title: input.title,
          description: input.description,
          category: input.category,
          priority: input.priority,
          owner_name: input.owner_name,
          due_date: input.due_date,
          raised_in_meeting_id: input.meeting_id,
          series_id: input.series_id,
          status: "assigned" as IssueStatus,
          source: "manual",
          owner_user_id: input.owner_name ? null : user.id,
        })
        .select()
        .single();

      if (error) throw error;
      await logTaskEvent(supabase, {
        issueId: (data as Issue).id,
        event: "created",
        actor: user.email ?? user.id,
        payload: { title: input.title, status: "assigned" },
      });
      return data as Issue;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: issueKeys.all });
      queryClient.invalidateQueries({
        queryKey: issueKeys.list(variables.series_id),
      });
      queryClient.invalidateQueries({
        queryKey: ["meetings", "detail", variables.meeting_id],
      });
    },
  });
}

// ---------------------------------------------------------------------------
// useUpdateIssueStatus - optimistic update + creates IssueUpdate record
// ---------------------------------------------------------------------------
type UpdateIssueStatusVars = {
  issueId: string;
  seriesId: string;
  oldStatus: IssueStatus;
  newStatus: IssueStatus;
  note?: string;
  meetingId?: string;
  /** Set when this call is itself an Undo, so it does not spawn another toast. */
  isUndo?: boolean;
};

export function useUpdateIssueStatus() {
  const supabase = createClient();
  const queryClient = useQueryClient();
  // Latest `mutate` captured in a ref so the undo toast (fired from onSuccess,
  // which cannot reference the mutation it lives in) can re-invoke it.
  const mutateRef = useRef<((vars: UpdateIssueStatusVars) => void) | null>(null);

  const mutation = useMutation<
    Issue,
    Error,
    UpdateIssueStatusVars,
    {
      previousIssueLists: IssueListSnapshot;
      previousDetail: IssueWithUpdates | undefined;
    }
  >({
    mutationFn: async ({ issueId, oldStatus, newStatus, note, meetingId }) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const actor = user?.email ?? user?.id ?? "";
      const nowIso = new Date().toISOString();

      // Terminal/accept stamps travel with the status so the workflow fields
      // (accepted_at/closed_at) never drift from the status itself.
      const patch: Record<string, unknown> = {
        status: newStatus,
        resolved_in_meeting_id: newStatus === "resolved" ? meetingId : null,
      };
      if (newStatus === "accepted") {
        patch.accepted_at = nowIso;
        patch.accepted_by = actor;
      }
      if (newStatus === "resolved") {
        patch.closed_at = nowIso;
        patch.closed_by = actor;
      } else if (isClosedStatus(oldStatus)) {
        patch.closed_at = null;
        patch.closed_by = "";
      }

      const { data: issue, error: issueError } = await supabase
        .from("issues")
        .update(patch)
        .eq("id", issueId)
        .select()
        .single();

      if (issueError) throw issueError;

      const { error: updateError } = await supabase
        .from("issue_updates")
        .insert({
          issue_id: issueId,
          meeting_id: meetingId ?? null,
          updated_by: user?.id ?? "",
          author_type: "human",
          previous_status: oldStatus,
          new_status: newStatus,
          note: note ?? "",
        });

      if (updateError) throw updateError;

      await logTaskEvent(supabase, {
        issueId,
        event: statusTransitionEvent(oldStatus, newStatus),
        actor,
        payload: { from: oldStatus, to: newStatus },
      });

      return issue as Issue;
    },

    onMutate: async ({ issueId, newStatus, meetingId }) => {
      await queryClient.cancelQueries({ queryKey: issueKeys.all });
      await queryClient.cancelQueries({ queryKey: issueKeys.detail(issueId) });

      const previousIssueLists = getIssueListSnapshots(queryClient);
      const previousDetail = queryClient.getQueryData<IssueWithUpdates>(
        issueKeys.detail(issueId)
      );
      const resolvedMeetingId = newStatus === "resolved" ? meetingId ?? null : null;

      updateCachedIssueLists(queryClient, (issue) =>
        issue.id === issueId
          ? {
              ...issue,
              status: newStatus,
              resolved_in_meeting_id: resolvedMeetingId,
              update_count: (issue.update_count ?? 0) + 1,
            }
          : issue
      );

      queryClient.setQueryData<IssueWithUpdates>(
        issueKeys.detail(issueId),
        (old) =>
          old
            ? {
                ...old,
                status: newStatus,
                resolved_in_meeting_id: resolvedMeetingId,
              }
            : old
      );

      return { previousIssueLists, previousDetail };
    },

    onError: (_err, vars, context) => {
      if (context) {
        restoreIssueListSnapshots(queryClient, context.previousIssueLists);
        queryClient.setQueryData(
          issueKeys.detail(vars.issueId),
          context.previousDetail
        );
      }
    },

    onSuccess: (data, variables) => {
      updateCachedIssueLists(queryClient, (issue) =>
        issue.id === data.id ? { ...issue, ...data } : issue
      );
      queryClient.setQueryData<IssueWithUpdates>(
        issueKeys.detail(variables.issueId),
        (old) => (old ? { ...old, ...data, updates: old.updates } : old)
      );

      // Universal one-tap Undo for any status change. Suppressed on the undo's
      // own success so undo-of-undo does not chain toasts.
      if (!variables.isUndo) {
        toast(`Статус: ${STATUS_CONFIG[variables.newStatus]?.label ?? variables.newStatus}`, {
          action: {
            label: "Отменить",
            onClick: () =>
              mutateRef.current?.({
                issueId: variables.issueId,
                seriesId: variables.seriesId,
                oldStatus: variables.newStatus,
                newStatus: variables.oldStatus,
                meetingId: variables.meetingId,
                isUndo: true,
              }),
          },
        });
      }
    },

    onSettled: (_data, _error, variables) => {
      queryClient.invalidateQueries({
        queryKey: issueKeys.detail(variables.issueId),
        refetchType: "inactive",
      });
      queryClient.invalidateQueries({
        queryKey: issueKeys.taskEvents(variables.issueId),
        refetchType: "inactive",
      });
      if (variables.meetingId) {
        queryClient.invalidateQueries({
          queryKey: ["meetings", "detail", variables.meetingId],
          refetchType: "inactive",
        });
      }
    },
  });

  // Keep the ref pointed at the latest (referentially stable) mutate so the
  // undo toast can re-invoke it without referencing the mutation during render.
  useEffect(() => {
    mutateRef.current = mutation.mutate;
  }, [mutation.mutate]);
  return mutation;
}

// ---------------------------------------------------------------------------
// useUpdateIssue - update arbitrary issue fields (title, description, etc.)
// ---------------------------------------------------------------------------
export function useUpdateIssue() {
  const supabase = createClient();
  const queryClient = useQueryClient();

  return useMutation<
    Issue,
    Error,
    {
      issueId: string;
      title?: string;
      description?: string | null;
      owner_name?: string | null;
      due_date?: string | null;
      priority?: string;
      proposed_due_date?: string | null;
    },
    {
      previousIssueLists: IssueListSnapshot;
      previousDetail: IssueWithUpdates | undefined;
    }
  >({
    mutationFn: async ({ issueId, ...fields }) => {
      const { data, error } = await supabase
        .from("issues")
        .update(fields)
        .eq("id", issueId)
        .select()
        .single();

      if (error) throw error;
      return data as Issue;
    },

    onMutate: async ({ issueId, ...fields }) => {
      await queryClient.cancelQueries({ queryKey: issueKeys.all });
      await queryClient.cancelQueries({ queryKey: issueKeys.detail(issueId) });

      const previousIssueLists = getIssueListSnapshots(queryClient);
      const previousDetail = queryClient.getQueryData<IssueWithUpdates>(
        issueKeys.detail(issueId)
      );

      updateCachedIssueLists(queryClient, (issue) =>
        issue.id === issueId ? ({ ...issue, ...fields } as Issue) : issue
      );
      queryClient.setQueryData<IssueWithUpdates>(
        issueKeys.detail(issueId),
        (old) => (old ? ({ ...old, ...fields } as IssueWithUpdates) : old)
      );

      return { previousIssueLists, previousDetail };
    },

    onError: (_err, vars, context) => {
      if (!context) return;
      restoreIssueListSnapshots(queryClient, context.previousIssueLists);
      queryClient.setQueryData(
        issueKeys.detail(vars.issueId),
        context.previousDetail
      );
    },

    onSuccess: (data) => {
      updateCachedIssueLists(queryClient, (issue) =>
        issue.id === data.id ? { ...issue, ...data } : issue
      );
      queryClient.setQueryData<IssueWithUpdates>(
        issueKeys.detail(data.id),
        (old) => (old ? { ...old, ...data, updates: old.updates } : old)
      );
    },

    onSettled: (_data, _error, vars) => {
      queryClient.invalidateQueries({
        queryKey: issueKeys.detail(vars.issueId),
        refetchType: "inactive",
      });
      queryClient.invalidateQueries({ queryKey: issueKeys.all });
    },
  });
}

// ---------------------------------------------------------------------------
// useReorderIssues - persist drag-to-reorder within a series (issues.sort_order)
// ---------------------------------------------------------------------------
export function useReorderIssues() {
  const supabase = createClient();
  const queryClient = useQueryClient();
  return useMutation<void, Error, { seriesId: string; orderedIds: string[] }, { previousIssueLists: IssueListSnapshot }>({
    mutationFn: async ({ seriesId, orderedIds }) => {
      const { error } = await supabase.rpc("reorder_issues", { p_series_id: seriesId, p_ordered_ids: orderedIds });
      if (error) throw error;
    },
    onMutate: async ({ orderedIds }) => {
      await queryClient.cancelQueries({ queryKey: issueKeys.all });
      const previousIssueLists = getIssueListSnapshots(queryClient);
      const pos = new Map(orderedIds.map((id, i) => [id, i + 1]));
      updateCachedIssueLists(queryClient, (issue) => pos.has(issue.id) ? { ...issue, sort_order: pos.get(issue.id)! } : issue);
      return { previousIssueLists };
    },
    onError: (_e, _v, ctx) => { if (ctx) restoreIssueListSnapshots(queryClient, ctx.previousIssueLists); },
    onSettled: (_d, _e, { seriesId }) => {
      queryClient.invalidateQueries({ queryKey: issueKeys.all });
      queryClient.invalidateQueries({ queryKey: issueKeys.list(seriesId) });
    },
    meta: { errorMessage: "Не удалось сохранить новый порядок." },
  });
}

// ---------------------------------------------------------------------------
// useAssignIssue - assign to a workspace member (owner_user_id) or free text
// ---------------------------------------------------------------------------
export function useAssignIssue() {
  const supabase = createClient();
  const queryClient = useQueryClient();

  return useMutation<
    void,
    Error,
    { issueId: string; owner_user_id: string | null; owner_name: string | null },
    {
      previousIssueLists: IssueListSnapshot;
      previousDetail: IssueWithUpdates | undefined;
    }
  >({
    mutationFn: async ({ issueId, owner_user_id, owner_name }) => {
      const { error } = await supabase.rpc("assign_issue", {
        p_issue_id: issueId,
        p_owner_user_id: owner_user_id,
        p_owner_name: owner_name ?? "",
      });
      if (error) throw error;

      const {
        data: { user },
      } = await supabase.auth.getUser();
      await logTaskEvent(supabase, {
        issueId,
        event: "assigned",
        actor: user?.email ?? user?.id ?? "",
        payload: { owner_name: owner_name ?? "", owner_user_id: owner_user_id ?? null },
      });
    },

    onMutate: async ({ issueId, owner_user_id, owner_name }) => {
      await queryClient.cancelQueries({ queryKey: issueKeys.all });
      await queryClient.cancelQueries({ queryKey: issueKeys.detail(issueId) });

      const previousIssueLists = getIssueListSnapshots(queryClient);
      const previousDetail = queryClient.getQueryData<IssueWithUpdates>(
        issueKeys.detail(issueId)
      );
      const nextOwnerName = owner_name ?? "";

      updateCachedIssueLists(queryClient, (issue) =>
        issue.id === issueId
          ? { ...issue, owner_user_id, owner_name: nextOwnerName }
          : issue
      );

      queryClient.setQueryData<IssueWithUpdates>(
        issueKeys.detail(issueId),
        (old) =>
          old ? { ...old, owner_user_id, owner_name: nextOwnerName } : old
      );

      return { previousIssueLists, previousDetail };
    },

    onError: (_err, vars, context) => {
      if (!context) return;
      restoreIssueListSnapshots(queryClient, context.previousIssueLists);
      queryClient.setQueryData(
        issueKeys.detail(vars.issueId),
        context.previousDetail
      );
    },

    onSettled: (_data, _error, variables) => {
      queryClient.invalidateQueries({ queryKey: issueKeys.all });
      queryClient.invalidateQueries({ queryKey: issueKeys.detail(variables.issueId) });
    },

    meta: { errorMessage: "Не удалось обновить исполнителя." },
  });
}

// ---------------------------------------------------------------------------
// useAddIssueUpdate - add a standalone timeline entry (note/status change)
// ---------------------------------------------------------------------------
export function useAddIssueUpdate() {
  const supabase = createClient();
  const queryClient = useQueryClient();

  return useMutation<
    IssueUpdate,
    Error,
    {
      issueId: string;
      note?: string;
      newStatus?: IssueStatus;
      oldStatus?: IssueStatus;
    },
    {
      tempUpdateId: string;
      previousIssueLists: IssueListSnapshot;
      previousDetail: IssueWithUpdates | undefined;
    }
  >({
    mutationFn: async ({
      issueId,
      note,
      newStatus,
      oldStatus,
    }) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const { data: update, error: updateError } = await supabase
        .from("issue_updates")
        .insert({
          issue_id: issueId,
          meeting_id: null,
          updated_by: user?.id ?? "",
          author_type: "human",
          previous_status: oldStatus ?? null,
          new_status: newStatus ?? null,
          note: note ?? null,
        })
        .select()
        .single();

      if (updateError) throw updateError;

      if (newStatus && newStatus !== oldStatus) {
        const { error: issueError } = await supabase
          .from("issues")
          .update({ status: newStatus })
          .eq("id", issueId);

        if (issueError) throw issueError;
      }

      return update as IssueUpdate;
    },

    onMutate: async ({ issueId, note, newStatus, oldStatus }) => {
      await queryClient.cancelQueries({ queryKey: issueKeys.all });
      await queryClient.cancelQueries({ queryKey: issueKeys.detail(issueId) });

      const previousIssueLists = getIssueListSnapshots(queryClient);
      const previousDetail = queryClient.getQueryData<IssueWithUpdates>(
        issueKeys.detail(issueId)
      );
      const tempUpdateId =
        globalThis.crypto?.randomUUID?.() ?? `optimistic-${Date.now()}`;
      const optimisticUpdate: IssueUpdate = {
        id: tempUpdateId,
        issue_id: issueId,
        meeting_id: null,
        updated_by: "",
        author_type: "human",
        previous_status: oldStatus ?? null,
        new_status: newStatus ?? null,
        note: note ?? null,
        created_at: new Date(),
      };
      const statusChanged = !!newStatus && newStatus !== oldStatus;

      queryClient.setQueryData<IssueWithUpdates>(
        issueKeys.detail(issueId),
        (old) =>
          old
            ? {
                ...old,
                status: statusChanged ? newStatus : old.status,
                updates: [optimisticUpdate, ...(old.updates ?? [])],
              }
            : old
      );

      updateCachedIssueLists(queryClient, (issue) =>
        issue.id === issueId
          ? {
              ...issue,
              status: statusChanged ? newStatus : issue.status,
              update_count: (issue.update_count ?? 0) + 1,
            }
          : issue
      );

      return { tempUpdateId, previousIssueLists, previousDetail };
    },

    onError: (_err, variables, context) => {
      if (!context) return;
      restoreIssueListSnapshots(queryClient, context.previousIssueLists);
      queryClient.setQueryData(
        issueKeys.detail(variables.issueId),
        context.previousDetail
      );
    },

    onSuccess: (data, variables, context) => {
      queryClient.setQueryData<IssueWithUpdates>(
        issueKeys.detail(variables.issueId),
        (old) =>
          old
            ? {
                ...old,
                updates: (old.updates ?? []).map((update) =>
                  update.id === context?.tempUpdateId ? data : update
                ),
              }
            : old
      );
    },

    onSettled: (_data, _error, variables) => {
      queryClient.invalidateQueries({
        queryKey: issueKeys.detail(variables.issueId),
        refetchType: "inactive",
      });
    },
  });
}

// ---------------------------------------------------------------------------
// useDeleteIssue
// ---------------------------------------------------------------------------
export function useDeleteIssue() {
  const supabase = createClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (issueId: string) => {
      const { error } = await supabase
        .from("issues")
        .delete()
        .eq("id", issueId);

      if (error) throw error;
    },
    // The UI optimistically hides the row and parks its id in the pending-delete
    // registry (grace window). Whether the server delete succeeds or fails, clear
    // the id so the fetch-filter stops hiding it: on success the row is already
    // gone; on error the row honestly returns and the global error toast fires.
    onSettled: (_data, _error, issueId) => {
      clearPendingDelete(issueId);
      queryClient.invalidateQueries({ queryKey: issueKeys.all });
    },
  });
}

// ---------------------------------------------------------------------------
// useAcceptIssue - the assignee confirms wording + due date. Sets the accept
// stamps atomically with the status (accepted_at/accepted_by) and logs the
// accept event. Kept separate from a plain status change so the stamp can never
// drift from the accepted status.
// ---------------------------------------------------------------------------
export function useAcceptIssue() {
  const supabase = createClient();
  const queryClient = useQueryClient();

  return useMutation<void, Error, { issueId: string; seriesId: string }>({
    mutationFn: async ({ issueId }) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const actor = user?.email ?? user?.id ?? "";
      const nowIso = new Date().toISOString();
      const { error } = await supabase
        .from("issues")
        .update({ status: "accepted", accepted_at: nowIso, accepted_by: actor })
        .eq("id", issueId);
      if (error) throw error;
      await logTaskEvent(supabase, { issueId, event: "accepted", actor });
    },
    onSettled: (_d, _e, v) => {
      queryClient.invalidateQueries({ queryKey: issueKeys.all });
      queryClient.invalidateQueries({ queryKey: issueKeys.detail(v.issueId) });
      queryClient.invalidateQueries({ queryKey: issueKeys.taskEvents(v.issueId) });
    },
    meta: { errorMessage: "Не удалось подтвердить поручение." },
  });
}

// ---------------------------------------------------------------------------
// useSetHold - pause / resume an issue via hold_reason + hold_until. Hold is a
// branch, never a status: the issue keeps its current status while parked.
// Resume passes reason="" + until=null and logs "resumed".
// ---------------------------------------------------------------------------
export function useSetHold() {
  const supabase = createClient();
  const queryClient = useQueryClient();

  return useMutation<
    void,
    Error,
    { issueId: string; seriesId: string; reason: string; until: string | null }
  >({
    mutationFn: async ({ issueId, reason, until }) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const actor = user?.email ?? user?.id ?? "";
      const { error } = await supabase
        .from("issues")
        .update({ hold_reason: reason, hold_until: until })
        .eq("id", issueId);
      if (error) throw error;
      await logTaskEvent(supabase, {
        issueId,
        event: reason || until ? "hold" : "resumed",
        actor,
        payload: { reason, until },
      });
    },
    onSettled: (_d, _e, v) => {
      queryClient.invalidateQueries({ queryKey: issueKeys.all });
      queryClient.invalidateQueries({ queryKey: issueKeys.detail(v.issueId) });
      queryClient.invalidateQueries({ queryKey: issueKeys.taskEvents(v.issueId) });
    },
    meta: { errorMessage: "Не удалось сохранить приостановку." },
  });
}
