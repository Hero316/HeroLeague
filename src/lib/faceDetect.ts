// ===========================================================================
// Gesichtserkennung fürs Foto-Studio (Backoffice): findet Gesichter auf der
// Freistellung, damit das Porträt automatisch auf Kopf & Schultern sitzt –
// auch bei Action- und Gruppenfotos. Modell: Ultra-Light-Fast-Generic-Face-
// Detector (RFB-640, MIT, ~1,6 MB) aus dem ONNX Model Zoo, über dieselbe
// onnxruntime-Laufzeit wie der Freisteller. Schlägt das Laden fehl, gibt es
// einfach keine Gesichter – das Studio nimmt dann eine einfache Faustregel.
// ===========================================================================

import { modelSession } from './onnx';

export type FaceBox = { x: number; y: number; w: number; h: number; score: number };

const MODEL_URLS = ['https://huggingface.co/onnxmodelzoo/version-RFB-640/resolve/main/version-RFB-640.onnx'];
const IN_W = 640;
const IN_H = 480;
const MIN_SCORE = 0.7;
const NMS_IOU = 0.3;

const loadSession = modelSession(MODEL_URLS, 'Gesichtserkennung');

// Modell schon vorab laden (läuft parallel zum Freistellen).
export function preloadFaceModel(): void {
  loadSession().catch(() => {});
}

const iou = (a: FaceBox, b: FaceBox) => {
  const ix = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const iy = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  const inter = ix * iy;
  const union = a.w * a.h + b.w * b.h - inter;
  return union > 0 ? inter / union : 0;
};

// Gesichter auf einem (freigestellten) Bild – Koordinaten in Bild-Pixeln,
// bestes zuerst. Die Freistellung wird auf neutralem Grau ausgewertet.
export async function detectFaces(src: HTMLCanvasElement): Promise<FaceBox[]> {
  const { ort, session } = await loadSession();
  const k = Math.min(IN_W / src.width, IN_H / src.height);
  const c = document.createElement('canvas');
  c.width = IN_W;
  c.height = IN_H;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  if (!ctx) return [];
  ctx.fillStyle = 'rgb(128,128,128)';
  ctx.fillRect(0, 0, IN_W, IN_H);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, 0, 0, Math.round(src.width * k), Math.round(src.height * k));
  const px = ctx.getImageData(0, 0, IN_W, IN_H).data;
  const plane = IN_W * IN_H;
  const data = new Float32Array(3 * plane);
  for (let i = 0; i < plane; i++) {
    data[i] = (px[i * 4] - 127) / 128;
    data[plane + i] = (px[i * 4 + 1] - 127) / 128;
    data[2 * plane + i] = (px[i * 4 + 2] - 127) / 128;
  }
  const out = await session.run({ [session.inputNames[0]]: new ort.Tensor('float32', data, [1, 3, IN_H, IN_W]) });
  // Ausgaben: scores [1, N, 2] (Hintergrund, Gesicht) und boxes [1, N, 4] (x1, y1, x2, y2; 0–1)
  const scores = (out.scores ?? out[session.outputNames[0]]).data as Float32Array;
  const boxes = (out.boxes ?? out[session.outputNames[1]]).data as Float32Array;
  const n = scores.length / 2;
  const found: FaceBox[] = [];
  for (let i = 0; i < n; i++) {
    const score = scores[i * 2 + 1];
    if (score < MIN_SCORE) continue;
    const x1 = (boxes[i * 4] * IN_W) / k;
    const y1 = (boxes[i * 4 + 1] * IN_H) / k;
    const x2 = (boxes[i * 4 + 2] * IN_W) / k;
    const y2 = (boxes[i * 4 + 3] * IN_H) / k;
    if (x2 - x1 < 4 || y2 - y1 < 4) continue;
    found.push({ x: x1, y: y1, w: x2 - x1, h: y2 - y1, score });
  }
  found.sort((a, b) => b.score - a.score);
  const keep: FaceBox[] = [];
  for (const f of found) if (keep.every((g) => iou(f, g) <= NMS_IOU)) keep.push(f);
  return keep;
}
