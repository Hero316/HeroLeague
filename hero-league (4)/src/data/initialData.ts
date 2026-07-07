import { Team, Match, PlayerStat } from '../types';

export const INITIAL_TEAMS: Team[] = [
  { id: 'apex', name: 'Apex München', shortName: 'APX', logoColor: '#3B82F6', logoIcon: '🛡️' }, // Blue
  { id: 'borussia', name: 'Borussia Ruhr', shortName: 'BVB', logoColor: '#F59E0B', logoIcon: '🐝' }, // Yellow
  { id: 'vanguard', name: 'Vanguard Hamburg', shortName: 'VGH', logoColor: '#EF4444', logoIcon: '⚓' }, // Red
  { id: 'eintracht', name: 'Eintracht Frankfurt', shortName: 'SGE', logoColor: '#10B981', logoIcon: '🦅' }, // Green
  { id: 'leipzig', name: 'Red Bull Leipzig', shortName: 'RBL', logoColor: '#8B5CF6', logoIcon: '🐂' }, // Purple
  { id: 'berlin', name: 'SpVgg Berlin', shortName: 'BSC', logoColor: '#06B6D4', logoIcon: '🐻' }, // Cyan
  { id: 'koeln', name: 'Titan Köln', shortName: 'KOE', logoColor: '#EC4899', logoIcon: '🏰' }, // Pink
  { id: 'stuttgart', name: 'VfB Stuttgart', shortName: 'VFB', logoColor: '#F43F5E', logoIcon: '🎯' }, // Rose
  { id: 'bremen', name: 'Werder Bremen', shortName: 'SVW', logoColor: '#14B8A6', logoIcon: '🟢' }, // Teal
  { id: 'leverkusen', name: 'Phönix Leverkusen', shortName: 'PHO', logoColor: '#F97316', logoIcon: '🔥' } // Orange
];

