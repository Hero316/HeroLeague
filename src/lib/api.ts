// Zentraler Fetch-Helfer: JSON-Header, Fehlertexte vom Server, 401-Behandlung

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
const MAX_DIMENSION = 512; // längste Kante – reicht für Logos, Wappen und Spielerfotos

// Bild im Browser verkleinern und zu WebP wandeln, damit die Seite kleine Dateien
// ausliefert (Blob-Transfervolumen). Fallback PNG erhält Transparenz, falls der
// Browser kein WebP schreiben kann (älteres Safari). GIFs bleiben unangetastet,
// damit Animationen erhalten bleiben.
async function compressImage(file: File): Promise<File> {
  if (file.type === 'image/gif') return file;

  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
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

// Bild hochladen (Vercel Blob) und öffentliche URL zurückgeben
export async function uploadImage(file: File): Promise<string> {
  if (!ALLOWED_UPLOAD_TYPES.includes(file.type)) {
    throw new Error('Nur PNG, JPEG, WebP oder GIF erlaubt.');
  }
  if (file.size > MAX_SOURCE_BYTES) {
    throw new Error('Bild ist zu groß (max. 15 MB).');
  }

  let upload = file;
  try {
    upload = await compressImage(file);
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
