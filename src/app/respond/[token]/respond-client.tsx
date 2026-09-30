"use client";

import * as React from "react";

export type IssuePreview = {
  issue_number: string;
  title: string;
  owner_name: string | null;
  status: string;
  priority: string | null;
  due_date: string | null;
  accepted_at: string | null;
  proposed_due_date: string | null;
};

export default function RespondClient({
  token,
  issue,
  due,
  alreadyAccepted,
}: {
  token: string;
  issue: IssuePreview;
  due: string | null;
  alreadyAccepted: boolean;
}) {
  const [state, setState] = React.useState<"idle" | "busy" | "done" | "error">("idle");
  const [message, setMessage] = React.useState<string | null>(null);
  const [showPropose, setShowPropose] = React.useState(false);
  const [newDate, setNewDate] = React.useState("");
  const [note, setNote] = React.useState("");

  async function send(body: Record<string, unknown>) {
    setState("busy");
    setMessage(null);
    try {
      const res = await fetch(`/api/respond/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Ошибка");
      setState("done");
      setMessage(data.message ?? "Готово");
    } catch (e) {
      setState("error");
      setMessage(e instanceof Error ? e.message : "Ошибка");
    }
  }

  if (state === "done") {
    return (
      <Shell>
        <div className="space-y-2 text-center">
          <div className="text-green-600 text-4xl">✓</div>
          <h1 className="text-xl font-semibold">Спасибо!</h1>
          <p className="text-sm text-ink-3">{message}</p>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="space-y-5">
        <div>
          <p className="text-xs uppercase tracking-wide text-ink-4">Поручение {issue.issue_number}</p>
          <h1 className="text-xl font-semibold leading-snug">{issue.title}</h1>
          <p className="text-sm text-ink-3 mt-1">
            Ответственный: {issue.owner_name ?? "—"}
            {due ? ` · Срок: ${due}` : ""}
          </p>
          {alreadyAccepted && (
            <p className="text-sm text-green-700 mt-1">Вы уже подтвердили это поручение.</p>
          )}
        </div>

        {state === "error" && <p className="text-sm text-red-600">{message}</p>}

        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => send({ action: "accept" })}
            disabled={state === "busy" || alreadyAccepted}
            className="px-5 py-2.5 rounded-lg bg-ink text-white text-sm font-medium disabled:opacity-50"
          >
            {alreadyAccepted ? "Принято ✓" : "Принято, срок верный"}
          </button>
          <button
            onClick={() => setShowPropose((v) => !v)}
            disabled={state === "busy"}
            className="px-5 py-2.5 rounded-lg border border-rule text-sm font-medium disabled:opacity-50"
          >
            Предложить корректировку
          </button>
        </div>

        {showPropose && (
          <div className="space-y-3 border border-rule rounded-xl p-4">
            <label className="block text-sm">
              <span className="text-ink-3">Новая дата (ГГГГ-ММ-ДД)</span>
              <input
                value={newDate}
                onChange={(e) => setNewDate(e.target.value)}
                placeholder="2026-10-15"
                className="mt-1 w-full rounded-lg border border-rule px-3 py-2 text-sm bg-transparent"
              />
            </label>
            <label className="block text-sm">
              <span className="text-ink-3">Комментарий (необязательно)</span>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                placeholder="Могу к среде — команда вернётся из отпуска"
                className="mt-1 w-full rounded-lg border border-rule px-3 py-2 text-sm bg-transparent resize-none"
              />
            </label>
            <button
              onClick={() => send({ action: "propose", due_date: newDate, note })}
              disabled={state === "busy" || !newDate}
              className="px-4 py-2 rounded-lg bg-ink text-white text-sm font-medium disabled:opacity-50"
            >
              Отправить предложение
            </button>
          </div>
        )}
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-paper flex items-center justify-center p-6">
      <div className="w-full max-w-lg bg-white rounded-2xl border border-rule p-6 sm:p-8 shadow-sm">
        {children}
        <p className="mt-6 text-xs text-ink-4 text-center">Kotrol · подтверждение поручения</p>
      </div>
    </main>
  );
}
