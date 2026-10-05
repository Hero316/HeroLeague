// ===========================================================================
// Spiel-Fotos fürs Tracking: Screenshot statt Kaderbild — gilt für den ganzen
// SPIELTAG (alle Spiele des Abends), damit man ihn nur einmal machen muss.
// Kader und Backend werden dabei NIE angefasst.
//
// Gespeichert wird nur lokal im Browser (localStorage), je Spieltag ein Eintrag
// (Schlüssel „Team::Spieler"). Ältere Einträge je Spiel werden weiter gelesen.
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

const dayKeyFor = (dayKey: string) => `${KEY_PREFIX}day:${dayKey}`;

function readMap(storageKey: string): PhotoMap {
  try {
    const raw = localStorage.getItem(storageKey);
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

// Fotos eines Spiels laden: Spieltags-Fotos („Team::Spieler") auf die Zeilen-
// Schlüssel dieses Spiels („Spiel::Team::Spieler") abbilden. Alte Einzelspiel-
// Fotos (frühere Version) gelten weiter, die Spieltags-Fotos haben Vorrang.
export function loadMatchPhotos(matchId: string, dayKey?: string): PhotoMap {
  const out: PhotoMap = {};
  if (dayKey) {
    for (const [k, v] of Object.entries(readMap(dayKeyFor(dayKey)))) out[`${matchId}::${k}`] = v;
  }
  return { ...readMap(keyFor(matchId)), ...out };
}

// Ein Foto für den ganzen Spieltag setzen (dataUrl) oder entfernen (null).
// Ist der Speicher voll, werden zuerst die Fotos ANDERER Spieltage/Spiele
// weggeräumt und es wird einmal erneut versucht. Klappt auch das nicht, gilt
// das Foto nur bis zum Neuladen — gemeldet über den Rückgabewert.
export function saveDayPhoto(dayKey: string, matchId: string, teamPlayer: string, dataUrl: string | null): boolean {
  const own = dayKeyFor(dayKey);
  const map = readMap(own);
  if (dataUrl === null) delete map[teamPlayer];
  else map[teamPlayer] = dataUrl;
  // Beim Entfernen auch ein altes Einzelspiel-Foto dieses Spielers löschen.
  if (dataUrl === null) {
    const legacy = readMap(keyFor(matchId));
    if (legacy[`${matchId}::${teamPlayer}`]) {
      delete legacy[`${matchId}::${teamPlayer}`];
      try {
        localStorage.setItem(keyFor(matchId), JSON.stringify(legacy));
      } catch {
        /* egal */
      }
    }
  }
  const write = () => localStorage.setItem(own, JSON.stringify(map));
  try {
    write();
    return true;
  } catch {
    try {
      for (const k of Object.keys(localStorage)) {
        if (k.startsWith(KEY_PREFIX) && k !== own) localStorage.removeItem(k);
      }
      write();
      return true;
    } catch {
      return false;
    }
  }
}
