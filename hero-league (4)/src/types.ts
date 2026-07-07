export interface Team {
  id: string;
  name: string;
  shortName: string;
  logoColor: string; // Tailwind hex or class color for the team emblem
  logoIcon: string; // Emoji or simple abbreviation
  logoUrl?: string;
  spielerliste?: string[];
}

export interface Match {
  id: string;
  matchday: number;
  homeTeamId: string;
  awayTeamId: string;
  homeScore: number | null; // null means not played yet
  awayScore: number | null; // null means not played yet
  date: string;
  time: string;
  isCompleted: boolean;
  status?: 'geplant' | 'live' | 'beendet';
  scorers?: { playerName: string; teamId: string; assistName?: string }[];
  liveStartedAt?: string;
}

export interface PlayerOfMonth {
  name: string;
  club: string;
  goals: number;
  assists: number;
  image: string;
}

export interface Standing {
  teamId: string;
  teamName: string;
  shortName: string;
  logoColor: string;
  logoIcon: string;
  logoUrl?: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
  form: ('W' | 'D' | 'L')[]; // Last 5 matches
}

export interface PlayerStat {
  id: string;
  name: string;
  teamName: string;
  teamLogoColor: string;
  goals: number;
  assists: number;
  matchesPlayed: number;
}

export type ActiveTab = 'home' | 'spielplan' | 'tabelle' | 'torschuetzen' | 'statistiken';
