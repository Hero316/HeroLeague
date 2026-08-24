// Client-Helfer für die öffentlichen Formulare: Season-2-Team-Anmeldung &
// Zuschauer-Tickets. Dünne Wrapper um apiFetch + Typen + ein optionales
// Cloudflare-Turnstile-Widget (nur aktiv, wenn ein Site-Key konfiguriert ist).
import { useEffect, useRef, useState } from 'react';
import { apiFetch } from './api';

// --- Season-2-Anmeldung -----------------------------------------------------
export interface SignupConfig {
  open: boolean;
  seasonLabel: string;
  startInfo: string;
  minSquad: number;
  maxSquad: number;
  note: string;
  turnstileSiteKey: string;
}
export type PlayerRatings = { technik: number | null; ausdauer: number | null; tempo: number | null; uebersicht: number | null; abschluss: number | null };
export interface SignupPayload {
  email: string;
  code?: string;
  entry: 'team' | 'player';
  consent?: boolean;
  website?: string; // Honeypot
  turnstileToken?: string;
  phone?: string;
  motivation?: string;
  heardFrom?: string;
  // Team
  kind?: 'returning' | 'new';
  teamName?: string;
  contactName?: string;
  s1TeamName?: string;
  keepName?: boolean;
  rosterChange?: 'same' | 'minor' | 'major' | '';
  squadSize?: number | null;
  avgAge?: string;
  level?: 'hobby' | 'mixed' | 'ambitioniert' | '';
  clubPlayers?: number | null;
  hobbyPlayers?: number | null;
  // Spieler
  name?: string;
  age?: number | null;
  playerType?: 'verein' | 'hobby';
  position?: 'tor' | 'abwehr' | 'mittelfeld' | 'sturm' | 'flexibel' | '';
  foot?: 'links' | 'rechts' | 'beid' | '';
  ratings?: Partial<PlayerRatings>;
  club?: string;
  league?: string;
  years?: number | null;
  frequency?: 'selten' | 'monatlich' | 'woechentlich' | 'mehrmals' | '';
}
export interface SignupListItem {
  id: string; email: string; status: string; entry: 'team' | 'player'; kind: string;
  teamName: string; contactName: string; emailVerified: boolean;
  createdAt: string; updatedAt: string;
}
export interface SignupDetail extends SignupListItem {
  ip: string;
  data: {
    heardFrom?: string;
    // Team
    teamName?: string; contactName?: string; phone?: string; kind?: string;
    s1TeamName?: string; keepName?: boolean; rosterChange?: string;
    squadSize?: number | null; avgAge?: string; level?: string;
    clubPlayers?: number | null; hobbyPlayers?: number | null; motivation?: string;
    // Spieler
    name?: string; age?: number | null; playerType?: string;
    position?: string; foot?: string; ratings?: PlayerRatings;
    club?: string; league?: string; years?: number | null; frequency?: string;
  };
}
export interface Captain { email: string; teamName: string; }

export const fetchSignupConfig = () => apiFetch<SignupConfig>('/api/signup?action=config');
export const lookupCaptain = (email: string) =>
  apiFetch<{ found: boolean; teamName: string }>('/api/signup?action=captain-lookup', { method: 'POST', body: JSON.stringify({ email }) });
export const requestSignupCode = (body: Partial<SignupPayload>) =>
  apiFetch<{ ok: boolean; devCode?: string }>('/api/signup?action=request-code', { method: 'POST', body: JSON.stringify(body) });
export const submitSignup = (body: SignupPayload) =>
  apiFetch<{ ok: boolean }>('/api/signup?action=submit', { method: 'POST', body: JSON.stringify(body) });

export const signupAdminList = () => apiFetch<SignupListItem[]>('/api/signup?action=admin-list');
export const signupAdminDetail = (id: string) => apiFetch<SignupDetail>(`/api/signup?action=admin-detail&id=${encodeURIComponent(id)}`);
export const signupAdminDelete = (id: string) =>
  apiFetch<{ ok: boolean }>('/api/signup?action=admin-delete', { method: 'POST', body: JSON.stringify({ id }) });
export const signupAdminConfig = () =>
  apiFetch<{ config: Omit<SignupConfig, 'turnstileSiteKey'>; captains: Captain[]; turnstileActive: boolean }>('/api/signup?action=admin-config');
export const signupAdminSave = (body: { config?: Partial<SignupConfig>; captains?: Captain[] }) =>
  apiFetch<{ ok: boolean }>('/api/signup?action=admin-config', { method: 'POST', body: JSON.stringify(body) });

