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

// Ein Kaderspieler, der in diesem Spiel NICHT mitgespielt hat (abwesend).
// Fehlt der Eintrag, gilt der Spieler wie bisher als eingesetzt.
export interface Absence {
  playerName: string;
  teamId: string;
}

// Bester Spieler eines Teams in diesem Spiel (vom eigenen Team gewählt).
// Pro Team höchstens einer; gibt Punkte für die Ballon-d'Or-Wertung.
export interface BestPlayer {
  playerName: string;
  teamId: string;
}

// Torwart eines Teams in diesem Spiel (pro Team höchstens einer).
// Wird je Spiel gespeichert; bei „zu null" gibt es Punkte (Goldener Handschuh).
export interface Goalkeeper {
  playerName: string;
  teamId: string;
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
  venue?: string | null; // Spielort/Halle des Spieltag-Abends, z.B. "Halle Königsfeld"
  field?: number | null; // Feld/Platz (z.B. 1 oder 2), aus dem Spielplan-Import
  slot?: number | null; // Zeitfenster im Ligaabend, aus dem Spielplan-Import
  importRef?: string | null; // Spiel-ID aus der Import-Datei, z.B. "HL-001"
  scorers?: Scorer[];
  absentees?: Absence[]; // Kaderspieler, die in diesem Spiel gefehlt haben
  bestPlayers?: BestPlayer[]; // Bester Spieler je Team (max. einer pro Team)
  goalkeepers?: Goalkeeper[]; // Torwart je Team (max. einer pro Team)
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

export interface TwitchConfig {
  channel: string; // Kanalname ohne URL, z.B. "heroleague"
  isLive: boolean; // manuell im Admin geschaltet
}

// Rollen: superadmin darf alles; match_admin darf nur Spiele/Live/Ticker pflegen.
export type UserRole = 'superadmin' | 'match_admin';

export interface AppUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  isActive: boolean;
}

// Die im Frontend bekannte Identität der aktiven Sitzung
export interface SessionUser {
  email: string;
  name: string;
  role: UserRole;
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
  motmCount: number; // Anzahl „bester Spieler des Spiels"-Auszeichnungen
  cleanSheets: number; // Spiele als Torwart ohne Gegentor („zu null")
  gamesInGoal: number; // Spiele, in denen der Spieler im Tor stand
  goalsConceded: number; // kassierte Gegentore in seinen Torwart-Spielen
  points: number; // Ballon-d'Or-Wertung (aus Toren, Vorlagen, MOTM, Team-Ergebnis, Torwart-zu-null)
}

export type ActiveTab = 'home' | 'spielplan' | 'tabelle' | 'torschuetzen' | 'statistiken';
