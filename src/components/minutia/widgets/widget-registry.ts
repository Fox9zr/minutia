export interface WidgetMeta {
  type: string;
  name: string;
  description: string;
  span: 1 | 2;
  group: "pulse" | "agenda" | "workload";
}

export const WIDGET_REGISTRY: WidgetMeta[] = [
  {
    type: "hero",
    name: "Summary",
    description: "Количество открытых элементов, график решения, средний срок жизни",
    span: 2,
    group: "pulse",
  },
  {
    type: "next-meeting",
    name: "Следующая встреча",
    description: "Быстрый переход к предстоящей серии встреч",
    span: 1,
    group: "pulse",
  },
  {
    type: "outstanding",
    name: "Нерешенные вопросы",
    description: "Все открытые вопросы по сериям с фильтрацией",
    span: 2,
    group: "pulse",
  },
  {
    type: "серия",
    name: "Ваши серии встреч",
    description: "Список серий с количеством открытых вопросов",
    span: 1,
    group: "pulse",
  },
  {
    type: "decisions",
    name: "Недавние решения",
    description: "Последние 5 решений по всем сериям",
    span: 1,
    group: "pulse",
  },
  {
    type: "age",
    name: "Срок открытых поручений",
    description: "Распределение возраста задач по периодам",
    span: 1,
    group: "pulse",
  },
  {
    type: "stale-items",
    name: "Устаревшие элементы",
    description: "Items with no updates for 14+ days",
    span: 1,
    group: "pulse",
  },
  {
    type: "серия-health",
    name: "Состояние серии",
    description: "Распределение статусов по сериям с долей закрытия",
    span: 2,
    group: "pulse",
  },
  {
    type: "meeting-triage",
    name: "Сортировка встреч",
    description: "Перенесенные / Новые / Заблокированные: данные для подготовки к встрече",
    span: 2,
    group: "agenda",
  },
  {
    type: "workload",
    name: "Workload",
    description: "Открытые элементы по ответственным с диаграммами баланса",
    span: 2,
    group: "workload",
  },
];

export function getWidgetMeta(type: string): WidgetMeta | undefined {
  return WIDGET_REGISTRY.find((w) => w.type === type);
}
