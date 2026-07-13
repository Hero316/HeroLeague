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

const MAX_UPLOAD_BYTES = 3 * 1024 * 1024;
const ALLOWED_UPLOAD_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

// Bild hochladen (Vercel Blob) und öffentliche URL zurückgeben
export async function uploadImage(file: File): Promise<string> {
  if (!ALLOWED_UPLOAD_TYPES.includes(file.type)) {
    throw new Error('Nur PNG, JPEG, WebP oder GIF erlaubt.');
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error('Bild ist zu groß (max. 3 MB).');
  }

  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Datei konnte nicht gelesen werden.'));
    reader.readAsDataURL(file);
  });

  const result = await apiFetch<{ url: string }>('/api/upload', {
    method: 'POST',
    body: JSON.stringify({ image: dataUrl, filename: file.name }),
  });
  return result.url;
}
