import { sql, getTeams } from './db.js';

// ---------------------------------------------------------------------------
// Abend-Aufstellung auf die Einzelspiele eines Spieltags übertragen:
// Abwesende = Kader minus anwesend, Torwart je Team. Nur die übergebenen Teams
// werden angefasst – Gegner und bereits erfasste Torschützen bleiben unberührt.
// Gemeinsam genutzt vom Schiedsrichtermodus (twitch.ts, resource=roster) und
// der Manager-Kaderseite (managers.ts).
// ---------------------------------------------------------------------------
export type RosterEntry = { playerName: string; teamId: string };
export type RosterTeamIn = { present: string[]; goalkeeper?: string };

export async function applyRosterToMatches(
  seasonId: string,
  matchday: number,
  teams: Record<string, RosterTeamIn>,
  minutes: number
): Promise<void> {
  const allTeams = await getTeams();
  const kaderOf = (teamId: string) => (allTeams.find((t) => t.id === teamId)?.spielerliste ?? []).map((p) => p.name);
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
}
