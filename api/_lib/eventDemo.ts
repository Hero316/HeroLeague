import { getTeams, sql } from './db.js';
import type { EventArchive, EventConfig, EventMatch, Player } from '../../src/types';

// ===========================================================================
// Testspiel-DEMO: füllt EIN separates „Demo"-Event mit Zufalls-Kadern,
// -Ergebnissen und getrackten Werten – analog zur Liga-Demo (api/_lib/demo.ts),
// aber komplett innerhalb des Event-Archivs und namensbasiert.
//
//  • Das echte Testspiel wird NIE verändert – die Demo ist ein eigenes Event
//    mit id-Präfix `event-demo-` und eigenen Spiel-IDs/Tracking-Schlüsseln.
//  • Sichtbar nur für Super-Admins: previewId zeigt auf das Demo-Event.
//  • Restlos entfernbar (removeEventDemo).
// ===========================================================================

const rand = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
const pick = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
const SCORE_POOL = [0, 0, 1, 1, 1, 2, 2, 2, 3, 3, 4, 5, 6];
const norm = (s: string) => s.toLowerCase().replace(/\./g, '').replace(/\s+/g, ' ').trim();

const sample = (arr: string[], k: number): string[] => {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, Math.max(0, Math.min(k, copy.length)));
};

function stripZero(o: Record<string, number>): Record<string, number> {
  const r: Record<string, number> = {};
  for (const k in o) if (o[k] > 0) r[k] = o[k];
  return r;
}
function demoFieldCounts(): Record<string, number> {
  return stripZero({
    pass_ok: rand(6, 26), pass_fail: rand(0, 8), key_pass: rand(0, 4), assist: rand(0, 2),
    shot_on: rand(0, 5), shot_miss: rand(0, 4), shot_blocked_off: rand(0, 2), goal: rand(0, 3),
    dribble_won: rand(0, 8), dribble_lost: rand(0, 5), duel_won: rand(2, 12), duel_lost: rand(0, 8),
    interception: rand(0, 6), shot_blocked_def: rand(0, 3), turnover: rand(0, 6),
  });
}
function demoKeeperCounts(conceded: number): Record<string, number> {
  return stripZero({
    pass_ok: rand(8, 22), pass_fail: rand(0, 5), save: rand(1, 9),
    gk_goal_against: Math.max(0, conceded), gk_position_save: rand(0, 4), penalty_save: rand(0, 1),
  });
}

// Torschützen (+ gelegentliche Vorlagen) in EVENT-Form (player/team).
function makeScorers(goals: number, teamName: string, names: string[]) {
  const out: { player: string; team: string; assist?: string }[] = [];
  for (let i = 0; i < goals && names.length; i++) {
    const scorer = pick(names);
    const assist =
      names.length > 1 && Math.random() < 0.55 ? names.filter((n) => n !== scorer)[Math.floor(Math.random() * (names.length - 1))] : undefined;
    out.push({ player: scorer, team: teamName, ...(assist ? { assist } : {}) });
  }
  return out;
}

function readArchive(value: unknown): EventArchive {
  const v = (value ?? {}) as Partial<EventArchive>;
  return {
    activeId: typeof v.activeId === 'string' ? v.activeId : null,
    previewId: typeof v.previewId === 'string' ? v.previewId : null,
    events: Array.isArray(v.events) ? (v.events as EventConfig[]) : [],
  };
}

// Kader eines Event-Teams für die Demo: eigener Event-Kader, sonst gleichnamiger
// Liga-Verein, sonst generische Demo-Spieler (damit Statistiken entstehen).
function rosterFor(source: EventConfig, teamName: string, leagueTeams: { name: string; shortName?: string; spielerliste?: Player[] }[]): Player[] {
  const own = source.rosters?.find((r) => norm(r.team) === norm(teamName))?.players;
  if (own && own.length) return own;
  const lg = leagueTeams.find((t) => norm(t.name) === norm(teamName))?.spielerliste;
  if (lg && lg.length) return lg;
  const short = teamName.split(/\s+/).map((w) => w[0] || '').join('').toUpperCase().slice(0, 3) || 'TEAM';
  return Array.from({ length: 10 }, (_, i) => ({ name: `${short} Spieler ${i + 1}` }));
}

