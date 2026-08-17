import { apiFetch } from './api';
import { mergeScoring } from './scoring';
import type { EveningRoster, MatchPlayerStat, ScoringConfig } from '../types';

// ===========================================================================
// Frontend-Anbindung ans Statistics Center (/api/stats).
// Speichert/liest nur Roh-Zähler & Einstellungen – gerechnet wird lokal mit
// src/lib/rating.ts.
// ===========================================================================

// Score-Einstellungen laden (roh vom Server) und mit den Defaults zusammenführen.
export async function fetchScoring(): Promise<ScoringConfig> {
  const raw = await apiFetch<unknown>('/api/stats?resource=scoring');
  return mergeScoring(raw);
}

export function saveScoring(cfg: ScoringConfig): Promise<{ ok: boolean }> {
  return apiFetch('/api/stats?resource=scoring', { method: 'POST', body: JSON.stringify(cfg) });
}

// Veröffentlichte Spieltag-/Abend-Schlüssel (für die öffentliche Anzeige).
export function fetchLiveDays(): Promise<string[]> {
  return apiFetch<string[]>('/api/stats?resource=live');
}

export function publishDay(dayKey: string, live: boolean): Promise<{ days: string[] }> {
  return apiFetch('/api/stats?resource=publish', {
    method: 'POST',
    body: JSON.stringify({ dayKey, live }),
  });
}

// Alle Zeilen eines Spieltags/Abends (+ ob er live geschaltet ist).
export function fetchDayStats(dayKey: string): Promise<{ rows: MatchPlayerStat[]; live: boolean }> {
  return apiFetch(`/api/stats?resource=day&day=${encodeURIComponent(dayKey)}`);
}

// Alle Zeilen eines einzelnen Spiels.
export function fetchMatchStats(matchId: string): Promise<{ rows: MatchPlayerStat[] }> {
  return apiFetch(`/api/stats?resource=match&matchId=${encodeURIComponent(matchId)}`);
}

// ÖFFENTLICH: nur veröffentlichte Spieltage (für Spieler-Karten & Spielbericht).
export function fetchPublicStats(seasonId?: string): Promise<{ rows: MatchPlayerStat[]; days: string[] }> {
  const q = seasonId ? `&season=${encodeURIComponent(seasonId)}` : '';
  return apiFetch(`/api/stats?resource=public${q}`);
}

// Verbindungstest zum Google Sheet (schreibt nichts).
export function testSheet(): Promise<{ ok: boolean; title: string; sheets: string[] }> {
  return apiFetch('/api/stats?resource=sheet-test', { method: 'POST', body: '{}' });
}

// Einen Liga-Spieltag ins Google Sheet kopieren (manuell).
export function exportToSheet(
  dayKey: string
): Promise<{ ok: boolean; written: number; matches: number; players: number; placedNew: number; unmatched: string[] }> {
  return apiFetch('/api/stats?resource=export', { method: 'POST', body: JSON.stringify({ dayKey }) });
}

// Eine Spieler-Zeile (Zähler) speichern.
export function saveTally(row: MatchPlayerStat): Promise<{ ok: boolean }> {
  return apiFetch('/api/stats?resource=tally', { method: 'POST', body: JSON.stringify(row) });
}

// Anwesenheit/Torwart eines Spieltags speichern (Abend-Aufstellung). Schreibt
// zusätzlich die Abwesenden in die Einzelspiele zurück (für Einsätze/Excel).
export function saveAttendance(
  seasonId: string,
  matchday: number,
  minutes: number,
  teams: EveningRoster['teams']
): Promise<unknown> {
  return apiFetch('/api/twitch?resource=roster', {
    method: 'POST',
    body: JSON.stringify({ seasonId, matchday, minutes, teams }),
  });
}

// --- Spieltag-/Event-Schlüssel (eindeutig, stabil) --------------------------

export function leagueDayKey(seasonId: string, matchday: number): string {
  return `s:${seasonId}:${matchday}`;
}

export function eventDayKey(eventId: string): string {
  return `event:${eventId}`;
}
