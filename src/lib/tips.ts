import type { Match, Tip } from '../types';
import { apiFetch } from './api';

// ---------------------------------------------------------------------------
// Tippspiel-Helfer. Teilnehmen nur nach Anmeldung mit bestätigter E-Mail
// (6-stelliger Code) – so sind die Daten für Gewinne echt und Bots draußen.
// Die bestätigte Identität (E-Mail, voterId, Anzeigename) liegt im localStorage.
// ---------------------------------------------------------------------------

const IDENTITY_KEY = 'hl_tipp_identity';

// Tippschluss: 19:00 Uhr (Europe/Berlin) am Spieltag – als echter Zeitpunkt,
// DST-korrekt (Sommer +02:00, Winter +01:00).
export function tipDeadline(dateStr: string): Date {
  const noonUTC = new Date(`${dateStr}T12:00:00Z`);
  const berlinHour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Berlin', hour: '2-digit', hour12: false }).format(noonUTC));
  const off = berlinHour - 12; // 1 (Winter) oder 2 (Sommer)
  const sign = off >= 0 ? '+' : '-';
  return new Date(`${dateStr}T19:00:00${sign}${String(Math.abs(off)).padStart(2, '0')}:00`);
}

// Heutiges Datum in Europe/Berlin als 'YYYY-MM-DD'.
export function berlinToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

export interface TippIdentity {
  email: string;
  voterId: string;
  displayName: string;
}

