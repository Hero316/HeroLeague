import type { Match } from '../types';
import { GAME_MINUTES, BREAK_MINUTES } from './matchTiming';

// ---------------------------------------------------------------------------
// Spielpausen-Regel: Kein Team spielt mehr als ZWEIMAL direkt hintereinander.
// „Direkt hintereinander" = zwei aufeinanderfolgende Anstoßzeiten im 8+3-Takt
// (eine größere Lücke, z. B. zwischen zwei Blöcken, zählt als Pause).
//
// optimizeDay() ordnet die BESTEHENDEN Paarungen eines Spieltags neu auf die
// BESTEHENDEN Anstoßzeiten/Felder an – es werden keine Zeiten erfunden, keine
// Spiele angelegt oder gelöscht. Übernommen wird das Ergebnis über den normalen
// Weg „Spielplan aus Tabelle“ (mit Vorschau und Rückfrage).
// ---------------------------------------------------------------------------

export const MAX_IN_A_ROW = 2;
const STEP = GAME_MINUTES + BREAK_MINUTES;

const mins = (t: string) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(t.trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : NaN;
};
// Zwei Anstoßzeiten folgen direkt aufeinander (ein Takt, mit etwas Spielraum).
const adjacent = (a: string, b: string) => {
  const d = mins(b) - mins(a);
  return d > 0 && d <= STEP + 4;
};

export interface Placed {
  time: string;
  field: number;
  homeTeamId: string;
  awayTeamId: string;
}
export interface StreakIssue {
  teamId: string;
  times: string[]; // die Anstoßzeiten der Serie (≥ 3)
}

// Alle Serien von mehr als MAX_IN_A_ROW Spielen am Stück.
export function streakIssues(plan: Placed[]): StreakIssue[] {
  const times = [...new Set(plan.map((p) => p.time))].sort((a, b) => mins(a) - mins(b));
  const teams = new Set(plan.flatMap((p) => [p.homeTeamId, p.awayTeamId]));
  const issues: StreakIssue[] = [];
  for (const team of teams) {
    let run: string[] = [];
    const flush = () => {
      if (run.length > MAX_IN_A_ROW) issues.push({ teamId: team, times: run });
      run = [];
    };
    for (let i = 0; i < times.length; i++) {
      const plays = plan.some((p) => p.time === times[i] && (p.homeTeamId === team || p.awayTeamId === team));
      if (!plays) {
        flush();
        continue;
      }
      if (run.length && !adjacent(run[run.length - 1], times[i])) flush();
      run.push(times[i]);
    }
    flush();
  }
  return issues;
}

export const planOf = (dayMatches: Match[]): Placed[] =>
  dayMatches.map((m) => ({ time: m.time, field: m.field ?? 1, homeTeamId: m.homeTeamId, awayTeamId: m.awayTeamId }));

