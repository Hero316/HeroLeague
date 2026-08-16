export interface Player {
  name: string;
  imageUrl?: string;
  number?: number; // feste Trikotnummer (ab Saisonstart), optional
  captain?: boolean; // Mannschaftskapitän (max. einer pro Team, vom Superadmin gesetzt)
  goalkeeper?: boolean; // fester Torwart (max. einer pro Team) – nur Vorauswahl für die Abend-Aufstellung, dort weiter änderbar
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

// „Spieler des Spieltages" (früher „Spieler des Monats"). Der interne Schlüssel
// (playerOfMonth) und der Typname bleiben aus Kompatibilitätsgründen erhalten;
// die Auszeichnung ist jetzt auf einen einzelnen Spieltag bezogen.
export interface PlayerOfMonth {
  name: string;
  club: string;
  teamId?: string; // Verein-Zuordnung (für Wappen + Link zur Team-Seite)
  goals: number;
  assists: number;
  image: string;
  matchday?: number; // Spieltag-Nummer, ergibt „Spieler des Spieltages N" (0/leer = ohne Nummer)
  sponsorId?: string; // ID eines Partners (aus PartnersConfig), der die Auszeichnung sponsert (leer = keiner)
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

// Partner / Sponsoren-Logos für die Sektion ganz unten auf jeder Seite.
// Logos werden farbig (mit transparentem Hintergrund) hochgeladen; die
// Schwarz-Weiß-Darstellung macht die Website per CSS-Filter, Farbe erst beim
// Hovern. Hauptpartner stehen in einer eigenen, größeren Reihe oben.
// Stufe eines Partners: 'main' = Hauptpartner, 'bank' = Bankpartner (beide groß
// oben, mit Überschrift darüber), 'normal' = kleines Raster darunter.
export type PartnerTier = 'main' | 'bank' | 'normal';

export interface Partner {
  id: string;
  name: string; // interne Bezeichnung / Alt-Text fürs Logo
  logoUrl: string; // farbiges Logo (Blob-URL), leer = wird nicht angezeigt
  linkUrl: string; // Ziel-Link (leer = Logo nicht klickbar)
  tier: PartnerTier; // Hauptpartner / Bankpartner (groß, oben) oder normal (klein)
  label: string; // Überschrift über dem großen Logo, z. B. "Offizieller Bankpartner" (leer = keine)
}

export interface PartnersConfig {
  items: Partner[];
}

// Team-/Trikot-Sponsoren pro Verein. Werden auf der jeweiligen Teamseite als
// schlichte Logo-Liste angezeigt („Partner von <Team>"). Ein Team kann mehrere
// haben. Kein Haupt-/Normal-Konzept – einfach eine Liste.
export interface TeamSponsor {
  id: string;
  name: string; // interne Bezeichnung / Alt-Text
  logoUrl: string; // Logo (transparent), Blob-URL
  linkUrl: string; // Ziel-Link (leer = nicht klickbar)
  bg?: string; // Hintergrundfarbe der Logo-Kachel (Hex), Standard Weiß – für helle Logos änderbar
}

// Zuordnung Team-ID → Sponsoren dieses Teams.
export type TeamSponsorsMap = Record<string, TeamSponsor[]>;

// Klick-Statistik je Sponsor/Partner (Analytics). Legt sich beim ersten Klick
// automatisch an – auch für neue Sponsoren und neue Platzierungen.
export interface SponsorClickStat {
  name: string; // zuletzt bekannter Anzeigename
  total: number; // Klicks insgesamt
  placements: Record<string, number>; // Klicks je Platzierung (z.B. 'partners', 'team-sponsor')
  lastAt: string; // Zeitpunkt des letzten Klicks (ISO)
}
export type SponsorClicksMap = Record<string, SponsorClickStat>;

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
  dateLabel: string; // z.B. "Sonntag, 2. August 2026" (Anzeige-Text)
  date?: string; // 'YYYY-MM-DD' – echtes Datum für den Kalender (optional)
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
// pfeifen und die Abend-Aufstellung setzen; team_member sieht NUR den
// Team-Bereich (Tickets/Aufgaben/Chat mitarbeiten) – keinen Liga-Admin.
// Tickets VERWALTEN dürfen ausschließlich Super-Admins (keine eigene Rolle mehr).
export type UserRole = 'superadmin' | 'match_admin' | 'referee' | 'team_member';

// Zusätzliche, frei kombinierbare Rechte (unabhängig von der Basis-Rolle).
// Aktuell keine – bewusst leer gelassen (erweiterbar). Tickets verwalten hängt
// allein an der Super-Admin-Rolle, daher kein „Tickets bearbeiten"-Recht mehr.
export type AdminPermission = never;
export const ALL_ADMIN_PERMISSIONS: { id: AdminPermission; label: string }[] = [];

// Präsenz-Status (Slack-artig) mit Emoji + Farbe. Erweiterbar.
export type UserStatus = 'online' | 'away' | 'busy' | 'vacation' | 'out';
export const USER_STATUS: Record<UserStatus, { emoji: string; label: string; dot: string }> = {
  online: { emoji: '🟢', label: 'Online', dot: 'bg-emerald-400' },
  away: { emoji: '🌙', label: 'Abwesend', dot: 'bg-amber-400' },
  busy: { emoji: '⛔', label: 'Beschäftigt', dot: 'bg-rose-500' },
  vacation: { emoji: '🌴', label: 'Urlaub', dot: 'bg-sky-400' },
  out: { emoji: '🏠', label: 'Außer Haus', dot: 'bg-slate-400' },
};
export const USER_STATUS_LIST = Object.keys(USER_STATUS) as UserStatus[];

export interface AppUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  permissions: AdminPermission[];
  avatarUrl: string;
  status: UserStatus;
  isActive: boolean;
}

// Die im Frontend bekannte Identität der aktiven Sitzung
export interface SessionUser {
  id: string; // 'bootstrap' beim Master-Passwort-Login
  email: string;
  name: string;
  role: UserRole;
  permissions: AdminPermission[];
  avatarUrl: string;
  status: UserStatus;
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
  wins: number; // Siege in Spielen, in denen der Spieler eingesetzt war
  draws: number; // Unentschieden mit dem Spieler auf dem Feld
  losses: number; // Niederlagen mit dem Spieler auf dem Feld
  motmCount: number; // Anzahl „bester Spieler des Spiels"-Auszeichnungen
  cleanSheets: number; // Spiele als Torwart ohne Gegentor („zu null")
  gamesInGoal: number; // Spiele, in denen der Spieler im Tor stand
  goalsConceded: number; // kassierte Gegentore in seinen Torwart-Spielen
  points: number; // Ballon-d'Or-Wertung (aus Toren, Vorlagen, MOTM, Team-Ergebnis, Torwart-zu-null)
}

export type ActiveTab = 'home' | 'spielplan' | 'tabelle' | 'heroone' | 'statistiken' | 'highlights';

// --- Team-Zusammenarbeit: Tickets, Aufgaben, Benachrichtigungen -------------

// Mitglied des internen Teams (für Zuweisungen/Erwähnungen). Reduzierte, für
// jeden eingeloggten Nutzer lesbare Nutzerliste (nicht die volle AppUser-Liste).
export interface TeamMember {
  id: string;
  name: string; // Anzeigename (fällt auf E-Mail zurück, falls kein Name)
  role: UserRole;
  avatarUrl: string;
  status: UserStatus;
}

export type TicketPriority = 'niedrig' | 'mittel' | 'hoch' | 'dringend';
export type TicketStatus = 'offen' | 'in_bearbeitung' | 'erledigt' | 'abgelehnt';

// Benannter Link („Link-Taste"): url = Ziel, label = Anzeigetext (leer = Host).
export interface LinkItem {
  url: string;
  label: string;
}

export interface TicketComment {
  id: string;
  ticketId: string;
  authorId: string;
  authorName: string;
  body: string;
  images: string[];
  createdAt: string;
}

export interface Ticket {
  id: string;
  title: string;
  description: string;
  priority: TicketPriority;
  status: TicketStatus;
  category: string;
  images: string[]; // Screenshot-URLs (Vercel Blob)
  links: LinkItem[]; // benannte Link-Tasten
  createdBy: string;
  createdByName: string;
  assignedTo: string | null;
  assignedToName: string | null;
  createdAt: string;
  updatedAt: string;
  commentCount?: number; // nur in der Listenansicht
  comments?: TicketComment[]; // nur in der Detailansicht
}

// Aufgaben-Board (Monday-Style)
export type TaskStatus = 'leer' | 'offen' | 'in_bearbeitung' | 'erledigt' | 'abgebrochen';

export interface TaskComment {
  id: string;
  taskId: string;
  authorId: string;
  authorName: string;
  body: string;
  createdAt: string;
}

// Termin (Kalender-Eintrag) · Aufgabe (To-do mit Frist) · beides.
export type TaskKind = 'termin' | 'aufgabe' | 'beides';

export interface Task {
  id: string;
  title: string;
  notes: string;
  type: TaskKind; // termin = im Kalender, aufgabe = To-do mit Frist, beides = beides
  dueDate: string | null; // YYYY-MM-DD – START-Tag der Aufgabe (oder null)
  endDate: string | null; // YYYY-MM-DD – END-Tag (null = eintägig, Balken über mehrere Tage möglich)
  startTime: string | null; // "HH:MM" – Startzeit (null = ganztägig)
  endTime: string | null; // "HH:MM" – Endzeit (nur mit startTime sinnvoll)
  isoWeek: string | null; // z.B. "2026-W33" (Wochenansicht) oder null
  status: TaskStatus;
  priority: TicketPriority; // gleiche Stufen wie Tickets (niedrig…dringend)
  links: LinkItem[]; // benannte Link-Tasten (z.B. Google-Drive-Ordner)
  createdBy: string;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
  assignees: { userId: string; userName: string }[];
  commentCount?: number;
  comments?: TaskComment[];
}

// --- Ideen (Brainstorm) -----------------------------------------------------
// Eine Idee ist ein eigener kleiner Brainstorm-Bereich: Titel + Verlauf
// (jeder Teilnehmer schreibt Vorschläge) + ein manuelles Fazit. Ist sie fertig,
// kann daraus eine Aufgabe/ein Termin erstellt werden (verknüpft).
export type IdeaStatus = 'offen' | 'in_bearbeitung' | 'erledigt' | 'verworfen';

export interface IdeaComment {
  id: string;
  ideaId: string;
  authorId: string;
  authorName: string;
  body: string;
  // Chat-artige Medien-Anhänge im Brainstorm (Bild/Video/Datei = 'file', 'audio').
  attachType?: 'file' | 'audio' | null;
  attachUrl?: string | null;
  attachMime?: string | null;
  attachTitle?: string | null;
  createdAt: string;
}

export interface Idea {
  id: string;
  title: string;
  summary: string; // manuelles Fazit / Zusammenfassung
  status: IdeaStatus;
  links: LinkItem[]; // benannte Link-Tasten
  createdBy: string;
  createdByName: string;
  linkedTaskId: string | null; // gesetzt, wenn daraus eine Aufgabe/Termin wurde
  createdAt: string;
  updatedAt: string;
  members: { userId: string; userName: string }[];
  commentCount?: number;
  comments?: IdeaComment[];
}

// In-App-Benachrichtigung (Erwähnung, Zuweisung, neuer Kommentar, Chat, Idee)
export interface AppNotification {
  id: string;
  kind: string; // 'ticket_assigned' | 'ticket_comment' | 'task_assigned' | 'task_comment' | 'mention' | 'chat' | 'idea'
  refType: 'ticket' | 'task' | 'conversation' | 'idea';
  refId: string;
  body: string;
  isRead: boolean;
  createdAt: string;
}

// --- Phase 3: Chat ----------------------------------------------------------
export interface ConversationMember {
  userId: string;
  userName: string;
}

export interface ChatLastMessage {
  body: string;
  authorName: string;
  createdAt: string;
  attachType: 'ticket' | 'task' | 'file' | 'audio' | 'poll' | null;
  deleted?: boolean; // Nachricht wurde zurückgenommen
}

export interface MessageReaction {
  userId: string;
  emoji: string;
}

export interface Conversation {
  id: string;
  kind: 'group' | 'dm';
  title: string;
  avatarUrl: string; // Gruppenbild (leer = Standard-Icon)
  createdBy: string;
  updatedAt: string;
  members: ConversationMember[];
  unread: number;
  lastMessage: ChatLastMessage | null;
}

// Präsenz-Schnappschuss für den Chat: wer ist gerade online + wer tippt in der
// geöffneten Unterhaltung. Bewusst ohne Lesebestätigung.
export interface ChatPresence {
  online: string[]; // User-IDs mit frischem Heartbeat
  typing: { userId: string; userName: string }[]; // tippt in der aktiven Unterhaltung
}

export type ChatAttachType = 'ticket' | 'task' | 'file' | 'audio' | 'poll';

// Abstimmung (Umfrage) im Chat – wie bei WhatsApp.
export interface PollOption {
  id: string;
  text: string;
  count: number; // Anzahl Stimmen für diese Option
  mine: boolean; // habe ich selbst diese Option gewählt?
  voters: { userId: string; userName: string }[]; // leer bei anonymer Abstimmung
}
export interface Poll {
  id: string;
  question: string;
  multiple: boolean; // mehrere Antworten erlaubt
  anonymous: boolean; // Namen der Abstimmenden verbergen
  refType: 'ticket' | 'task' | null; // optional verknüpftes Ticket/Aufgabe/Termin
  refId: string | null;
  refTitle: string | null;
  totalVoters: number; // Anzahl verschiedener Abstimmender
  options: PollOption[];
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  parentId: string | null;
  authorId: string;
  authorName: string;
  body: string;
  attachType: ChatAttachType | null;
  attachId: string | null; // ticket/task: Entity-ID
  attachTitle: string | null; // Titel bzw. Dateiname
  attachUrl: string | null; // file/audio: Blob-URL
  attachMime: string | null; // file: MIME-Typ (für Vorschau/Icon)
  createdAt: string;
  editedAt?: string | null; // gesetzt = nachträglich bearbeitet
  deletedAt?: string | null; // gesetzt = für alle zurückgenommen
  reactions?: MessageReaction[]; // Emoji-Reaktionen
  replyCount?: number; // nur bei Top-Level-Nachrichten
  unreadReplies?: number; // ungelesene Thread-Antworten (Top-Level, für das Leuchten)
  poll?: Poll | null; // gesetzt, wenn attachType === 'poll'
}
