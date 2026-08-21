import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { EventArchive, EventMatch } from '../src/types';
import { createEventDemo, removeEventDemo } from './_lib/eventDemo.js';
import { sql, getTeams } from './_lib/db.js';
import { requireStaff, requireMatchWrite, requireSuperadmin, getSession } from './_lib/auth.js';

const DEFAULT_TWITCH = { channel: '', isLive: false };
const DEFAULT_SOCIAL = { instagram: '', tiktok: '', youtube: '' };

// Partner / Sponsoren-Logos (Sektion unten auf jeder Seite). Leere Liste =
// die Sektion erscheint gar nicht.
type PartnerTier = 'main' | 'bank' | 'normal';
type Partner = { id: string; name: string; logoUrl: string; linkUrl: string; tier: PartnerTier; label: string };
const DEFAULT_PARTNERS = { items: [] as Partner[] };

// Team-/Trikot-Sponsoren je Verein: Zuordnung Team-ID → Liste. Leerer Standard.
type TeamSponsor = { id: string; name: string; logoUrl: string; linkUrl: string; bg: string };
const DEFAULT_TEAM_SPONSORS: Record<string, TeamSponsor[]> = {};

// Hex-Farbe (#rgb oder #rrggbb) zulassen, sonst Vorgabe (Weiß).
function safeHexColor(input: unknown, fallback = '#ffffff'): string {
  if (typeof input !== 'string') return fallback;
  const t = input.trim();
  return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(t) ? t : fallback;
}
// Eigene Hintergrundbilder der drei Hero-Slides auf der Startseite. Leer =
// das eingebaute Standard-Design bleibt.
const DEFAULT_HERO = { match: '', pom: '', table: '' };
// Countdown auf der Startseite bis zum Anstoß. `target` ist eine lokale
// datetime-local-Zeichenkette (z. B. "2026-10-04T19:00"). active=false ⇒
// Startseite ist normal.
const DEFAULT_COUNTDOWN = { active: false, target: '2026-10-04T19:00', title: 'Till Season begins' };

// News-Laufband unter der Navigation: freie Kurz-Nachrichten, die im Ticker
// hinten an die automatischen Einträge angehängt werden. Leere Liste = normal.
type NewsItem = { id: string; text: string };
const DEFAULT_NEWS = { items: [] as NewsItem[] };

// Highlights: gemischte Medien-Liste (Bilder + Video-Links) + Ordner (Alben).
type HighlightMedia = { id: string; type: 'image' | 'video'; url: string; caption?: string; ratio?: number; featured?: boolean };
type HighlightAlbum = { id: string; title: string; items: HighlightMedia[]; cover?: string };
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
  date: '2026-08-02',
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
const DEFAULT_EVENT_ARCHIVE = { activeId: null as string | null, previewId: null as string | null, events: [DEFAULT_EVENT] };

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

