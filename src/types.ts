export interface Player {
  name: string;
  imageUrl?: string;
}

export interface Team {
  id: string;
  name: string;
  shortName: string;
  logoColor: string; // Hex-Farbe für das Vereins-Emblem
  logoIcon: string; // Emoji-Wappen
  logoUrl?: string;
  spielerliste?: Player[];
}

export interface Scorer {
  playerName: string;
  teamId: string;
  assistName?: string;
}

export interface Match {
  id: string;
  seasonId: string;
  matchday: number;
  homeTeamId: string;
  awayTeamId: string;
  homeScore: number | null; // null = noch nicht gespielt
  awayScore: number | null;
  date: string; // 'YYYY-MM-DD'
  time: string; // 'HH:MM'
  status: 'geplant' | 'live' | 'beendet';
  scorers?: Scorer[];
  liveStartedAt?: string | null;
}

export interface Season {
  id: string;
  label: string; // z.B. "2026/27"
  isCurrent: boolean;
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
  form: ('W' | 'D' | 'L')[]; // Letzte 5 Spiele
}

export interface PlayerStat {
  id: string;
  name: string;
  imageUrl?: string;
  teamName: string;
  teamLogoColor: string;
  goals: number;
  assists: number;
  matchesPlayed: number;
}

export type ActiveTab = 'home' | 'spielplan' | 'tabelle' | 'torschuetzen' | 'statistiken';
