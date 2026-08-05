export interface Player {
  name: string;
  imageUrl?: string;
  number?: number; // feste Trikotnummer (ab Saisonstart), optional
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
  // Spieldauer in Minuten für den Live-Countdown (vom Schiedsrichtermodus beim
  // Anpfiff gesetzt). null/undefined ⇒ klassische hochzählende Live-Minute.
  durationMinutes?: number | null;
  // Zeitstempel, seit dem der Countdown pausiert ist (Schiedsrichter). Ist er
  // gesetzt, friert der Timer ein; beim Fortsetzen wird `liveStartedAt` um die
  // Pausendauer nach hinten verschoben, damit es nahtlos weiterläuft.
  pausedAt?: string | null;
}

export interface Season {
  id: string;
  label: string; // z.B. "2026/27"
  isCurrent: boolean;
}

// Optionale eigene Hintergrundbilder der drei Hero-Slides (Startseite).
// Leerer String = eingebautes Standard-Design.
export interface HeroImages {
  match: string;
  pom: string;
  table: string;
}

// Countdown auf der Startseite bis zum Anstoß. active=false ⇒ normal.
export interface CountdownConfig {
  active: boolean;
  target: string; // lokale datetime-local-Zeichenkette, z. B. "2026-10-04T19:00"
  title: string; // dezenter Text dahinter, z. B. "Till Season begins"
}

// News-Laufband unter der Navigation. Jede Nachricht ist ein eigener Eintrag
// (eigenes Textfeld im Admin) und wird im Ticker hinten an die automatischen
// Einträge (Ergebnisse, Anstöße, Top-Torschütze) angehängt.
export interface NewsItem {
  id: string;
  text: string;
}

export interface NewsConfig {
  items: NewsItem[];
}

export interface PlayerOfMonth {
  name: string;
  club: string;
  teamId?: string; // Verein-Zuordnung (für Wappen + Link zur Team-Seite)
  goals: number;
  assists: number;
  image: string;
}

export interface TwitchConfig {
  channel: string; // Kanalname ohne URL, z.B. "heroleague"
  isLive: boolean; // manuell im Admin geschaltet
}

export interface SocialLinks {
  instagram: string; // volle URL zum Kanal (leer = Symbol wird ausgeblendet)
  tiktok: string;
  youtube: string;
}

// Highlights: eine gemischte, geordnete Medien-Liste aus Kamera-Fotos
// (öffentliche Blob-URLs) und Video-Links (YouTube/Twitch, auch Shorts).
export interface HighlightMedia {
  id: string;
  type: 'image' | 'video';
  url: string; // Bild: Blob-URL · Video: YouTube-/Twitch-Link
  caption?: string;
  ratio?: number; // Breite/Höhe – nur Bilder (beim Upload erfasst), fürs Mosaik ohne Sprung
  featured?: boolean; // vom Admin mit Stern markiert ⇒ erscheint im Startseiten-Karussell
}

// Ordner/Album (z. B. je Spieltag): eigener Titel + eigene Medienliste.
export interface HighlightAlbum {
  id: string;
  title: string;
  items: HighlightMedia[];
  cover?: string; // eigenes Cover (z. B. rundes Design, transparent) – wie ein Wappen
}

export interface HighlightsConfig {
  items: HighlightMedia[]; // lose Highlights ganz oben
  albums: HighlightAlbum[]; // Ordner darunter (je Spieltag o. Ä.)
}

// Spontanes Sonder-Event (z.B. Testspieltag), unabhängig vom Liga-Betrieb.
// Wird über einen Schalter im Admin ein-/ausgeblendet; ist `active` false,
// bleibt die Website komplett normal.
export interface EventScorer {
  player: string;
  team: string; // Teamname (home oder away des Spiels)
  assist?: string;
}

export interface EventAward {
  player: string;
  team: string;
}

export interface EventMatch {
  id: string;
  block: number; // Zeitblock (1..n)
  field: number; // Feld/Platz (1 oder 2)
  start: string; // 'HH:MM'
  end: string; // 'HH:MM'
  home: string; // Teamname
  away: string; // Teamname
  homeScore: number | null; // null = noch nicht gespielt
  awayScore: number | null;
  status?: 'geplant' | 'live' | 'beendet'; // Spielstatus (wie bei den echten Spielen)
  liveStartedAt?: string | null; // Zeitstempel, seit dem das Spiel läuft (für Live-Minute)
  scorers?: EventScorer[]; // Torschützen (mit optionaler Vorlage)
  bestPlayers?: EventAward[]; // bester Spieler je Team (max. einer pro Team)
  goalkeepers?: EventAward[]; // Torwart je Team (für „zu null")
  absentees?: EventAward[]; // abwesende Kaderspieler je Team
}

export interface EventConfig {
  id: string; // eindeutige ID (z.B. "testspiel-1")
  label: string; // Anzeigename in der Verwaltung, z.B. "Testspiel 1"
  title: string; // z.B. "Testspieltag"
  tagline: string; // kurzer Untertitel fürs Banner
  dateLabel: string; // z.B. "Sonntag, 2. August 2026"
  location: string; // z.B. "Soccer Center Königsfeld"
  teams: string[]; // Teamnamen (für die Tabelle, auch ohne Ergebnisse)
  matches: EventMatch[];
}

// Archiv aller Testspiele – vergangene bleiben gespeichert (wie Saisons).
// `activeId` bestimmt, welches Event aktuell auf der Website sichtbar ist
// (null = keins sichtbar, Seite ist komplett normal).
export interface EventArchive {
  activeId: string | null;
  events: EventConfig[];
}

// Rollen: superadmin darf alles; match_admin darf Spiele/Live/Ticker pflegen;
// referee (Schiedsrichter) darf ausschließlich im Schiedsrichtermodus Spiele
// pfeifen und die Abend-Aufstellung setzen – sonst nichts.
export type UserRole = 'superadmin' | 'match_admin' | 'referee';

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

// Abend-Aufstellung (Schiedsrichtermodus): pro Team wird EINMAL für den ganzen
// Spieltag-Abend festgelegt, wer anwesend ist und wer im Tor steht. Daraus
// werden je Einzelspiel die Abwesenden (Kader minus anwesend) und der Torwart
// abgeleitet, damit die Statistik/Punkte weiterhin stimmen.
export interface RosterTeam {
  present: string[]; // anwesende Spielernamen (aus dem Kader)
  goalkeeper?: string; // Torwart des Abends (Spielername), optional
}

export interface EveningRoster {
  minutes: number; // Spieldauer in Minuten (Countdown), Standard 7
  teams: Record<string, RosterTeam>; // teamId -> Aufstellung
}

// Gesamter Aufstellungs-Speicher, Schlüssel `${seasonId}:${matchday}`.
export type RosterMap = Record<string, EveningRoster>;

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
  teamId: string; // Verein-Zuordnung – eindeutig, auch bei gleichen Spielernamen in mehreren Teams
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

export type ActiveTab = 'home' | 'spielplan' | 'tabelle' | 'heroone' | 'statistiken' | 'highlights';
