import type { Match, PlayerOfMonth, Team } from '../../src/types';

// Demo-Daten für Entwicklung und Erstinstallation.
// Für den echten Ligabetrieb: Demo-Vereine im Admin-Panel löschen und eigene anlegen
// (siehe README, Abschnitt "Demo-Daten entfernen").

export const SEED_SEASON = { id: 'saison-2026-27', label: '2026/27' };

export const SEED_TEAMS: Team[] = [
  { id: 'apex', name: 'Apex München', shortName: 'APX', logoColor: '#3B82F6', logoIcon: '🛡️', logoUrl: '', spielerliste: [{ name: 'Harry Kane' }, { name: 'Leroy Sané' }, { name: 'Jamal Musiala' }, { name: 'Thomas Müller' }, { name: 'Joshua Kimmich' }] },
  { id: 'borussia', name: 'Borussia Ruhr', shortName: 'BVB', logoColor: '#F59E0B', logoIcon: '🐝', logoUrl: '', spielerliste: [{ name: 'Serhou Guirassy' }, { name: 'Julian Brandt' }, { name: 'Emre Can' }, { name: 'Nico Schlotterbeck' }, { name: 'Marcel Sabitzer' }] },
  { id: 'vanguard', name: 'Vanguard Hamburg', shortName: 'VGH', logoColor: '#EF4444', logoIcon: '⚓', logoUrl: '', spielerliste: [{ name: 'Robert Glatzel' }, { name: 'Ludovit Reis' }, { name: 'Bakery Jatta' }, { name: 'Sebastian Schonlau' }] },
  { id: 'eintracht', name: 'Eintracht Frankfurt', shortName: 'SGE', logoColor: '#10B981', logoIcon: '🦅', logoUrl: '', spielerliste: [{ name: 'Hugo Ekitiké' }, { name: 'Mario Götze' }, { name: 'Robin Koch' }, { name: 'Kevin Trapp' }, { name: 'Ellyes Skhiri' }] },
  { id: 'leipzig', name: 'Red Bull Leipzig', shortName: 'RBL', logoColor: '#8B5CF6', logoIcon: '🐂', logoUrl: '', spielerliste: [{ name: 'Lois Openda' }, { name: 'Xavi Simons' }, { name: 'Benjamin Šeško' }, { name: 'Willi Orbán' }, { name: 'Amadou Haidara' }] },
  { id: 'berlin', name: 'SpVgg Berlin', shortName: 'BSC', logoColor: '#06B6D4', logoIcon: '🐻', logoUrl: '', spielerliste: [{ name: 'Haris Tabaković' }, { name: 'Fabian Reese' }, { name: 'Toni Leistner' }, { name: 'Deyovaisio Zeefuik' }] },
  { id: 'koeln', name: 'Titan Köln', shortName: 'KOE', logoColor: '#EC4899', logoIcon: '🏰', logoUrl: '', spielerliste: [{ name: 'Mark Uth' }, { name: 'Davie Selke' }, { name: 'Florian Kainz' }, { name: 'Timo Hübers' }] },
  { id: 'stuttgart', name: 'VfB Stuttgart', shortName: 'VFB', logoColor: '#F43F5E', logoIcon: '🎯', logoUrl: '', spielerliste: [{ name: 'Deniz Undav' }, { name: 'Chris Führich' }, { name: 'Angelo Stiller' }, { name: 'Alexander Nübel' }, { name: 'Maximilian Mittelstädt' }] },
  { id: 'bremen', name: 'Werder Bremen', shortName: 'SVW', logoColor: '#14B8A6', logoIcon: '🟢', logoUrl: '', spielerliste: [{ name: 'Marvin Ducksch' }, { name: 'Jens Stage' }, { name: 'Mitchell Weiser' }, { name: 'Marco Friedl' }, { name: 'Leonardo Bittencourt' }] },
  { id: 'leverkusen', name: 'Phönix Leverkusen', shortName: 'PHO', logoColor: '#F97316', logoIcon: '🔥', logoUrl: '', spielerliste: [{ name: 'Florian Wirtz' }, { name: 'Granit Xhaka' }, { name: 'Victor Boniface' }, { name: 'Alejandro Grimaldo' }, { name: 'Jeremie Frimpong' }, { name: 'Robert Andrich' }] },
];

