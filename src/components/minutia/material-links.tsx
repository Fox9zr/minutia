"use client";

// Блок «Материалы» для карточки встречи/поручения: именованные ссылки на
// файлы (Яндекс.Диск и т.п.). Autosavelink добавление: title + URL.
// Плюс TextWithLinks — рендер текста протокола с автокликабельными URL
// (замена мёртвому <pre> для готовых заметок; без markdown-зависимостей).

import * as React from "react";
import { ExternalLink, Paperclip, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  useLinks,
  useAddLink,
  useDeleteLink,
  type LinkTarget,
} from "@/lib/hooks/use-links";

export function MaterialLinksSection({
  target,
  canManage,
  className,
}: {
  target: LinkTarget;
  canManage: boolean;
  className?: string;
}) {
  const { data: links, isLoading } = useLinks(target);
  const addLink = useAddLink();
  const deleteLink = useDeleteLink();
  const [adding, setAdding] = React.useState(false);
  const [title, setTitle] = React.useState("");
  const [url, setUrl] = React.useState("");

  function submit() {
    if (!url.trim()) return;
    addLink.mutate(
      { target, title: title, url: url.trim() },
      {
        onSuccess: () => {
          setTitle("");
          setUrl("");
          setAdding(false);
        },
      }
    );
  }

  return (
    <section className={className} aria-label="Материалы">
      <div className="flex items-center justify-between gap-3 mb-2">
        <h3 className="text-xs font-mono font-medium text-ink-3 uppercase tracking-wider flex items-center gap-1.5">
          <Paperclip className="size-3.5" />
          Материалы ({links?.length ?? 0})
        </h3>
        {canManage && !adding && (
          <Button
            variant="ghost"
            size="sm"
            type="button"
            onClick={() => setAdding(true)}
            className="h-6 px-2 text-xs text-ink-3"
          >
            <Plus className="size-3.5 mr-1" />
            Добавить ссылку
          </Button>
        )}
      </div>

      {isLoading ? (
        <p className="text-xs text-ink-4">Загрузка…</p>
      ) : (links?.length ?? 0) === 0 && !adding ? (
        <p className="text-xs text-ink-4">
          Файлы встречи не приложены. Ссылку на файл (напр. Яндекс.Диск) можно добавить —
          она сохранится вместе с протоколом.
        </p>
      ) : null}

      {links && links.length > 0 && (
        <ul className="space-y-1.5">
          {links.map((link) => (
            <li
              key={link.id}
              className="group flex items-center gap-2 rounded-md border border-rule bg-card px-3 py-2"
            >
              <a
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="min-w-0 flex-1 text-sm text-ink hover:text-accent truncate"
                title={link.url}
              >
                <span className="font-medium">{link.title}</span>
                <span className="ml-2 text-xs text-ink-4 font-mono truncate">
                  {link.url.replace(/^https?:\/\//, "")}
                </span>
              </a>
              <ExternalLink className="size-3.5 shrink-0 text-ink-4" />
              {canManage && (
                <button
                  type="button"
                  onClick={() => deleteLink.mutate(link.id)}
                  className="opacity-0 group-hover:opacity-100 transition-opacity text-ink-4 hover:text-destructive shrink-0"
                  aria-label={`Удалить ${link.title}`}
                >
                  <Trash2 className="size-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {adding && (
        <div className="mt-2 rounded-md border border-rule bg-card p-3 space-y-2">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Название (напр. «Смета Q4»)"
            className="w-full bg-transparent border border-rule rounded-md px-2 py-1.5 text-sm focus:outline-none focus:border-ink-3"
          />
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://disk.yandex.ru/…"
            className="w-full bg-transparent border border-rule rounded-md px-2 py-1.5 text-sm font-mono focus:outline-none focus:border-ink-3"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                submit();
              }
              if (e.key === "Escape") {
                setAdding(false);
                setTitle("");
                setUrl("");
              }
            }}
          />
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              type="button"
              onClick={() => {
                setAdding(false);
                setTitle("");
                setUrl("");
              }}
              className="h-7 text-xs"
            >
              <X className="size-3.5 mr-1" /> Отмена
            </Button>
            <Button
              variant="accent"
              size="sm"
              type="button"
              onClick={submit}
              disabled={!url.trim() || addLink.isPending}
              className="h-7 text-xs"
            >
              Сохранить
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}

// URL_PATTERN — http(s) ссылки в произвольном тексте.
const URL_PATTERN = /(https?:\/\/[^\s<>"')\]]+)/g;

/// Рендер текста, в котором http(s)-ссылки становятся кликабельными.
/// Экранирование выполняет React (текст идёт как children, не как HTML).
export function TextWithLinks({ text }: { text: string }) {
  const parts = React.useMemo(() => text.split(URL_PATTERN), [text]);
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <a
            key={i}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent underline decoration-accent/40 hover:decoration-accent break-all"
          >
            {part}
          </a>
        ) : (
          <React.Fragment key={i}>{part}</React.Fragment>
        )
      )}
    </>
  );
}
