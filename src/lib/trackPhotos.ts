// ===========================================================================
// Spiel-Fotos fürs Tracking: Screenshot statt Kaderbild — aber NUR für ein
// einzelnes Spiel. Kader und Backend werden dabei NIE angefasst.
//
// Gespeichert wird nur lokal im Browser (localStorage), je Spiel ein Eintrag.
// Deshalb werden die Bilder vorher stark verkleinert: ein roher Screenshot hat
// schnell mehrere MB, der localStorage fasst aber nur ~5 MB insgesamt.
// ===========================================================================

const KEY_PREFIX = 'hl-trackphoto:';
const MAX_SIDE = 512; // reicht für Karte (96px) und Großansicht locker
const QUALITY = 0.8;

export type PhotoMap = Record<string, string>; // rowKey -> data-URL

const keyFor = (matchId: string) => `${KEY_PREFIX}${matchId}`;

// Bild auf MAX_SIDE verkleinern und als JPEG-data-URL zurückgeben (~30–60 KB).
export async function downscaleToDataUrl(blob: Blob): Promise<string> {
  const url = URL.createObjectURL(blob);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('Bild konnte nicht gelesen werden'));
      i.src = url;
    });
    const scale = Math.min(1, MAX_SIDE / Math.max(img.width, img.height));
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas nicht verfügbar');
    ctx.drawImage(img, 0, 0, w, h);
    return canvas.toDataURL('image/jpeg', QUALITY);
  } finally {
    URL.revokeObjectURL(url);
  }
}

// Erstes Bild aus einer Zwischenablage-/Drop-Datenquelle holen.
export function imageFromDataTransfer(dt: DataTransfer | null): File | null {
  if (!dt) return null;
  for (const item of Array.from(dt.items)) {
    if (item.kind === 'file' && item.type.startsWith('image/')) {
      const f = item.getAsFile();
      if (f) return f;
    }
  }
  return null;
}

// Bild aus der Zwischenablage lesen (Chrome/Edge; braucht HTTPS + Erlaubnis).
export async function imageFromClipboard(): Promise<Blob | null> {
  const nav = navigator as Navigator & { clipboard?: { read?: () => Promise<ClipboardItem[]> } };
  if (!nav.clipboard?.read) return null;
  const items = await nav.clipboard.read();
  for (const item of items) {
    const type = item.types.find((t) => t.startsWith('image/'));
    if (type) return await item.getType(type);
  }
  return null;
}

export function loadMatchPhotos(matchId: string): PhotoMap {
  try {
    const raw = localStorage.getItem(keyFor(matchId));
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    const out: PhotoMap = {};
    if (parsed && typeof parsed === 'object') {
      for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
        if (typeof v === 'string' && v.startsWith('data:image/')) out[k] = v;
      }
    }
    return out;
  } catch {
    return {};
  }
}

// Speichern. Ist der Speicher voll, werden zuerst die Fotos ANDERER Spiele
// weggeräumt (die braucht man nach dem Spiel ohnehin nicht mehr) und es wird
// einmal erneut versucht. Klappt auch das nicht, gilt das Foto nur bis zum
// Neuladen — gemeldet über den Rückgabewert.
export function saveMatchPhotos(matchId: string, map: PhotoMap): boolean {
  const write = () => localStorage.setItem(keyFor(matchId), JSON.stringify(map));
  try {
    write();
    return true;
  } catch {
    try {
      for (const k of Object.keys(localStorage)) {
        if (k.startsWith(KEY_PREFIX) && k !== keyFor(matchId)) localStorage.removeItem(k);
      }
      write();
      return true;
    } catch {
      return false;
    }
  }
}
