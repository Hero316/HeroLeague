import type { Match, Tip } from '../types';
import { apiFetch } from './api';

// ---------------------------------------------------------------------------
// Tippspiel-Helfer (öffentlich, ohne Login). Jedes Gerät bekommt eine stabile
// anonyme voterId + einen Anzeigenamen (localStorage). Ein Tipp pro Spiel –
// die Sperre erzwingt zusätzlich der Server.
// ---------------------------------------------------------------------------

const ID_KEY = 'hl_tipp_id';
const NAME_KEY = 'hl_tipp_name';

export function getVoterId(): string {
  try {
    let id = localStorage.getItem(ID_KEY);
    if (!id) {
      id = `v-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
      localStorage.setItem(ID_KEY, id);
    }
    return id;
  } catch {
    // Privater Modus o. Ä. – flüchtige ID (Tippen klappt, aber ohne Wiedererkennung).
    return `v-tmp-${Math.random().toString(36).slice(2, 10)}`;
  }
}

export function getVoterName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? '';
  } catch {
    return '';
  }
}

export function setVoterName(name: string): void {
  try {
    localStorage.setItem(NAME_KEY, name.trim().slice(0, 24));
  } catch {
    /* ignorieren */
  }
}

export async function fetchTips(): Promise<Tip[]> {
  const data = await apiFetch<{ tips: Tip[] }>('/api/twitch?resource=tips');
  return Array.isArray(data.tips) ? data.tips : [];
}

export async function submitTip(matchId: string, home: number, away: number, voterName: string): Promise<Tip> {
  return apiFetch<Tip>('/api/twitch?resource=tip', {
    method: 'POST',
    body: JSON.stringify({ matchId, home, away, voterId: getVoterId(), voterName }),
  });
}

// Punkte für einen Tipp gegen das Endergebnis: exakt = 3, Tendenz = 1, sonst 0.
export function scoreTip(tip: { home: number; away: number }, match: Match): number {
  if (match.homeScore === null || match.awayScore === null) return 0;
  const rh = match.homeScore;
  const ra = match.awayScore;
  if (tip.home === rh && tip.away === ra) return 3;
  const sign = (a: number, b: number) => (a > b ? 1 : a < b ? -1 : 0);
  return sign(tip.home, tip.away) === sign(rh, ra) ? 1 : 0;
}

export interface LeaderRow {
  voterId: string;
  name: string;
  points: number;
  exact: number; // Volltreffer
  correct: number; // richtige Tendenz (inkl. Volltreffer)
  tips: number; // gewertete Tipps (Spiel beendet)
}

// Rangliste aus allen Tipps + Spielen (nur beendete Spiele zählen).
export function leaderboard(tips: Tip[], matches: Match[]): LeaderRow[] {
  const byId = new Map(matches.map((m) => [m.id, m]));
  const rows = new Map<string, LeaderRow>();
  for (const t of tips) {
    const m = byId.get(t.matchId);
    if (!m || m.status !== 'beendet' || m.homeScore === null || m.awayScore === null) continue;
    const pts = scoreTip(t, m);
    const row = rows.get(t.voterId) ?? { voterId: t.voterId, name: t.voterName, points: 0, exact: 0, correct: 0, tips: 0 };
    row.name = t.voterName || row.name; // jüngster Name gewinnt
    row.points += pts;
    row.tips += 1;
    if (pts === 3) row.exact += 1;
    if (pts >= 1) row.correct += 1;
    rows.set(t.voterId, row);
  }
  return [...rows.values()].sort((a, b) => b.points - a.points || b.exact - a.exact || a.name.localeCompare(b.name));
}
