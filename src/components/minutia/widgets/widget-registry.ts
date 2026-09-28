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
    name: "Next Meeting",
    description: "Быстрый переход к предстоящей серии встреч",
    span: 1,
    group: "pulse",
  },
  {
    type: "outstanding",
    name: "Outstanding Items",
    description: "Все открытые вопросы по сериям с фильтрацией",
    span: 2,
    group: "pulse",
  },
  {
    type: "series",
    name: "Your Series",
    description: "Список серий с количеством открытых вопросов",
    span: 1,
    group: "pulse",
  },
  {
    type: "decisions",
    name: "Recent Decisions",
    description: "Последние 5 решений по всем сериям",
    span: 1,
    group: "pulse",
  },
  {
    type: "age",
    name: "Age of Open Items",
    description: "Распределение возраста задач по периодам",
    span: 1,
    group: "pulse",
  },
  {
    type: "stale-items",
    name: "Stale Items",
    description: "Items with no updates for 14+ days",
    span: 1,
    group: "pulse",
  },
  {
    type: "series-health",
    name: "Series Health",
    description: "Распределение статусов по сериям с долей закрытия",
    span: 2,
    group: "pulse",
  },
  {
    type: "meeting-triage",
    name: "Meeting Triage",
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