const saveTwitch = requireStaff(async (req: VercelRequest, res: VercelResponse) => {
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

const saveSocial = requireStaff(async (req: VercelRequest, res: VercelResponse) => {
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

// Nur echte http(s)-Bild-URLs zulassen (kein javascript:/data: o. Ä.).
function safeImageUrl(input: unknown): string {
  if (typeof input !== 'string') return '';
  const t = input.trim();
  return /^https?:\/\//i.test(t) ? t : '';
}

// Partner-Logos speichern. NUR Super-Admin (nicht der Spiel-Admin).
const savePartners = requireSuperadmin(async (req: VercelRequest, res: VercelResponse) => {
  const rawItems = Array.isArray(req.body?.items) ? req.body.items : [];
  const items: Partner[] = rawItems
    .map((p: unknown, i: number) => {
      const o = (p ?? {}) as Record<string, unknown>;
      const id = typeof o.id === 'string' && o.id ? o.id : `partner-${Date.now()}-${i}`;
      // Stufe übernehmen; alte Datensätze mit `main:true` zu 'main' migrieren.
      const tier: PartnerTier =
        o.tier === 'main' || o.tier === 'bank' ? o.tier : o.main ? 'main' : 'normal';
      let label = typeof o.label === 'string' ? o.label.trim().slice(0, 60) : '';
      // Bankpartner ohne eigene Überschrift bekommen eine sinnvolle Vorgabe.
      if (tier === 'bank' && !label) label = 'Offizieller Bankpartner';
      return {
        id,
        name: typeof o.name === 'string' ? o.name.trim().slice(0, 80) : '',
        logoUrl: safeImageUrl(o.logoUrl),
        linkUrl: normalizeUrl(o.linkUrl),
        tier,
        label,
      };
    })
    // Ohne Logo ergibt ein Partner keinen Sinn – solche Einträge verwerfen.
    .filter((p: Partner) => p.logoUrl);
  const cfg = { items };

  await sql`
    INSERT INTO settings (key, value) VALUES ('partners', ${JSON.stringify(cfg)}::jsonb)
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
  `;

  return res.json(cfg);
});

// Team-/Trikot-Sponsoren speichern. NUR Super-Admin (wie die Klub-/Kaderpflege).
// Body: { [teamId]: TeamSponsor[] }. Sponsoren ohne Logo werden verworfen,
// leere Team-Listen fallen weg.
const saveTeamSponsors = requireSuperadmin(async (req: VercelRequest, res: VercelResponse) => {
  const raw = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? (req.body as Record<string, unknown>) : {};
  const out: Record<string, TeamSponsor[]> = {};
  for (const [teamId, list] of Object.entries(raw)) {
    if (typeof teamId !== 'string' || !Array.isArray(list)) continue;
    const cleaned: TeamSponsor[] = list
      .map((s: unknown, i: number) => {
        const o = (s ?? {}) as Record<string, unknown>;
        return {
          id: typeof o.id === 'string' && o.id ? o.id : `s-${Date.now()}-${i}`,
          name: typeof o.name === 'string' ? o.name.trim().slice(0, 80) : '',
          logoUrl: safeImageUrl(o.logoUrl),
          linkUrl: normalizeUrl(o.linkUrl),
          bg: safeHexColor(o.bg),
        };
      })
      .filter((s: TeamSponsor) => s.logoUrl);
    if (cleaned.length) out[teamId] = cleaned;
  }

  await sql`
    INSERT INTO settings (key, value) VALUES ('team-sponsors', ${JSON.stringify(out)}::jsonb)
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
  `;

  return res.json(out);
});

// Hero-Hintergrundbilder speichern (nur http(s)-URLs; leere Felder = Standard).
const saveHero = requireStaff(async (req: VercelRequest, res: VercelResponse) => {
  const { match, pom, table } = req.body ?? {};
  const pick = (v: unknown) => {
    const url = normalizeUrl(v);
    return /^https?:\/\//i.test(url) ? url : '';
  };
  const cfg = { match: pick(match), pom: pick(pom), table: pick(table) };

  await sql`
    INSERT INTO settings (key, value) VALUES ('hero', ${JSON.stringify(cfg)}::jsonb)
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
  `;

  return res.json(cfg);
});

// Countdown-Konfiguration speichern.
const saveCountdown = requireStaff(async (req: VercelRequest, res: VercelResponse) => {
  const b = req.body ?? {};
  const target = typeof b.target === 'string' && b.target.trim() ? b.target.trim().slice(0, 40) : DEFAULT_COUNTDOWN.target;
  const cfg = {
    active: Boolean(b.active),
    target,
    title: typeof b.title === 'string' ? b.title.trim().slice(0, 60) : DEFAULT_COUNTDOWN.title,
  };

  await sql`
    INSERT INTO settings (key, value) VALUES ('countdown', ${JSON.stringify(cfg)}::jsonb)
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
  `;

  return res.json(cfg);
});

// News-Liste säubern: nur Einträge mit Text übernehmen, jeweils gekürzt.
function normalizeNews(body: unknown) {
  const b = (body ?? {}) as Record<string, unknown>;
  const raw = Array.isArray(b.items) ? b.items : [];
  const items: NewsItem[] = raw
    .map((r, i) => {
      const o = (r ?? {}) as Record<string, unknown>;
      const text = (typeof o.text === 'string' ? o.text : '').trim().slice(0, 280);
      const id = typeof o.id === 'string' && o.id.trim() ? o.id.trim() : `news-${Date.now()}-${i}`;
      return { id, text };
    })
    .filter((n) => n.text)
    .slice(0, 30);
  return { items };
}

const saveNews = requireStaff(async (req: VercelRequest, res: VercelResponse) => {
  const cfg = normalizeNews(req.body);
  await sql`
    INSERT INTO settings (key, value) VALUES ('news', ${JSON.stringify(cfg)}::jsonb)
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
    // Echtes Kalenderdatum (YYYY-MM-DD) für die Aufgaben-Kalender-Markierung.
    date: /^\d{4}-\d{2}-\d{2}$/.test(str(b.date).trim()) ? str(b.date).trim() : '',
    location: str(b.location).trim(),
    teams: Array.isArray(b.teams) ? b.teams.map((t) => str(t).trim()).filter(Boolean) : [],
    // Eigener Kader je Event-Team (namensbasiert, getrennt von der Liga).
    rosters: (Array.isArray(b.rosters) ? b.rosters : [])
      .map((raw) => {
        const r = (raw ?? {}) as Record<string, unknown>;
        const players = (Array.isArray(r.players) ? r.players : [])
          .map((praw) => {
            const p = (praw ?? {}) as Record<string, unknown>;
            const num = Number(p.number);
            const player: Record<string, unknown> = { name: str(p.name).trim() };
            const img = str(p.imageUrl).trim();
            if (img) player.imageUrl = img;
            if (str(p.number) !== '' && Number.isFinite(num)) player.number = Math.trunc(num);
            if (p.goalkeeper) player.goalkeeper = true;
            if (p.captain) player.captain = true;
            return player;
          })
          .filter((p) => p.name);
        return { team: str(r.team).trim(), players };
      })
      .filter((r) => r.team),
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
        durationMinutes: Number.isFinite(Number(m.durationMinutes)) && str(m.durationMinutes) !== '' ? Math.max(1, Math.min(120, Math.trunc(Number(m.durationMinutes)))) : undefined,
        pausedAt: typeof m.pausedAt === 'string' ? m.pausedAt : null,
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
  const previewId = typeof b.previewId === 'string' && ids.has(b.previewId) ? b.previewId : null;
  return { activeId, previewId, events };
}

// Gespeicherten Wert in ein Archiv umwandeln – inkl. Migration vom alten
// Einzel-Event-Format (ohne `events`-Liste) auf das neue Archiv-Format.
function toArchive(stored: unknown) {
  if (!stored || typeof stored !== 'object') return DEFAULT_EVENT_ARCHIVE;
  const s = stored as Record<string, unknown>;
  if (Array.isArray(s.events)) return normalizeArchive(s);
  // Alt-Format: ein einzelnes Event -> in ein Archiv verpacken.
  const single = normalizeEvent(s, 0);
  return { activeId: s.active ? single.id : null, previewId: null, events: [single] };
}

const saveEvent = requireStaff(async (req: VercelRequest, res: VercelResponse) => {
  const archive = normalizeArchive(req.body);
  await sql`
    INSERT INTO settings (key, value) VALUES ('event', ${JSON.stringify(archive)}::jsonb)
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
  `;
  return res.json(archive);
});

// Ein EINZELNES Event-Spiel aktualisieren (Schiedsrichtermodus: live schalten,
// Tore, bester Spieler, Pause/Abpfiff). Bewusst match-granular und mit
// requireMatchWrite, damit auch Schiedsrichter (nicht nur Staff) Testspiele
// live pfeifen dürfen – ohne das komplette Event-Archiv überschreiben zu können.
const saveEventMatch = requireMatchWrite(async (req: VercelRequest, res: VercelResponse) => {
  const b = (req.body ?? {}) as { eventId?: unknown; matchId?: unknown; patch?: unknown };
  const eventId = str(b.eventId).trim();
  const matchId = str(b.matchId).trim();
  if (!eventId || !matchId) return res.status(400).json({ error: 'eventId und matchId sind Pflicht.' });
  const patch = (b.patch && typeof b.patch === 'object' ? b.patch : {}) as Record<string, unknown>;

  const rows = await sql`SELECT value FROM settings WHERE key = 'event'`;
  const archive = toArchive(rows[0]?.value) as EventArchive;
  const ev = archive.events.find((e) => e.id === eventId);
  if (!ev) return res.status(404).json({ error: 'Testspiel nicht gefunden.' });
  const m = ev.matches.find((mm) => mm.id === matchId) as EventMatch | undefined;
  if (!m) return res.status(404).json({ error: 'Spiel nicht gefunden.' });

  // Match-Form (playerName/teamId) -> Event-Form (player/team).
  const mapScorers = (v: unknown) =>
    (Array.isArray(v) ? v : [])
      .map((raw) => {
        const o = (raw ?? {}) as Record<string, unknown>;
        const out: { player: string; team: string; assist?: string } = {
          player: str(o.playerName ?? o.player).trim(),
          team: str(o.teamId ?? o.team).trim(),
        };
        const assist = str(o.assistName ?? o.assist).trim();
        if (assist) out.assist = assist;
        return out;
      })
      .filter((s) => s.team);
  const mapAwards = (v: unknown) =>
    (Array.isArray(v) ? v : [])
      .map((raw) => {
        const o = (raw ?? {}) as Record<string, unknown>;
        return { player: str(o.playerName ?? o.player).trim(), team: str(o.teamId ?? o.team).trim() };
      })
      .filter((a) => a.team);

  if ('homeScore' in patch) m.homeScore = toScore(patch.homeScore);
  if ('awayScore' in patch) m.awayScore = toScore(patch.awayScore);
  if ('scorers' in patch) m.scorers = mapScorers(patch.scorers);
  if ('bestPlayers' in patch) m.bestPlayers = mapAwards(patch.bestPlayers);
  if ('goalkeepers' in patch) m.goalkeepers = mapAwards(patch.goalkeepers);
  if ('absentees' in patch) m.absentees = mapAwards(patch.absentees);
  if ('durationMinutes' in patch) {
    const d = Number(patch.durationMinutes);
    if (Number.isFinite(d)) m.durationMinutes = Math.max(1, Math.min(120, Math.trunc(d)));
  }

  // Live-Logik wie bei den echten Spielen (liveStartedAt / pausedAt).
  if ('status' in patch) {
    const status = (['geplant', 'live', 'beendet'].includes(str(patch.status)) ? str(patch.status) : m.status) as EventMatch['status'];
    m.status = status;
    if (status === 'live') {
      if (!m.liveStartedAt) m.liveStartedAt = new Date().toISOString();
    } else {
      m.liveStartedAt = null;
      m.pausedAt = null;
    }
  }
  if ('pausedAt' in patch) {
    const wasPaused = m.pausedAt;
    const now = typeof patch.pausedAt === 'string' ? patch.pausedAt : null;
    if (now === null && wasPaused && m.liveStartedAt) {
      const pausedMs = Date.now() - new Date(wasPaused).getTime();
      if (pausedMs > 0) m.liveStartedAt = new Date(new Date(m.liveStartedAt).getTime() + pausedMs).toISOString();
    }
    m.pausedAt = now;
  }

  const next = normalizeArchive(archive);
  await sql`
    INSERT INTO settings (key, value) VALUES ('event', ${JSON.stringify(next)}::jsonb)
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
  `;
  return res.json(next);
});

// Testspiel-Demo befüllen/entfernen (nur Super-Admin). Legt ein separates
// Demo-Event an (nur für Super-Admins sichtbar), lässt das echte Testspiel in Ruhe.
const eventDemo = requireSuperadmin(async (req: VercelRequest, res: VercelResponse) => {
  const b = (req.body ?? {}) as { action?: unknown; sourceEventId?: unknown };
  try {
    if (str(b.action) === 'remove') return res.json(await removeEventDemo());
    return res.json(await createEventDemo(str(b.sourceEventId).trim()));
  } catch (err) {
    return res.status(400).json({ error: err instanceof Error ? err.message : 'Demo-Fehler' });
  }
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
    ...(o.featured === true ? { featured: true } : {}),
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
      const cover = normalizeUrl(a.cover);
      return {
        id: str(a.id).trim() || `alb-${Date.now()}-${i}`,
        title: str(a.title).trim() || `Ordner ${i + 1}`,
        items: normalizeMediaList(a.items),
        ...(cover ? { cover } : {}),
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

const saveHighlights = requireStaff(async (req: VercelRequest, res: VercelResponse) => {
  const cfg = normalizeHighlights(req.body);
  await sql`
    INSERT INTO settings (key, value) VALUES ('highlights', ${JSON.stringify(cfg)}::jsonb)
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
  `;
  return res.json(cfg);
});

// --- Abend-Aufstellung (Schiedsrichtermodus) -------------------------------
// Pro Spieltag-Abend wird je Team festgelegt, wer anwesend ist und wer im Tor
// steht, plus die Spieldauer (Countdown). Alles liegt in EINEM settings-Eintrag
// (key 'roster'), Schlüssel `${seasonId}:${matchday}`. Beim Speichern wird die
// Aufstellung zusätzlich auf die Einzelspiele übertragen (Abwesende = Kader
// minus anwesend, Torwart je Team), damit Tabelle/Statistik/Punkte stimmen.
type RosterEntry = { playerName: string; teamId: string };
type RosterTeamIn = { present: string[]; goalkeeper?: string };

function normalizeRosterPayload(body: unknown) {
  const b = (body ?? {}) as Record<string, unknown>;
  const teamsRaw = (b.teams ?? {}) as Record<string, unknown>;
  const teams: Record<string, RosterTeamIn> = {};
  for (const [teamId, val] of Object.entries(teamsRaw)) {
    const o = (val ?? {}) as Record<string, unknown>;
    const present = Array.isArray(o.present) ? o.present.map((p) => str(p).trim()).filter(Boolean) : [];
    const goalkeeper = str(o.goalkeeper).trim();
    teams[teamId] = goalkeeper ? { present, goalkeeper } : { present };
  }
  // Optionale Trikotnummern-Änderungen: teamId → Spielername → Nummer|null.
  const numbersRaw = (b.numbers ?? {}) as Record<string, unknown>;
  const numbers: Record<string, Record<string, number | null>> = {};
  for (const [teamId, val] of Object.entries(numbersRaw)) {
    const o = (val ?? {}) as Record<string, unknown>;
    const map: Record<string, number | null> = {};
    for (const [name, num] of Object.entries(o)) {
      const nm = str(name).trim();
      if (!nm) continue;
      if (num === null) map[nm] = null;
      else {
        const n = Number(num);
        if (Number.isFinite(n)) map[nm] = Math.min(999, Math.max(0, Math.floor(n)));
      }
    }
    if (Object.keys(map).length) numbers[teamId] = map;
  }
  const matchdayNum = Number(b.matchday);
  const minutesNum = Number(b.minutes);
  return {
    seasonId: str(b.seasonId).trim(),
    matchday: Number.isInteger(matchdayNum) ? matchdayNum : NaN,
    minutes: Number.isFinite(minutesNum) ? Math.min(120, Math.max(1, Math.floor(minutesNum))) : 7,
    teams,
    numbers,
  };
}

const saveRoster = requireMatchWrite(async (req: VercelRequest, res: VercelResponse) => {
  const { seasonId, matchday, minutes, teams, numbers } = normalizeRosterPayload(req.body);
  if (!seasonId || !Number.isInteger(matchday) || matchday < 1 || matchday > 99) {
    return res.status(400).json({ error: 'Ungültige Saison/Spieltag-Angabe.' });
  }

  // 1) Aufstellung im settings-Speicher ablegen (Schlüssel season:matchday).
  const rows = await sql`SELECT value FROM settings WHERE key = 'roster'`;
  const stored = rows[0]?.value;
  const map = (stored && typeof stored === 'object' ? stored : {}) as Record<string, unknown>;
  map[`${seasonId}:${matchday}`] = { minutes, teams };
  await sql`
    INSERT INTO settings (key, value) VALUES ('roster', ${JSON.stringify(map)}::jsonb)
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
  `;

  // 2) Auf die Einzelspiele übertragen (nur die Teams aus der Aufstellung; der
  //    Gegner und bereits erfasste Torschützen/beste Spieler bleiben unberührt).
  const allTeams = await getTeams();
  const kaderOf = (teamId: string) =>
    (allTeams.find((t) => t.id === teamId)?.spielerliste ?? []).map((p) => p.name);
  const matchRows = (await sql`
    SELECT id, home_team_id AS "homeTeamId", away_team_id AS "awayTeamId", absentees, goalkeepers
    FROM matches WHERE season_id = ${seasonId} AND matchday = ${matchday}
  `) as { id: string; homeTeamId: string; awayTeamId: string; absentees: RosterEntry[]; goalkeepers: RosterEntry[] }[];

  for (const m of matchRows) {
    let absentees: RosterEntry[] = Array.isArray(m.absentees) ? m.absentees : [];
    let goalkeepers: RosterEntry[] = Array.isArray(m.goalkeepers) ? m.goalkeepers : [];
    for (const teamId of [m.homeTeamId, m.awayTeamId]) {
      const roster = teams[teamId];
      if (!roster) continue;
      const present = new Set(roster.present);
      const teamAbsent = kaderOf(teamId)
        .filter((n) => !present.has(n))
        .map((n) => ({ playerName: n, teamId }));
      absentees = absentees.filter((a) => a.teamId !== teamId).concat(teamAbsent);
      goalkeepers = goalkeepers.filter((g) => g.teamId !== teamId);
      if (roster.goalkeeper && present.has(roster.goalkeeper)) {
        goalkeepers.push({ playerName: roster.goalkeeper, teamId });
      }
    }
    await sql`
      UPDATE matches
      SET absentees = ${JSON.stringify(absentees)}::jsonb,
          goalkeepers = ${JSON.stringify(goalkeepers)}::jsonb,
          duration_minutes = ${minutes}
      WHERE id = ${m.id}
    `;
  }

  // 3) Optional: Trikotnummern anpassen (nur übergebene Teams/Spieler). Nummer|null
  //    ⇒ setzen bzw. entfernen. Übrige Kaderdaten (Name, Foto) bleiben unberührt.
  for (const [teamId, map] of Object.entries(numbers)) {
    const team = allTeams.find((t) => t.id === teamId);
    if (!team) continue;
    let changed = false;
    const roster = (team.spielerliste ?? []).map((p) => {
      if (!Object.prototype.hasOwnProperty.call(map, p.name)) return p;
      const next = map[p.name] === null ? undefined : (map[p.name] as number);
      if (next === p.number) return p;
      changed = true;
      const base: { name: string; imageUrl?: string; number?: number } = { name: p.name };
      if (p.imageUrl) base.imageUrl = p.imageUrl;
      if (next !== undefined) base.number = next;
      return base;
    });
    if (changed) {
      await sql`UPDATE teams SET spielerliste = ${JSON.stringify(roster)}::jsonb WHERE id = ${teamId}`;
    }
  }

  return res.json({ ok: true, minutes, teams });
});

// --- Mini-Game „Hero Kicker" – Bestenliste ---------------------------------
// Pro Nutzer eine Bilanz gegen die KI (Spiele/Siege/Tore), abgelegt in EINEM
// settings-Eintrag (key 'game'), Schlüssel = userId. Identität kommt aus der
// Login-Session (nicht aus dem Body) – niemand kann sich als jemand anderes
// eintragen. Gelesen wird als sortierte Rangliste, jeder sieht die Scores der
// anderen.
type GameStat = {
  name: string;
  plays: number;
  wins: number;
  draws: number;
  losses: number;
  gf: number; // erzielte Tore gesamt
  ga: number; // kassierte Tore gesamt
  bestWin: number; // größte Tordifferenz in einem Sieg
  updatedAt: string;
};

function emptyGameStat(name: string): GameStat {
  return { name, plays: 0, wins: 0, draws: 0, losses: 0, gf: 0, ga: 0, bestWin: 0, updatedAt: '' };
}

// Punkte für die Rangliste: 3 pro Sieg, 1 pro Remis; Tordifferenz als Feinsortierung.
function gamePoints(s: GameStat): number {
  return s.wins * 3 + s.draws;
}

// Gespeicherte Map (userId → GameStat) in eine sortierte Rangliste umwandeln.
function toGameBoard(stored: unknown) {
  const map = (stored && typeof stored === 'object' ? stored : {}) as Record<string, Partial<GameStat>>;
  const rows = Object.entries(map).map(([userId, v]) => {
    const s = { ...emptyGameStat(str(v?.name)), ...v } as GameStat;
    return {
      userId,
      name: str(s.name) || 'Spieler',
      plays: Math.max(0, Math.floor(Number(s.plays) || 0)),
      wins: Math.max(0, Math.floor(Number(s.wins) || 0)),
      draws: Math.max(0, Math.floor(Number(s.draws) || 0)),
      losses: Math.max(0, Math.floor(Number(s.losses) || 0)),
      gf: Math.max(0, Math.floor(Number(s.gf) || 0)),
      ga: Math.max(0, Math.floor(Number(s.ga) || 0)),
      bestWin: Math.max(0, Math.floor(Number(s.bestWin) || 0)),
      points: 0,
    };
  });
  rows.forEach((r) => (r.points = r.wins * 3 + r.draws));
  rows.sort(
    (a, b) => b.points - a.points || b.wins - a.wins || (b.gf - b.ga) - (a.gf - a.ga) || b.gf - a.gf
  );
  return rows;
}

const saveGame = async (req: VercelRequest, res: VercelResponse) => {
  const session = await getSession(req);
  if (!session) return res.status(401).json({ error: 'Nicht angemeldet' });

  const b = (req.body ?? {}) as Record<string, unknown>;
  const result = b.result === 'win' || b.result === 'draw' || b.result === 'loss' ? b.result : null;
  const gf = toScore(b.gf) ?? 0;
  const ga = toScore(b.ga) ?? 0;
  if (!result) return res.status(400).json({ error: 'Ungültiges Ergebnis.' });

  const rows = await sql`SELECT value FROM settings WHERE key = 'game'`;
  const map = (rows[0]?.value && typeof rows[0].value === 'object' ? rows[0].value : {}) as Record<string, GameStat>;
  const prev = map[session.userId] ?? emptyGameStat(session.name);
  const next: GameStat = {
    name: session.name || prev.name || 'Spieler',
    plays: (Number(prev.plays) || 0) + 1,
    wins: (Number(prev.wins) || 0) + (result === 'win' ? 1 : 0),
    draws: (Number(prev.draws) || 0) + (result === 'draw' ? 1 : 0),
    losses: (Number(prev.losses) || 0) + (result === 'loss' ? 1 : 0),
    gf: (Number(prev.gf) || 0) + gf,
    ga: (Number(prev.ga) || 0) + ga,
    bestWin: Math.max(Number(prev.bestWin) || 0, result === 'win' ? gf - ga : 0),
    updatedAt: new Date().toISOString(),
  };
  map[session.userId] = next;

  await sql`
    INSERT INTO settings (key, value) VALUES ('game', ${JSON.stringify(map)}::jsonb)
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
  `;

  return res.json({ me: { userId: session.userId, ...next, points: gamePoints(next) }, board: toGameBoard(map) });
};

// --- Sponsor-/Partner-Klicks (Analytics) -----------------------------------
// Zählt, wie oft die einzelnen Sponsoren angeklickt werden – EGAL wo (Partner-
// Leiste unten, „Spieler des Spieltages", Team-Seiten, künftige Platzierungen).
// Alles in EINEM settings-Eintrag (key 'sponsor-clicks'), Schlüssel = Sponsor-ID.
// Neue Sponsoren/Platzierungen legen sich beim ersten Klick automatisch selbst an.
// WICHTIG: Der Zähl-POST ist bewusst ÖFFENTLICH (Website-Besucher sind nicht
// eingeloggt). Er kann ausschließlich Zähler hochzählen; Größen- und Anzahl-
// Limits schützen vor Missbrauch. Die Auswertung (GET) ist login-geschützt.
const SPONSOR_MAX = 800; // max. verschiedene Sponsoren
const PLACEMENT_MAX = 40; // max. Platzierungen je Sponsor

const trackSponsorClick = async (req: VercelRequest, res: VercelResponse) => {
  const b = (req.body ?? {}) as Record<string, unknown>;
  const id = str(b.sponsorId).trim().slice(0, 80);
  if (!id) return res.status(400).json({ error: 'sponsorId fehlt' });
  const name = str(b.name).trim().slice(0, 80);
  const placement = (str(b.placement).trim().slice(0, 40)) || 'unbekannt';

  const rows = await sql`SELECT value FROM settings WHERE key = 'sponsor-clicks'`;
  const map = (rows[0]?.value && typeof rows[0].value === 'object' ? rows[0].value : {}) as Record<
    string,
    { name: string; total: number; placements: Record<string, number>; lastAt: string }
  >;
  // Schutz vor Missbrauch: keine unbegrenzt neuen Schlüssel zulassen.
  if (!map[id] && Object.keys(map).length >= SPONSOR_MAX) return res.json({ ok: true });

  const e = map[id] && typeof map[id] === 'object' ? map[id] : { name: '', total: 0, placements: {}, lastAt: '' };
  e.name = name || e.name || 'Sponsor';
  e.total = (Number(e.total) || 0) + 1;
  if (!e.placements || typeof e.placements !== 'object') e.placements = {};
  if (e.placements[placement] !== undefined || Object.keys(e.placements).length < PLACEMENT_MAX) {
    e.placements[placement] = (Number(e.placements[placement]) || 0) + 1;
  }
  e.lastAt = new Date().toISOString();
  map[id] = e;

  await sql`
    INSERT INTO settings (key, value) VALUES ('sponsor-clicks', ${JSON.stringify(map)}::jsonb)
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
  `;
  return res.json({ ok: true });
};

// Ein Endpunkt für alle Website-Einstellungen (Twitch + Social Media + Event +
// Highlights + News), um unter dem Serverless-Funktionslimit (12) zu bleiben.
// Angesprochen über ?resource=social | event | highlights | hero | countdown |
// news | roster | game | sponsor-clicks (GET) | sponsor-click (POST);
// Twitch ist die Vorgabe.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const resource = req.query.resource;

    if (req.method === 'GET') {
      res.setHeader('Cache-Control', 'no-store');
      if (resource === 'social') {
        const rows = await sql`SELECT value FROM settings WHERE key = 'social'`;
        return res.json(rows[0]?.value ?? DEFAULT_SOCIAL);
      }
      if (resource === 'partners') {
        const rows = await sql`SELECT value FROM settings WHERE key = 'partners'`;
        return res.json(rows[0]?.value ?? DEFAULT_PARTNERS);
      }
      if (resource === 'team-sponsors') {
        const rows = await sql`SELECT value FROM settings WHERE key = 'team-sponsors'`;
        return res.json(rows[0]?.value ?? DEFAULT_TEAM_SPONSORS);
      }
      if (resource === 'event') {
        const rows = await sql`SELECT value FROM settings WHERE key = 'event'`;
        const archive = toArchive(rows[0]?.value) as EventArchive;
        // Test-Event (previewId) NUR an Super-Admins ausliefern; für alle anderen
        // komplett aus der Antwort entfernen, damit nichts durchsickert.
        if (archive.previewId && archive.activeId !== archive.previewId) {
          const session = await getSession(req);
          if (session?.role !== 'superadmin') {
            return res.json({
              activeId: archive.activeId,
              previewId: null,
              events: archive.events.filter((e) => e.id !== archive.previewId),
            });
          }
        }
        return res.json(archive);
      }
      if (resource === 'highlights') {
        const rows = await sql`SELECT value FROM settings WHERE key = 'highlights'`;
        // Migration vom alten {clip,images}-Format erfolgt in normalizeHighlights.
        return res.json(rows[0]?.value ? normalizeHighlights(rows[0].value) : DEFAULT_HIGHLIGHTS);
      }
      if (resource === 'hero') {
        const rows = await sql`SELECT value FROM settings WHERE key = 'hero'`;
        return res.json({ ...DEFAULT_HERO, ...(rows[0]?.value ?? {}) });
      }
      if (resource === 'countdown') {
        const rows = await sql`SELECT value FROM settings WHERE key = 'countdown'`;
        return res.json({ ...DEFAULT_COUNTDOWN, ...(rows[0]?.value ?? {}) });
      }
      if (resource === 'news') {
        const rows = await sql`SELECT value FROM settings WHERE key = 'news'`;
        return res.json(rows[0]?.value ? normalizeNews(rows[0].value) : DEFAULT_NEWS);
      }
      if (resource === 'roster') {
        const rows = await sql`SELECT value FROM settings WHERE key = 'roster'`;
        return res.json(rows[0]?.value ?? {});
      }
      if (resource === 'game') {
        const rows = await sql`SELECT value FROM settings WHERE key = 'game'`;
        return res.json({ board: toGameBoard(rows[0]?.value) });
      }
      if (resource === 'sponsor-clicks') {
        // Auswertung nur für Super-Admin und Spiel-Admin (interne Analytics).
        const session = await getSession(req);
        if (!session) return res.status(401).json({ error: 'Nicht angemeldet' });
        if (session.role !== 'superadmin' && session.role !== 'match_admin') {
          return res.status(403).json({ error: 'Keine Berechtigung für diese Auswertung.' });
        }
        const rows = await sql`SELECT value FROM settings WHERE key = 'sponsor-clicks'`;
        return res.json(rows[0]?.value ?? {});
      }
      const rows = await sql`SELECT value FROM settings WHERE key = 'twitch'`;
      return res.json(rows[0]?.value ?? DEFAULT_TWITCH);
    }
    if (req.method === 'POST') {
      if (resource === 'social') return saveSocial(req, res);
      if (resource === 'partners') return savePartners(req, res);
      if (resource === 'team-sponsors') return saveTeamSponsors(req, res);
      if (resource === 'event') return saveEvent(req, res);
      if (resource === 'event-match') return saveEventMatch(req, res);
      if (resource === 'event-demo') return eventDemo(req, res);
      if (resource === 'highlights') return saveHighlights(req, res);
      if (resource === 'hero') return saveHero(req, res);
      if (resource === 'countdown') return saveCountdown(req, res);
      if (resource === 'news') return saveNews(req, res);
      if (resource === 'roster') return saveRoster(req, res);
      if (resource === 'game') return saveGame(req, res);
      if (resource === 'sponsor-click') return trackSponsorClick(req, res);
      return saveTwitch(req, res);
    }
    return res.status(405).json({ error: 'Nicht unterstützt' });
  } catch (err) {
    console.error('Fehler in /api/twitch:', err);
    return res.status(500).json({ error: 'Interner Fehler' });
  }
}
