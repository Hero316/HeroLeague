// Freigestelltes Spielerfoto (ohne Hintergrund) – gilt nur, solange es aus dem
// AKTUELLEN Foto entstanden ist (cutoutSrc === imageUrl). Wird das Foto
// getauscht, fällt die alte Freistellung automatisch weg.
export function validCutout(p: { imageUrl?: string; cutoutUrl?: string; cutoutSrc?: string } | undefined): string | undefined {
  return p && p.imageUrl && p.cutoutUrl && p.cutoutSrc === p.imageUrl ? p.cutoutUrl : undefined;
}

// Hintergrund der Spielerbilder (dunkel mit türkisem Lichtkegel, 4:5). Darauf
// setzt das Foto-Studio im Backoffice die freigestellten Spieler; Spieler ohne
// Foto zeigen ihn mit ihren Initialen (PlayerPlaceholder).
export const PLAYER_PHOTO_BG = '/assets/spieler-hintergrund.webp';
