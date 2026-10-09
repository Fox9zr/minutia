"use client";

import * as React from "react";
import {
  useThemeCatalog,
  useThemeMutations,
  groupThemes,
  type ThemeCatalogRow,
} from "@/lib/hooks/use-themes";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ChevronUp, ChevronDown, Plus, Trash2, EyeOff, Eye } from "lucide-react";

// ---------------------------------------------------------------------------
// /settings/themes — управляемый справочник тем (для Инны и менеджеров).
// Группа → темы. Inline-правка, добавить тему/группу, деактивация (is_active=false
// скрывает тему из выбора, данные сохраняются), сортировка стрелками.
// Пишут только менеджеры (RLS theme_catalog_write); прочим — read-only.
// ---------------------------------------------------------------------------

function groupOf(rows: ThemeCatalogRow[], name: string) {
  return rows
    .filter((r) => r.group_name === name)
    .sort((a, b) => a.sort_order - b.sort_order || a.topic_name.localeCompare(b.topic_name, "ru"));
}

export default function ThemesSettingsPage() {
  const { data: rows, isLoading } = useThemeCatalog();
  const { create, update, remove } = useThemeMutations();
  const [message, setMessage] = React.useState<string | null>(null);
  const [err, setErr] = React.useState<string | null>(null);

  const groups = React.useMemo(() => groupThemes(rows), [rows]);

  // New theme form (adds to an existing or brand-new group).
  const [newGroup, setNewGroup] = React.useState("");
  const [newTopic, setNewTopic] = React.useState("");

  // Rename buffers per group.
  const [renameBuf, setRenameBuf] = React.useState<Record<string, string>>({});

  async function addTheme() {
    setMessage(null);
    setErr(null);
    if (!newGroup.trim() || !newTopic.trim()) {
      setErr("Укажите группу и тему");
      return;
    }
    try {
      const maxSort = rows
        ?.filter((r) => r.group_name === newGroup.trim())
        .reduce((m, r) => Math.max(m, r.sort_order), 0) ?? 0;
      await create.mutateAsync({
        group_name: newGroup.trim(),
        topic_name: newTopic.trim(),
        sort_order: maxSort + 1,
      });
      setNewTopic("");
      setMessage("Тема добавлена");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Ошибка");
    }
  }

  async function renameTopic(row: ThemeCatalogRow, value: string) {
    const name = value.trim();
    if (!name || name === row.topic_name) return;
    setErr(null);
    try {
      await update.mutateAsync({ id: row.id, topic_name: name });
      setMessage("Сохранено");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Ошибка");
    }
  }

  async function toggleActive(row: ThemeCatalogRow) {
    setErr(null);
    try {
      await update.mutateAsync({ id: row.id, is_active: !row.is_active });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Ошибка");
    }
  }

  async function move(row: ThemeCatalogRow, dir: -1 | 1) {
    const list = groupOf(rows ?? [], row.group_name);
    const idx = list.findIndex((r) => r.id === row.id);
    const swapWith = list[idx + dir];
    if (!swapWith) return;
    setErr(null);
    try {
      await update.mutateAsync({ id: row.id, sort_order: swapWith.sort_order });
      await update.mutateAsync({ id: swapWith.id, sort_order: row.sort_order });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Ошибка");
    }
  }

  async function renameGroup(oldName: string) {
    const name = (renameBuf[oldName] ?? "").trim();
    if (!name || name === oldName) return;
    setErr(null);
    try {
      const list = groupOf(rows ?? [], oldName);
      for (const r of list) {
        await update.mutateAsync({ id: r.id, group_name: name });
      }
      setMessage("Группа переименована");
      setRenameBuf((b) => ({ ...b, [oldName]: "" }));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Ошибка");
    }
  }

  async function deleteTopic(row: ThemeCatalogRow) {
    if (!confirm(`Удалить тему «${row.topic_name}»?`)) return;
    setErr(null);
    try {
      await remove.mutateAsync(row.id);
      setMessage("Тема удалена");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Ошибка");
    }
  }

  const totalActive = (rows ?? []).filter((r) => r.is_active).length;

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 lg:p-6">
      <div className="mx-auto w-full max-w-3xl space-y-6">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink">Справочник тем</h1>
          <p className="mt-1 text-sm text-ink-3">
            Группы и темы для серий встреч. Всего групп: {groups.length}, активных тем:{" "}
            {totalActive}. Деактивированные темы скрыты из выбора, но не удалены.
          </p>
        </div>

        {(message || err) && (
          <p className={err ? "text-xs text-danger" : "text-xs text-success"}>
            {err ?? message}
          </p>
        )}

        {isLoading ? (
          <p className="text-sm text-ink-3">Загрузка…</p>
        ) : (
          groups.map((g) => (
            <Card key={g.group_name}>
              <CardHeader>
                <CardTitle className="flex items-center justify-between gap-2">
                  <span>{g.group_name}</span>
                  <Badge variant="secondary" className="text-[11px]">
                    {g.topics.filter((t) => t.is_active).length}/{g.topics.length}
                  </Badge>
                </CardTitle>
                <CardDescription className="flex items-center gap-2">
                  <Input
                    placeholder="Переименовать группу…"
                    value={renameBuf[g.group_name] ?? ""}
                    onChange={(e) =>
                      setRenameBuf((b) => ({ ...b, [g.group_name]: e.target.value }))
                    }
                    className="h-8 max-w-xs text-xs"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => renameGroup(g.group_name)}
                    disabled={!renameBuf[g.group_name]?.trim()}
                  >
                    Переименовать
                  </Button>
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-1.5">
                {g.topics.map((t, i) => (
                  <div
                    key={t.id}
                    className="flex items-center gap-2 rounded-md border border-rule px-2 py-1.5"
                  >
                    <div className="flex flex-col">
                      <button
                        type="button"
                        onClick={() => move(t, -1)}
                        disabled={i === 0}
                        className="text-ink-4 hover:text-ink disabled:opacity-30"
                        aria-label="Выше"
                      >
                        <ChevronUp className="size-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => move(t, 1)}
                        disabled={i === g.topics.length - 1}
                        className="text-ink-4 hover:text-ink disabled:opacity-30"
                        aria-label="Ниже"
                      >
                        <ChevronDown className="size-3.5" />
                      </button>
                    </div>
                    <Input
                      defaultValue={t.topic_name}
                      onBlur={(e) => renameTopic(t, e.target.value)}
                      className={
                        "h-8 flex-1 text-sm " + (t.is_active ? "" : "text-ink-4 line-through")
                      }
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      title={t.is_active ? "Деактивировать" : "Активировать"}
                      onClick={() => toggleActive(t)}
                    >
                      {t.is_active ? (
                        <Eye className="size-3.5" />
                      ) : (
                        <EyeOff className="size-3.5 text-ink-4" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-danger"
                      title="Удалить"
                      onClick={() => deleteTopic(t)}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                ))}
              </CardContent>
            </Card>
          ))
        )}

        <Card>
          <CardHeader>
            <CardTitle>Добавить тему</CardTitle>
            <CardDescription>
              Выберите существующую группу из списка или введите новую.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex flex-1 flex-col gap-1.5">
              <Label htmlFor="new-group">Группа</Label>
              <Input
                id="new-group"
                list="theme-group-list"
                value={newGroup}
                onChange={(e) => setNewGroup(e.target.value)}
                placeholder="Например: Финансы"
              />
              <datalist id="theme-group-list">
                {groups.map((g) => (
                  <option key={g.group_name} value={g.group_name} />
                ))}
              </datalist>
            </div>
            <div className="flex flex-1 flex-col gap-1.5">
              <Label htmlFor="new-topic">Тема</Label>
              <Input
                id="new-topic"
                value={newTopic}
                onChange={(e) => setNewTopic(e.target.value)}
                placeholder="Например: Бюджетирование"
              />
            </div>
            <Button variant="accent" onClick={addTheme} disabled={create.isPending}>
              <Plus className="size-4" data-icon="inline-start" />
              Добавить
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
