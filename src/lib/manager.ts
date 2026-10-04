import { apiFetch } from './api';

// Team-Manager (Captains): Abend-Kader selbst melden – Seite /kader.
// Der Login-Token (nur für das eigene Team) bleibt auf dem Handy gespeichert.

const KEY = 'hl-manager-token';

export function getManagerToken(): string {
  try {
    return localStorage.getItem(KEY) || '';
  } catch {
    return '';
  }
}
export function setManagerToken(token: string | null) {
  try {
    if (token) localStorage.setItem(KEY, token);
    else localStorage.removeItem(KEY);
  } catch {
    /* privater Modus – dann eben pro Besuch neu anmelden */
  }
}

export interface ManagerPlayer { name: string; imageUrl: string; number: number | null; goalkeeper: boolean; captain: boolean }
export interface ManagerRoster {
  team: { id: string; name: string; shortName: string; logoColor: string; logoUrl: string; players: ManagerPlayer[] };
  matchday: number | null;
  locked: boolean;
  // off = im Backend nicht freigegeben · deadline = Meldeschluss vorbei · started = Spieltag läuft
  closedReason: 'off' | 'deadline' | 'started' | null;
  deadline: string; // Meldeschluss als "HH:MM" (Ortszeit)
  deadlineAt: string | null; // genauer Zeitpunkt "YYYY-MM-DDTHH:MM", null wenn kein Spieltag offen
  matches: { id: string; date: string; time: string; field: number; status: string; opponent: string }[];
  saved: { present: string[]; goalkeeper?: string; at?: string } | null;
}

const post = <T,>(resource: string, body: unknown) =>
  apiFetch<T>(`/api/twitch?resource=${resource}`, { method: 'POST', body: JSON.stringify(body) });

export const managerRequestCode = (email: string) => post<{ ok: boolean; devCode?: string }>('manager-code', { email });
export const managerVerify = (email: string, code: string) => post<{ ok: boolean; token: string }>('manager-verify', { email, code });
export const managerGetRoster = (token: string) => post<ManagerRoster>('manager-roster-get', { token });
export const managerSaveRoster = (token: string, present: string[], goalkeeper: string) =>
  post<{ ok: boolean; present: string[]; goalkeeper: string | null; at: string }>('manager-roster', { token, present, goalkeeper });

// Admin: Manager-E-Mails je Team
export const fetchManagers = () => apiFetch<Record<string, string[]>>('/api/twitch?resource=managers');
export const saveManagers = (teamId: string, emails: string[]) =>
  apiFetch<{ ok: boolean; emails: string[] }>('/api/twitch?resource=managers', { method: 'POST', body: JSON.stringify({ teamId, emails }) });

// Admin: Freigabe der Kader-Meldung + Übersicht, wer schon gemeldet hat
export interface ManagerConfigView {
  open: boolean; // wirklich offen (Schalter an, Spieltag gewählt, vor Meldeschluss, noch nicht begonnen)
  switchOn: boolean;
  matchday: number | null;
  suggested: number | null; // nächster Spieltag mit geplanten Spielen
  started: boolean;
  deadline: string; // Meldeschluss als "HH:MM"
  deadlineAt: string | null; // genauer Zeitpunkt am Spieltag
  deadlinePassed: boolean;
  teams: { id: string; name: string; managers: number; reportedAt: string | null }[];
}
export const fetchManagerConfig = () => apiFetch<ManagerConfigView>('/api/twitch?resource=manager-config');
export const saveManagerConfig = (open: boolean, matchday: number | null, deadline?: string) =>
  apiFetch<{ ok: boolean }>('/api/twitch?resource=manager-config', {
    method: 'POST',
    body: JSON.stringify(deadline ? { open, matchday, deadline } : { open, matchday }),
  });
