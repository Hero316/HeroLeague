import type { Player, Team } from '../../src/types';
import { getTeams, getMatches, getCurrentSeason, sql } from './db.js';

// Demo-Modus: legt eine komplette, per Zufall gefuellte Kopie (Teams + Kader +
// eigene Saison mit Ergebnissen) an, die sich an-/ausschalten laesst. Die echte
// Saison wird dabei NIE angefasst – die Demo besteht aus eigenen Zeilen mit
// eigenen IDs und wird beim Deaktivieren restlos wieder entfernt.

export interface DemoState {
  active: boolean;
  seasonId: string;
  teamIds: string[];
}

const EMPTY: DemoState = { active: false, seasonId: '', teamIds: [] };

export async function readDemo(): Promise<DemoState> {
  const rows = await sql`SELECT value FROM settings WHERE key = 'demo'`;
  const v = rows[0]?.value as Partial<DemoState> | undefined;
  if (!v) return EMPTY;
  return {
    active: Boolean(v.active),
    seasonId: typeof v.seasonId === 'string' ? v.seasonId : '',
    teamIds: Array.isArray(v.teamIds) ? v.teamIds.filter((x): x is string => typeof x === 'string') : [],
  };
}

const rand = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
const pick = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
// Ergebnis-Verteilung: eher niedrige Tore, gelegentlich hoehere.
const SCORE_POOL = [0, 0, 1, 1, 1, 2, 2, 2, 3, 3, 4, 5, 6];

function rosterNames(team: Team): string[] {
  const names = (team.spielerliste || []).map((p) => p.name).filter(Boolean);
  if (names.length > 0) return names;
  // Kein Kader hinterlegt -> generische Demo-Spieler, damit Statistiken entstehen
  return Array.from({ length: 10 }, (_, i) => `${team.shortName || 'Team'} Spieler ${i + 1}`);
}

// Baut Torschuetzen (+ gelegentliche Vorlagen) fuer eine Anzahl Tore eines Teams.
function makeScorers(goals: number, teamId: string, names: string[]) {
  const out: { playerName: string; teamId: string; assistName?: string }[] = [];
  for (let i = 0; i < goals; i++) {
    const scorer = pick(names);
    const assist =
      names.length > 1 && Math.random() < 0.55 ? names.filter((n) => n !== scorer)[Math.floor(Math.random() * (names.length - 1))] : undefined;
    out.push({ playerName: scorer, teamId, ...(assist ? { assistName: assist } : {}) });
  }
  return out;
}

