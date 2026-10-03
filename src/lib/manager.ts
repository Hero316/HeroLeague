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
