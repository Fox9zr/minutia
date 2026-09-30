// INTENT: секция настроек автоматических напоминаний для админа (Инны) — GSD kotrol-reminders-auto.
// Живёт на странице admin/(instance)/settings.PUT идёт через существующий /api/admin/config.
"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type ConfigMap = Record<string, string | null>;
type ProblemRow = {
  id: string; issue_title: string | null; kind: string; status: string;
  recipient_email: string | null; error: string | null; attempts: number;
  updated_at: string | null;
};

const NUM_FIELDS: { key: string; label: string; hint: string; min: number; max: number }[] = [
  { key: "reminder_days_before", label: "За сколько дней до срока", hint: "Напоминание уходит заранее, чтобы успеть подготовиться", min: 1, max: 30 },
  { key: "reminder_repeat_hours", label: "Повторять каждые N часов", hint: "Повтор — только пока поручение не подтверждено. Не чаще 1 раза в сутки", min: 24, max: 720 },
  { key: "reminder_send_hour_msk", label: "Час отправки (МСК)", hint: "Письма уходят начиная с этого часа, по московскому времени", min: 0, max: 23 },
];

export function ReminderSettingsCard() {
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<ConfigMap>({});
  const [original, setOriginal] = useState<ConfigMap>({});
  const [enabled, setEnabled] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [messageState, setMessageState] = useState<"success" | "error">("success");
  const [problems, setProblems] = useState<ProblemRow[]>([]);

  const loadProblems = useCallback(() => {
    fetch("/api/admin/reminder-log?status=problem")
      .then((r) => (r.ok ? r.json() : { rows: [] }))
      .then((d) => setProblems(d.rows ?? []))
      .catch(() => setProblems([]));
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/config")
      .then((r) => (r.ok ? r.json() : {}))
      .then((cfg: ConfigMap) => {
        if (cancelled) return;
        // дефолты как в воркере
        const d: Record<string, string> = { reminder_days_before: "2", reminder_repeat_hours: "48", reminder_send_hour_msk: "9" };
        const merged: Record<string, string> = {};
        for (const k of Object.keys(d)) merged[k] = cfg[k] ?? d[k];
        setForm(merged);
        setOriginal(merged);
        setEnabled(cfg.reminder_automatic_enabled === "true");
        setLoading(false);
      })
      .catch(() => !cancelled && setLoading(false));
    loadProblems();
    return () => { cancelled = true; };
  }, [loadProblems]);

  async function save(body: Record<string, string>) {
    setSaving(true); setMessage("");
    const res = await fetch("/api/admin/config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    setSaving(false);
    setMessageState(res.ok ? "success" : "error");
    setMessage(res.ok ? "Настройки напоминаний сохранены." : data.error || "Не удалось сохранить.");
    return res.ok;
  }

  async function handleSave() {
    const changed: Record<string, string> = {};
    for (const f of NUM_FIELDS) {
      const v = (form[f.key] ?? "").trim();
      const n = Number(v);
      if (!Number.isFinite(n) || n < f.min || n > f.max) {
        setMessageState("error");
        setMessage(`«${f.label}»: укажите число от ${f.min} до ${f.max}.`);
        return;
      }
      if (v !== (original[f.key] ?? "")) changed[f.key] = String(n);
    }
    if (Object.keys(changed).length === 0) {
      setMessageState("success"); setMessage("Нет изменений."); return;
    }
    if (await save(changed)) setOriginal((p) => ({ ...p, ...changed }));
  }

  async function handleToggle() {
    const next = !enabled;
    setEnabled(next);
    if (await save({ reminder_automatic_enabled: next ? "true" : "false" })) {
      setMessage(next ? "Автоматические напоминания включены." : "Автоматические напоминания выключены.");
    } else setEnabled(!next);
  }

  async function handleRetry(id: string) {
    await fetch(`/api/admin/reminder-log?id=${id}`, { method: "POST" });
    loadProblems();
  }

  if (loading) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Напоминания</CardTitle>
        <CardDescription>
          Автоматические напоминания исполнителям о поручениях со сроками. Письма уходят на email из справочника людей.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-3">
          {NUM_FIELDS.map((f) => (
            <div key={f.key} className="flex flex-col gap-1.5">
              <Label htmlFor={f.key}>{f.label}</Label>
              <Input
                id={f.key}
                inputMode="numeric"
                value={form[f.key] ?? ""}
                onChange={(e) => setForm((p) => ({ ...p, [f.key]: e.target.value }))}
              />
              <p className="text-xs text-ink-3">{f.hint}</p>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" size="sm" variant="outline" disabled={saving} onClick={handleSave}>
            {saving ? "Сохранение..." : "Сохранить параметры"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant={enabled ? "destructive" : "default"}
            disabled={saving}
            onClick={handleToggle}
          >
            {enabled ? "Выключить автоматику" : "Включить автоматику"}
          </Button>
          {message && (
            <p className={cn("text-xs", messageState === "error" ? "text-danger" : "text-success")}>{message}</p>
          )}
        </div>
        <p className="text-xs text-ink-3">
          Автоматика проверяет поручения каждые 15 минут и отправляет письма после указанного часа (МСК).
          Пока автоматика выключена, напоминания можно отправлять вручную кнопками в карточках поручений.
        </p>

        {problems.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium">Проблемы отправки</p>
            {problems.map((p) => (
              <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-xs">
                <div>
                  <span className="font-medium">{p.issue_title ?? "Поручение"}</span>
                  <span className="text-ink-3">
                    {" "}· {p.status === "skipped_no_email" ? "нет email у исполнителя" : `ошибка: ${p.error ?? "?"}`}
                    {p.recipient_email ? ` · ${p.recipient_email}` : ""}
                  </span>
                </div>
                {p.status !== "skipped_no_email" && (
                  <Button type="button" size="sm" variant="outline" onClick={() => handleRetry(p.id)}>
                    Повторить
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
