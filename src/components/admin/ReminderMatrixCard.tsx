// INTENT: секция матрицы напоминаний (Phase 6b) для админа (Инны).
// GET/PUT через /api/admin/reminder-matrix. Одна строка = правило по статусу:
// за сколько дней до срока напомнить + период повтора + вкл/выкл.
// Плюс сводка Telegram-канала (сколько сотрудников привязано).
"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type MatrixRow = {
  id: string;
  status: string;
  recipient: string;
  remind_before_days: number | null;
  repeat_hours: number | null;
  enabled: boolean;
};

const STATUS_LABELS: Record<string, string> = {
  open: "Открыто",
  assigned: "Назначено",
  accepted: "Принято",
  in_progress: "В работе",
  pending: "В ожидании",
  rework: "На доработке",
};

export function ReminderMatrixCard() {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<MatrixRow[]>([]);
  const [tgLinked, setTgLinked] = useState(0);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [messageState, setMessageState] = useState<"success" | "error">("success");

  const load = useCallback(() => {
    fetch("/api/admin/reminder-matrix")
      .then((r) => (r.ok ? r.json() : { matrix: [] }))
      .then((d) => {
        setRows(d.matrix ?? []);
        setTgLinked(d.tg?.linked ?? 0);
      })
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  async function saveRow(row: MatrixRow) {
    setSavingId(row.id);
    setMessage("");
    try {
      const res = await fetch("/api/admin/reminder-matrix", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: row.id,
          remind_before_days: row.remind_before_days,
          repeat_hours: row.repeat_hours,
          enabled: row.enabled,
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Ошибка сохранения");
      setMessage(`Правило «${STATUS_LABELS[row.status] ?? row.status}» сохранено`);
      setMessageState("success");
      load();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Ошибка сохранения");
      setMessageState("error");
    } finally {
      setSavingId(null);
    }
  }

  function updateRow(id: string, patch: Partial<MatrixRow>) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Матрица напоминаний</CardTitle>
        <CardDescription>
          Правила по статусам поручений: за сколько дней до срока напомнить и как часто повторять.
          Действует для email и Telegram одновременно. Привязано к Telegram: {tgLinked}.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <p className="text-sm text-muted-foreground">Загрузка…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">Матрица пуста (обратитесь к администратору).</p>
        ) : (
          rows.map((row) => (
            <div key={row.id} className="flex flex-wrap items-end gap-3 rounded-md border p-3">
              <div className="min-w-[140px]">
                <Label>{STATUS_LABELS[row.status] ?? row.status}</Label>
                <p className="text-xs text-muted-foreground">получатель: {row.recipient === "executor" ? "исполнитель" : row.recipient}</p>
              </div>
              <div>
                <Label htmlFor={`days-${row.id}`} className="text-xs">За дней до срока</Label>
                <Input
                  id={`days-${row.id}`}
                  type="number" min={0} max={30} className="w-24"
                  value={row.remind_before_days ?? ""}
                  onChange={(e) => updateRow(row.id, { remind_before_days: e.target.value === "" ? null : Number(e.target.value) })}
                />
              </div>
              <div>
                <Label htmlFor={`hours-${row.id}`} className="text-xs">Повтор, часов</Label>
                <Input
                  id={`hours-${row.id}`}
                  type="number" min={1} max={720} className="w-24"
                  value={row.repeat_hours ?? ""}
                  onChange={(e) => updateRow(row.id, { repeat_hours: e.target.value === "" ? null : Number(e.target.value) })}
                />
              </div>
              <div>
                <Label className="text-xs">Включено</Label>
                <Button
                  type="button" variant={row.enabled ? "default" : "outline"} size="sm"
                  onClick={() => updateRow(row.id, { enabled: !row.enabled })}
                >
                  {row.enabled ? "Вкл" : "Выкл"}
                </Button>
              </div>
              <Button size="sm" disabled={savingId === row.id} onClick={() => saveRow(row)}>
                {savingId === row.id ? "Сохранение…" : "Сохранить"}
              </Button>
            </div>
          ))
        )}
        {message && (
          <p className={cn("text-sm", messageState === "success" ? "text-green-600" : "text-red-600")}>{message}</p>
        )}
      </CardContent>
    </Card>
  );
}
