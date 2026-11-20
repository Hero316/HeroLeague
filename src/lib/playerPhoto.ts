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

// Bild für Listen/Podeste (Hero One, Statistik, Bestenlisten): das eigene
// Porträt (Kopf & Schultern) hat Vorrang – Action-Fotos der FIFA-Karte wären
// dort winzige Ganzkörper-Figuren. Sonst die Freistellung des Kartenbilds.
export function listPortrait(
  p: { imageUrl?: string; cutoutUrl?: string; cutoutSrc?: string; portraitUrl?: string } | undefined
): string | undefined {
  return p?.portraitUrl || validCutout(p);
}

// „Nur Kartenbild" ändern: Hatte der Spieler kein eigenes Porträt, zeigten die
// Listen bisher die Freistellung des alten Kartenbilds. Die wird jetzt als
// Porträt festgehalten, damit sich dort nichts ändert.
export function keepPortrait(p: { imageUrl?: string; cutoutUrl?: string; cutoutSrc?: string; portraitUrl?: string } | undefined): { portraitUrl?: string } {
  if (!p || p.portraitUrl) return {};
  const old = validCutout(p);
  return old ? { portraitUrl: old } : {};
}
