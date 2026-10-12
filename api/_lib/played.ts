// ===========================================================================
// Hat ein Spieler in einem Spiel WIRKLICH gespielt? (Tracking-Zeile)
//  • role 'out'  → im Tracking als „Spielt nicht" markiert → nein
//  • Torwart     → ja (ein Spiel zu null geht auch ganz ohne Parade)
//  • Feldspieler → nur mit mindestens EINER getrackten Aktion
// So zählt ein Spiel, das jemand am Abend ausgesetzt hat, weder bei „pro Spiel"
// noch bei Spielen/Siegquote mit. Gilt für Website UND Server.
// ===========================================================================

export const OUT_ROLE = 'out';

export function rowPlayed(role: string | null | undefined, counts: unknown): boolean {
  if (role === OUT_ROLE) return false;
  if (role === 'keeper') return true;
  if (!counts || typeof counts !== 'object') return false;
  return Object.values(counts as Record<string, unknown>).some((v) => typeof v === 'number' && v > 0);
}
