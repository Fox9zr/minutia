"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface ShortcutGroup {
  title: string;
  shortcuts: { keys: string[]; label: string }[];
}

const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    title: "Глобальный",
    shortcuts: [
      { keys: ["⌘", "K"], label: "Палитра команд" },
      { keys: ["N"], label: "Новый вопрос" },
      { keys: ["G", "O"], label: "Перейти к доске OIL" },
      { keys: ["G", "S"], label: "Перейти к серии" },
      { keys: ["G", "A"], label: "Перейти в Мои задачи" },
      { keys: ["G", "I"], label: "Перейти во Входящие" },
      { keys: ["/"], label: "Перейти к поиску" },
      { keys: ["?"], label: "Горячие клавиши" },
    ],
  },
  {
    title: "Доска OIL",
    shortcuts: [
      { keys: ["J"], label: "Следующий пункт" },
      { keys: ["K"], label: "Предыдущий элемент" },
      { keys: ["Enter"], label: "Открыть выбранный элемент" },
    ],
  },
  {
    title: "Детали задачи",
    shortcuts: [
      { keys: ["S"], label: "Статус цикла" },
      { keys: ["R"], label: "Отметить решенным" },
      { keys: ["D"], label: "Отклонить" },
      { keys: ["C"], label: "Добавить статус" },
      { keys: ["Esc"], label: "Назад к доске" },
    ],
  },
  {
    title: "Завершенная встреча",
    shortcuts: [{ keys: ["R"], label: "Воспроизвести итоги" }],
  },
  {
    title: "Запись в реальном времени",
    shortcuts: [
      { keys: ["A", "Space"], label: "Категория: Действие" },
      { keys: ["D", "Space"], label: "Категория: Решение" },
      { keys: ["I", "Space"], label: "Категория: Информация" },
      { keys: ["R", "Space"], label: "Категория: Риск" },
      { keys: ["Enter"], label: "Сохранить" },
      { keys: ["Shift", "Enter"], label: "Новая строка" },
      { keys: ["Esc"], label: "Завершить захват" },
    ],
  },
];

export function KeyboardShortcutsDialog() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "?" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const tag = (e.target as HTMLElement).tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
        e.preventDefault();
        setOpen(true);
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display text-lg">
            Keyboard shortcuts
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 pt-2">
          {SHORTCUT_GROUPS.map((group) => (
            <div key={group.title}>
              <h3 className="text-[11px] font-mono uppercase tracking-wider text-ink-3 mb-2">
                {group.title}
              </h3>
              <div className="space-y-1">
                {group.shortcuts.map((shortcut) => (
                  <div
                    key={shortcut.label}
                    className="flex items-center justify-between py-1.5"
                  >
                    <span className="text-sm text-ink-2">{shortcut.label}</span>
                    <div className="flex items-center gap-1">
                      {shortcut.keys.map((key, i) => (
                        <span key={i}>
                          <kbd className="inline-flex items-center justify-center min-w-[24px] h-6 px-1.5 rounded bg-paper-2 border border-rule text-[11px] font-mono font-medium text-ink-2">
                            {key}
                          </kbd>
                          {i < shortcut.keys.length - 1 && key !== "⌘" && (
                            <span className="text-ink-4 text-[10px] mx-0.5">then</span>
                          )}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