const S = SEED_SEASON.id;

export const SEED_MATCHES: Match[] = [
  { id: 'm1-1', seasonId: S, matchday: 1, homeTeamId: 'apex', awayTeamId: 'borussia', homeScore: 3, awayScore: 1, status: 'beendet', date: '2026-08-14', time: '20:30' },
  { id: 'm1-2', seasonId: S, matchday: 1, homeTeamId: 'vanguard', awayTeamId: 'eintracht', homeScore: 1, awayScore: 1, status: 'beendet', date: '2026-08-15', time: '15:30' },
  { id: 'm1-3', seasonId: S, matchday: 1, homeTeamId: 'leipzig', awayTeamId: 'berlin', homeScore: 2, awayScore: 0, status: 'beendet', date: '2026-08-15', time: '15:30' },
  { id: 'm1-4', seasonId: S, matchday: 1, homeTeamId: 'koeln', awayTeamId: 'stuttgart', homeScore: 0, awayScore: 2, status: 'beendet', date: '2026-08-15', time: '18:30' },
  { id: 'm1-5', seasonId: S, matchday: 1, homeTeamId: 'bremen', awayTeamId: 'leverkusen', homeScore: 2, awayScore: 4, status: 'beendet', date: '2026-08-16', time: '17:30' },
  { id: 'm2-1', seasonId: S, matchday: 2, homeTeamId: 'borussia', awayTeamId: 'vanguard', homeScore: 2, awayScore: 2, status: 'beendet', date: '2026-08-21', time: '20:30' },
  { id: 'm2-2', seasonId: S, matchday: 2, homeTeamId: 'eintracht', awayTeamId: 'apex', homeScore: 0, awayScore: 2, status: 'beendet', date: '2026-08-22', time: '15:30' },
  { id: 'm2-3', seasonId: S, matchday: 2, homeTeamId: 'berlin', awayTeamId: 'bremen', homeScore: 1, awayScore: 1, status: 'beendet', date: '2026-08-22', time: '15:30' },
  { id: 'm2-4', seasonId: S, matchday: 2, homeTeamId: 'stuttgart', awayTeamId: 'leipzig', homeScore: 1, awayScore: 3, status: 'beendet', date: '2026-08-22', time: '18:30' },
  { id: 'm2-5', seasonId: S, matchday: 2, homeTeamId: 'leverkusen', awayTeamId: 'koeln', homeScore: 5, awayScore: 1, status: 'beendet', date: '2026-08-23', time: '17:30' },
  { id: 'm3-1', seasonId: S, matchday: 3, homeTeamId: 'apex', awayTeamId: 'vanguard', homeScore: null, awayScore: null, status: 'geplant', date: '2026-08-28', time: '20:30' },
  { id: 'm3-2', seasonId: S, matchday: 3, homeTeamId: 'borussia', awayTeamId: 'eintracht', homeScore: null, awayScore: null, status: 'geplant', date: '2026-08-29', time: '15:30' },
  { id: 'm3-3', seasonId: S, matchday: 3, homeTeamId: 'leipzig', awayTeamId: 'leverkusen', homeScore: null, awayScore: null, status: 'geplant', date: '2026-08-29', time: '15:30' },
  { id: 'm3-4', seasonId: S, matchday: 3, homeTeamId: 'koeln', awayTeamId: 'berlin', homeScore: null, awayScore: null, status: 'geplant', date: '2026-08-29', time: '18:30' },
  { id: 'm3-5', seasonId: S, matchday: 3, homeTeamId: 'bremen', awayTeamId: 'stuttgart', homeScore: null, awayScore: null, status: 'geplant', date: '2026-08-30', time: '17:30' },
  { id: 'm4-1', seasonId: S, matchday: 4, homeTeamId: 'vanguard', awayTeamId: 'leipzig', homeScore: null, awayScore: null, status: 'geplant', date: '2026-09-11', time: '20:30' },
  { id: 'm4-2', seasonId: S, matchday: 4, homeTeamId: 'leverkusen', awayTeamId: 'apex', homeScore: null, awayScore: null, status: 'geplant', date: '2026-09-12', time: '15:30' },
  { id: 'm4-3', seasonId: S, matchday: 4, homeTeamId: 'eintracht', awayTeamId: 'koeln', homeScore: null, awayScore: null, status: 'geplant', date: '2026-09-12', time: '15:30' },
  { id: 'm4-4', seasonId: S, matchday: 4, homeTeamId: 'stuttgart', awayTeamId: 'berlin', homeScore: null, awayScore: null, status: 'geplant', date: '2026-09-12', time: '18:30' },
  { id: 'm4-5', seasonId: S, matchday: 4, homeTeamId: 'bremen', awayTeamId: 'borussia', homeScore: null, awayScore: null, status: 'geplant', date: '2026-09-13', time: '17:30' },
  { id: 'm5-1', seasonId: S, matchday: 5, homeTeamId: 'apex', awayTeamId: 'stuttgart', homeScore: null, awayScore: null, status: 'geplant', date: '2026-09-18', time: '20:30' },
  { id: 'm5-2', seasonId: S, matchday: 5, homeTeamId: 'borussia', awayTeamId: 'leverkusen', homeScore: null, awayScore: null, status: 'geplant', date: '2026-09-19', time: '15:30' },
  { id: 'm5-3', seasonId: S, matchday: 5, homeTeamId: 'koeln', awayTeamId: 'vanguard', homeScore: null, awayScore: null, status: 'geplant', date: '2026-09-19', time: '15:30' },
  { id: 'm5-4', seasonId: S, matchday: 5, homeTeamId: 'leipzig', awayTeamId: 'bremen', homeScore: null, awayScore: null, status: 'geplant', date: '2026-09-19', time: '18:30' },
  { id: 'm5-5', seasonId: S, matchday: 5, homeTeamId: 'berlin', awayTeamId: 'eintracht', homeScore: null, awayScore: null, status: 'geplant', date: '2026-09-20', time: '17:30' },
];

