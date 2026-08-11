import type { VercelRequest, VercelResponse } from '@vercel/node';
import { put } from '@vercel/blob';
import { requireAuth } from './_lib/auth.js';
import { badRequest } from './_lib/validate.js';

// Erlaubte Bildformate (kein SVG – Skript-Injektionsrisiko). Bilder werden
// bereits im Browser verkleinert/komprimiert (siehe src/lib/api.ts).
const IMAGE_TYPES: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

// Zusätzlich erlaubte Datei-/Audioformate für Chat-Anhänge (Whitelist – alles
// andere wird abgewiesen). Audio (Sprachnachrichten) ist durch Opus/WebM bereits
// stark komprimiert.
const FILE_TYPES: Record<string, string> = {
  ...IMAGE_TYPES,
  'application/pdf': 'pdf',
  'text/plain': 'txt',
  'application/zip': 'zip',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  'audio/webm': 'webm',
  'audio/ogg': 'ogg',
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/wav': 'wav',
  'audio/aac': 'aac',
};

const MAX_BYTES = 3 * 1024 * 1024; // 3 MB dekodiert (Vercel-Request-Limit ~4,5 MB inkl. Base64)

export default requireAuth(async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Nicht unterstützt' });

    // kind='file' erlaubt Dokumente/Audio; sonst (Standard) nur Bilder.
    const isFile = req.body?.kind === 'file';
    const allowed = isFile ? FILE_TYPES : IMAGE_TYPES;

    const fileData = req.body?.image ?? req.body?.file;
    const filename = typeof req.body?.filename === 'string' ? req.body.filename : 'upload';
    if (typeof fileData !== 'string') return badRequest(res, 'Keine Datei-Daten empfangen.');

    // Der MIME-Teil kann Parameter enthalten (z.B. audio/webm;codecs=opus) –
    // daher bis zum ";base64," alles erlauben und danach den Basis-Typ nehmen.
    const match = fileData.match(/^data:([^,]*);base64,(.+)$/i);
    if (!match) return badRequest(res, 'Ungültiges Format (Base64-Data-URL erwartet).');

    const mimeType = (match[1] || '').toLowerCase().split(';')[0].trim();
    const extension = allowed[mimeType];
    if (!extension) {
      return badRequest(res, isFile ? 'Dieser Dateityp ist nicht erlaubt.' : 'Nur PNG, JPEG, WebP oder GIF erlaubt.');
    }

    const buffer = Buffer.from(match[2], 'base64');
    if (buffer.length > MAX_BYTES) return badRequest(res, 'Datei ist zu groß (max. 3 MB).');
    if (buffer.length === 0) return badRequest(res, 'Leere Datei.');

    const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '').slice(0, 40) || 'upload';
    const base = safeName.replace(/\.[a-z0-9]+$/i, '') || 'upload';
    const blob = await put(`uploads/${Date.now()}-${base}.${extension}`, buffer, {
      access: 'public',
      contentType: mimeType,
      cacheControlMaxAge: 31536000, // 1 Jahr Browser-Cache – Dateinamen sind durch den Timestamp einmalig
    });

    // Bild-Upload bleibt rückwärtskompatibel ({url}); Datei-Upload liefert zusätzlich name/mime.
    return res.json(isFile ? { url: blob.url, name: filename.slice(0, 80), mime: mimeType } : { url: blob.url });
  } catch (err) {
    console.error('Upload fehlgeschlagen:', err);
    return res.status(500).json({ error: 'Upload-Fehler' });
  }
});
