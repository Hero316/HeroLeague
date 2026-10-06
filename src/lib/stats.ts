import { apiFetch } from './api';
import { mergeScoring } from './scoring';
import type { EveningRoster, EventArchive, Match, MatchPlayerStat, ScoringConfig } from '../types';

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

// Ein einzelnes Spiel live schalten (unabhängig vom ganzen Tag/Event).
export function publishMatch(matchId: string, live: boolean): Promise<{ days: string[] }> {
  return apiFetch('/api/stats?resource=publish', {
    method: 'POST',
    body: JSON.stringify({ matchId, live }),
  });
}

// Alle Zeilen eines Spieltags/Abends (+ ob er live ist, + einzeln live geschaltete Spiele).
export function fetchDayStats(dayKey: string): Promise<{ rows: MatchPlayerStat[]; live: boolean; liveMatchIds?: string[] }> {
  return apiFetch(`/api/stats?resource=day&day=${encodeURIComponent(dayKey)}`);
}

// IDs aller Spiele, zu denen schon getrackte Daten vorliegen. Damit zeigt die
// Übersicht je Spieltag/Testspiel, wie viele Spiele bereits erledigt sind.
export function fetchTrackedMatchIds(): Promise<{ matchIds: string[]; tracked?: { matchId: string; dayKey: string }[] }> {
  return apiFetch('/api/stats?resource=tracked-matches');
}

// Getrackte Daten komplett zurücksetzen: einzelne Spiele (matchIds) oder den
// ganzen Spieltag/das Testspiel (wholeDay). Nimmt sie auch aus „live".
export function resetTracking(dayKey: string, matchIds: string[], wholeDay = false): Promise<{ ok: boolean; deleted: number }> {
  return apiFetch('/api/stats?resource=tally-reset', { method: 'POST', body: JSON.stringify({ dayKey, matchIds, wholeDay }) });
}

// Alle Zeilen eines einzelnen Spiels.
export function fetchMatchStats(matchId: string): Promise<{ rows: MatchPlayerStat[] }> {
  return apiFetch(`/api/stats?resource=match&matchId=${encodeURIComponent(matchId)}`);
}

// ÖFFENTLICH: nur veröffentlichte Spieltage (für Spieler-Karten & Spielbericht).
// includeAll=true zeigt auch Entwürfe – serverseitig NUR für die Demo-Saison erlaubt.
export function fetchPublicStats(
  seasonId?: string,
  includeAll?: boolean
): Promise<{ rows: MatchPlayerStat[]; days: string[] }> {
  const params: string[] = [];
  if (seasonId) params.push(`season=${encodeURIComponent(seasonId)}`);
  if (includeAll) params.push('all=1');
  const q = params.length ? `&${params.join('&')}` : '';
  return apiFetch(`/api/stats?resource=public${q}`);
}

// Öffentliche (veröffentlichte) Roh-Daten EINES Testspiels/Events laden –
// getrennt von den Liga-Saisons (day_key = "event:<id>").
export function fetchEventStats(eventId: string): Promise<{ rows: MatchPlayerStat[]; days: string[] }> {
  return apiFetch(`/api/stats?resource=public&event=${encodeURIComponent(eventId)}`);
}

// Anwesenheit/Torwart für ein Testspiel speichern (schreibt Abwesende auf alle
// Event-Spiele) – gibt das aktualisierte Archiv zurück.
export function saveEventAttendance(
  eventId: string,
  teams: EveningRoster['teams'],
  minutes?: number
): Promise<EventArchive> {
  return apiFetch('/api/twitch?resource=event-attendance', {
    method: 'POST',
    body: JSON.stringify({ eventId, teams, minutes }),
  });
}

// Ein einzelnes Event-Spiel aktualisieren (Schiedsrichtermodus). Match-Form-Patch
// (playerName/teamId) wird serverseitig in die Event-Form übersetzt. Gibt das
// aktualisierte Archiv zurück.
export function saveEventMatch(eventId: string, matchId: string, patch: Partial<Match>): Promise<EventArchive> {
  return apiFetch('/api/twitch?resource=event-match', {
    method: 'POST',
    body: JSON.stringify({ eventId, matchId, patch }),
  });
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

// Die Score-Einstellungen (Punkte/Regler/Minimums) ins Google Sheet kopieren.
export function exportScoringToSheet(
  cfg: ScoringConfig
): Promise<{ ok: boolean; sheet: string; written: number; matched: number; unmatched: string[] }> {
  return apiFetch('/api/stats?resource=export-scoring', { method: 'POST', body: JSON.stringify(cfg) });
}

// Eine Spieler-Zeile (Zähler) speichern.
export function saveTally(row: MatchPlayerStat): Promise<{ ok: boolean }> {
  return apiFetch('/api/stats?resource=tally', { method: 'POST', body: JSON.stringify(row) });
}

// Getrackte Werte innerhalb eines Teams umbuchen:
//  • op='merge'  → `from` auf `to` addieren, `from` löschen (Zuordnen/Kopieren)
//  • op='swap'   → `from` und `to` vertauschen (2 Spieler verwechselt)
//  • op='delete' → `from` entfernen (versehentlich angelegt)
export function tallyOp(body: {
  dayKey: string;
  matchIds: string[];
  teamId: string;
  op: 'merge' | 'swap' | 'delete';
  from: string;
  to?: string;
}): Promise<{ ok: boolean }> {
  return apiFetch('/api/stats?resource=tally-op', { method: 'POST', body: JSON.stringify(body) });
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

// Tracking-Status je Spiel („wird getrackt" / „fertig") – geräteübergreifend,
// damit nicht zwei Leute dasselbe Spiel tracken. Schlüssel „<dayKey>|<matchId>".
export type TrackStatus = 'tracking' | 'done';
// „Fertig" geht erst, wenn in dem Spiel mindestens so viele Aktionen erfasst sind
// (Schutz gegen versehentliches/absichtliches Durchklicken). Gleicher Wert im Server.
export const MIN_DONE_ACTIONS = 10;
export type TrackStatusMap = Record<string, { status: TrackStatus; by: string; at: string }>;
export function fetchTrackStatus(): Promise<TrackStatusMap> {
  return apiFetch('/api/stats?resource=track-status');
}
export function setTrackStatus(dayKey: string, matchId: string, status: TrackStatus | null): Promise<{ ok: boolean }> {
  return apiFetch('/api/stats?resource=track-status', { method: 'POST', body: JSON.stringify({ dayKey, matchId, status }) });
}
