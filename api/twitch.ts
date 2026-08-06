import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sql, getTeams } from './_lib/db.js';
import { requireStaff, requireMatchWrite, requireSuperadmin } from './_lib/auth.js';

const DEFAULT_TWITCH = { channel: '', isLive: false };
const DEFAULT_SOCIAL = { instagram: '', tiktok: '', youtube: '' };

// Partner / Sponsoren-Logos (Sektion unten auf jeder Seite). Leere Liste =
// die Sektion erscheint gar nicht.
type PartnerTier = 'main' | 'bank' | 'normal';
type Partner = { id: string; name: string; logoUrl: string; linkUrl: string; tier: PartnerTier; label: string };
const DEFAULT_PARTNERS = { items: [] as Partner[] };
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

const saveEvent = requireStaff(async (req: VercelRequest, res: VercelResponse) => {
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

// Ein Endpunkt für alle Website-Einstellungen (Twitch + Social Media + Event +
// Highlights + News), um unter dem Serverless-Funktionslimit (12) zu bleiben.
// Angesprochen über ?resource=social | event | highlights | hero | countdown |
// news | roster; Twitch ist die Vorgabe.
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
      if (resource === 'event') {
        const rows = await sql`SELECT value FROM settings WHERE key = 'event'`;
        return res.json(toArchive(rows[0]?.value));
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
      const rows = await sql`SELECT value FROM settings WHERE key = 'twitch'`;
      return res.json(rows[0]?.value ?? DEFAULT_TWITCH);
    }
    if (req.method === 'POST') {
      if (resource === 'social') return saveSocial(req, res);
      if (resource === 'partners') return savePartners(req, res);
      if (resource === 'event') return saveEvent(req, res);
      if (resource === 'highlights') return saveHighlights(req, res);
      if (resource === 'hero') return saveHero(req, res);
      if (resource === 'countdown') return saveCountdown(req, res);
      if (resource === 'news') return saveNews(req, res);
      if (resource === 'roster') return saveRoster(req, res);
      return saveTwitch(req, res);
    }
    return res.status(405).json({ error: 'Nicht unterstützt' });
  } catch (err) {
    console.error('Fehler in /api/twitch:', err);
    return res.status(500).json({ error: 'Interner Fehler' });
  }
}
