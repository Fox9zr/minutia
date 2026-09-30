"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

type Person = {
  id: string;
  full_name: string;
  email: string;
  position: string;
  absent_until: string | null;
  active: boolean;
};

export default function DirectoryPage() {
  const qc = useQueryClient();
  const [search, setSearch] = React.useState("");
  const [newName, setNewName] = React.useState("");
  const [newEmail, setNewEmail] = React.useState("");
  const [newPosition, setNewPosition] = React.useState("");
  const [editing, setEditing] = React.useState<Person | null>(null);
  const [message, setMessage] = React.useState<string | null>(null);

  const { data, isLoading } = useQuery<{ people: Person[] }>({
    queryKey: ["directory"],
    queryFn: async () => {
      const res = await fetch("/api/directory");
      if (!res.ok) throw new Error("Ошибка загрузки");
      return res.json();
    },
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["directory"] });

  const addMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/directory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ full_name: newName, email: newEmail, position: newPosition }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Ошибка");
      return json;
    },
    onSuccess: () => {
      setNewName(""); setNewEmail(""); setNewPosition("");
      setMessage("Добавлено");
      invalidate();
    },
    onError: (e: Error) => setMessage(e.message),
  });

  const saveMutation = useMutation({
    mutationFn: async (p: Person) => {
      const res = await fetch("/api/directory", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(p),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Ошибка");
      return json;
    },
    onSuccess: () => {
      setEditing(null);
      setMessage("Сохранено");
      invalidate();
    },
    onError: (e: Error) => setMessage(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/directory?id=${id}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Ошибка");
      return json;
    },
    onSuccess: () => {
      setMessage("Удалено");
      invalidate();
    },
    onError: (e: Error) => setMessage(e.message),
  });

  const people = (data?.people ?? []).filter((p) =>
    !search ||
    p.full_name.toLowerCase().includes(search.toLowerCase()) ||
    p.email.toLowerCase().includes(search.toLowerCase()) ||
    p.position.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Справочник сотрудников</h1>
        <p className="text-sm text-ink-3 mt-1">
          Почтовые адреса для напоминаний ответственным без аккаунта в системе. Совпадение — по ФИО в поручении.
        </p>
      </div>

      {message && (
        <div className="text-sm text-ink-3" onClick={() => setMessage(null)}>{message}</div>
      )}

      <div className="flex flex-wrap gap-2 items-end">
        <div className="w-56"><Input placeholder="ФИО" value={newName} onChange={(e) => setNewName(e.target.value)} /></div>
        <div className="w-56"><Input placeholder="email@tps.by" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} /></div>
        <div className="w-56"><Input placeholder="Должность" value={newPosition} onChange={(e) => setNewPosition(e.target.value)} /></div>
        <Button disabled={!newName.trim() || addMutation.isPending} onClick={() => addMutation.mutate()}>
          {addMutation.isPending ? "Добавляем…" : "Добавить"}
        </Button>
      </div>

      <Input
        className="max-w-sm"
        placeholder="Поиск по имени, email, должности…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {isLoading ? (
        <p className="text-sm text-ink-3">Загрузка…</p>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left">
              <tr>
                <th className="p-2 font-medium">ФИО</th>
                <th className="p-2 font-medium">Email</th>
                <th className="p-2 font-medium">Должность</th>
                <th className="p-2 font-medium w-24">Действия</th>
              </tr>
            </thead>
            <tbody>
              {people.map((p) => (
                <tr key={p.id} className="border-t">
                  {editing?.id === p.id ? (
                    <>
                      <td className="p-2"><Input value={editing.full_name} onChange={(e) => setEditing({ ...editing, full_name: e.target.value })} /></td>
                      <td className="p-2"><Input value={editing.email} onChange={(e) => setEditing({ ...editing, email: e.target.value })} /></td>
                      <td className="p-2"><Input value={editing.position} onChange={(e) => setEditing({ ...editing, position: e.target.value })} /></td>
                      <td className="p-2 whitespace-nowrap">
                        <Button size="sm" disabled={saveMutation.isPending} onClick={() => saveMutation.mutate(editing)}>Сохранить</Button>{" "}
                        <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>Отмена</Button>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="p-2">{p.full_name}{!p.active && <span className="ml-2 text-xs text-ink-4">(неактивен)</span>}</td>
                      <td className="p-2 font-mono text-xs">{p.email || "—"}</td>
                      <td className="p-2 text-ink-3">{p.position || "—"}</td>
                      <td className="p-2 whitespace-nowrap">
                        <Button size="sm" variant="ghost" onClick={() => setEditing(p)}>Изменить</Button>{" "}
                        <Button size="sm" variant="ghost" className="text-red-600" disabled={deleteMutation.isPending} onClick={() => { if (confirm(`Удалить ${p.full_name}?`)) deleteMutation.mutate(p.id); }}>
                          Удалить
                        </Button>
                      </td>
                    </>
                  )}
                </tr>
              ))}
              {people.length === 0 && (
                <tr><td colSpan={4} className="p-4 text-center text-ink-3">Ничего не найдено</td></tr>
              )}
            </tbody>
          </table>
          <div className="p-2 bg-muted/30 text-xs text-ink-4 border-t">Всего: {data?.people?.length ?? 0}</div>
        </div>
      )}
    </div>
  );
}
