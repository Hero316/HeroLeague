import type { Match } from '../types';

// ---------------------------------------------------------------------------
// Welcher Spieltag ist beim Öffnen des Spielplans vorausgewählt?
// Ab SCHEDULE_LEAD_DAYS Tagen vor einem Spieltag (0 Uhr, Ortszeit) springt der
// Spielplan auf diesen Spieltag – bis dahin zeigt er den davor (= zuletzt
// gespielten). Vor Saisonbeginn: der erste Spieltag. Gilt automatisch für jeden
// weiteren Spieltag; maßgeblich ist das früheste Datum der Spiele eines Spieltags.
// ---------------------------------------------------------------------------

export const SCHEDULE_LEAD_DAYS = 3;

export function defaultScheduleMatchday(
  matches: Pick<Match, 'matchday' | 'date'>[],
  now: Date = new Date()
): number | null {
  const days = [...new Set(matches.map((m) => m.matchday))].sort((a, b) => a - b);
  if (days.length === 0) return null;
  const firstDate = new Map<number, string>();
  for (const m of matches) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(m.date ?? '')) continue;
    const cur = firstDate.get(m.matchday);
    if (!cur || m.date < cur) firstDate.set(m.matchday, m.date);
  }
  let pick: number | null = null;
  for (const day of days) {
    const date = firstDate.get(day);
    if (!date) continue;
    const [y, mo, d] = date.split('-').map(Number);
    const from = new Date(y, mo - 1, d - SCHEDULE_LEAD_DAYS, 0, 0, 0, 0);
    if (from.getTime() <= now.getTime()) pick = day;
  }
  return pick ?? days[0];
}