// Neue Anordnung suchen. Behält Anstoßzeiten und Felder pro Zeitfenster bei und
// verschiebt möglichst wenige Spiele. Zusätzlich gilt:
//  • Ein Spiel bleibt in SEINEM Block (Blöcke = durch eine Pause getrennt).
//  • Kein Team spielt früher als sein bisher erstes Spiel an diesem Abend –
//    so bleiben z. B. Teams, die erst ab dem 2. Block können (Süß FC,
//    Trossingen), automatisch hinten.
// null = keine gültige Anordnung gefunden.
export function optimizeDay(dayMatches: Match[]): { match: Match; time: string; field: number }[] | null {
  const slots = [...new Set(dayMatches.map((m) => m.time))].sort((a, b) => mins(a) - mins(b));
  const fieldsAt = new Map(slots.map((t) => [t, dayMatches.filter((m) => m.time === t).map((m) => m.field ?? 1).sort((a, b) => a - b)]));
  const origSlot = new Map(dayMatches.map((m) => [m.id, slots.indexOf(m.time)]));
  const left = new Set(dayMatches.map((m) => m.id));
  // Block je Zeitfenster: neuer Block, sobald zwischen zwei Anstößen mehr als ein Takt liegt.
  const blockOf: number[] = [];
  slots.forEach((t, i) => blockOf.push(i === 0 ? 0 : adjacent(slots[i - 1], t) ? blockOf[i - 1] : blockOf[i - 1] + 1));
  // Frühestes bisheriges Zeitfenster je Team.
  const earliest = new Map<string, number>();
  for (const m of dayMatches) {
    const si = slots.indexOf(m.time);
    for (const t of [m.homeTeamId, m.awayTeamId]) earliest.set(t, Math.min(earliest.get(t) ?? Infinity, si));
  }
  const byId = new Map(dayMatches.map((m) => [m.id, m]));
  // Laufende Serie je Team bis zum aktuellen Zeitfenster.
  const lastSlot = new Map<string, number>();
  const runLen = new Map<string, number>();
  const assign: { id: string; slot: number }[] = [];
  let budget = 300_000;
  let best: { id: string; slot: number }[] | null = null;
  let bestCost = Infinity;

  const costOf = (a: { id: string; slot: number }[]) => a.reduce((s, x) => s + Math.abs(x.slot - (origSlot.get(x.id) ?? 0)), 0);

  const teamsOf = (id: string) => {
    const m = byId.get(id)!;
    return [m.homeTeamId, m.awayTeamId];
  };

  function combos(ids: string[], k: number, start = 0, cur: string[] = [], out: string[][] = []): string[][] {
    if (cur.length === k) {
      const ts = cur.flatMap(teamsOf);
      if (new Set(ts).size === ts.length) out.push([...cur]);
      return out;
    }
    for (let i = start; i < ids.length && out.length < 400; i++) combos(ids, k, i + 1, [...cur, ids[i]], out);
    return out;
  }

  function go(si: number) {
    if (--budget < 0) return;
    if (si === slots.length) {
      const c = costOf(assign);
      if (c < bestCost) {
        bestCost = c;
        best = [...assign];
      }
      return;
    }
    const k = fieldsAt.get(slots[si])!.length;
    const prevAdj = si > 0 && adjacent(slots[si - 1], slots[si]);
    // Kandidaten: Teams, die sonst zum dritten Mal am Stück spielen würden, raus.
    const ok = [...left].filter(
      (id) =>
        blockOf[origSlot.get(id) ?? 0] === blockOf[si] &&
        teamsOf(id).every(
          (t) => si >= (earliest.get(t) ?? 0) && !(prevAdj && lastSlot.get(t) === si - 1 && (runLen.get(t) ?? 0) >= MAX_IN_A_ROW)
        )
    );
    // Spiele, die ursprünglich hier lagen, zuerst probieren (= wenig Umstellung).
    ok.sort((a, b) => Math.abs((origSlot.get(a) ?? 0) - si) - Math.abs((origSlot.get(b) ?? 0) - si));
    for (const combo of combos(ok, k)) {
      const partial = costOf(assign) + combo.reduce((s, id) => s + Math.abs((origSlot.get(id) ?? 0) - si), 0);
      if (partial >= bestCost) continue;
      const saved = new Map<string, [number | undefined, number | undefined]>();
      for (const id of combo) {
        left.delete(id);
        assign.push({ id, slot: si });
        for (const t of teamsOf(id)) {
          saved.set(t, [lastSlot.get(t), runLen.get(t)]);
          const cont = prevAdj && lastSlot.get(t) === si - 1;
          runLen.set(t, cont ? (runLen.get(t) ?? 0) + 1 : 1);
          lastSlot.set(t, si);
        }
      }
      go(si + 1);
      for (const id of combo) {
        left.add(id);
        assign.pop();
      }
      saved.forEach(([l, r], t) => {
        if (l === undefined) lastSlot.delete(t);
        else lastSlot.set(t, l);
        if (r === undefined) runLen.delete(t);
        else runLen.set(t, r);
      });
      if (bestCost === 0 || budget < 0) return;
    }
  }
  go(0);
  const found = best as { id: string; slot: number }[] | null;
  if (!found) return null;

  // Felder je Zeitfenster vergeben – wenn möglich behält ein Spiel sein Feld.
  const out: { match: Match; time: string; field: number }[] = [];
  slots.forEach((t, si) => {
    const here = found.filter((x) => x.slot === si).map((x) => byId.get(x.id)!);
    const free = [...fieldsAt.get(t)!];
    const keep = here.filter((m) => m.time === t && free.includes(m.field ?? 1));
    for (const m of keep) {
      free.splice(free.indexOf(m.field ?? 1), 1);
      out.push({ match: m, time: t, field: m.field ?? 1 });
    }
    for (const m of here.filter((x) => !keep.includes(x))) out.push({ match: m, time: t, field: free.shift() ?? 1 });
  });
  return out;
}

// Als Text für „Spielplan aus Tabelle“: eine Zeile je Anstoßzeit, Feld 1 | Feld 2 …
export function planToText(plan: { match: Match; time: string; field: number }[], nameOf: (id: string) => string): string {
  const times = [...new Set(plan.map((p) => p.time))].sort((a, b) => mins(a) - mins(b));
  const maxField = Math.max(1, ...plan.map((p) => p.field));
  return times
    .map((t) => {
      const cells = Array.from({ length: maxField }, (_, i) => {
        const p = plan.find((x) => x.time === t && x.field === i + 1);
        return p ? `${nameOf(p.match.homeTeamId)} – ${nameOf(p.match.awayTeamId)}` : 'Frei';
      });
      return `${t} | ${cells.join(' | ')}`;
    })
    .join('\n');
}