// Demo befüllen: baut aus dem Quell-Event ein Demo-Event, schreibt Archiv +
// getrackte Werte + Freigabe. Gibt das aktualisierte Archiv zurück.
export async function createEventDemo(sourceEventId: string): Promise<EventArchive> {
  const leagueTeams = await getTeams();
  const rows = await sql`SELECT value FROM settings WHERE key = 'event'`;
  const archive = readArchive(rows[0]?.value);
  const events = archive.events;
  const source =
    events.find((e) => e.id === sourceEventId && !e.id.startsWith('event-demo-')) ??
    events.find((e) => !e.id.startsWith('event-demo-')) ??
    null;
  if (!source) throw new Error('Kein Testspiel zum Kopieren gefunden.');

  const stamp = Date.now();
  const demoId = `event-demo-${stamp}`;
  const teamNames = source.teams.length ? [...source.teams] : [...new Set(source.matches.flatMap((m) => [m.home, m.away]))];

  const rosterByTeam = new Map<string, Player[]>();
  const namesByTeam = new Map<string, string[]>();
  for (const name of teamNames) {
    const players = rosterFor(source, name, leagueTeams);
    rosterByTeam.set(name, players);
    namesByTeam.set(name, players.map((p) => p.name).filter(Boolean));
  }

  const teamKeeper = new Map<string, string>();
  for (const name of teamNames) {
    const ns = namesByTeam.get(name) ?? [];
    if (ns.length) teamKeeper.set(name, pick(ns));
  }

  // Anwesenheit je (Team, Block) – für alle Spiele desselben Blocks identisch,
  // damit sich Siegquoten je Spieler unterscheiden (beste Aufstellung).
  const attendance = new Map<string, string[]>();
  const presentFor = (teamName: string, block: number): string[] => {
    const key = `${teamName}:${block}`;
    const cached = attendance.get(key);
    if (cached) return cached;
    const names = namesByTeam.get(teamName) ?? [];
    const keeper = teamKeeper.get(teamName);
    const target = Math.min(names.length, rand(5, 7));
    let present: string[];
    if (names.length <= target || !keeper) present = [...names];
    else present = [keeper, ...sample(names.filter((n) => n !== keeper), target - 1)];
    attendance.set(key, present);
    return present;
  };

  const demoMatches: EventMatch[] = source.matches.map((m) => {
    const homePresent = presentFor(m.home, m.block);
    const awayPresent = presentFor(m.away, m.block);
    const homeNames = namesByTeam.get(m.home) ?? [];
    const awayNames = namesByTeam.get(m.away) ?? [];
    const absentees = [
      ...homeNames.filter((n) => !homePresent.includes(n)).map((player) => ({ player, team: m.home })),
      ...awayNames.filter((n) => !awayPresent.includes(n)).map((player) => ({ player, team: m.away })),
    ];
    const hs = pick(SCORE_POOL);
    const as = pick(SCORE_POOL);
    const scorers = [...makeScorers(hs, m.home, homePresent), ...makeScorers(as, m.away, awayPresent)];
    const bestPlayers = [
      ...(homePresent.length ? [{ player: pick(homePresent), team: m.home }] : []),
      ...(awayPresent.length ? [{ player: pick(awayPresent), team: m.away }] : []),
    ];
    const hk = teamKeeper.get(m.home) && homePresent.includes(teamKeeper.get(m.home)!) ? teamKeeper.get(m.home)! : homePresent[0];
    const ak = teamKeeper.get(m.away) && awayPresent.includes(teamKeeper.get(m.away)!) ? teamKeeper.get(m.away)! : awayPresent[0];
    const goalkeepers = [
      ...(hk ? [{ player: hk, team: m.home }] : []),
      ...(ak ? [{ player: ak, team: m.away }] : []),
    ];
    return {
      ...m,
      id: `${demoId}-${m.id}`,
      homeScore: hs,
      awayScore: as,
      status: 'beendet',
      liveStartedAt: null,
      pausedAt: null,
      durationMinutes: undefined,
      scorers,
      absentees,
      bestPlayers,
      goalkeepers,
    };
  });

  const demoEvent: EventConfig = {
    id: demoId,
    label: `Demo – ${source.label || source.title || 'Testspiel'}`,
    title: source.title || 'Testspieltag',
    tagline: source.tagline || '',
    dateLabel: source.dateLabel || '',
    date: source.date || '',
    location: source.location || '',
    teams: [...teamNames],
    rosters: teamNames.map((name) => ({ team: name, players: (rosterByTeam.get(name) || []).map((p) => ({ ...p })) })),
    matches: demoMatches,
  };

  const nextArchive: EventArchive = {
    activeId: archive.activeId ?? null,
    previewId: demoId, // nur für Super-Admins sichtbar
    events: events.filter((e) => !e.id.startsWith('event-demo-')).concat(demoEvent),
  };

  // Getrackte Demo-Werte je anwesendem Spieler (Noten/Quoten/Karten/Spielbericht).
  const dayKey = `event:${demoId}`;
  const statRows: { day_key: string; match_id: string; team_id: string; player_name: string; role: string; counts: Record<string, number> }[] = [];
  for (const m of demoMatches) {
    const sides = [
      { team: m.home, conceded: m.awayScore ?? 0 },
      { team: m.away, conceded: m.homeScore ?? 0 },
    ];
    for (const side of sides) {
      const present = presentFor(side.team, m.block);
      const keeper = (m.goalkeepers || []).find((g) => g.team === side.team)?.player;
      for (const name of present) {
        const isK = name === keeper;
        statRows.push({
          day_key: dayKey,
          match_id: m.id,
          team_id: side.team,
          player_name: name,
          role: isK ? 'keeper' : 'field',
          counts: isK ? demoKeeperCounts(side.conceded) : demoFieldCounts(),
        });
      }
    }
  }

  // Freigabe (tracking-live): alte Demo-Tage raus, diesen rein.
  const liveRows = await sql`SELECT value FROM settings WHERE key = 'tracking-live'`;
  const prevDays = Array.isArray((liveRows[0]?.value as { days?: unknown })?.days)
    ? ((liveRows[0].value as { days: unknown[] }).days.filter((d): d is string => typeof d === 'string'))
    : [];
  const days = prevDays.filter((d) => !d.startsWith('event:event-demo-')).concat(dayKey);

  const stmts = [] as ReturnType<typeof sql>[];
  stmts.push(sql`DELETE FROM match_player_stats WHERE day_key LIKE 'event:event-demo-%'`);
  stmts.push(
    sql`INSERT INTO settings (key, value) VALUES ('event', ${JSON.stringify(nextArchive)}::jsonb)
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`
  );
  if (statRows.length > 0) {
    stmts.push(sql`
      INSERT INTO match_player_stats (day_key, match_id, team_id, player_name, role, counts)
      SELECT day_key, match_id, team_id, player_name, role, counts
      FROM jsonb_to_recordset(${JSON.stringify(statRows)}::jsonb)
        AS x(day_key text, match_id text, team_id text, player_name text, role text, counts jsonb)
      ON CONFLICT (match_id, team_id, player_name) DO NOTHING`);
  }
  stmts.push(
    sql`INSERT INTO settings (key, value) VALUES ('tracking-live', ${JSON.stringify({ days })}::jsonb)
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`
  );
  await sql.transaction(stmts);

  return nextArchive;
}

