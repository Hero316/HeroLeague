// Klick-Tracking für Sponsoren/Partner. Ein Klick auf ein Sponsor-Logo/-Link
// meldet (feuern & vergessen) an den Server; wer man ist, spielt keine Rolle –
// gezählt wird pro Sponsor-ID, aufgeschlüsselt nach Platzierung.
import { apiFetch } from './api';
import type { SponsorClicksMap } from '../types';

// Feuert einen Zähl-Ping. Nutzt sendBeacon (übersteht das Verlassen der Seite),
// mit fetch-keepalive als Fallback. Schlägt bewusst niemals fehl/blockt nie.
export function trackSponsorClick(sponsorId: string, name: string, placement: string): void {
  if (!sponsorId || typeof navigator === 'undefined') return;
  try {
    const payload = JSON.stringify({ sponsorId, name: name || '', placement });
    const url = '/api/twitch?resource=sponsor-click';
    if (typeof navigator.sendBeacon === 'function') {
      const blob = new Blob([payload], { type: 'application/json' });
      if (navigator.sendBeacon(url, blob)) return;
    }
    void fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* Analytics dürfen niemals die Navigation stören */
  }
}

// Auswertung (nur eingeloggt): Map Sponsor-ID → Statistik.
export const fetchSponsorClicks = () => apiFetch<SponsorClicksMap>('/api/twitch?resource=sponsor-clicks');