// --- Zuschauer-Tickets ------------------------------------------------------
export interface TicketConfig {
  open: boolean; title: string; dateLabel: string; locationLabel: string;
  capacity: number; remaining: number; maxPerEmail: number; note: string;
  hasDonation: boolean; turnstileSiteKey: string;
}
export interface TicketPayload {
  name: string; email: string; quantity: number; website?: string; turnstileToken?: string;
}
export interface TicketAdminConfig {
  open: boolean; eventKey: string; title: string; dateLabel: string; locationLabel: string;
  capacity: number; maxPerEmail: number; note: string; donationUrl: string;
}
export interface TicketRow {
  id: string; email: string; name: string; quantity: number; status: string;
  code: string | null; checkedIn: boolean; createdAt: string; verifiedAt: string | null;
}
export interface TicketAdminData {
  config: TicketAdminConfig; rows: TicketRow[]; capacity: number;
  soldSeats: number; confirmedCount: number; remaining: number;
}

export const fetchTicketConfig = () => apiFetch<TicketConfig>('/api/event-tickets?action=config');
export const requestTicketCode = (body: TicketPayload) =>
  apiFetch<{ ok: boolean; devCode?: string }>('/api/event-tickets?action=request-code', { method: 'POST', body: JSON.stringify(body) });
export const confirmTicket = (email: string, code: string) =>
  apiFetch<{ ok: boolean; code: string; quantity: number; donationUrl?: string; alreadyConfirmed?: boolean }>(
    '/api/event-tickets?action=confirm', { method: 'POST', body: JSON.stringify({ email, code }) });

export const ticketAdminList = () => apiFetch<TicketAdminData>('/api/event-tickets?action=admin-list');
export const ticketAdminCheckin = (id: string, checkedIn: boolean) =>
  apiFetch<{ ok: boolean }>('/api/event-tickets?action=admin-checkin', { method: 'POST', body: JSON.stringify({ id, checkedIn }) });
export const ticketAdminDelete = (id: string) =>
  apiFetch<{ ok: boolean }>('/api/event-tickets?action=admin-delete', { method: 'POST', body: JSON.stringify({ id }) });
export const ticketAdminSave = (config: TicketAdminConfig) =>
  apiFetch<{ ok: boolean; config: TicketAdminConfig }>('/api/event-tickets?action=admin-config', { method: 'POST', body: JSON.stringify({ config }) });

// --- Cloudflare Turnstile (optional) ----------------------------------------
// Lädt das Widget nur, wenn ein Site-Key da ist. Ohne Key: kein Widget, Token
// bleibt leer (der Server akzeptiert das, solange Turnstile nicht aktiviert ist).
interface TurnstileWindow extends Window {
  turnstile?: {
    render: (el: HTMLElement, opts: Record<string, unknown>) => string;
    reset: (id?: string) => void;
    remove: (id?: string) => void;
  };
}
let turnstileScriptLoading: Promise<void> | null = null;
function loadTurnstileScript(): Promise<void> {
  if ((window as TurnstileWindow).turnstile) return Promise.resolve();
  if (turnstileScriptLoading) return turnstileScriptLoading;
  turnstileScriptLoading = new Promise<void>((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    s.async = true; s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Turnstile konnte nicht geladen werden.'));
    document.head.appendChild(s);
  });
  return turnstileScriptLoading;
}

// Rendert das Turnstile-Widget in `ref` und liefert den aktuellen Token.
export function useTurnstile(siteKey: string | undefined) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [token, setToken] = useState('');
  const widgetId = useRef<string | null>(null);
  useEffect(() => {
    if (!siteKey || !ref.current) return;
    let cancelled = false;
    const el = ref.current;
    loadTurnstileScript()
      .then(() => {
        const tw = window as TurnstileWindow;
        if (cancelled || !tw.turnstile || !el) return;
        widgetId.current = tw.turnstile.render(el, {
          sitekey: siteKey,
          callback: (t: string) => setToken(t),
          'expired-callback': () => setToken(''),
          'error-callback': () => setToken(''),
          theme: 'dark',
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      const tw = window as TurnstileWindow;
      if (tw.turnstile && widgetId.current) { try { tw.turnstile.remove(widgetId.current); } catch { /* egal */ } }
    };
  }, [siteKey]);
  // Turnstile-Token ist einmalig. Nach dem Verbrauch (Code angefordert) neu holen,
  // damit „Code erneut senden" nicht am schon verbrauchten Token scheitert.
  const reset = () => {
    const tw = window as TurnstileWindow;
    if (tw.turnstile && widgetId.current) { try { tw.turnstile.reset(widgetId.current); setToken(''); } catch { /* egal */ } }
  };
  // Ohne Site-Key ist das Captcha aus → als „bereit" behandeln (leerer Token ok).
  return { ref, token, ready: !siteKey || !!token, reset };
}
