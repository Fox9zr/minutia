// Phase 2 v2 P1: absence ("Отсутствует до") support for reminders.
// Source of truth: people_directory.absent_until (date). A person counts as
// absent while absent_until >= today (inclusive). Name matching mirrors the
// existing directory email resolution in the reminder routes (exact full_name,
// normalised for case and inner whitespace).
export type AbsenceLookup = {
  /** normalised full_name -> ISO date (YYYY-MM-DD) the person returns on */
  byName: Record<string, string>;
};

export function normalizePersonName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

export function emptyAbsenceLookup(): AbsenceLookup {
  return { byName: {} };
}

/** Build a lookup from people_directory rows (full_name, absent_until). */
export function buildAbsenceLookup(
  rows: { full_name: string; absent_until: string | null }[]
): AbsenceLookup {
  const byName: Record<string, string> = {};
  for (const row of rows) {
    if (row.full_name && row.absent_until) {
      byName[normalizePersonName(row.full_name)] = row.absent_until.slice(0, 10);
    }
  }
  return { byName };
}

/** True when an ISO date-only value is today or in the future. */
export function isAbsentOn(until: string | null | undefined, todayISO: string): boolean {
  if (!until) return false;
  return until.slice(0, 10) >= todayISO.slice(0, 10);
}

/** MSK calendar date as YYYY-MM-DD (mirrors the reminder scheduler day math). */
export function mskTodayISO(now: Date = new Date()): string {
  const msk = new Date(now.getTime() + (3 * 60 + now.getTimezoneOffset()) * 60_000);
  return msk.toISOString().slice(0, 10);
}

/** Active absence date for an owner name, or null when present / unknown. */
export function absenceForName(
  lookup: AbsenceLookup | undefined,
  name: string | null | undefined,
  todayISO: string
): string | null {
  if (!lookup || !name) return null;
  const until = lookup.byName[normalizePersonName(name)];
  return isAbsentOn(until, todayISO) ? until : null;
}
