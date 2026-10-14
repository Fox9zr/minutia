"use client";

import * as React from "react";
import { CircleHelp, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

/* ---------------------------------------------------------------------------
 * HelpSheet — справка приложения (кнопка «Справка» в хедере).
 * Три вкладки: Регламент Инны · Интерфейс · Термины. Поиск по заголовкам.
 * Чек-листы Инны сохраняют отметки на день (localStorage, ключ с датой).
 * ------------------------------------------------------------------------ */

type ChecklistItem = { id: string; title: string; body: string };
type ChecklistBlock = { id: string; when: string; period: string; items: ChecklistItem[] };

const INNA_BLOCKS: ChecklistBlock[] = [
  {
    id: "morning",
    when: "Утро, после встречи (≈ 09:30–10:30)",
    period: "каждый рабочий день",
    items: [
      {
        id: "m1",
        title: "Откройте «Входящие»",
        body: "Ночью Kotrol сам обработал запись вчерашней встречи. Если появился черновик поручений — в «Входящих» будет уведомление «Вам назначено…» или «Готов черновик протокола». Нажмите на уведомление, чтобы попасть в нужную серию встреч.",
      },
      {
        id: "m2",
        title: "Проверьте черновик поручений",
        body: "Откройте серию встреч → свежая встреча. У каждого предложенного поручения раскройте «Источник · дословные цитаты» и сверьте: правильный ли ответственный, верен ли срок, совпадает ли формулировка со смыслом сказанного. Всё неточное исправьте прямо в карточке (нажмите на текст). Если поручения нет — оно не потеряется: пункт «обсудили» остаётся в протоколе встречи.",
      },
      {
        id: "m3",
        title: "Подтвердите корректные пункты",
        body: "Нажмите «Подтвердить» на каждом проверенном поручении. После подтверждения: статус становится «Назначено», исполнителю автоматически уходит письмо с кнопками «Принято, срок верный» / «Скорректировать». Ничего вручную отправлять не нужно — Kotrol делает это сам.",
      },
      {
        id: "m4",
        title: "Проверьте спорные пункты",
        body: "Если в записи прозвучало только имя («Егор», «Алексей») — система честно пометит ответственного «проверить», а не будет угадывать. Откройте такой пункт, сверьтесь с цитатой и выберите нужного человека из справочника (133 сотрудника, поиск по фамилии).",
      },
    ],
  },
  {
    id: "day",
    when: "В течение дня",
    period: "по мере уведомлений",
    items: [
      {
        id: "d1",
        title: "Следите за «Входящими»",
        body: "Исполнители подтверждают поручения или просят скорректировать срок — уведомления приходят в «Входящие». На каждое достаточно нажать «Прочитать»: счётчик непрочитанных исчезнет, а поручение в реестре обновит статус само.",
      },
      {
        id: "d2",
        title: "Смотрите сводку серии",
        body: "Откройте серию встреч — сверху сводные счётчики: сколько поручений назначено, принято, в работе, просрочено. Это и есть ваша «панель руководителя»: одним взглядом видно, что требует внимания.",
      },
    ],
  },
  {
    id: "friday",
    when: "Пятница (≈ 16:00)",
    period: "раз в неделю",
    items: [
      {
        id: "f1",
        title: "Сводка для руководителя",
        body: "Откройте «Настройки» → экспорт: выгрузите реестр в Excel (только подтверждённые поручения, с ответственными и сроками). Либо покажите дашборд серии прямо на экране — счётчики и просрочки уже посчитаны.",
      },
      {
        id: "f2",
        title: "Просроченные поручения",
        body: "В серии просрочки выделены отдельно. По каждому просроченному напомните исполнителю — письмо отправит Kotrol, вам достаточно нажать «Напомнить» в карточке поручения (или исполнитель получит напоминание в Telegram, если подключил бота).",
      },
    ],
  },
];

const UI_SECTIONS: { title: string; body: string }[] = [
  {
    title: "Доска OIL (главная)",
    body: "Обзор всех поручений и встреч. Здесь видно общее состояние: что назначено, что в работе, что просрочено. Клик по карточке открывает поручение.",
  },
  {
    title: "Серии встреч",
    body: "Регулярные встречи объединены в серии (например, «Совещания GM»). Внутри серии — список встреч по датам и все поручения этой серии со счётчиками статусов. Кнопка «Спросить по серии» отвечает на вопросы словами — строго по материалам встреч, с цитатами.",
  },
  {
    title: "Карточка поручения",
    body: "Каждое поручение: название, ответственный, срок, статус. Текст описания можно редактировать нажатием. Блок «Источник · дословные цитаты» показывает, из какой фразы встречи родилось поручение (кто сказал, таймкод).",
  },
  {
    title: "Мои поручения",
    body: "Личный список поручений текущего пользователя. Отсюда удобно менять статус: Назначено → Принято → В работе → На проверке → Завершено.",
  },
  {
    title: "Входящие",
    body: "Уведомления: «Вам назначено…», смена статусов, запросы на корректировку. Кнопка «Прочитать все» очищает счётчик.",
  },
  {
    title: "Справочник",
    body: "133 сотрудника: ФИО, почта, должность. Источник имён для ответственных. Управляется в «Настройках → Справочник».",
  },
  {
    title: "Темы",
    body: "Направления («Логистика», «Бюджет»…), которыми помечаются встречи и поручения. Настраиваются в «Настройках → Темы».",
  },
  {
    title: "Поиск (⌘K)",
    body: "Нажмите ⌘K (или Ctrl+K) — откроется палитра: быстрый переход к любой странице, серии, поручению или решению. Начните печатать название.",
  },
  {
    title: "Экспорт",
    body: "«Настройки» → экспорт реестра в Excel. Выгружаются подтверждённые поручения с ответственными и сроками.",
  },
  {
    title: "Telegram-бот @kotrol_tasks_bot",
    body: "Поручения можно получать и подтверждать в Telegram: привязка аккаунта одноразовым кодом из письма, команда «Мои поручения», кнопки подтверждения. Почта остаётся основным каналом, бот — по желанию.",
  },
];

const TERMS: { term: string; def: string }[] = [
  { term: "Серия встреч", def: "Регулярные встречи, объединённые в одну группу (например, еженедельные совещания GM). Все поручения серии видны вместе." },
  { term: "Встреча", def: "Отдельное событие и его материалы: запись Teams, расшифровка, черновик протокола." },
  { term: "Поручение", def: "Конкретная задача с ответственным и, если прозвучал срок, датой. Появляется из фраз встречи." },
  { term: "Черновик", def: "Предложение поручения, ещё не проверенное человеком. Пока черновик не подтверждён, исполнителю ничего не уходит." },
  { term: "Источник (цитата)", def: "Дословная фраза из записи встречи, из которой родилось поручение: кто сказал и на какой минуте. Гарантия против «мы так не договаривались»." },
  { term: "Статус поручения", def: "Этап жизни: Назначено → Принято → В работе → На проверке → Завершено (или Отменено)." },
  { term: "Входящие", def: "Личные уведомления: назначения, подтверждения, смены статусов, вопросы." },
  { term: "Тема", def: "Метка-направление (например, «Логистика»), объединяющая встречи и поручения из разных серий." },
  { term: "Справочник сотрудников", def: "Единый список людей (133 чел.), из которого выбираются ответственные." },
  { term: "Экспорт", def: "Выгрузка реестра поручений в файл Excel — реестр всегда остаётся вашим." },
  { term: "Спросить по серии", def: "Ответ системы на вопрос обычными словами — строго по материалам встреч серии, с цитатами. Если данных нет, честно ответит «не найдено»." },
  { term: "⌘K (палитра поиска)", def: "Быстрый поиск по страницам, сериям, поручениям и решениям. Открывается сочетанием ⌘K или Ctrl+K." },
];

function useDailyChecks() {
  const key = "kotrol-help-checks-" + new Date().toISOString().slice(0, 10);
  const [checked, setChecked] = React.useState<Record<string, boolean>>({});
  React.useEffect(() => {
    try { setChecked(JSON.parse(localStorage.getItem(key) || "{}")); } catch {}
  }, [key]);
  const toggle = (id: string) => {
    setChecked((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      try { localStorage.setItem(key, JSON.stringify(next)); } catch {}
      return next;
    });
  };
  return { checked, toggle };
}

function InnaSection({ q }: { q: string }) {
  const { checked, toggle } = useDailyChecks();
  const blocks = INNA_BLOCKS.map((b) => ({
    ...b,
    items: b.items.filter(
      (it) => !q || (it.title + " " + it.body).toLowerCase().includes(q.toLowerCase())
    ),
  })).filter((b) => b.items.length);
  return (
    <div className="space-y-5">
      <p className="text-sm text-ink-3">
        Порядок действий помощницы: когда и что делать. Отметки сохраняются на сегодня и завтра
        обнуляются. Система делает многое сама — ниже только то, что нужно человеку.
      </p>
      {blocks.map((b) => (
        <div key={b.id} className="rounded-lg border border-rule bg-paper-2/60 p-4">
          <div className="mb-3 flex items-baseline justify-between gap-2">
            <h3 className="font-display text-sm font-semibold text-ink">{b.when}</h3>
            <span className="text-xs text-ink-4">{b.period}</span>
          </div>
          <ol className="space-y-3">
            {b.items.map((it, idx) => (
              <li key={it.id} className="flex gap-3">
                <button
                  type="button"
                  onClick={() => toggle(it.id)}
                  aria-pressed={!!checked[it.id]}
                  className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded border border-rule-strong text-xs font-bold text-ink-3 aria-pressed:bg-success aria-pressed:border-success aria-pressed:text-white"
                  aria-label={`Отметить: ${it.title}`}
                >
                  {checked[it.id] ? "✓" : idx + 1}
                </button>
                <div>
                  <div className="text-sm font-semibold text-ink">{it.title}</div>
                  <p className="mt-1 text-[13px] leading-relaxed text-ink-2">{it.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      ))}
    </div>
  );
}

export function HelpSheet() {
  const [q, setQ] = React.useState("");
  const [open, setOpen] = React.useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <HintWrapper>
        <SheetTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 text-ink-3 hover:text-ink"
            aria-label="Открыть справку"
          >
            <CircleHelp className="size-3.5" />
            <span className="hidden text-xs sm:inline">Справка</span>
          </Button>
        </SheetTrigger>
      </HintWrapper>
      <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-xl">
        <SheetHeader className="border-b border-rule px-5 py-4">
          <SheetTitle className="font-display text-base">Справка Kotrol</SheetTitle>
          <SheetDescription className="text-xs text-ink-3">
            Как устроена система и что делать по шагам
          </SheetDescription>
          <div className="relative mt-2">
            <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-4" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Поиск по справке…"
              className="h-8 pl-8 text-sm"
            />
          </div>
        </SheetHeader>
        <Tabs defaultValue="inna" className="flex min-h-0 flex-1 flex-col">
          <TabsList className="mx-4 mt-3 grid w-auto grid-cols-3">
            <TabsTrigger value="inna" className="text-xs">Регламент Инны</TabsTrigger>
            <TabsTrigger value="ui" className="text-xs">Интерфейс</TabsTrigger>
            <TabsTrigger value="terms" className="text-xs">Термины</TabsTrigger>
          </TabsList>
          <div className="scrollArea min-h-0 flex-1 overflow-y-auto px-5 pb-8 pt-4">
            <TabsContent value="inna" className="mt-0">
              <InnaSection q={q} />
            </TabsContent>
            <TabsContent value="ui" className="mt-0 space-y-4">
              {(q
                ? UI_SECTIONS.filter((s) => (s.title + s.body).toLowerCase().includes(q.toLowerCase()))
                : UI_SECTIONS
              ).map((s) => (
                <details key={s.title} className="group rounded-lg border border-rule bg-paper-2/60 p-3.5">
                  <summary className="cursor-pointer list-none font-display text-sm font-semibold text-ink marker:content-['']">
                    {s.title}
                    <span className="float-right text-ink-4 group-open:rotate-90 transition-transform">›</span>
                  </summary>
                  <p className="mt-2 text-[13px] leading-relaxed text-ink-2">{s.body}</p>
                </details>
              ))}
            </TabsContent>
            <TabsContent value="terms" className="mt-0 space-y-2.5">
              {(q
                ? TERMS.filter((t) => (t.term + t.def).toLowerCase().includes(q.toLowerCase()))
                : TERMS
              ).map((t) => (
                <div key={t.term} className="rounded-lg border border-rule bg-paper-2/60 p-3">
                  <div className="font-display text-sm font-semibold text-ink">{t.term}</div>
                  <p className="mt-1 text-[13px] leading-relaxed text-ink-2">{t.def}</p>
                </div>
              ))}
            </TabsContent>
          </div>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}

function HintWrapper({ children }: { children: React.ReactNode }) {
  return (
    <span title="Справка: интерфейс, термины, порядок действий">
      {children}
    </span>
  );
}