// Demo restlos entfernen: Demo-Events raus, previewId ggf. löschen, getrackte
// Demo-Werte + Freigaben entfernen. Echtes Testspiel bleibt unberührt.
export async function removeEventDemo(): Promise<EventArchive> {
  const rows = await sql`SELECT value FROM settings WHERE key = 'event'`;
  const archive = readArchive(rows[0]?.value);
  const nextEvents = archive.events.filter((e) => !e.id.startsWith('event-demo-'));
  const previewId = archive.previewId && archive.previewId.startsWith('event-demo-') ? null : archive.previewId;
  const nextArchive: EventArchive = { activeId: archive.activeId ?? null, previewId, events: nextEvents };

  const liveRows = await sql`SELECT value FROM settings WHERE key = 'tracking-live'`;
  const prevDays = Array.isArray((liveRows[0]?.value as { days?: unknown })?.days)
    ? ((liveRows[0].value as { days: unknown[] }).days.filter((d): d is string => typeof d === 'string'))
    : [];
  const days = prevDays.filter((d) => !d.startsWith('event:event-demo-'));

  await sql.transaction([
    sql`DELETE FROM match_player_stats WHERE day_key LIKE 'event:event-demo-%'`,
    sql`INSERT INTO settings (key, value) VALUES ('event', ${JSON.stringify(nextArchive)}::jsonb)
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    sql`INSERT INTO settings (key, value) VALUES ('tracking-live', ${JSON.stringify({ days })}::jsonb)
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
  ]);

  return nextArchive;
}
