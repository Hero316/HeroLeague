// Kleiner „Hero"-Punktestand pro Nutzer – Belohnung fürs Abschließen von
// Aufgaben. Bewusst lokal (pro Gerät, localStorage), rein zum Spaß/Motivation;
// kein Backend nötig.
const KEY = (userId: string) => `hl-heroes-${userId || 'me'}`;

export function getHeroes(userId: string): number {
  try {
    return Number(localStorage.getItem(KEY(userId))) || 0;
  } catch {
    return 0;
  }
}

export function bumpHeroes(userId: string, by = 1): number {
  const next = Math.max(0, getHeroes(userId) + by);
  try {
    localStorage.setItem(KEY(userId), String(next));
  } catch {
    /* egal */
  }
  return next;
}
