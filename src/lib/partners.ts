// Partnerprogramm (/partner): öffentliche Konfiguration, Anfrage senden, Admin.
// Läuft über den bestehenden Endpunkt /api/signup?action=partner-… bzw. admin-partner-…
import { apiFetch } from './api';

export type PartnerType = 'main' | 'partner' | 'team' | 'other';
export type PartnerRequestStatus = 'neu' | 'kontakt' | 'abgeschlossen' | 'abgelehnt';

export interface PartnerStat {
  value: number;
  suffix: string;
  label: string;
  sub: string;
}
export interface PartnerProgramPublic {
  active: boolean;
  preview: boolean; // nicht aktiv, aber Admin sieht die Seite trotzdem
  stats: PartnerStat[];
  turnstileSiteKey: string;
}
export interface PartnerApplyPayload {
  company: string;
  contact: string;
  email: string;
  phone: string;
  website: string;
  type: PartnerType;
  budget: string;
  message: string;
  acceptPrivacy: boolean;
  acceptTerms: boolean;
  website2: string; // Honeypot – bleibt leer
  turnstileToken?: string;
}
export interface PartnerRequest {
  id: string;
  createdAt: string;
  status: PartnerRequestStatus;
  company: string;
  contact: string;
  email: string;
  phone: string;
  website: string;
  type: PartnerType;
  budget: string;
  message: string;
  consentAt: string;
}

export const PARTNER_TYPE_LABEL: Record<PartnerType, string> = {
  main: 'Hauptpartnerschaft',
  partner: 'Partnerschaft',
  team: 'Teampartner',
  other: 'Weitere',
};

// Einmal pro Seitenaufruf laden (Footer-Balken auf jeder Seite).
let cache: PartnerProgramPublic | null = null;
let inflight: Promise<PartnerProgramPublic | null> | null = null;
export function loadPartnerProgram(): Promise<PartnerProgramPublic | null> {
  if (cache) return Promise.resolve(cache);
  if (!inflight) {
    inflight = apiFetch<PartnerProgramPublic>('/api/signup?action=partner-config')
      .then((d) => (cache = d))
      .catch(() => {
        inflight = null;
        return null;
      });
  }
  return inflight;
}
export const cachedPartnerProgram = () => cache;

export const applyPartner = (body: PartnerApplyPayload) =>
  apiFetch<{ ok: boolean }>('/api/signup?action=partner-apply', { method: 'POST', body: JSON.stringify(body) });

export const partnerAdminList = () =>
  apiFetch<{ config: { active: boolean; stats: PartnerStat[] }; requests: PartnerRequest[] }>('/api/signup?action=admin-partner');
export const partnerAdminSaveConfig = (cfg: { active?: boolean; stats?: PartnerStat[] }) =>
  apiFetch<{ active: boolean; stats: PartnerStat[] }>('/api/signup?action=admin-partner-config', { method: 'POST', body: JSON.stringify(cfg) }).then((r) => {
    cache = null;
    inflight = null;
    return r;
  });
export const partnerAdminStatus = (id: string, status: PartnerRequestStatus) =>
  apiFetch<{ ok: boolean }>('/api/signup?action=admin-partner-status', { method: 'POST', body: JSON.stringify({ id, status }) });
export const partnerAdminDelete = (id: string) =>
  apiFetch<{ ok: boolean }>('/api/signup?action=admin-partner-delete', { method: 'POST', body: JSON.stringify({ id }) });
