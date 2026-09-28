"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  GoogleCalendarStatus,
  GoogleCalendarEntry,
  GoogleCalendarEvent,
  GoogleCalendarAgendaItem,
} from "@/lib/types";
import { серияKeys } from "./use-серия";
import { meetingKeys } from "./use-meetings";

export const calendarKeys = {
  status: ["calendar", "status"] as const,
  calendars: ["calendar", "calendars"] as const,
  events: (серияId: string) => ["calendar", "events", серияId] as const,
  agenda: ["calendar", "agenda"] as const,
};

export function useGoogleCalendarStatus(enabled = true) {
  return useQuery<GoogleCalendarStatus>({
    queryKey: calendarKeys.status,
    enabled,
    queryFn: async () => {
      const res = await fetch("/api/calendar/status");
      if (!res.ok) throw new Error("Не удалось получить статус календаря");
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useCalendarList() {
  const { data: status } = useGoogleCalendarStatus();

  return useQuery<GoogleCalendarEntry[]>({
    queryKey: calendarKeys.calendars,
    queryFn: async () => {
      const res = await fetch("/api/calendar/calendars");
      if (!res.ok) throw new Error("Не удалось получить календари");
      return res.json();
    },
    enabled: !!status?.connected,
    staleTime: 5 * 60 * 1000,
  });
}

export function useCalendarEvents(серияId: string | undefined) {
  const { data: status } = useGoogleCalendarStatus();

  return useQuery<GoogleCalendarEvent[]>({
    queryKey: calendarKeys.events(серияId ?? ""),
    queryFn: async () => {
      const res = await fetch(`/api/calendar/events?серияId=${серияId}`);
      if (!res.ok) throw new Error("Не удалось получить события");
      return res.json();
    },
    enabled: !!серияId && !!status?.connected,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
}

export function useCalendarAgenda(enabled = true) {
  const { data: status } = useGoogleCalendarStatus(enabled);

  return useQuery<{
    connected: boolean;
    syncedAt?: string;
    syncMode?: "full" | "incremental";
    events: GoogleCalendarAgendaItem[];
  }>({
    queryKey: calendarKeys.agenda,
    queryFn: async () => {
      const res = await fetch("/api/calendar/agenda");
      if (!res.ok) throw new Error("Не удалось получить повестку из календаря");
      return res.json();
    },
    enabled: enabled && !!status?.connected,
    staleTime: 2 * 60 * 1000,
    retry: 1,
  });
}

export function useStartCalendarAgendaEvent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (calendarEventId: string) => {
      const res = await fetch("/api/calendar/agenda/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ calendarEventId }),
      });
      if (!res.ok) throw new Error("Не удалось запустить встречу из календаря");
      return res.json() as Promise<{ meetingUrl: string | null; captureUrl: string }>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: calendarKeys.agenda });
      queryClient.invalidateQueries({ queryKey: meetingKeys.all });
    },
  });
}

export function useLinkCalendar() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ серияId, calendarId }: { серияId: string; calendarId: string }) => {
      const res = await fetch("/api/calendar/link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ серияId, calendarId }),
      });
      if (!res.ok) throw new Error("Не удалось привязать календарь");
      return res.json();
    },
    onSuccess: (_data, { серияId }) => {
      queryClient.invalidateQueries({ queryKey: серияKeys.all });
      queryClient.invalidateQueries({ queryKey: серияKeys.detail(серияId) });
      queryClient.invalidateQueries({ queryKey: calendarKeys.events(серияId) });
    },
  });
}

export function useUnlinkCalendar() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (серияId: string) => {
      const res = await fetch("/api/calendar/unlink", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ серияId }),
      });
      if (!res.ok) throw new Error("Не удалось отвязать календарь");
      return res.json();
    },
    onSuccess: (_data, серияId) => {
      queryClient.invalidateQueries({ queryKey: серияKeys.all });
      queryClient.invalidateQueries({ queryKey: серияKeys.detail(серияId) });
      queryClient.invalidateQueries({ queryKey: calendarKeys.events(серияId) });
    },
  });
}

export function useDisconnectGoogle() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/auth/google/disconnect", { method: "POST" });
      if (!res.ok) throw new Error("Не удалось отключить");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: calendarKeys.status });
      queryClient.invalidateQueries({ queryKey: calendarKeys.calendars });
      queryClient.invalidateQueries({ queryKey: calendarKeys.agenda });
    },
  });
}