export function getIdentity(): TippIdentity | null {
  try {
    const raw = localStorage.getItem(IDENTITY_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (p && typeof p.email === 'string' && typeof p.voterId === 'string') return p as TippIdentity;
    return null;
  } catch {
    return null;
  }
}

function setIdentity(id: TippIdentity): void {
  try {
    localStorage.setItem(IDENTITY_KEY, JSON.stringify(id));
  } catch {
    /* ignorieren */
  }
}

export function clearIdentity(): void {
  try {
    localStorage.removeItem(IDENTITY_KEY);
  } catch {
    /* ignorieren */
  }
}

export interface RegisterProfile {
  vorname: string;
  name: string;
  email: string;
  age: number | string;
  foundVia?: string;
  suggestion?: string;
  consent: boolean;
  website?: string; // Honeypot
  turnstileToken?: string;
}

// Schritt 1: Anmeldung absenden → Bestätigungs-Code per E-Mail.
export async function registerRequestCode(profile: RegisterProfile): Promise<{ ok: boolean; devCode?: string; alreadyRegistered?: boolean }> {
  return apiFetch('/api/twitch?resource=tipp-register', {
    method: 'POST',
    body: JSON.stringify(profile),
  });
}

// Schritt 2: Code bestätigen → Identität speichern und zurückgeben.
export async function registerVerify(email: string, code: string): Promise<TippIdentity> {
  const res = await apiFetch<{ email: string; voterId: string; displayName: string }>('/api/twitch?resource=tipp-verify', {
    method: 'POST',
    body: JSON.stringify({ email: email.trim(), code: code.trim() }),
  });
  const id: TippIdentity = { email: res.email, voterId: res.voterId, displayName: res.displayName };
  setIdentity(id);
  return id;
}

// --- Admin: Teilnehmerliste (nur Super-Admin) ------------------------------
export interface TippUser {
  email: string;
  voterId: string;
  firstName: string;
  lastName: string;
  displayName: string;
  age: number | null;
  foundVia: string | null;
  suggestion: string | null;
  verified: boolean;
  createdAt: string;
  verifiedAt: string | null;
}

export async function fetchTippUsers(): Promise<TippUser[]> {
  const data = await apiFetch<{ users: TippUser[] }>('/api/twitch?resource=tipp-users');
  return Array.isArray(data.users) ? data.users : [];
}

// --- Saison-Zusatzfragen (einmalig bis Spieltag-1-Tippschluss) -------------
export interface BonusQuestion { id: string; label: string; points: number }

export const BONUS_QUESTIONS: BonusQuestion[] = [
  { id: 'champion', label: 'Wer wird Meister (Platz 1)?', points: 10 },
  { id: 'place2', label: 'Wer wird Platz 2?', points: 5 },
  { id: 'place3', label: 'Wer wird Platz 3?', points: 5 },
  { id: 'heroone', label: 'Welches Team stellt den Hero One?', points: 5 },
  { id: 'glove', label: 'Welches Team stellt den Goldenen Handschuh?', points: 5 },
  { id: 'offense', label: 'Beste Offensive – meiste Tore?', points: 5 },
  { id: 'defense', label: 'Beste Defensive – wenigste Gegentore?', points: 5 },
  { id: 'last', label: 'Wer wird Tabellenletzter?', points: 5 },
];
export const BONUS_MAX = BONUS_QUESTIONS.reduce((s, q) => s + q.points, 0);

export type BonusAnswers = Record<string, string>; // qid -> teamId

export interface BonusState {
  mine: BonusAnswers | null;
  submittedAt: string | null;
  solution: BonusAnswers; // qid -> teamId (korrekt); leer, bis der Admin es setzt
  scores: { voterId: string; name: string; points: number }[];
}

export async function fetchBonus(identity: TippIdentity | null): Promise<BonusState> {
  let url = '/api/twitch?resource=tipp-bonus';
  if (identity) url += `&email=${encodeURIComponent(identity.email)}&voterId=${encodeURIComponent(identity.voterId)}`;
  const d = await apiFetch<BonusState>(url);
  return {
    mine: d.mine ?? null,
    submittedAt: d.submittedAt ?? null,
    solution: d.solution ?? {},
    scores: Array.isArray(d.scores) ? d.scores : [],
  };
}

export async function submitBonus(identity: TippIdentity, answers: BonusAnswers): Promise<{ ok: boolean; submittedAt: string }> {
  return apiFetch('/api/twitch?resource=tipp-bonus', {
    method: 'POST',
    body: JSON.stringify({ email: identity.email, voterId: identity.voterId, answers }),
  });
}

// Admin: korrekte Lösung setzen (Saisonende) → vergibt die Punkte.
export async function saveBonusSolution(answers: BonusAnswers): Promise<{ ok: boolean }> {
  return apiFetch('/api/twitch?resource=tipp-bonus-solution', {
    method: 'POST',
    body: JSON.stringify({ answers }),
  });
}

export async function fetchTips(): Promise<Tip[]> {
  const data = await apiFetch<{ tips: Tip[] }>('/api/twitch?resource=tips');
  return Array.isArray(data.tips) ? data.tips : [];
}

export async function submitTip(matchId: string, home: number, away: number): Promise<Tip> {
  const id = getIdentity();
  if (!id) throw new Error('Bitte zuerst zum Tippspiel anmelden.');
  return apiFetch<Tip>('/api/twitch?resource=tip', {
    method: 'POST',
    body: JSON.stringify({ matchId, home, away, email: id.email, voterId: id.voterId }),
  });
}

// Punkte-Stufen (3-Stufen-System). Volltreffer am meisten, richtige Tendenz
// (nur Sieger) am wenigsten, richtige Tordifferenz dazwischen.
export const TIP_POINTS = { exact: 5, diff: 3, tendency: 2 } as const;

// Punkte für einen Tipp gegen das Endergebnis:
//   exaktes Ergebnis              → TIP_POINTS.exact (am meisten)
//   richtige Tordifferenz         → TIP_POINTS.diff (auch: richtiges Remis, aber
//                                   nicht exakt – die Tordifferenz 0 stimmt ja)
//   nur Sieger/Tendenz richtig    → TIP_POINTS.tendency (am wenigsten)
//   falsch                        → 0
export function scoreTip(tip: { home: number; away: number }, match: Match): number {
  if (match.homeScore === null || match.awayScore === null) return 0;
  const rh = match.homeScore;
  const ra = match.awayScore;
  if (tip.home === rh && tip.away === ra) return TIP_POINTS.exact; // exakt (auch exaktes Remis)

  const sign = (a: number, b: number) => (a > b ? 1 : a < b ? -1 : 0);
  if (sign(tip.home, tip.away) !== sign(rh, ra)) return 0; // Sieger/Tendenz falsch (bei Remis: kein Remis getippt)
  if (tip.home - tip.away === rh - ra) return TIP_POINTS.diff; // richtige Tordifferenz (Remis: richtiges Remis, nicht exakt)
  return TIP_POINTS.tendency; // Sieger richtig, Abstand daneben
}

export interface LeaderRow {
  voterId: string;
  name: string;
  points: number;
  exact: number; // Volltreffer
  correct: number; // richtige Tendenz (inkl. Volltreffer)
  tips: number; // gewertete Tipps (Spiel beendet)
}

// Rangliste aus allen Tipps + Spielen (nur beendete Spiele zählen) plus den
// Zusatzfragen-Punkten (erst nach dem Setzen der Lösung > 0).
export function leaderboard(
  tips: Tip[],
  matches: Match[],
  bonus: { voterId: string; name: string; points: number }[] = []
): LeaderRow[] {
  const byId = new Map(matches.map((m) => [m.id, m]));
  const rows = new Map<string, LeaderRow>();
  for (const t of tips) {
    const m = byId.get(t.matchId);
    if (!m || m.status !== 'beendet' || m.homeScore === null || m.awayScore === null) continue;
    const pts = scoreTip(t, m);
    const row = rows.get(t.voterId) ?? { voterId: t.voterId, name: t.voterName, points: 0, exact: 0, correct: 0, tips: 0 };
    row.name = t.voterName || row.name;
    row.points += pts;
    row.tips += 1;
    if (pts >= TIP_POINTS.exact) row.exact += 1;
    if (pts >= 1) row.correct += 1;
    rows.set(t.voterId, row);
  }
  // Zusatzfragen-Punkte dazurechnen. Teilnehmer, die NUR Zusatzfragen haben,
  // tauchen erst auf, sobald sie dort Punkte erzielt haben (Lösung gesetzt).
  for (const b of bonus) {
    const existing = rows.get(b.voterId);
    if (existing) {
      existing.points += b.points;
    } else if (b.points > 0) {
      rows.set(b.voterId, { voterId: b.voterId, name: b.name, points: b.points, exact: 0, correct: 0, tips: 0 });
    }
  }
  return [...rows.values()].sort((a, b) => b.points - a.points || b.exact - a.exact || a.name.localeCompare(b.name));
}
