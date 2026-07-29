import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sql } from './_lib/db.js';
import { requireAdmin } from './_lib/auth.js';

const DEFAULT_TWITCH = { channel: '', isLive: false };
const DEFAULT_SOCIAL = { instagram: '', tiktok: '', youtube: '' };

// Highlights: gemischte Medien-Liste (Bilder + Video-Links) + Ordner (Alben).
type HighlightMedia = { id: string; type: 'image' | 'video'; url: string; caption?: string; ratio?: number };
type HighlightAlbum = { id: string; title: string; items: HighlightMedia[] };
const DEFAULT_HIGHLIGHTS = { items: [] as HighlightMedia[], albums: [] as HighlightAlbum[] };

// Vorbefülltes Sonder-Event (Testspieltag 02.08.2026), standardmäßig
// AUSgeschaltet. Der Spielplan ist bereits hinterlegt – im Admin muss nur der
// Schalter „aktiv" umgelegt und später die Ergebnisse eingetragen werden.
const em = (
  id: string,
  block: number,
  field: number,
  start: string,
  end: string,
  home: string,
  away: string
) => ({ id, block, field, start, end, home, away, homeScore: null, awayScore: null });

const DEFAULT_EVENT = {
  id: 'testspiel-1',
  label: 'Testspiel 1',
  title: 'Testspieltag',
  tagline: '6 Teams · jeder gegen jeden · ab 20:30 Uhr',
  dateLabel: 'Sonntag, 2. August 2026',
  location: 'Soccer Center Königsfeld',
  teams: ['New Way F.C.', 'Süss FC', 'Phalanx United', 'Trossingen F.C.', 'FC Apex', 'FC Patchwork'],
  matches: [
    em('b1f1', 1, 1, '20:30', '20:38', 'New Way F.C.', 'Süss FC'),
    em('b1f2', 1, 2, '20:30', '20:38', 'FC Apex', 'Trossingen F.C.'),
    em('b2f1', 2, 1, '20:41', '20:49', 'FC Apex', 'FC Patchwork'),
    em('b2f2', 2, 2, '20:41', '20:49', 'Phalanx United', 'Süss FC'),
    em('b3f1', 3, 1, '20:52', '21:00', 'New Way F.C.', 'Phalanx United'),
    em('b3f2', 3, 2, '20:52', '21:00', 'FC Patchwork', 'Trossingen F.C.'),
    em('b4f1', 4, 1, '21:03', '21:11', 'New Way F.C.', 'Trossingen F.C.'),
    em('b4f2', 4, 2, '21:03', '21:11', 'FC Apex', 'Süss FC'),
    em('b5f2', 5, 2, '21:14', '21:22', 'FC Patchwork', 'Phalanx United'),
    em('b6f1', 6, 1, '21:25', '21:33', 'Süss FC', 'Trossingen F.C.'),
    em('b6f2', 6, 2, '21:25', '21:33', 'FC Apex', 'New Way F.C.'),
    em('b7f1', 7, 1, '21:36', '21:44', 'FC Patchwork', 'Süss FC'),
    em('b7f2', 7, 2, '21:36', '21:44', 'Phalanx United', 'Trossingen F.C.'),
    em('b8f1', 8, 1, '21:47', '21:55', 'FC Apex', 'Phalanx United'),
    em('b8f2', 8, 2, '21:47', '21:55', 'FC Patchwork', 'New Way F.C.'),
  ],
};

// Archiv aller Testspiele – standardmäßig eins (Testspiel 1), keins aktiv.
const DEFAULT_EVENT_ARCHIVE = { activeId: null as string | null, events: [DEFAULT_EVENT] };

