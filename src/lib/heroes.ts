// Hero-Punktestand (Belohnung fürs Abschließen). Jetzt serverseitig: jede
// zugewiesene/ausgewählte Person bekommt beim Abschließen einen Punkt – auch
// wenn sie gerade nicht in der App war (dann kommt die Feier-Animation beim
// nächsten Öffnen). Dieses Modul hält den zuletzt bekannten Stand im Speicher
// (mit localStorage-Cache für sofortige Anzeige) und benachrichtigt Abonnenten.
import { useEffect, useState } from 'react';

const CACHE_KEY = 'hl-herostats';

export type HeroStats = { total: number; month: number };

function readCache(): HeroStats {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      return { total: Number(p.total) || 0, month: Number(p.month) || 0 };
    }
  } catch {
    /* egal */
  }
  return { total: 0, month: 0 };
}

let stats: HeroStats = readCache();
const subs = new Set<() => void>();

function emit() {
  for (const fn of subs) fn();
}

export function getHeroStats(): HeroStats {
  return stats;
}

export function setHeroStats(next: HeroStats) {
  stats = next;
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(next));
  } catch {
    /* egal */
  }
  emit();
}

// Optimistisch +n (sofortiges Feedback beim eigenen Abschließen).
export function bumpHeroStats(by = 1) {
  setHeroStats({ total: stats.total + by, month: stats.month + by });
}

export function subscribeHeroStats(fn: () => void): () => void {
  subs.add(fn);
  return () => {
    subs.delete(fn);
  };
}

// React-Hook: liefert den aktuellen Stand und rendert bei Änderungen neu.
export function useHeroStats(): HeroStats {
  const [, force] = useState(0);
  useEffect(() => subscribeHeroStats(() => force((x) => x + 1)), []);
  return stats;
}

// Rückwärtskompatibel: nur der Gesamtstand (frühere Signatur getHeroes(userId)).
export function getHeroes(_userId?: string): number {
  return stats.total;
}
