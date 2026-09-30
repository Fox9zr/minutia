import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";

export const metadata: Metadata = {
  title: "Kotrol: реестр встреч и поручений",
  description:
    "Kotrol — надёжный реестр вопросов и поручений для регулярных встреч: решения, задачи и контроль сроков в одном месте.",
};

const features = [
  {
    title: "Запись в реальном времени",
    description:
      "Фиксируйте вопросы, решения и поручения в ходе встречи, а не после нее.",
  },
  {
    title: "Доска OIL",
    description:
      "Единая доска нерешенных вопросов по всем сериям регулярных встреч.",
  },
  {
    title: "Итоги от AI",
    description:
      "Автоматические итоги встреч и умная сортировка задач, чтобы ничего не упустить.",
  },
  {
    title: "Журнал решений",
    description:
      "Надежный журнал с поиском по всем решениям команды на регулярных встречах.",
  },
];

export default function LandingPage() {
  return (
    <main className="min-h-full bg-paper text-ink font-sans">
      {/* ─── Hero ─── */}
      <section className="mx-auto max-w-3xl px-6 pt-24 pb-20 text-center sm:pt-32 sm:pb-28">
        <p className="text-xs font-mono uppercase tracking-wider text-accent mb-5">
          Реестр нерешённых вопросов для регулярных встреч
        </p>
        <h1 className="font-display text-4xl font-bold leading-tight tracking-tight text-ink sm:text-6xl">
          Поручения со встреч больше не теряются.
        </h1>
        <p className="mt-6 text-lg text-ink-2 sm:text-xl">
          Kotrol — надёжный реестр решений, поручений и контрольных точек по
          регулярным встречам. Всё, что решено и кому-то поручено, остаётся
          в системе — с ответственными, сроками и напоминаниями.
        </p>
        <div className="mt-10 flex items-center justify-center">
          <Link
            href="/login?mode=signup"
            className="inline-flex items-center gap-2 rounded-md bg-ink px-6 py-3 text-sm font-medium text-paper transition-colors hover:bg-ink-2"
          >
            Начать работу
            <ArrowRight className="size-4" />
          </Link>
        </div>
        <p className="mt-3 text-xs text-ink-4">
          Доступ по приглашению администратора.
        </p>
      </section>

      {/* ─── Features ─── */}
      <section className="mx-auto max-w-5xl px-6 py-16 border-t border-rule">
        <h2 className="font-display text-2xl font-semibold text-ink sm:text-3xl text-center mb-12">
          Всё, чтобы встречи заканчивались результатом
        </h2>
        <div className="grid gap-8 sm:grid-cols-2">
          {features.map((feature) => (
            <div key={feature.title} className="flex gap-4">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-accent-soft text-accent">
                <Check className="size-4" />
              </div>
              <div>
                <h3 className="font-display text-lg font-semibold text-ink">
                  {feature.title}
                </h3>
                <p className="mt-1 text-sm text-ink-2">{feature.description}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ─── Final CTA ─── */}
      <section className="border-t border-rule">
        <div className="mx-auto max-w-3xl px-6 py-20 text-center">
          <h2 className="font-display text-2xl font-semibold text-ink sm:text-3xl">
            Готовы закрывать вопросы на каждой встрече?
          </h2>
          <p className="mt-4 text-ink-2">
            Войдите в систему или запросите доступ у администратора.
          </p>
          <div className="mt-8">
            <Link
              href="/login?mode=signup"
              className="inline-flex items-center gap-2 rounded-md bg-accent px-6 py-3 text-sm font-medium text-paper transition-colors hover:bg-accent-hover"
            >
              Войти
              <ArrowRight className="size-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* ─── Footer ─── */}
      <footer className="border-t border-rule">
        <div className="mx-auto max-w-5xl px-6 py-8 flex items-center justify-between">
          <span className="font-display text-sm font-semibold text-ink">
            Kotrol
          </span>
          <p className="text-xs text-ink-4">
            Реестр встреч и поручений. Данные хранятся на серверах компании.
          </p>
        </div>
      </footer>
    </main>
  );
}
