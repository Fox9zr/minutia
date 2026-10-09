-- Phase 2 v2 P0.3 — иерархия тем.
--
-- meeting_series.theme_group / theme_subtopic — SSOT для дерева
--   Группа → Тема (серия) → Встречи → Поручения.
-- Отдельной таблицы групп нет: набор групп = уникальные непустые значения
-- theme_group. Пустая строка '' = «Без группы».
--
-- Колонки на этом инстансе могли быть добавлены вручную — обеспечиваем их
-- идемпотентно, затем осмысленно засеваем две существующие управленческие серии.

alter table public.meeting_series
  add column if not exists theme_group text not null default '',
  add column if not exists theme_subtopic text not null default '';

-- Seed (guarded by theme_group = '' so re-runs and already-grouped rows are
-- untouched; names are matched loosely to survive minor wording changes).
update public.meeting_series
   set theme_group = 'Стратегия и цели'
 where theme_group = ''
   and name like '%Цели 2026%';

update public.meeting_series
   set theme_group = 'Управление компанией'
 where theme_group = ''
   and name like '%Реестр%';