// Aktiviert die Demo: raeumt eine evtl. bestehende Demo weg, kopiert Teams/Kader,
// legt eine Demo-Saison an und fuellt alle Spiele der echten aktiven Saison per Zufall.
export async function activateDemo(): Promise<DemoState> {
  const prev = await readDemo();

  // 1) Alte Demo restlos entfernen + Flag aus (falls der naechste Schritt scheitert, ist alles sauber aus)
  const cleanup = [] as ReturnType<typeof sql>[];
  if (prev.seasonId) {
    cleanup.push(sql`DELETE FROM matches WHERE season_id = ${prev.seasonId}`);
    cleanup.push(sql`DELETE FROM seasons WHERE id = ${prev.seasonId}`);
  }
  if (prev.teamIds.length > 0) {
    cleanup.push(sql`DELETE FROM teams WHERE id = ANY(${prev.teamIds})`);
  }
  cleanup.push(
    sql`INSERT INTO settings (key, value) VALUES ('demo', ${JSON.stringify(EMPTY)}::jsonb)
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`
  );
  await sql.transaction(cleanup);

  // 2) Grundlage: echte Teams (ohne evtl. Demo-Reste) + echte aktive Saison + deren Spiele
  const [allTeams, allMatches, currentSeason] = await Promise.all([getTeams(), getMatches(), getCurrentSeason()]);
  if (!currentSeason) throw new Error('Keine aktive Saison vorhanden.');
  const prevTeamSet = new Set(prev.teamIds);
  const realTeams = allTeams.filter((t) => !prevTeamSet.has(t.id) && t.id !== prev.seasonId);
  const realFixtures = allMatches.filter((m) => m.seasonId === currentSeason.id);

  const stamp = Date.now();
  const demoSeasonId = `demo-saison-${stamp}`;

  // 3) Teams kopieren (neue IDs), Map echt -> demo
  const idMap = new Map<string, string>();
  const demoTeams: Team[] = realTeams.map((t, i) => {
    const demoId = `demo-team-${stamp}-${i}`;
    idMap.set(t.id, demoId);
    const roster: Player[] = (t.spielerliste && t.spielerliste.length > 0
      ? t.spielerliste
      : rosterNames(t).map((name) => ({ name })));
    return { ...t, id: demoId, spielerliste: roster };
  });

  // 4) Spiele der echten Saison als Demo-Spiele mit Zufallsergebnis nachbauen
  const demoTeamById = new Map(demoTeams.map((t) => [t.id, t] as const));

  // --- Realistische Anwesenheit: pro Spieltag-Abend ist nur ein Teil des Kaders da ---
  // Ziel: ca. 6 Spieler pro Abend, ein fester Torwart, Rest rotiert. Dadurch ändern
  // sich Siegquoten je Spieler und die „beste Aufstellung" hat echte Aussagekraft.
  const TARGET_PRESENT = 6;

  // k zufällige, verschiedene Namen ziehen (Fisher-Yates auf einer Kopie).
  const sample = (arr: string[], k: number): string[] => {
    const copy = [...arr];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy.slice(0, Math.max(0, Math.min(k, copy.length)));
  };

  // Fester Stamm-Torwart je Team (einmal gewählt, an jedem Abend dabei).
  const teamKeeper = new Map<string, string>();
  for (const t of demoTeams) teamKeeper.set(t.id, pick(rosterNames(t)));

  // Anwesenheit je (Team, Spieltag) – für alle Spiele desselben Abends identisch.
  const attendance = new Map<string, string[]>();
  const presentFor = (teamId: string, matchday: number, names: string[]): string[] => {
    const key = `${teamId}:${matchday}`;
    const cached = attendance.get(key);
    if (cached) return cached;
    const keeper = teamKeeper.get(teamId);
    const target = Math.min(names.length, rand(5, 7)); // „ungefähr sechs"
    let present: string[];
    if (names.length <= target || !keeper) {
      present = [...names];
    } else {
      const others = names.filter((n) => n !== keeper);
      present = [keeper, ...sample(others, target - 1)];
    }
    attendance.set(key, present);
    return present;
  };

  const demoMatches = realFixtures
    .map((m, i) => {
      const homeId = idMap.get(m.homeTeamId);
      const awayId = idMap.get(m.awayTeamId);
      if (!homeId || !awayId) return null;
      const homeNames = rosterNames(demoTeamById.get(homeId)!);
      const awayNames = rosterNames(demoTeamById.get(awayId)!);
      const homePresent = presentFor(homeId, m.matchday, homeNames);
      const awayPresent = presentFor(awayId, m.matchday, awayNames);
      // Abwesende = Kader minus Anwesende (so entstehen unterschiedliche Aufstellungen)
      const absentees = [
        ...homeNames.filter((n) => !homePresent.includes(n)).map((playerName) => ({ playerName, teamId: homeId })),
        ...awayNames.filter((n) => !awayPresent.includes(n)).map((playerName) => ({ playerName, teamId: awayId })),
      ];
      const homeScore = pick(SCORE_POOL);
      const awayScore = pick(SCORE_POOL);
      // Torschützen nur aus den Anwesenden des Abends.
      const scorers = [...makeScorers(homeScore, homeId, homePresent), ...makeScorers(awayScore, awayId, awayPresent)];
      const bestPlayers = [
        { playerName: pick(homePresent), teamId: homeId },
        { playerName: pick(awayPresent), teamId: awayId },
      ];
      // Torwart = fester Stamm-Torwart (ist immer anwesend), sonst irgendwer Anwesendes.
      const homeGk = teamKeeper.get(homeId) && homePresent.includes(teamKeeper.get(homeId)!) ? teamKeeper.get(homeId)! : pick(homePresent);
      const awayGk = teamKeeper.get(awayId) && awayPresent.includes(teamKeeper.get(awayId)!) ? teamKeeper.get(awayId)! : pick(awayPresent);
      const goalkeepers = [
        { playerName: homeGk, teamId: homeId },
        { playerName: awayGk, teamId: awayId },
      ];
      return {
        id: `demo-m-${stamp}-${i}`,
        matchday: m.matchday,
        homeTeamId: homeId,
        awayTeamId: awayId,
        homeScore,
        awayScore,
        date: m.date,
        time: m.time,
        venue: m.venue ?? null,
        field: m.field ?? null,
        slot: m.slot ?? null,
        scorers,
        absentees,
        bestPlayers,
        goalkeepers,
      };
    })
    .filter((m): m is NonNullable<typeof m> => m !== null);

  // 5) Alles in EINER Transaktion einspielen (Reihenfolge: Teams -> Saison -> Spiele -> Flag)
  const build = [] as ReturnType<typeof sql>[];
  for (const t of demoTeams) {
    build.push(
      sql`INSERT INTO teams (id, name, short_name, logo_color, logo_icon, logo_url, spielerliste)
          VALUES (${t.id}, ${t.name}, ${t.shortName}, ${t.logoColor}, ${t.logoIcon}, ${t.logoUrl ?? ''}, ${JSON.stringify(t.spielerliste ?? [])}::jsonb)`
    );
  }
  build.push(
    sql`INSERT INTO seasons (id, label, is_current) VALUES (${demoSeasonId}, ${`Demo ${currentSeason.label}`}, false)`
  );
  for (const m of demoMatches) {
    build.push(
      sql`INSERT INTO matches
            (id, season_id, matchday, home_team_id, away_team_id, home_score, away_score, status, date, time, venue, field, slot, scorers, absentees, best_players, goalkeepers)
          VALUES
            (${m.id}, ${demoSeasonId}, ${m.matchday}, ${m.homeTeamId}, ${m.awayTeamId}, ${m.homeScore}, ${m.awayScore}, 'beendet', ${m.date}, ${m.time}, ${m.venue}, ${m.field}, ${m.slot},
             ${JSON.stringify(m.scorers)}::jsonb, ${JSON.stringify(m.absentees)}::jsonb, ${JSON.stringify(m.bestPlayers)}::jsonb, ${JSON.stringify(m.goalkeepers)}::jsonb)`
    );
  }
  const state: DemoState = { active: true, seasonId: demoSeasonId, teamIds: demoTeams.map((t) => t.id) };
  build.push(
    sql`INSERT INTO settings (key, value) VALUES ('demo', ${JSON.stringify(state)}::jsonb)
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`
  );
  await sql.transaction(build);

  return state;
}

// Deaktiviert die Demo: entfernt alle Demo-Zeilen restlos, Flag aus. Echte Daten bleiben unberuehrt.
export async function deactivateDemo(): Promise<DemoState> {
  const prev = await readDemo();
  const stmts = [] as ReturnType<typeof sql>[];
  if (prev.seasonId) {
    stmts.push(sql`DELETE FROM matches WHERE season_id = ${prev.seasonId}`);
    stmts.push(sql`DELETE FROM seasons WHERE id = ${prev.seasonId}`);
  }
  if (prev.teamIds.length > 0) {
    stmts.push(sql`DELETE FROM teams WHERE id = ANY(${prev.teamIds})`);
  }
  stmts.push(
    sql`INSERT INTO settings (key, value) VALUES ('demo', ${JSON.stringify(EMPTY)}::jsonb)
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`
  );
  await sql.transaction(stmts);
  return EMPTY;
}
