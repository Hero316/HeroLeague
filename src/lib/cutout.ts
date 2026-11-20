// ===========================================================================
// Freisteller: entfernt den Hintergrund von Spielerfotos – komplett im Browser.
// Modell: MODNet (Porträt-Matting, Apache-2.0) über onnxruntime-web (WASM).
// Wird NUR im Backoffice per dynamischem Import geladen; die öffentliche Seite
// lädt davon nichts. Das Modell (~25 MB) holt der Browser einmalig von
// Hugging Face und legt es im Cache ab.
// Ergebnis: transparentes WebP, oben/links/rechts eng zugeschnitten – der
// untere Bildrand bleibt die „Schnittkante" (Brust), auf der der Spieler in
// den Kacheln steht.
// ===========================================================================

import { uploadImage } from './api';
import { modelSession } from './onnx';

const MODEL_URLS = [
  'https://huggingface.co/Xenova/modnet/resolve/main/onnx/model.onnx',
  'https://huggingface.co/Xenova/modnet/resolve/main/onnx/model_quantized.onnx',
];
const OUT_MAX = 900; // längste Kante des freigestellten Bildes (Standard)

const loadSession = modelSession(MODEL_URLS, 'Freistell-Modell');

async function toBitmap(source: Blob | string): Promise<ImageBitmap> {
  const blob = typeof source === 'string' ? await (await fetch(source, { mode: 'cors' })).blob() : source;
  return createImageBitmap(blob);
}

function canvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas nicht verfügbar.');
  return { c, ctx };
}