export const INITIAL_MATCHES: Match[] = [
  // Spieltag 1 (Completed)
  { id: 'm1-1', matchday: 1, homeTeamId: 'apex', awayTeamId: 'borussia', homeScore: 3, awayScore: 1, date: '2026-08-14', time: '20:30', isCompleted: true },
  { id: 'm1-2', matchday: 1, homeTeamId: 'vanguard', awayTeamId: 'eintracht', homeScore: 1, awayScore: 1, date: '2026-08-15', time: '15:30', isCompleted: true },
  { id: 'm1-3', matchday: 1, homeTeamId: 'leipzig', awayTeamId: 'berlin', homeScore: 2, awayScore: 0, date: '2026-08-15', time: '15:30', isCompleted: true },
  { id: 'm1-4', matchday: 1, homeTeamId: 'koeln', awayTeamId: 'stuttgart', homeScore: 0, awayScore: 2, date: '2026-08-15', time: '18:30', isCompleted: true },
  { id: 'm1-5', matchday: 1, homeTeamId: 'bremen', awayTeamId: 'leverkusen', homeScore: 2, awayScore: 4, date: '2026-08-16', time: '17:30', isCompleted: true },

  // Spieltag 2 (Completed)
  { id: 'm2-1', matchday: 2, homeTeamId: 'borussia', awayTeamId: 'vanguard', homeScore: 2, awayScore: 2, date: '2026-08-21', time: '20:30', isCompleted: true },
  { id: 'm2-2', matchday: 2, homeTeamId: 'eintracht', awayTeamId: 'apex', homeScore: 0, awayScore: 2, date: '2026-08-22', time: '15:30', isCompleted: true },
  { id: 'm2-3', matchday: 2, homeTeamId: 'berlin', awayTeamId: 'bremen', homeScore: 1, awayScore: 1, date: '2026-08-22', time: '15:30', isCompleted: true },
  { id: 'm2-4', matchday: 2, homeTeamId: 'stuttgart', awayTeamId: 'leipzig', homeScore: 1, awayScore: 3, date: '2026-08-22', time: '18:30', isCompleted: true },
  { id: 'm2-5', matchday: 2, homeTeamId: 'leverkusen', awayTeamId: 'koeln', homeScore: 5, awayScore: 1, date: '2026-08-23', time: '17:30', isCompleted: true },

  // Spieltag 3 (Upcoming / Editable)
  { id: 'm3-1', matchday: 3, homeTeamId: 'apex', awayTeamId: 'vanguard', homeScore: null, awayScore: null, date: '2026-08-28', time: '20:30', isCompleted: false },
  { id: 'm3-2', matchday: 3, homeTeamId: 'borussia', awayTeamId: 'eintracht', homeScore: null, awayScore: null, date: '2026-08-29', time: '15:30', isCompleted: false },
  { id: 'm3-3', matchday: 3, homeTeamId: 'leipzig', awayTeamId: 'leverkusen', homeScore: null, awayScore: null, date: '2026-08-29', time: '15:30', isCompleted: false },
  { id: 'm3-4', matchday: 3, homeTeamId: 'koeln', awayTeamId: 'berlin', homeScore: null, awayScore: null, date: '2026-08-29', time: '18:30', isCompleted: false },
  { id: 'm3-5', matchday: 3, homeTeamId: 'bremen', awayTeamId: 'stuttgart', homeScore: null, awayScore: null, date: '2026-08-30', time: '17:30', isCompleted: false },

  // Spieltag 4 (Upcoming / Editable)
  { id: 'm4-1', matchday: 4, homeTeamId: 'vanguard', awayTeamId: 'leipzig', homeScore: null, awayScore: null, date: '2026-09-11', time: '20:30', isCompleted: false },
  { id: 'm4-2', matchday: 4, homeTeamId: 'leverkusen', awayTeamId: 'apex', homeScore: null, awayScore: null, date: '2026-09-12', time: '15:30', isCompleted: false },
  { id: 'm4-3', matchday: 4, homeTeamId: 'eintracht', awayTeamId: 'koeln', homeScore: null, awayScore: null, date: '2026-09-12', time: '15:30', isCompleted: false },
  { id: 'm4-4', matchday: 4, homeTeamId: 'stuttgart', awayTeamId: 'berlin', homeScore: null, awayScore: null, date: '2026-09-12', time: '18:30', isCompleted: false },
  { id: 'm4-5', matchday: 4, homeTeamId: 'bremen', awayTeamId: 'borussia', homeScore: null, awayScore: null, date: '2026-09-13', time: '17:30', isCompleted: false },

  // Spieltag 5 (Upcoming / Editable)
  { id: 'm5-1', matchday: 5, homeTeamId: 'apex', awayTeamId: 'stuttgart', homeScore: null, awayScore: null, date: '2026-09-18', time: '20:30', isCompleted: false },
  { id: 'm5-2', matchday: 5, homeTeamId: 'borussia', awayTeamId: 'leverkusen', homeScore: null, awayScore: null, date: '2026-09-19', time: '15:30', isCompleted: false },
  { id: 'm5-3', matchday: 5, homeTeamId: 'koeln', awayTeamId: 'vanguard', homeScore: null, awayScore: null, date: '2026-09-19', time: '15:30', isCompleted: false },
  { id: 'm5-4', matchday: 5, homeTeamId: 'leipzig', awayTeamId: 'bremen', homeScore: null, awayScore: null, date: '2026-09-19', time: '18:30', isCompleted: false },
  { id: 'm5-5', matchday: 5, homeTeamId: 'berlin', awayTeamId: 'eintracht', homeScore: null, awayScore: null, date: '2026-09-20', time: '17:30', isCompleted: false }
];

export const INITIAL_PLAYERS: PlayerStat[] = [
  { id: 'p1', name: 'Florian Wirtz', teamName: 'Phönix Leverkusen', teamLogoColor: '#F97316', goals: 4, assists: 3, matchesPlayed: 2 },
  { id: 'p2', name: 'Harry Kane', teamName: 'Apex München', teamLogoColor: '#3B82F6', goals: 3, assists: 1, matchesPlayed: 2 },
  { id: 'p3', name: 'Serhou Guirassy', teamName: 'Borussia Ruhr', teamLogoColor: '#F59E0B', goals: 2, assists: 1, matchesPlayed: 2 },
  { id: 'p4', name: 'Lois Openda', teamName: 'Red Bull Leipzig', teamLogoColor: '#8B5CF6', goals: 2, assists: 2, matchesPlayed: 2 },
  { id: 'p5', name: 'Deniz Undav', teamName: 'VfB Stuttgart', teamLogoColor: '#F43F5E', goals: 1, assists: 2, matchesPlayed: 2 },
  { id: 'p6', name: 'Hugo Ekitiké', teamName: 'Eintracht Frankfurt', teamLogoColor: '#10B981', goals: 1, assists: 1, matchesPlayed: 2 },
  { id: 'p7', name: 'Robert Glatzel', teamName: 'Vanguard Hamburg', teamLogoColor: '#EF4444', goals: 1, assists: 0, matchesPlayed: 2 }
];