// Kanalnamen aus einer evtl. eingefügten URL extrahieren
function normalizeChannel(input: unknown): string {
  if (typeof input !== 'string') return '';
  return input
    .trim()
    .replace(/^https?:\/\/(www\.)?twitch\.tv\//i, '')
    .replace(/[/?#].*$/, '')
    .trim();
}

// Social-Eingabe zu einer aufrufbaren URL normalisieren: leere Felder bleiben
// leer, bei fehlendem Schema wird https:// vorangestellt.
function normalizeUrl(input: unknown): string {
  if (typeof input !== 'string') return '';
  const t = input.trim();
  if (!t) return '';
  if (/^https?:\/\//i.test(t)) return t;
  return `https://${t}`;
}

const saveTwitch = requireAdmin(async (req: VercelRequest, res: VercelResponse) => {
  const { channel, isLive } = req.body ?? {};
  const cfg = {
    channel: normalizeChannel(channel),
    isLive: Boolean(isLive),
  };

  await sql`
    INSERT INTO settings (key, value) VALUES ('twitch', ${JSON.stringify(cfg)}::jsonb)
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
  `;

  return res.json(cfg);
});

const saveSocial = requireAdmin(async (req: VercelRequest, res: VercelResponse) => {
  const { instagram, tiktok, youtube } = req.body ?? {};
  const cfg = {
    instagram: normalizeUrl(instagram),
    tiktok: normalizeUrl(tiktok),
    youtube: normalizeUrl(youtube),
  };

  await sql`
    INSERT INTO settings (key, value) VALUES ('social', ${JSON.stringify(cfg)}::jsonb)
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
  `;

  return res.json(cfg);
});

// Ganzzahl-Score oder null
function toScore(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : null;
}

function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}

// Ein einzelnes Event säubern (nur erwartete Felder übernehmen).
function normalizeEvent(body: unknown, index = 0) {
  const b = (body ?? {}) as Record<string, unknown>;
  const matches = Array.isArray(b.matches) ? b.matches : [];
  return {
    id: str(b.id).trim() || `testspiel-${index + 1}`,
    label: str(b.label).trim() || `Testspiel ${index + 1}`,
    title: str(b.title, 'Testspieltag').trim() || 'Testspieltag',
    tagline: str(b.tagline).trim(),
    dateLabel: str(b.dateLabel).trim(),
    location: str(b.location).trim(),
    teams: Array.isArray(b.teams) ? b.teams.map((t) => str(t).trim()).filter(Boolean) : [],
    matches: matches.map((raw, i) => {
      const m = (raw ?? {}) as Record<string, unknown>;
      const arr = (v: unknown) => (Array.isArray(v) ? v : []);
      return {
        id: str(m.id) || `m${i}`,
        block: Number.isFinite(Number(m.block)) ? Number(m.block) : 0,
        field: Number.isFinite(Number(m.field)) ? Number(m.field) : 0,
        start: str(m.start),
        end: str(m.end),
        home: str(m.home).trim(),
        away: str(m.away).trim(),
        homeScore: toScore(m.homeScore),
        awayScore: toScore(m.awayScore),
        status: ['geplant', 'live', 'beendet'].includes(str(m.status)) ? (str(m.status) as string) : 'geplant',
        liveStartedAt: typeof m.liveStartedAt === 'string' ? m.liveStartedAt : null,
        absentees: arr(m.absentees)
          .map((s) => {
            const o = (s ?? {}) as Record<string, unknown>;
            return { player: str(o.player).trim(), team: str(o.team).trim() };
          })
          .filter((s) => s.player),
        scorers: arr(m.scorers)
          .map((s) => {
            const o = (s ?? {}) as Record<string, unknown>;
            return { player: str(o.player).trim(), team: str(o.team).trim(), assist: str(o.assist).trim() };
          })
          .filter((s) => s.player),
        bestPlayers: arr(m.bestPlayers)
          .map((s) => {
            const o = (s ?? {}) as Record<string, unknown>;
            return { player: str(o.player).trim(), team: str(o.team).trim() };
          })
          .filter((s) => s.player),
        goalkeepers: arr(m.goalkeepers)
          .map((s) => {
            const o = (s ?? {}) as Record<string, unknown>;
            return { player: str(o.player).trim(), team: str(o.team).trim() };
          })
          .filter((s) => s.player),
      };
    }),
  };
}

// Ganzes Archiv säubern (Liste von Events + activeId).
function normalizeArchive(body: unknown) {
  const b = (body ?? {}) as Record<string, unknown>;
  const events = (Array.isArray(b.events) ? b.events : []).map((e, i) => normalizeEvent(e, i));
  const ids = new Set(events.map((e) => e.id));
  const activeId = typeof b.activeId === 'string' && ids.has(b.activeId) ? b.activeId : null;
  return { activeId, events };
}

// Gespeicherten Wert in ein Archiv umwandeln – inkl. Migration vom alten
// Einzel-Event-Format (ohne `events`-Liste) auf das neue Archiv-Format.
function toArchive(stored: unknown) {
  if (!stored || typeof stored !== 'object') return DEFAULT_EVENT_ARCHIVE;
  const s = stored as Record<string, unknown>;
  if (Array.isArray(s.events)) return normalizeArchive(s);
  // Alt-Format: ein einzelnes Event -> in ein Archiv verpacken.
  const single = normalizeEvent(s, 0);
  return { activeId: s.active ? single.id : null, events: [single] };
}

const saveEvent = requireAdmin(async (req: VercelRequest, res: VercelResponse) => {
  const archive = normalizeArchive(req.body);
  await sql`
    INSERT INTO settings (key, value) VALUES ('event', ${JSON.stringify(archive)}::jsonb)
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
  `;
  return res.json(archive);
});

// Ein einzelnes Medien-Item säubern.
function normalizeMediaItem(raw: unknown, i: number): HighlightMedia | null {
  const o = (raw ?? {}) as Record<string, unknown>;
  const url = normalizeUrl(o.url);
  if (!url) return null;
  const type = o.type === 'video' ? 'video' : 'image';
  const caption = str(o.caption).trim();
  const ratio = Number(o.ratio);
  return {
    id: str(o.id).trim() || `hl-${Date.now()}-${i}`,
    type,
    url,
    ...(caption ? { caption } : {}),
    ...(Number.isFinite(ratio) && ratio > 0 ? { ratio } : {}),
  };
}

function normalizeMediaList(raw: unknown): HighlightMedia[] {
  return (Array.isArray(raw) ? raw : [])
    .map((r, i) => normalizeMediaItem(r, i))
    .filter((m): m is HighlightMedia => !!m);
}

// Highlights säubern – inkl. Migration vom alten Format `{ clip, images }`
// bzw. `{ items }` (ohne Alben) auf `{ items, albums }`.
function normalizeHighlights(body: unknown) {
  const b = (body ?? {}) as Record<string, unknown>;

  if (Array.isArray(b.items) || Array.isArray(b.albums)) {
    const items = normalizeMediaList(b.items);
    const albums: HighlightAlbum[] = (Array.isArray(b.albums) ? b.albums : []).map((raw, i): HighlightAlbum => {
      const a = (raw ?? {}) as Record<string, unknown>;
      return {
        id: str(a.id).trim() || `alb-${Date.now()}-${i}`,
        title: str(a.title).trim() || `Ordner ${i + 1}`,
        items: normalizeMediaList(a.items),
      };
    });
    return { items, albums };
  }

  // Ur-Alt-Format: erst der Clip (als Video), dann die Bilder.
  const items: HighlightMedia[] = [];
  const clipRaw = b.clip;
  const clipUrl = normalizeUrl(
    typeof clipRaw === 'string' ? clipRaw : (clipRaw as Record<string, unknown> | null | undefined)?.url
  );
  if (clipUrl) items.push({ id: `hl-${Date.now()}-clip`, type: 'video', url: clipUrl });
  const rawImages = Array.isArray(b.images) ? b.images : [];
  rawImages.forEach((raw, i) => {
    const o = (raw ?? {}) as Record<string, unknown>;
    const url = normalizeUrl(o.url);
    if (!url) return;
    const caption = str(o.caption).trim();
    items.push({ id: str(o.id).trim() || `hl-${Date.now()}-${i}`, type: 'image', url, ...(caption ? { caption } : {}) });
  });
  return { items, albums: [] as HighlightAlbum[] };
}

const saveHighlights = requireAdmin(async (req: VercelRequest, res: VercelResponse) => {
  const cfg = normalizeHighlights(req.body);
  await sql`
    INSERT INTO settings (key, value) VALUES ('highlights', ${JSON.stringify(cfg)}::jsonb)
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
  `;
  return res.json(cfg);
});

// Ein Endpunkt für alle Website-Einstellungen (Twitch + Social Media + Event +
// Highlights), um unter dem Serverless-Funktionslimit (12) zu bleiben. Angesprochen
// über ?resource=social | event | highlights; Twitch ist die Vorgabe.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const resource = req.query.resource;

    if (req.method === 'GET') {
      res.setHeader('Cache-Control', 'no-store');
      if (resource === 'social') {
        const rows = await sql`SELECT value FROM settings WHERE key = 'social'`;
        return res.json(rows[0]?.value ?? DEFAULT_SOCIAL);
      }
      if (resource === 'event') {
        const rows = await sql`SELECT value FROM settings WHERE key = 'event'`;
        return res.json(toArchive(rows[0]?.value));
      }
      if (resource === 'highlights') {
        const rows = await sql`SELECT value FROM settings WHERE key = 'highlights'`;
        // Migration vom alten {clip,images}-Format erfolgt in normalizeHighlights.
        return res.json(rows[0]?.value ? normalizeHighlights(rows[0].value) : DEFAULT_HIGHLIGHTS);
      }
      const rows = await sql`SELECT value FROM settings WHERE key = 'twitch'`;
      return res.json(rows[0]?.value ?? DEFAULT_TWITCH);
    }
    if (req.method === 'POST') {
      if (resource === 'social') return saveSocial(req, res);
      if (resource === 'event') return saveEvent(req, res);
      if (resource === 'highlights') return saveHighlights(req, res);
      return saveTwitch(req, res);
    }
    return res.status(405).json({ error: 'Nicht unterstützt' });
  } catch (err) {
    console.error('Fehler in /api/twitch:', err);
    return res.status(500).json({ error: 'Interner Fehler' });
  }
}
