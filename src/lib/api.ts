// Zentraler Fetch-Helfer: JSON-Header, Fehlertexte vom Server, 401-Behandlung
import { upload as blobUpload } from '@vercel/blob/client';

let onUnauthorized: (() => void) | null = null;

export function setUnauthorizedHandler(handler: () => void) {
  onUnauthorized = handler;
}

export async function apiFetch<T = unknown>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });

  if (res.status === 401) {
    onUnauthorized?.();
    throw new Error('Sitzung abgelaufen – bitte neu anmelden.');
  }

  if (!res.ok) {
    let message = `Fehler (${res.status})`;
    try {
      const data = await res.json();
      if (data?.error) message = data.error;
    } catch {
      // Antwort war kein JSON – Statustext reicht
    }
    throw new Error(message);
  }

  return res.json();
}

const MAX_UPLOAD_BYTES = 3 * 1024 * 1024; // Server-Limit für den fertigen Upload
const MAX_SOURCE_BYTES = 15 * 1024 * 1024; // Originaldatei – wird vor dem Upload stark verkleinert
const ALLOWED_UPLOAD_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
const MAX_DIMENSION = 512; // längste Kante – Vorgabe für Logos, Wappen und Spielerfotos
const GALLERY_MAX_DIMENSION = 1600; // größere Highlight-Fotos: scharf, aber weiterhin klein

// Bild im Browser verkleinern und zu WebP wandeln, damit die Seite kleine Dateien
// ausliefert (Blob-Transfervolumen). Fallback PNG erhält Transparenz, falls der
// Browser kein WebP schreiben kann (älteres Safari). GIFs bleiben unangetastet,
// damit Animationen erhalten bleiben. Über `maxDimension` lässt sich die längste
// Kante steuern (Logos 512px, Highlight-Galerie 1600px).
async function compressImage(file: File, maxDimension = MAX_DIMENSION): Promise<File> {
  if (file.type === 'image/gif') return file;

  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) return file;
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  const toBlob = (type: string, quality?: number) =>
    new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
  let blob = await toBlob('image/webp', 0.82);
  if (!blob || blob.type !== 'image/webp') blob = await toBlob('image/png');
  if (!blob) return file;

  const baseName = file.name.replace(/\.[a-z0-9]+$/i, '') || 'bild';
  const extension = blob.type === 'image/webp' ? 'webp' : 'png';
  return new File([blob], `${baseName}.${extension}`, { type: blob.type });
}

// Bild hochladen (Vercel Blob) und öffentliche URL zurückgeben. Über
// `maxDimension` steuert der Aufrufer die Auflösung (Highlight-Galerie: 1600px).
export async function uploadImage(file: File, opts?: { maxDimension?: number }): Promise<string> {
  if (!ALLOWED_UPLOAD_TYPES.includes(file.type)) {
    throw new Error('Nur PNG, JPEG, WebP oder GIF erlaubt.');
  }
  if (file.size > MAX_SOURCE_BYTES) {
    throw new Error('Bild ist zu groß (max. 15 MB).');
  }

  let upload = file;
  try {
    upload = await compressImage(file, opts?.maxDimension);
  } catch {
    // Komprimierung fehlgeschlagen (z.B. defekte Datei) – Original weiterverwenden
  }
  if (upload.size > MAX_UPLOAD_BYTES) {
    throw new Error('Bild ist zu groß (max. 3 MB).');
  }

  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Datei konnte nicht gelesen werden.'));
    reader.readAsDataURL(upload);
  });

  const result = await apiFetch<{ url: string }>('/api/upload', {
    method: 'POST',
    body: JSON.stringify({ image: dataUrl, filename: upload.name }),
  });
  return result.url;
}

// Kleiner Upload (Bild/Datei/Audio ≤ 3 MB) über die Serverless-Funktion (Base64).
async function uploadSmallFile(file: File): Promise<{ url: string; name: string; mime: string }> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Datei konnte nicht gelesen werden.'));
    reader.readAsDataURL(file);
  });
  return apiFetch<{ url: string; name: string; mime: string }>('/api/upload', {
    method: 'POST',
    body: JSON.stringify({ kind: 'file', file: dataUrl, filename: file.name || 'datei' }),
  });
}

// Direkter Upload vom Browser zu Vercel Blob – umgeht das ~3-MB-Request-Limit
// der Serverless-Funktion. Für große Dateien, v.a. Videos. Der Server stellt
// nur ein kurzlebiges Token aus (/api/upload?resource=blob), die Daten fließen
// direkt (inkl. Multipart bei großen Dateien). Bis 500 MB.
const BLOB_MAX_BYTES = 500 * 1024 * 1024;
export async function uploadViaBlob(
  file: File,
  onProgress?: (pct: number) => void,
): Promise<{ url: string; name: string; mime: string }> {
  if (file.size > BLOB_MAX_BYTES) {
    throw new Error('Datei ist zu groß (max. 500 MB).');
  }
  const safe = (file.name || 'datei').replace(/[^a-zA-Z0-9._-]/g, '').slice(0, 60) || 'datei';
  const result = await blobUpload(`uploads/${Date.now()}-${safe}`, file, {
    access: 'public',
    handleUploadUrl: '/api/upload?resource=blob',
    contentType: file.type || undefined,
    multipart: true, // große Videos in Teilen, parallel + mit Wiederholung
    onUploadProgress: onProgress ? (e) => onProgress(Math.round(e.percentage)) : undefined,
  });
  return { url: result.url, name: file.name || 'datei', mime: file.type || '' };
}

// Beliebige Datei / Audio / Video hochladen (Chat- & Ideen-Anhänge).
// - Bilder: im Browser verkleinert + zu WebP komprimiert (wie die Website).
// - Videos & große Dateien: direkt zu Vercel Blob (kein 3-MB-Limit).
// - Kleine Dateien/Audio: klassisch über die Serverless-Funktion.
// onProgress meldet den Fortschritt (0–100) beim direkten Blob-Upload.
export async function uploadFile(
  file: File,
  onProgress?: (pct: number) => void,
): Promise<{ url: string; name: string; mime: string }> {
  // Bilder immer komprimieren (spart Speicher/Ladezeit – wie auf der Website).
  if (file.type.startsWith('image/')) {
    let img = file;
    try {
      img = await compressImage(file, GALLERY_MAX_DIMENSION);
    } catch {
      /* Original behalten */
    }
    // Nach der Komprimierung meist winzig → einfacher Weg; nur im Ausnahmefall Blob.
    return img.size <= MAX_UPLOAD_BYTES ? uploadSmallFile(img) : uploadViaBlob(img, onProgress);
  }
  // Videos und alles > 3 MB: direkt zu Blob. Kleine Dateien/Audio: klassisch.
  if (file.type.startsWith('video/') || file.size > MAX_UPLOAD_BYTES) {
    return uploadViaBlob(file, onProgress);
  }
  return uploadSmallFile(file);
}
