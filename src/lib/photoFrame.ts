// ===========================================================================
// Bildgeometrie fürs Foto-Studio (Backoffice). Aus EINER Freistellung entstehen
// zwei Bilder:
//  • Kartenbild – 4:5 auf dem Spielerbild-Hintergrund, Kopf bei 13 % von oben,
//    unten bündig (FIFA-Karte, Kader, Avatare).
//  • Porträt – Kopf & Schultern, freigestellt, unten die Schnittkante (Hero One,
//    Statistik, Bestenlisten). Standard-Ausschnitt wie bei den bisherigen
//    Porträts: Kopf (Scheitel bis Kinn) ≈ 56 % der Bildhöhe.
// Beide Ausschnitte lassen sich getrennt verschieben und vergrößern.
// ===========================================================================

import type { FaceBox } from './faceDetect';

export type Pt = { x: number; y: number };
export type Box = { x: number; y: number; w: number; h: number };
// box = sichtbarer Inhalt der Freistellung, headX = waagerechte Kopfmitte (beides in Freistellungs-Pixeln)
export type Layout = { box: Box; headX: number };
// Porträt-Anker (Freistellungs-Pixel): top = Scheitel, cx = Kopfmitte,
// len = sichtbare Länge ab dem Scheitel bei Größe 100 %.
export type Anchor = { top: number; cx: number; len: number };

export const FRAME_RATIO = 0.8; // Breite : Höhe (4:5) – Kartenbild und Porträt-Rahmen
export const CARD_HEAD_TOP = 0.13; // Abstand Kopf → oberer Rand, wie bei den handgemachten Bildern
const PORTRAIT_HEAD_TOP = 0.1;
const PORTRAIT_HEAD_SHARE = 0.565; // Kopf / sichtbare Höhe – gemessen an den bisherigen Porträts
const ALPHA_MIN = 24;

export const ctx2d = (c: HTMLCanvasElement) => c.getContext('2d', { willReadFrequently: true })!;

// Sichtbarer Inhalt + Kopfmitte (Schwerpunkt der Deckkraft im oberen Viertel des
// Inhalts) – so sitzt der Kopf mittig im Lichtkegel, auch wenn ein Arm zur Seite
// ragt. null = nichts mehr zu sehen (alles wegradiert).
export function measure(c: HTMLCanvasElement): Layout | null {
  const { width: w, height: h } = c;
  const d = ctx2d(c).getImageData(0, 0, w, h).data;
  let x0 = w;
  let y0 = h;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (d[(y * w + x) * 4 + 3] > ALPHA_MIN) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) return null;
  const box = { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
  const yEnd = y0 + Math.max(1, Math.round(box.h * 0.25));
  let sum = 0;
  let weight = 0;
  for (let y = y0; y < yEnd; y++) {
    for (let x = x0; x <= x1; x++) {
      const a = d[(y * w + x) * 4 + 3];
      sum += a * x;
      weight += a;
    }
  }
  return { box, headX: weight > 0 ? sum / weight : x0 + box.w / 2 };
}

// ---------------------------------------------------------------------------
// Kartenbild
// ---------------------------------------------------------------------------

// Wo und wie groß die Freistellung gezeichnet wird. size = 1: Kopf bei 13 % von
// oben und unten bündig; größer: Kopf bleibt oben; kleiner: unten bündig. Dazu
// kommt das Verschieben (pan = Anteil der Bildbreite/-höhe).
export function placeCard(W: number, H: number, l: Layout, size: number, pan: Pt) {
  const s = ((H * (1 - CARD_HEAD_TOP)) / l.box.h) * size;
  const boxTop = Math.max(H * CARD_HEAD_TOP, H - l.box.h * s);
  return { x: W / 2 - l.headX * s + pan.x * W, y: boxTop - l.box.y * s + pan.y * H, s };
}

