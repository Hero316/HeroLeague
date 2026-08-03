import type { VercelRequest, VercelResponse } from '@vercel/node';
import { put } from '@vercel/blob';
import { requireStaff } from './_lib/auth.js';
import { badRequest } from './_lib/validate.js';

// Erlaubte Bildformate (kein SVG – Skript-Injektionsrisiko)
const ALLOWED_TYPES: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

const MAX_BYTES = 3 * 1024 * 1024; // 3 MB (Vercel-Request-Limit: 4,5 MB inkl. Base64-Overhead)

export default requireStaff(async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Nicht unterstützt' });

    const fileData = req.body?.image ?? req.body?.file;
    const filename = typeof req.body?.filename === 'string' ? req.body.filename : 'upload';
    if (typeof fileData !== 'string') return badRequest(res, 'Keine Datei-Daten empfangen.');

    const match = fileData.match(/^data:([a-z0-9.+/-]+);base64,(.+)$/i);
    if (!match) return badRequest(res, 'Ungültiges Bild-Format (Base64-Data-URL erwartet).');

    const mimeType = match[1].toLowerCase();
    const extension = ALLOWED_TYPES[mimeType];
    if (!extension) return badRequest(res, 'Nur PNG, JPEG, WebP oder GIF erlaubt.');

    const buffer = Buffer.from(match[2], 'base64');
    if (buffer.length > MAX_BYTES) return badRequest(res, 'Bild ist zu groß (max. 3 MB).');
    if (buffer.length === 0) return badRequest(res, 'Leere Datei.');

    const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '').slice(0, 40) || 'upload';
    const blob = await put(`uploads/${Date.now()}-${safeName}.${extension}`, buffer, {
      access: 'public',
      contentType: mimeType,
      cacheControlMaxAge: 31536000, // 1 Jahr Browser-Cache – Dateinamen sind durch den Timestamp einmalig
    });

    return res.json({ url: blob.url });
  } catch (err) {
    console.error('Upload fehlgeschlagen:', err);
    return res.status(500).json({ error: 'Upload-Fehler' });
  }
});