// Hintergrund entfernen → transparentes Bild (Blob, WebP bzw. PNG).
// maxSide = längste Kante des Ergebnisses (das Foto-Studio nimmt mehr, damit
// auch ein Porträt-Ausschnitt aus einem Ganzkörperfoto noch scharf ist).
export async function removeBackground(source: Blob | string, opts?: { maxSide?: number }): Promise<Blob> {
  const { ort, session } = await loadSession();
  const bmp = await toBitmap(source);

  // Modell-Eingabe: kürzeste Kante 512, beide Seiten Vielfache von 32.
  const s = 512 / Math.min(bmp.width, bmp.height);
  const W = Math.max(32, Math.round((bmp.width * s) / 32) * 32);
  const H = Math.max(32, Math.round((bmp.height * s) / 32) * 32);
  const inp = canvas(W, H);
  inp.ctx.drawImage(bmp, 0, 0, W, H);
  const px = inp.ctx.getImageData(0, 0, W, H).data;
  const plane = W * H;
  const data = new Float32Array(3 * plane);
  for (let i = 0; i < plane; i++) {
    data[i] = px[i * 4] / 127.5 - 1;
    data[plane + i] = px[i * 4 + 1] / 127.5 - 1;
    data[2 * plane + i] = px[i * 4 + 2] / 127.5 - 1;
  }
  const feeds = { [session.inputNames[0]]: new ort.Tensor('float32', data, [1, 3, H, W]) };
  const out = await session.run(feeds);
  const matte = out[session.outputNames[0]].data as Float32Array;

  // Lose Inseln entfernen: nur zusammenhängende Flächen behalten, die
  // mindestens 5 % so groß sind wie die größte (= die Person).
  const label = new Int32Array(plane).fill(-1);
  const sizes: number[] = [];
  const boxes: number[][] = [];
  const stack: number[] = [];
  for (let i = 0; i < plane; i++) {
    if (label[i] !== -1 || matte[i] < 0.5) continue;
    const id = sizes.length;
    let n = 0, bx0 = W, by0 = H, bx1 = 0, by1 = 0;
    label[i] = id;
    stack.push(i);
    while (stack.length) {
      const j = stack.pop()!;
      n++;
      const x = j % W, y = (j - x) / W;
      if (x < bx0) bx0 = x;
      if (x > bx1) bx1 = x;
      if (y < by0) by0 = y;
      if (y > by1) by1 = y;
      const nb = [x > 0 ? j - 1 : -1, x < W - 1 ? j + 1 : -1, y > 0 ? j - W : -1, y < H - 1 ? j + W : -1];
      for (const k of nb) if (k >= 0 && label[k] === -1 && matte[k] >= 0.5) { label[k] = id; stack.push(k); }
    }
    sizes.push(n);
    boxes.push([bx0, by0, bx1, by1]);
  }
  const biggest = Math.max(0, ...sizes);
  sizes.forEach((n, id) => {
    if (n >= biggest * 0.05) return;
    const [bx0, by0, bx1, by1] = boxes[id];
    for (let y = Math.max(0, by0 - 3); y <= Math.min(H - 1, by1 + 3); y++)
      for (let x = Math.max(0, bx0 - 3); x <= Math.min(W - 1, bx1 + 3); x++) {
        const j = y * W + x;
        if (label[j] === id || label[j] === -1) matte[j] = 0;
      }
  });

  // Maske als Alpha-Bild (leicht nachgeschärft: Reste unter 8 % weg, ab 92 % voll).
  const m = canvas(W, H);
  const mImg = m.ctx.createImageData(W, H);
  for (let i = 0; i < plane; i++) {
    const a = Math.min(1, Math.max(0, (matte[i] - 0.08) / 0.84));
    mImg.data[i * 4 + 3] = Math.round(a * 255);
  }
  m.ctx.putImageData(mImg, 0, 0);

  // In Ausgabegröße: Foto zeichnen, dann mit der Maske ausstanzen.
  const k = Math.min(1, (opts?.maxSide ?? OUT_MAX) / Math.max(bmp.width, bmp.height));
  const ow = Math.round(bmp.width * k);
  const oh = Math.round(bmp.height * k);
  const o = canvas(ow, oh);
  o.ctx.drawImage(bmp, 0, 0, ow, oh);
  o.ctx.globalCompositeOperation = 'destination-in';
  o.ctx.imageSmoothingQuality = 'high';
  o.ctx.drawImage(m.c, 0, 0, ow, oh);
  bmp.close();

  // Eng zuschneiden (leere Ränder weg), damit der Spieler die Kachel füllt.
  const od = o.ctx.getImageData(0, 0, ow, oh).data;
  let x0 = ow, y0 = oh, x1 = -1, y1 = -1;
  for (let y = 0; y < oh; y++) {
    for (let x = 0; x < ow; x++) {
      if (od[(y * ow + x) * 4 + 3] > 24) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) throw new Error('Auf dem Foto wurde keine Person erkannt.');
  const pad = Math.round(Math.max(ow, oh) * 0.01);
  x0 = Math.max(0, x0 - pad);
  y0 = Math.max(0, y0 - pad);
  x1 = Math.min(ow - 1, x1 + pad);
  y1 = Math.min(oh - 1, y1 + pad);
  const cw = x1 - x0 + 1;
  const ch = y1 - y0 + 1;
  const r = canvas(cw, ch);
  r.ctx.drawImage(o.c, x0, y0, cw, ch, 0, 0, cw, ch);

  const toBlob = (type: string, q?: number) => new Promise<Blob | null>((res) => r.c.toBlob(res, type, q));
  let blob = await toBlob('image/webp', 0.9);
  if (!blob || blob.type !== 'image/webp') blob = await toBlob('image/png');
  if (!blob) throw new Error('Bild konnte nicht erzeugt werden.');
  return blob;
}

// Freistellen + hochladen → öffentliche URL des freigestellten Bildes.
export async function makeCutout(source: Blob | string): Promise<string> {
  const blob = await removeBackground(source);
  const ext = blob.type === 'image/webp' ? 'webp' : 'png';
  return uploadImage(new File([blob], `freigestellt.${ext}`, { type: blob.type }), { maxDimension: OUT_MAX });
}