// Verschieben begrenzen: Der Spieler bleibt im Bild, und sein unterer Rand nie
// über dem Bildrand – sonst wäre mitten im Bild eine Schnittkante zu sehen.
export function clampCardPan(l: Layout, size: number, pan: Pt): Pt {
  const W = FRAME_RATIO;
  const H = 1;
  const b = placeCard(W, H, l, size, { x: 0, y: 0 });
  const minY = (H - (l.box.y + l.box.h) * b.s - b.y) / H; // unterer Rand ≥ Bildrand
  const minX = (0.15 * W - (l.box.x + l.box.w) * b.s - b.x) / W; // rechter Rand nicht links von 15 %
  const maxX = (0.85 * W - l.box.x * b.s - b.x) / W; // linker Rand nicht rechts von 85 %
  return { x: Math.min(maxX, Math.max(minX, pan.x)), y: Math.max(minY, pan.y) };
}

// Kartenbild zeichnen: Hintergrund + Spieler.
export function drawCard(ctx: CanvasRenderingContext2D, W: number, H: number, bg: HTMLImageElement, src: HTMLCanvasElement, l: Layout, size: number, pan: Pt) {
  ctx.clearRect(0, 0, W, H);
  ctx.drawImage(bg, 0, 0, W, H);
  const { x, y, s } = placeCard(W, H, l, size, pan);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, x, y, src.width * s, src.height * s);
}

// ---------------------------------------------------------------------------
// Porträt
// ---------------------------------------------------------------------------

// Hauptgesicht: groß und nah an der Kopfmitte des (übrig gebliebenen) Spielers.
function pickFace(faces: FaceBox[], l: Layout): FaceBox | null {
  let best: FaceBox | null = null;
  let bestScore = 0;
  for (const f of faces) {
    const cx = f.x + f.w / 2;
    const cy = f.y + f.h / 2;
    if (cy < l.box.y || cy > l.box.y + l.box.h || cx < l.box.x || cx > l.box.x + l.box.w) continue;
    const off = Math.min(1, Math.abs(cx - l.headX) / Math.max(1, l.box.w));
    const score = f.w * f.h * (1 - 0.6 * off);
    if (score > bestScore) {
      bestScore = score;
      best = f;
    }
  }
  return best;
}

// Standard-Ausschnitt fürs Porträt. Mit Gesicht: Scheitel = oberster deckender
// Punkt über dem Gesicht (Haare), Kinn = Unterkante des Gesichts. Ohne Gesicht
// (z. B. Hinterkopf): Faustregel nach der Form des Spielers.
export function portraitAnchor(c: HTMLCanvasElement, l: Layout, faces: FaceBox[]): Anchor {
  const bottom = l.box.y + l.box.h;
  const f = pickFace(faces, l);
  if (!f) {
    const tall = l.box.h / l.box.w >= 1.4; // Ganzkörper/Halbkörper → oberer Teil
    return { top: l.box.y, cx: l.headX, len: tall ? l.box.h * 0.45 : l.box.h };
  }
  const bx0 = Math.max(0, Math.floor(f.x));
  const bx1 = Math.min(c.width, Math.ceil(f.x + f.w));
  const yFrom = Math.max(0, Math.min(c.height - 1, Math.floor(f.y)));
  const yTo = Math.max(0, Math.floor(f.y - f.h * 1.2));
  let top = f.y;
  if (bx1 > bx0 && yFrom > yTo) {
    const bw = bx1 - bx0;
    const d = ctx2d(c).getImageData(bx0, yTo, bw, yFrom - yTo + 1).data;
    const need = Math.max(2, Math.round(bw * 0.04));
    let gap = 0;
    for (let y = yFrom; y >= yTo; y--) {
      const row = (y - yTo) * bw;
      let n = 0;
      for (let x = 0; x < bw; x++) if (d[(row + x) * 4 + 3] > ALPHA_MIN) n++;
      if (n >= need) {
        top = y;
        gap = 0;
      } else if (++gap > 2) break;
    }
  }
  const chin = f.y + f.h;
  const head = Math.max(1, chin - top);
  // Nicht mehr zeigen, als da ist: endet der Spieler früher, unten bündig.
  const len = Math.max(head * 1.05, Math.min(head / PORTRAIT_HEAD_SHARE, bottom - top));
  return { top, cx: f.x + f.w / 2, len };
}