export const DEFAULT_PLAYER_OF_MONTH: PlayerOfMonth = {
  name: 'Florian Wirtz',
  club: 'Phönix Leverkusen',
  goals: 4,
  assists: 5,
  image: '',
};

type Sql = ReturnType<typeof import('@neondatabase/serverless').neon>;

// Löscht alle Daten und spielt die Demo-Daten ein (eine Transaktion).
export async function applySeed(sql: Sql) {
  await sql.transaction((txn) => [
    txn`DELETE FROM matches`,
    txn`DELETE FROM teams`,
    txn`DELETE FROM seasons`,
    txn`INSERT INTO seasons (id, label, is_current) VALUES (${SEED_SEASON.id}, ${SEED_SEASON.label}, true)`,
    ...SEED_TEAMS.map(
      (t) => txn`
        INSERT INTO teams (id, name, short_name, logo_color, logo_icon, logo_url, spielerliste)
        VALUES (${t.id}, ${t.name}, ${t.shortName}, ${t.logoColor}, ${t.logoIcon}, ${t.logoUrl ?? ''}, ${JSON.stringify(t.spielerliste ?? [])}::jsonb)
      `
    ),
    ...SEED_MATCHES.map(
      (m) => txn`
        INSERT INTO matches (id, season_id, matchday, home_team_id, away_team_id, home_score, away_score, status, date, time, scorers)
        VALUES (${m.id}, ${m.seasonId}, ${m.matchday}, ${m.homeTeamId}, ${m.awayTeamId}, ${m.homeScore}, ${m.awayScore}, ${m.status}, ${m.date}, ${m.time}, ${JSON.stringify(m.scorers ?? [])}::jsonb)
      `
    ),
    txn`
      INSERT INTO settings (key, value) VALUES ('playerOfMonth', ${JSON.stringify(DEFAULT_PLAYER_OF_MONTH)}::jsonb)
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
    `,
  ]);
}
