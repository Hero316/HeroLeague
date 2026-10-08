import type { HeroSlideKind } from '../types';

// Reihenfolge der Startseiten-Slides (im Backoffice einstellbar). Fehlende oder
// unbekannte Einträge werden in der Standard-Reihenfolge ergänzt.
export const HERO_SLIDE_KINDS: HeroSlideKind[] = ['match', 'pom', 'table'];
export const HERO_SLIDE_LABELS: Record<HeroSlideKind, string> = {
  match: 'Spieltag',
  pom: 'Spieler des Spieltages',
  table: 'Tabellenführer',
};

export function normalizeHeroOrder(order: unknown): HeroSlideKind[] {
  const out: HeroSlideKind[] = [];
  if (Array.isArray(order)) {
    for (const k of order) if (HERO_SLIDE_KINDS.includes(k as HeroSlideKind) && !out.includes(k as HeroSlideKind)) out.push(k as HeroSlideKind);
  }
  for (const k of HERO_SLIDE_KINDS) if (!out.includes(k)) out.push(k);
  return out;
}
