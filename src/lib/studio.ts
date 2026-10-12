// Live-Regie für den Studio-Stream: Admin löst Einblendungen aus, das
// OBS-Overlay (/overlay/studio) spielt sie ab. Läuft über /api/twitch?resource=studio.
import { apiFetch } from './api';

export type CueKind = 'confetti' | 'emoji' | 'headline' | 'lowerthird' | 'link' | 'partner' | 'countdown' | 'clear';
export type PartnerId = 'dvag' | 'volksbank' | 'unisport';

export interface CueBody {
  kind: CueKind;
  title: string;
  text: string;
  link: string;
  emoji: string;
  partner: PartnerId | '';
  duration: number; // Sekunden
}
export interface Cue extends CueBody {
  id: number;
  at: number;
}
export interface StudioPreset {
  id: string;
  label: string;
  cue: CueBody;
}
export interface StudioState {
  cue: Cue | null;
  age: number | null; // ms seit dem Auslösen (Server-Uhr)
  presets: StudioPreset[] | null; // null = noch nie gespeichert → Vorschläge zeigen
}

const URL_ = '/api/twitch?resource=studio';
export const fetchStudio = () => apiFetch<StudioState>(URL_);
export const fireCue = (cue: Partial<CueBody> & { kind: CueKind }) =>
  apiFetch<{ ok: boolean; cue: Cue }>(URL_, {
    method: 'POST',
    body: JSON.stringify({ action: 'fire', cue: { title: '', text: '', link: '', emoji: '', partner: '', duration: 10, ...cue } }),
  });
export const saveStudioPresets = (presets: StudioPreset[]) =>
  apiFetch<{ ok: boolean; presets: StudioPreset[] }>(URL_, { method: 'POST', body: JSON.stringify({ action: 'presets', presets }) });

// Partner für Spotlight + Partner-Leiste (Logos unter public/assets/partners).
export const STUDIO_PARTNERS: Record<PartnerId, { label: string; name: string; logo: string; dark: boolean; sub?: string }> = {
  dvag: { label: 'Hauptpartner', name: 'Florian Hinterheller', sub: 'Deutsche Vermögensberatung', logo: '/assets/partners/dvag-mark-white.png', dark: true },
  volksbank: { label: 'Bankpartner', name: 'Volksbank – Die Gestalterbank', logo: '/assets/partners/volksbank-gestalterbank.png', dark: false },
  unisport: { label: 'Schuh- & Ausrüstungspartner', name: 'Unisport', logo: '/assets/partners/unisport.png', dark: false },
};

// „https://www.heroleague.de/season2" → „heroleague.de/season2"
export const prettyLink = (l: string) => l.trim().replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/\/$/, '');
