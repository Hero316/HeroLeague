import type { EventConfig, Match, Player, PlayerStat, Team } from '../types';
import { calculatePlayers } from '../../api/_lib/league';

// ===========================================================================
// Adapter: macht aus einem Testspiel/Event (namensbasiert) die gleichen
// Datenstrukturen wie die echte Liga (Team[]/Match[]), damit die bestehenden
// Liga-Komponenten (Spielbericht, beste Aufstellung, Team-Seite …) 1:1 fürs
// Event wiederverwendet werden können – ohne die Liga zu berühren.
//
// Konvention: die "ID" eines Event-Teams IST sein Name. So passen die
// namensbasierten Event-Daten (scorers.team, tracking teamId = Name) direkt
// zu team.id, ohne echte Liga-IDs zu vermischen.
// ===========================================================================

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

// Kader eines Event-Teams: zuerst der eigene Event-Kader, sonst (wenn der Name
// einem echten Verein entspricht) dessen Liga-Kader – rein für Fotos/Namen.
function rosterFor(event: EventConfig, teamName: string, leagueTeams: Team[]): Player[] {
  const own = event.rosters?.find((r) => norm(r.team) === norm(teamName))?.players;
  if (own && own.length) return own;
  return leagueTeams.find((t) => norm(t.name) === norm(teamName))?.spielerliste ?? [];
}

// Synthetische Teams: ein Team je Event-Teamname. Wappen/Farbe vom gleichnamigen
// Liga-Verein übernehmen (nur Optik), sonst die Event-Magenta-Welt.
export function eventTeamsAsTeams(event: EventConfig, leagueTeams: Team[]): Team[] {
  return event.teams.map((name) => {
    const league = leagueTeams.find((t) => norm(t.name) === norm(name));
    return {
      id: name,
      name,
      shortName: league?.shortName || name,
      logoColor: league?.logoColor || '#E6238E',
      logoIcon: league?.logoIcon || '⚽',
      logoUrl: league?.logoUrl,
      spielerliste: rosterFor(event, name, leagueTeams),
    };
  });
}

// Synthetische Matches: EventMatch -> Match (Team-„IDs" = Namen, seasonId =
// event:<id>). Torschützen/Abwesende/Bester/Torwart werden auf die Liga-Form
// gemappt, damit beste Aufstellung & Co. funktionieren.
export function eventMatchesAsMatches(event: EventConfig): Match[] {
  return event.matches.map((m) => ({
    id: m.id,
    seasonId: `event:${event.id}`,
    matchday: m.block,
    homeTeamId: m.home,
    awayTeamId: m.away,
    homeScore: m.homeScore,
    awayScore: m.awayScore,
    date: event.date || '',
    time: m.start,
    status: m.status ?? 'geplant',
    field: m.field,
    liveStartedAt: m.liveStartedAt ?? undefined,
    durationMinutes: m.durationMinutes,
    pausedAt: m.pausedAt ?? undefined,
    scorers: (m.scorers ?? []).map((s) => ({ playerName: s.player, teamId: s.team, assistName: s.assist })),
    absentees: (m.absentees ?? []).map((a) => ({ playerName: a.player, teamId: a.team })),
    bestPlayers: (m.bestPlayers ?? []).map((b) => ({ playerName: b.player, teamId: b.team })),
    goalkeepers: (m.goalkeepers ?? []).map((g) => ({ playerName: g.player, teamId: g.team })),
  }));
}

// Spielerstatistiken (Tore, Vorlagen, Einsätze, Siege, MOTM, Zu-Null …) fürs
// Event – dieselbe Berechnung wie in der Liga, nur auf die synthetischen
// Event-Daten angewandt (zählt nur beendete Event-Spiele). Für Team-Seite,
// Siegquote und die beste Aufstellung.
export function eventPlayers(event: EventConfig, leagueTeams: Team[]): PlayerStat[] {
  return calculatePlayers(eventTeamsAsTeams(event, leagueTeams), eventMatchesAsMatches(event));
}
