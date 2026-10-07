import { useEffect, useSyncExternalStore } from 'react';
import { apiFetch } from './api';

// ===========================================================================
// Öffentlicher Tracking-Fortschritt („Das Team ist am Tracken · 40 %").
// Ein gemeinsamer Speicher für alle Anzeigen (Startseite, HERO ONE,
// Statistiken): EIN Abruf, EIN Takt. Nachgeladen wird nur bei sichtbarem Tab –
// jede Minute, solange gerade getrackt wird, sonst alle 10 Minuten.
// ===========================================================================

export interface TrackingDayProgress {
  dayKey: string;
  matchday: number;
  done: number; // Spiele auf „Fertig"
  tracking: number; // Spiele „wird getrackt"
  total: number;
  pct: number; // done / total in %
}

let days: TrackingDayProgress[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
let subscribers = 0;
const listeners = new Set<() => void>();

async function load() {
  try {
    const r = await apiFetch<{ days: TrackingDayProgress[] }>('/api/stats?resource=tracking-progress');
    days = Array.isArray(r.days) ? r.days : [];
  } catch {
    /* still – dann eben keine Anzeige */
  }
  listeners.forEach((l) => l());
}

function schedule() {
  if (timer) clearTimeout(timer);
  if (subscribers === 0) return;
  timer = setTimeout(async () => {
    if (typeof document === 'undefined' || document.visibilityState === 'visible') await load();
    schedule();
  }, days.length ? 60_000 : 600_000);
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useTrackingProgress(): TrackingDayProgress[] {
  useEffect(() => {
    subscribers += 1;
    if (subscribers === 1) load().then(schedule);
    const onVisible = () => {
      if (document.visibilityState === 'visible') load();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      subscribers -= 1;
      document.removeEventListener('visibilitychange', onVisible);
      if (subscribers === 0 && timer) {
        clearTimeout(timer);
        timer = null;
      }
    };
  }, []);
  return useSyncExternalStore(subscribe, () => days, () => days);
}
