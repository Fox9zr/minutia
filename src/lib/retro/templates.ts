import type { RetroColumn } from "./types";

export interface RetroTemplate {
  id: "msg" | "ssc" | "4ls" | "fire";
  name: string;
  desc: string;
  columns: RetroColumn[];
  minutia?: boolean;
}

const cols = (...titles: string[]): RetroColumn[] =>
  titles.map((title) => ({ id: title.toLowerCase().replace(/[^a-z]+/g, "-"), title }));

export const TEMPLATES: RetroTemplate[] = [
  { id: "msg", name: "Mad · Sad · Glad", desc: "Сначала обсудите впечатления", columns: cols("Mad", "Sad", "Glad") },
  { id: "ssc", name: "Start · Stop · Continue", desc: "Конкретные изменения в поведении", columns: cols("Start", "Stop", "Continue") },
  { id: "4ls", name: "4Ls", desc: "Liked · Learned · Lacked · Longed for", columns: cols("Liked", "Learned", "Lacked", "Хотелось бы") },
  { id: "fire", name: "Что всё еще «горит»", desc: "Сформировано на основе открытых задач", columns: cols("Не закрыто", "New heat", "Период охлаждения"), minutia: true },
];

export const templateById = (id: string): RetroTemplate | undefined =>
  TEMPLATES.find((t) => t.id === id);