export function placePortrait(W: number, H: number, a: Anchor, size: number, pan: Pt) {
  const s = ((H * (1 - PORTRAIT_HEAD_TOP)) / a.len) * size;
  return { x: W / 2 - a.cx * s + pan.x * W, y: H * PORTRAIT_HEAD_TOP - a.top * s + pan.y * H, s };
}

// Verschieben begrenzen: Kopf bleibt im Rahmen, der Spieler reicht unten immer
// bis an den Rand (sonst sähe man mitten im Bild die Schnittkante).
export function clampPortraitPan(l: Layout, a: Anchor, size: number, pan: Pt): Pt {
  const W = FRAME_RATIO;
  const H = 1;
  const b = placePortrait(W, H, a, size, { x: 0, y: 0 });
  const minX = (0.15 * W - a.cx * b.s - b.x) / W;
  const maxX = (0.85 * W - a.cx * b.s - b.x) / W;
  const minY = Math.max(
    (H - (l.box.y + l.box.h) * b.s - b.y) / H, // unterer Rand ≥ Bildrand
    (-0.3 * H - a.top * b.s - b.y) / H // Scheitel nicht weiter als 30 % über den Rand hinaus
  );
  const maxY = (0.6 * H - a.top * b.s - b.y) / H; // Scheitel nicht tiefer als 60 %
  const y = Math.max(minY, Math.min(Math.max(minY, maxY), pan.y));
  return { x: Math.min(maxX, Math.max(minX, pan.x)), y };
}

// Porträt-Rahmen zum Bearbeiten: Hintergrund + Spieler im Porträt-Ausschnitt.
export function drawPortraitFrame(ctx: CanvasRenderingContext2D, W: number, H: number, bg: HTMLImageElement, src: HTMLCanvasElement, a: Anchor, size: number, pan: Pt) {
  ctx.clearRect(0, 0, W, H);
  ctx.drawImage(bg, 0, 0, W, H);
  const { x, y, s } = placePortrait(W, H, a, size, pan);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, x, y, src.width * s, src.height * s);
}

// Fertiges Porträt: freigestellt, oben/links/rechts eng zugeschnitten, unten die
// Schnittkante des Rahmens. Höhe ≈ native Auflösung (500–maxH Pixel).
export function renderPortrait(src: HTMLCanvasElement, l: Layout, a: Anchor, size: number, pan: Pt, maxH = 1000): HTMLCanvasElement | null {
  const nativeH = a.len / ((1 - PORTRAIT_HEAD_TOP) * size);
  const H = Math.round(Math.min(maxH, Math.max(Math.min(500, maxH), nativeH)));
  const W = Math.round(H * FRAME_RATIO);
  const frame = document.createElement('canvas');
  frame.width = W;
  frame.height = H;
  const ctx = ctx2d(frame);
  const p = placePortrait(W, H, a, size, clampPortraitPan(l, a, size, pan));
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, p.x, p.y, src.width * p.s, src.height * p.s);
  return trim(frame, true);
}

// Freistellung eng zuschneiden (leere Ränder weg). keepBottom: unterer Rand
// bleibt die Schnittkante. null = nichts zu sehen.
export function trim(c: HTMLCanvasElement, keepBottom = false): HTMLCanvasElement | null {
  const { width: w, height: h } = c;
  const d = ctx2d(c).getImageData(0, 0, w, h).data;
  let x0 = w;
  let y0 = h;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (d[(y * w + x) * 4 + 3] > ALPHA_MIN) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) return null;
  const pad = Math.round(Math.max(w, h) * 0.01);
  x0 = Math.max(0, x0 - pad);
  y0 = Math.max(0, y0 - pad);
  x1 = Math.min(w - 1, x1 + pad);
  y1 = keepBottom ? h - 1 : Math.min(h - 1, y1 + pad);
  const out = document.createElement('canvas');
  out.width = x1 - x0 + 1;
  out.height = y1 - y0 + 1;
  ctx2d(out).drawImage(c, x0, y0, out.width, out.height, 0, 0, out.width, out.height);
  return out;
}
