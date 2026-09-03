import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePolling } from './lib/usePolling';
import { Absence, BestPlayer, Goalkeeper, Match, PlayerStat, Scorer, Season, SessionUser, Team, ActiveTab, EventArchive, HighlightsConfig, HeroImages, CountdownConfig, NewsItem, RosterMap, EveningRoster, PlayerOfMonth, MatchPlayerStat, ScoringConfig } from './types';
import { apiFetch, setUnauthorizedHandler } from './lib/api';
import { fetchPublicStats, fetchEventStats, fetchScoring, saveEventMatch, saveEventAttendance } from './lib/stats';
import { eventTeamsAsTeams, eventMatchesAsMatches, eventPlayers } from './lib/eventView';
import { DEFAULT_SCORING } from './lib/scoring';
import { startPresence } from './lib/presence';
import { syncPush } from './lib/push';
import { seasonName } from './lib/heroAward';
import Navbar from './components/Navbar';
import Hero from './components/Hero';
import Tabelle from './components/Tabelle';
import Spielplan from './components/Spielplan';
import HeroOne from './components/HeroOne';
import Statistiken from './components/Statistiken';
import AdminPanel from './components/AdminPanel';
import AdminDashboard from './components/AdminDashboard';
import AdminLogin from './components/AdminLogin';
import UserManager from './components/UserManager';
import MatchManager from './components/MatchManager';
import RefereeMode from './components/RefereeMode';
import TeamDetail from './components/TeamDetail';
import LiveBanner from './components/LiveBanner';
import LiveTicker from './components/LiveTicker';
import InstallPrompt from './components/InstallPrompt';
import Ergebniszettel from './components/Ergebniszettel';
import LegalPage from './components/LegalPage';
import PageBackground from './components/PageBackground';
import MobileDock from './components/MobileDock';
import Countdown from './components/Countdown';
import EventPage, { EventTab } from './components/EventPage';
import EventBanner from './components/EventBanner';
import SeasonSignup from './components/SeasonSignup';
import SeasonSignupBanner from './components/SeasonSignupBanner';
import EventTickets from './components/EventTickets';
import SignupAdmin from './components/SignupAdmin';
import SeasonDraftManager from './components/SeasonDraftManager';
import TicketAdmin from './components/TicketAdmin';
import EventErgebniszettel from './components/EventErgebniszettel';
import HighlightsHome from './components/HighlightsHome';
import HighlightsPage from './components/HighlightsPage';
import ChatApp from './components/ChatApp';
import Avatar from './components/Avatar';
import DeepLinkModal from './components/DeepLinkModal';
import { PageHeader, Footer, AccordionGroup, AccordionSection } from './components/ui';
import { Shield, Sparkles, LogOut, ArrowLeft, CalendarPlus, History, Users, Printer, Pencil, Ticket, Trophy, ChevronRight, FlaskConical } from 'lucide-react';
import TrackingCenter from './components/TrackingCenter';
import SpielberichtPage from './components/SpielberichtPage';
import WertungenPage from './components/WertungenPage';

// Öffentliche Tabs haben eigene URLs, damit man nach einem Reload dort bleibt, wo man war.
const TAB_PATHS: Record<ActiveTab, string> = {
  home: '/',
  spielplan: '/spielplan',
  tabelle: '/tabelle',
  heroone: '/hero-one',
  statistiken: '/statistiken',
  highlights: '/highlights',
};

const tabFromPath = (path: string): ActiveTab => {
  const clean = path.replace(/\/+$/, '') || '/';
  const entry = (Object.entries(TAB_PATHS) as [ActiveTab, string][]).find(([, p]) => p === clean);
  return entry ? entry[0] : 'home';
};

export default function App() {
  const [currentPath, setCurrentPath] = useState<string>(window.location.pathname);
  // Aktiver Tab wird aus der URL abgeleitet – überlebt so den Reload
  const activeTab = tabFromPath(currentPath);

  const [teams, setTeams] = useState<Team[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [players, setPlayers] = useState<PlayerStat[]>([]);
  // Statistics Center: veröffentlichte getrackte Zähler + Score-Einstellungen
  // (für Spieler-FIFA-Karten und den Spielbericht). Öffentlich, ohne Login.
  const [trackingRows, setTrackingRows] = useState<MatchPlayerStat[]>([]);
  const [eventTrackingRows, setEventTrackingRows] = useState<MatchPlayerStat[]>([]);
  const [scoring, setScoring] = useState<ScoringConfig>(DEFAULT_SCORING);
  // Spieler des Monats schon beim Laden holen, damit der Hero direkt mit finaler
  // Höhe erscheint (sonst kommt der Slide asynchron dazu und der Hero „springt").
  const [pom, setPom] = useState<PlayerOfMonth | null>(null);
  const [eventArchive, setEventArchive] = useState<EventArchive | null>(null);
  const [highlights, setHighlights] = useState<HighlightsConfig>({ items: [], albums: [] });
  // Wenn aus der Story-Ansicht ein Ordner geöffnet wird: der Galerie-Seite mitgeben,
  // welcher Ordner direkt aufgeklappt starten soll. Wird nach dem Öffnen geleert.
  const [highlightsAlbumId, setHighlightsAlbumId] = useState<string | null>(null);
  // Eigene Hero-Hintergrundbilder (Startseite) – leer = Standard-Design
  const [heroImages, setHeroImages] = useState<HeroImages>({ match: '', pom: '', table: '' });
  // Countdown bis zum Anstoß (Startseite). active=false ⇒ normal.
  const [countdown, setCountdown] = useState<CountdownConfig>({ active: false, target: '2026-10-04T19:00', title: 'Till Season begins' });
  // Freie News fürs Laufband (im Admin gepflegt) – leer = nur automatische Ticker-Einträge
  const [news, setNews] = useState<NewsItem[]>([]);
  // Handy-Modus: Bottom-Dock zur Daumen-Steuerung. Pro Gerät gespeichert.
  const [mobileMode, setMobileMode] = useState<boolean>(() => {
    try {
      return localStorage.getItem('hl-mobile-mode') === '1';
    } catch {
      return false;
    }
  });
  const toggleMobileMode = () => setMobileMode((v) => !v);
  useEffect(() => {
    try {
      localStorage.setItem('hl-mobile-mode', mobileMode ? '1' : '0');
    } catch {
      /* localStorage nicht verfügbar – Modus bleibt für die Sitzung */
    }
  }, [mobileMode]);
  // Inline-Bearbeiten der Highlights (nur für angemeldete Admins wirksam)
  const [editMode, setEditMode] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const [sessionUser, setSessionUser] = useState<SessionUser | null>(null);
  // Aus einer Benachrichtigung direkt geöffnetes Ticket/Aufgabe (Deep-Link).
  const [deepOpen, setDeepOpen] = useState<{ type: 'ticket' | 'task'; id: string } | null>(null);
  const isAdmin = sessionUser !== null;
  const isSuperadmin = sessionUser?.role === 'superadmin';
  const isReferee = sessionUser?.role === 'referee';
  const isMatchAdmin = sessionUser?.role === 'match_admin';
  const isTeamMember = sessionUser?.role === 'team_member';
  // Reine Team-Mitglieder (Chat/Aufgaben/Tickets) haben KEIN Liga-Backoffice –
  // sie erreichen nur die Team-App (über das Hamburger-Menü). Backoffice bleibt
  // Super-Admins, Spiel-Admins und Schiedsrichtern vorbehalten.
  // Schiedsrichter sehen die normale Website + den Schiedsrichtermodus, aber kein
  // Backoffice (dort hätten sie ohnehin keine Rechte).
  const canAccessBackoffice = isAdmin && !isTeamMember && !isReferee;
  // Interne Team-App (Chat/Aufgaben/Kalender/Tickets/Ideen): für alle
  // eingeloggten Rollen AUSSER Schiedsrichter. Ein Schiri pfeift nur Spiele und
  // darf die internen Team-Daten GAR NICHT sehen (weder Oberfläche noch Daten).
  const canUseTeamApp = isAdmin && !isReferee;
  // Tickets verwalten (Status/Zuweisung/Löschen) dürfen nur Super-Admins.
  const canManageTickets = isSuperadmin;
  // Granulare Rechte – der Spiel-Admin bekommt bewusst nur einen Teil:
  const canManageMatches = isSuperadmin || isMatchAdmin; // Spielplan, Ergebnisse, Klubs, Ergebniszettel, Schiedsrichtermodus
  const canManageSeason = isSuperadmin; // Saison verwalten
  const canManagePom = isSuperadmin || isMatchAdmin; // Spieler des Monats
  const canEditHighlights = isSuperadmin || isMatchAdmin; // Highlights (öffentlich, inline)
  const canEditHomepage = isSuperadmin; // Startseite (Hero/Countdown), News-Ticker, Partner & Sponsoren
  const canManageChannels = isSuperadmin; // Twitch/Social, Event/Testspiel
  const canManageUsers = isSuperadmin; // Benutzerverwaltung
  // Sichtbares Event – rollenabhängig:
  //  • activeId  = öffentlich für ALLE sichtbar (echter Live-Gang).
  //  • previewId = „live", aber NUR für Super-Admins (Test vor dem Live-Gang);
  //    Besucher sehen die normale Seite ohne Event.
  const publicActiveEvent = eventArchive?.events?.find((e) => e.id === eventArchive?.activeId) ?? null;
  const staffPreviewEvent =
    isSuperadmin && eventArchive?.previewId ? eventArchive.events.find((e) => e.id === eventArchive.previewId) ?? null : null;
  const activeEvent = publicActiveEvent ?? staffPreviewEvent;
  // Event ist gerade NUR für Super-Admins sichtbar (Test-Modus) → Hinweis anzeigen.
  const eventStaffPreview = !publicActiveEvent && !!staffPreviewEvent;
  // Läuft gerade ein Spiel im sichtbaren Event?
  const eventHasLive = !!activeEvent?.matches?.some((m) => m.status === 'live');
  // Zuletzt angelegtes Event – Admin darf es auf /testspiel vorab prüfen.
  const lastEvent = eventArchive?.events?.length ? eventArchive.events[eventArchive.events.length - 1] : null;
  // Auf der Testspiel-Seite tatsächlich gezeigtes Event (aktiv, oder Admin-Vorschau).
  const shownEvent = activeEvent ?? (canManageChannels ? lastEvent : null);
  // Backoffice-Rubriken sichtbar, wenn mind. eine Sektion darin zugänglich ist:
  const canSeeLeagueArea = canManageMatches || canManageSeason;
  const canSeeStartseiteArea = canEditHomepage || canManagePom;
  const canSeeChannelsArea = canManageChannels;
  // Admin hat den Schiedsrichtermodus manuell geöffnet (per Navbar-Schnellzugang).
  // Abend-Aufstellungen (Schiedsrichtermodus), Schlüssel `${seasonId}:${matchday}`.
  const [roster, setRoster] = useState<RosterMap>({});
  const [selectedSeasonId, setSelectedSeasonId] = useState<string | null>(null);
  // Demo-Modus: komplette Zufalls-Kopie (eigene Teams + Saison). Echte Daten bleiben unberührt.
  const [demo, setDemo] = useState<{ active: boolean; seasonId: string; teamIds: string[] }>({
    active: false,
    seasonId: '',
    teamIds: [],
  });

  // Bei aktiver Demo wird die Demo-Saison als „aktuelle" behandelt (öffentlich + Backend)
  const demoSeason = useMemo(
    () => (demo.active ? seasons.find((s) => s.id === demo.seasonId) ?? null : null),
    [seasons, demo]
  );
  const currentSeason = useMemo(
    () => demoSeason ?? seasons.find((s) => s.isCurrent) ?? null,
    [seasons, demoSeason]
  );
  // Sichtbare Teams: im Demo-Modus nur die Demo-Kopien, sonst nur die echten (Demo ausgeblendet)
  const visibleTeams = useMemo(() => {
    const demoIds = new Set(demo.teamIds);
    return demo.active ? teams.filter((t) => demoIds.has(t.id)) : teams.filter((t) => !demoIds.has(t.id));
  }, [teams, demo]);
  // Saison-Umschalter: die interne Demo-Saison und Entwurf-Saisons (noch nicht
  // veröffentlicht) nie als wählbare Historie zeigen – Entwürfe bleiben öffentlich
  // komplett unsichtbar, bis sie live geschaltet werden.
  const visibleSeasons = useMemo(
    () => seasons.filter((s) => s.id !== demo.seasonId && !s.draft),
    [seasons, demo.seasonId]
  );

  const selectedSeason = useMemo(
    () => visibleSeasons.find((s) => s.id === selectedSeasonId) ?? currentSeason,
    [visibleSeasons, selectedSeasonId, currentSeason]
  );
  const isCurrentSeasonSelected = !selectedSeason || selectedSeason.id === currentSeason?.id;

  // Teams der Liga-Ansichten (Tabelle, Statistiken, HeroOne, Team-Detail): nur
  // die Vereine, die zur AUSGEWÄHLTEN (veröffentlichten) Saison gehören. So
  // tauchen Entwurf-/Season-2-Teams (z.B. Black Eagle) NICHT in Season 1 auf.
  // Rückwärtskompatibel: leere seasonIds = Altbestand → gehört zu allen Saisons.
  // Der Demo-Modus bleibt unberührt (eigene Kopien).
  const leagueTeams = useMemo(() => {
    if (demo.active || !selectedSeason) return visibleTeams;
    return visibleTeams.filter((t) => !t.seasonIds || t.seasonIds.length === 0 || t.seasonIds.includes(selectedSeason.id));
  }, [visibleTeams, selectedSeason, demo.active]);

  // Fortlaufende Saison-Nummer (1 = erste je angelegte Saison) für den HERO-Award-Titel:
  // erste Saison = HERO ONE, nächste = HERO TWO … Saisons kommen chronologisch (created_at)
  // vom Server. Die Demo-Saison spiegelt die Nummer der aktuellen echten Saison.
  const selectedSeasonNumber = useMemo(() => {
    const idx = selectedSeason ? visibleSeasons.findIndex((s) => s.id === selectedSeason.id) : -1;
    if (idx >= 0) return idx + 1;
    const currentReal = seasons.find((s) => s.isCurrent);
    const curIdx = currentReal ? visibleSeasons.findIndex((s) => s.id === currentReal.id) : -1;
    if (curIdx >= 0) return curIdx + 1;
    return visibleSeasons.length || 1;
  }, [selectedSeason, visibleSeasons, seasons]);

  // Nummer der aktuellen Saison – für das HERO-Award-Label in der Navigation (immer aktuell).
  const currentSeasonNumber = useMemo(() => {
    const idx = currentSeason ? visibleSeasons.findIndex((s) => s.id === currentSeason.id) : -1;
    return idx >= 0 ? idx + 1 : visibleSeasons.length || 1;
  }, [currentSeason, visibleSeasons]);

  // Anzeigename der Saison – „SEASON ONE/TWO …", abgeleitet aus der fortlaufenden
  // Nummer (analog zum HERO-Award). Ersetzt überall das alte Datums-Label ("2026/27").
  const selectedSeasonName = selectedSeason ? seasonName(selectedSeasonNumber) : '';
  const currentSeasonName = currentSeason ? seasonName(currentSeasonNumber) : '';
  // Name der nächsten (noch nicht angelegten) Saison – für den „Neue Saison"-Dialog.
  const nextSeasonName = seasonName((visibleSeasons.length || 0) + 1);

  // Spiele der ausgewählten Saison – Basis für alle öffentlichen Ansichten
  const seasonMatches = useMemo(
    () => (selectedSeason ? matches.filter((m) => m.seasonId === selectedSeason.id) : matches),
    [matches, selectedSeason]
  );
  // Spiele der aktiven Saison – Basis für die Admin-Pflege
  const currentSeasonMatches = useMemo(
    () => (currentSeason ? matches.filter((m) => m.seasonId === currentSeason.id) : matches),
    [matches, currentSeason]
  );

  const hasLiveMatch = useMemo(() => currentSeasonMatches.some((m) => m.status === 'live'), [currentSeasonMatches]);

  const fetchData = useCallback(async () => {
    try {
      const [dataTeams, dataMatches, dataSeasons, dataDemo, dataPom] = await Promise.all([
        apiFetch<Team[]>('/api/teams'),
        apiFetch<Match[]>('/api/matches'),
        apiFetch<Season[]>('/api/seasons'),
        apiFetch<{ active: boolean; seasonId: string; teamIds: string[] }>('/api/seasons?demo=1').catch(() => ({
          active: false,
          seasonId: '',
          teamIds: [],
        })),
        apiFetch<PlayerOfMonth>('/api/player-of-the-month').catch(() => null),
      ]);
      setTeams(dataTeams);
      setMatches(dataMatches);
      setSeasons(dataSeasons);
      setDemo(dataDemo);
      setPom(dataPom && dataPom.name ? dataPom : null);
    } catch (err) {
      console.error('Fehler beim Laden der Liga-Daten', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Eigene Hero-Hintergrundbilder laden (unkritisch – Fallback bleibt Standard)
  useEffect(() => {
    apiFetch<HeroImages>('/api/twitch?resource=hero')
      .then((data) => setHeroImages({ match: data.match || '', pom: data.pom || '', table: data.table || '' }))
      .catch(() => {
        // Kein eigenes Bild gepflegt – Standard-Design bleibt
      });
  }, []);

  // Countdown-Konfiguration laden (unkritisch – Fallback: aus)
  useEffect(() => {
    apiFetch<CountdownConfig>('/api/twitch?resource=countdown')
      .then((data) =>
        setCountdown({
          active: !!data.active,
          target: data.target || '2026-10-04T19:00',
          title: typeof data.title === 'string' ? data.title : 'Till Season begins',
        })
      )
      .catch(() => {
        /* nicht konfiguriert – Countdown bleibt aus */
      });
  }, []);

  // Freie News fürs Laufband laden (unkritisch – Fallback: keine)
  useEffect(() => {
    apiFetch<{ items: NewsItem[] }>('/api/twitch?resource=news')
      .then((data) => setNews(Array.isArray(data?.items) ? data.items : []))
      .catch(() => {
        /* noch keine News gepflegt – Ticker zeigt nur automatische Einträge */
      });
  }, []);

  // Spielerstatistiken hängen an der ausgewählten Saison
  useEffect(() => {
    const seasonId = selectedSeason?.id;
    const query = seasonId ? `?season=${encodeURIComponent(seasonId)}` : '';
    apiFetch<PlayerStat[]>(`/api/players${query}`)
      .then(setPlayers)
      .catch((err) => console.error('Fehler beim Laden der Spielerstatistiken', err));
  }, [selectedSeason?.id, matches, teams]);

  // Solange ein Spiel live ist: regelmäßig nachladen, damit Besucher den Spielstand
  // und die Torschützen ohne Neuladen mitverfolgen. Endet das Spiel, stoppt das Polling.
  // Nur im sichtbaren Tab (usePolling): Im Hintergrund pausiert das Nachladen, damit die
  // nutzungsbasiert abgerechnete Datenbank in ruhigen Phasen schlafen kann.
  usePolling(fetchData, 15_000, { enabled: hasLiveMatch, immediate: false });

  // Beim Zurückkehren zum Tab sofort den aktuellen Stand holen
  useEffect(() => {
    const onFocus = () => fetchData();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [fetchData]);

  // Anonyme Besucherzählung: nur echte Website-Besucher melden, nicht das
  // Backoffice oder den Ergebniszettel. Speist die Live-Anzeige im Backend.
  const isPublicPath =
    !currentPath.startsWith('/admin') && !currentPath.startsWith('/ergebniszettel') && !currentPath.startsWith('/chat');
  useEffect(() => {
    if (!isPublicPath) return;
    return startPresence();
  }, [isPublicPath]);

  useEffect(() => {
    setUnauthorizedHandler(() => setSessionUser(null));

    fetchData();
    apiFetch<{ isAdmin: boolean; user: SessionUser | null }>('/api/auth/session')
      .then((data) => setSessionUser(data.user))
      .catch(() => setSessionUser(null));
    apiFetch<EventArchive>('/api/twitch?resource=event')
      .then((data) => setEventArchive(data))
      .catch(() => setEventArchive(null));
    apiFetch<HighlightsConfig>('/api/twitch?resource=highlights')
      .then((data) =>
        setHighlights({
          items: Array.isArray(data?.items) ? data.items : [],
          albums: Array.isArray(data?.albums) ? data.albums : [],
        })
      )
      .catch(() => {
        /* noch nichts gepflegt – Bereich bleibt leer/unsichtbar */
      });

    const handlePopState = () => setCurrentPath(window.location.pathname);
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [fetchData]);

  // Event-Daten regelmäßig nachladen, damit Live-Ergebnisse/Status ohne
  // Neuladen erscheinen (Tabelle, Torschützen, Live-Anzeige).
  // Nur im sichtbaren Tab (usePolling); ohne laufendes Spiel reicht ein längerer Takt.
  usePolling(
    () => {
      apiFetch<EventArchive>('/api/twitch?resource=event')
        .then((data) => setEventArchive(data))
        .catch(() => {});
    },
    eventHasLive || hasLiveMatch ? 20_000 : 60_000,
    { immediate: false },
  );

  // App-Identität je nach Bereich umschalten: unter /chat ist es die eigene
  // „Hero Team"-App (eigenes Manifest, eigenes Symbol, startet direkt im Chat),
  // sonst die Hauptseite „Hero League". Wichtig fürs Installieren:
  //  • Android/Chrome liest das Manifest (eigenes `id` → getrennte App).
  //  • iPhone/iPad liest apple-touch-icon + Titel aus dem <head> im Moment des
  //    „Zum Home-Bildschirm". Deshalb hier dynamisch mitsetzen, damit die
  //    Team-App auf dem iPhone ihr eigenes Symbol und ihren eigenen Namen bekommt.
  useEffect(() => {
    const inChat = currentPath.startsWith('/chat');
    const setAttr = (selector: string, attr: string, value: string) => {
      const el = document.querySelector(selector);
      if (el) el.setAttribute(attr, value);
    };
    setAttr('link[rel="manifest"]', 'href', inChat ? '/chat.webmanifest' : '/manifest.webmanifest');
    setAttr('link[rel="apple-touch-icon"]', 'href', inChat ? '/assets/chat-apple-touch-icon.png' : '/assets/apple-touch-icon.png');
    setAttr('meta[name="apple-mobile-web-app-title"]', 'content', inChat ? 'Hero Team' : 'Hero League');
    setAttr('meta[name="theme-color"]', 'content', inChat ? '#070d0c' : '#060E0F');
  }, [currentPath]);

  // Team-Mitglieder haben kein Backoffice: Wer als team_member auf /admin landet
  // (z.B. nach dem Login über die Anmeldemaske dort), wird auf die normale
  // Startseite geschickt – von dort geht es über das Hamburger-Menü in die
  // Team-App. Andere Rollen (Super-Admin, Spiel-Admin, Schiri) bleiben.
  useEffect(() => {
    if ((isTeamMember || isReferee) && currentPath === '/admin') navigateTo('/');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTeamMember, isReferee, currentPath]);

  // Deep-Link aus einer Handy-Benachrichtigung: /admin?open=ticket&id=… bzw.
  // …?open=task&id=… → das Ticket/die Aufgabe direkt als Fenster öffnen. Danach
  // die URL säubern, damit ein Neuladen nicht erneut öffnet. (Chat-Deep-Links
  // laufen über /chat?c=… und werden dort direkt geöffnet.)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const open = params.get('open');
    const id = params.get('id');
    if ((open === 'ticket' || open === 'task') && id) {
      setDeepOpen({ type: open, id });
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [currentPath]);

  // Merkt sich, ob innerhalb der App navigiert wurde (für „Zurück").
  const navigatedInApp = useRef(false);

  const navigateTo = (path: string, opts?: { keepScroll?: boolean }) => {
    window.history.pushState({}, '', path);
    navigatedInApp.current = true;
    setCurrentPath(path);
    // Neue Seite (z.B. Vereinsseite) immer oben starten – außer bei reinen
    // Reiter-Wechseln auf derselben Seite (z.B. Testspiel Tabelle↔Spielplan),
    // da soll die Scroll-Position erhalten bleiben.
    if (!opts?.keepScroll) window.scrollTo({ top: 0 });
  };

  // Ziel einer Benachrichtigung öffnen (Glocke): Chat → eigene Seite, Idee →
  // Ideen-Bereich der Team-App, Ticket/Aufgabe → Detail-Fenster direkt hier.
  const openNotificationTarget = (refType: 'ticket' | 'task' | 'conversation' | 'idea', refId: string) => {
    if (refType === 'conversation') navigateTo(`/chat?c=${encodeURIComponent(refId)}`);
    else if (refType === 'idea') navigateTo(`/chat?tab=ideen&openIdea=${encodeURIComponent(refId)}`);
    else setDeepOpen({ type: refType, id: refId });
  };

  // Zurück zur zuletzt besuchten Seite (statt fest zur Startseite). Wurde die
  // Seite direkt per Link geöffnet (keine In-App-Historie), geht es zur Startseite.
  const goBack = () => {
    if (navigatedInApp.current) window.history.back();
    else navigateTo('/');
  };

  const handleLogout = async () => {
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // Cookie ist ggf. schon abgelaufen – lokal trotzdem abmelden
    }
    setSessionUser(null);
  };

  // Fehler aus Admin-Aktionen sichtbar machen statt still zu schlucken
  const runAdminAction = async (action: () => Promise<unknown>) => {
    try {
      await action();
      await fetchData();
      return true;
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Unbekannter Fehler');
      return false;
    }
  };

  // Abend-Aufstellungen laden (Schiedsrichtermodus).
  const fetchRoster = useCallback(async () => {
    try {
      setRoster(await apiFetch<RosterMap>('/api/twitch?resource=roster'));
    } catch {
      /* Aufstellung ist optional – Bereich bleibt leer */
    }
  }, []);

  // Bearbeiten-Modus nur für Admins – beim Abmelden automatisch verlassen.
  useEffect(() => {
    if (!canEditHighlights) setEditMode(false);
  }, [canEditHighlights]);

  // Score-Einstellungen einmalig laden.
  useEffect(() => {
    fetchScoring()
      .then(setScoring)
      .catch(() => {
        /* Defaults bleiben */
      });
  }, []);

  // Getrackte Werte (nur veröffentlichte) der AKTIVEN Saison laden – reagiert auf
  // die Demo-Umschaltung, sodass die Website im Demo-Modus nur Demo-Tracking zeigt.
  useEffect(() => {
    const sid = currentSeason?.id;
    if (!sid) {
      setTrackingRows([]);
      return;
    }
    // Im Demo-Modus auch Entwürfe zeigen (ohne „Live schalten") – nur Demo-Saison.
    fetchPublicStats(sid, demo.active)
      .then((r) => setTrackingRows(r.rows))
      .catch(() => {
        /* keine Daten – Karten bleiben verborgen */
      });
  }, [currentSeason?.id, demo.active]);

  // Spiele, für die es getrackte Werte gibt (→ Spielbericht anklickbar).
  const reportMatchIds = useMemo(() => new Set(trackingRows.map((r) => r.matchId)), [trackingRows]);

  // Veröffentlichte Roh-Daten des gezeigten Testspiels laden (Event-Spielberichte).
  useEffect(() => {
    const evId = shownEvent?.id;
    if (!evId) {
      setEventTrackingRows([]);
      return;
    }
    fetchEventStats(evId)
      .then((r) => setEventTrackingRows(r.rows))
      .catch(() => setEventTrackingRows([]));
  }, [shownEvent?.id, eventHasLive]);

  // Event-Spiele, für die es veröffentlichte Werte gibt (→ Spielbericht anklickbar).
  const eventReportMatchIds = useMemo(() => new Set(eventTrackingRows.map((r) => r.matchId)), [eventTrackingRows]);

  // Aufstellungen laden, sobald jemand angemeldet ist (für den Schiedsrichtermodus).
  useEffect(() => {
    if (sessionUser) fetchRoster();
  }, [sessionUser, fetchRoster]);

  // Push-Abo lebendig halten: Sobald jemand angemeldet ist – und jedes Mal, wenn
  // die App wieder in den Vordergrund kommt – ein zuvor gewünschtes (aber vom
  // Browser evtl. verworfenes) Abo wiederherstellen und serverseitig auffrischen.
  // Best-effort – ohne Wunsch/Erlaubnis passiert nichts.
  // WICHTIG: Nur in der Team-App (/chat). Das Backend/die Hero-League-App legt
  // bewusst KEIN Push-Abo mehr an – so kommen dort keine Benachrichtigungen an.
  useEffect(() => {
    if (!sessionUser || !currentPath.startsWith('/chat')) return;
    const beat = () => {
      if (document.visibilityState === 'visible') syncPush().catch(() => {});
    };
    beat();
    document.addEventListener('visibilitychange', beat);
    return () => document.removeEventListener('visibilitychange', beat);
  }, [sessionUser, currentPath]);

  // Highlights speichern (optimistisch): erst lokal setzen, dann serverseitig
  // schützen lassen. Schlägt das Speichern fehl, wird zurückgerollt.
  const persistHighlights = async (next: HighlightsConfig) => {
    const previous = highlights;
    setHighlights(next);
    try {
      const saved = await apiFetch<HighlightsConfig>('/api/twitch?resource=highlights', {
        method: 'POST',
        body: JSON.stringify(next),
      });
      setHighlights({
        items: Array.isArray(saved?.items) ? saved.items : [],
        albums: Array.isArray(saved?.albums) ? saved.albums : [],
      });
    } catch (err) {
      setHighlights(previous);
      alert(err instanceof Error ? err.message : 'Fehler beim Speichern der Highlights.');
    }
  };

  // Menüpunkt „Highlights“ zeigen, sobald Medien/Ordner vorhanden sind – Admins
  // sehen ihn immer (auch leer), um die Galerie pflegen zu können.
  const hasHighlights = highlights.items.length > 0 || highlights.albums.length > 0 || canEditHighlights;

  const handleUpdateMatchScore = (
    matchId: string,
    homeScore: number | null,
    awayScore: number | null,
    status: 'geplant' | 'live' | 'beendet',
    scorers?: Scorer[],
    absentees?: Absence[],
    bestPlayers?: BestPlayer[],
    goalkeepers?: Goalkeeper[]
  ) =>
    runAdminAction(() =>
      apiFetch(`/api/matches/${matchId}`, {
        method: 'PUT',
        body: JSON.stringify({ homeScore, awayScore, status, scorers, absentees, bestPlayers, goalkeepers }),
      })
    );

  const handleUpdateMatchMeta = (
    matchId: string,
    data: { matchday: number; date: string; time: string; homeTeamId: string; awayTeamId: string; venue: string }
  ) =>
    runAdminAction(() =>
      apiFetch(`/api/matches/${matchId}`, { method: 'PUT', body: JSON.stringify(data) })
    );

  // Aufstellung (Anwesende + Torwart + Spieldauer) für einen Spieltag speichern.
  const handleSaveRoster = (
    seasonId: string,
    matchday: number,
    minutes: number,
    teams: EveningRoster['teams'],
    numbers?: Record<string, Record<string, number | null>>
  ) =>
    runAdminAction(async () => {
      await apiFetch('/api/twitch?resource=roster', {
        method: 'POST',
        body: JSON.stringify({ seasonId, matchday, minutes, teams, numbers }),
      });
      await fetchRoster();
    });

  // Generisches Spiel-Update für den Schiedsrichtermodus (Ergebnis, Status,
  // Torschützen, Torwart, bester Spieler, Spieldauer). Speichert sofort.
  const handleRefereeUpdateMatch = (matchId: string, patch: Partial<Match>) =>
    runAdminAction(() => apiFetch(`/api/matches/${matchId}`, { method: 'PUT', body: JSON.stringify(patch) }));

  // Event-Archiv neu laden (für den Schiedsrichter-Refresh, damit parallele
  // Änderungen am zweiten Feld erscheinen).
  const refetchEventArchive = async () => {
    try {
      setEventArchive(await apiFetch<EventArchive>('/api/twitch?resource=event'));
    } catch {
      /* egal – bleibt beim letzten Stand */
    }
  };

  // Schiedsrichter: ein EINZELNES Event-Spiel aktualisieren (live, Tore, Abpfiff).
  const handleRefereeUpdateEventMatch = async (matchId: string, patch: Partial<Match>): Promise<boolean> => {
    if (!shownEvent) return false;
    try {
      const updated = await saveEventMatch(shownEvent.id, matchId, patch);
      setEventArchive(updated);
      return true;
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Fehler beim Speichern.');
      return false;
    }
  };

  // Schiedsrichter: Anwesenheit + Spieldauer fürs Testspiel setzen (wirkt auch
  // im Statistik-Center, weil beide dieselben Event-Abwesenden lesen).
  const handleRefereeEventAttendance = async (minutes: number, teams: EveningRoster['teams']): Promise<boolean> => {
    if (!shownEvent) return false;
    try {
      const updated = await saveEventAttendance(shownEvent.id, teams, minutes);
      setEventArchive(updated);
      return true;
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Fehler beim Speichern.');
      return false;
    }
  };

  const handleAddTeam = (newTeam: Omit<Team, 'id'>) =>
    runAdminAction(() => apiFetch('/api/teams', { method: 'POST', body: JSON.stringify(newTeam) }));

  const handleEditTeam = (teamId: string, updatedData: Partial<Team>) =>
    runAdminAction(() =>
      apiFetch(`/api/teams/${teamId}`, { method: 'PUT', body: JSON.stringify(updatedData) })
    );

  const handleDeleteTeam = (teamId: string) =>
    runAdminAction(() => apiFetch(`/api/teams/${teamId}`, { method: 'DELETE' }));

  const handleAddMatch = (data: {
    matchday: number;
    homeTeamId: string;
    awayTeamId: string;
    date: string;
    time: string;
    venue: string;
  }) => runAdminAction(() => apiFetch('/api/matches', { method: 'POST', body: JSON.stringify(data) }));

  const handleDeleteMatch = (matchId: string) =>
    runAdminAction(() => apiFetch(`/api/matches/${matchId}`, { method: 'DELETE' }));

  const handleStartSeason = async (label: string) => {
    const ok = await runAdminAction(() =>
      apiFetch('/api/seasons', { method: 'POST', body: JSON.stringify({ label }) })
    );
    if (ok) setSelectedSeasonId(null); // auf die neue aktive Saison springen
    return ok;
  };

  // --- Mehr-Saison-System: Entwurf-Saison vorbereiten & veröffentlichen -------
  const handleCreateDraftSeason = (label: string) =>
    runAdminAction(() => apiFetch('/api/seasons', { method: 'POST', body: JSON.stringify({ label, draft: true }) }));
  const handlePublishSeason = async (id: string) => {
    const ok = await runAdminAction(() =>
      apiFetch('/api/seasons', { method: 'POST', body: JSON.stringify({ action: 'publishSeason', id }) })
    );
    if (ok) setSelectedSeasonId(null); // auf die neu veröffentlichte (aktive) Saison springen
    return ok;
  };
  const handleDeleteDraftSeason = (id: string) =>
    runAdminAction(() => apiFetch('/api/seasons', { method: 'POST', body: JSON.stringify({ action: 'deleteDraftSeason', id }) }));
  const handleSetCurrentSeason = async (id: string) => {
    const ok = await runAdminAction(() =>
      apiFetch('/api/seasons', { method: 'POST', body: JSON.stringify({ action: 'setCurrentSeason', id }) })
    );
    if (ok) setSelectedSeasonId(null);
    return ok;
  };
  const handleAddTeamToSeason = (teamId: string, seasonId: string) =>
    runAdminAction(() => apiFetch('/api/teams', { method: 'POST', body: JSON.stringify({ action: 'addToSeason', teamId, seasonId }) }));
  const handleRemoveTeamFromSeason = (teamId: string, seasonId: string) =>
    runAdminAction(() => apiFetch('/api/teams', { method: 'POST', body: JSON.stringify({ action: 'removeFromSeason', teamId, seasonId }) }));
  const handleAddTeamForSeason = (newTeam: Omit<Team, 'id'>, seasonId: string) =>
    runAdminAction(() => apiFetch('/api/teams', { method: 'POST', body: JSON.stringify({ ...newTeam, seasonIds: [seasonId] }) }));

  // Demo an-/ausschalten: legt die Zufalls-Kopie an bzw. entfernt sie wieder.
  const handleToggleDemo = async () => {
    const action = demo.active ? 'demoDeactivate' : 'demoActivate';
    const ok = await runAdminAction(() =>
      apiFetch('/api/seasons', { method: 'POST', body: JSON.stringify({ action }) })
    );
    if (ok) setSelectedSeasonId(null); // im Demo-Modus die Demo-Saison zeigen
    return ok;
  };

  // Vereinsseite öffnen; mit playerName direkt das Spieler-Detail (teilbare URL).
  const openTeamDetail = (teamId: string, playerName?: string) =>
    navigateTo(
      playerName
        ? `/verein/${encodeURIComponent(teamId)}/spieler/${encodeURIComponent(playerName)}`
        : `/verein/${encodeURIComponent(teamId)}`
    );

  const goToTab = (tab: ActiveTab) => {
    navigateTo(TAB_PATHS[tab]);
  };

  // Aus der Story-Ansicht heraus direkt in den ganzen Ordner (Galerie) springen.
  const openHighlightsAlbum = (albumId: string) => {
    setHighlightsAlbumId(albumId);
    goToTab('highlights');
  };

  // Aus der Suche zu einem bestimmten Spieltag im Spielplan springen.
  const [spielplanMatchday, setSpielplanMatchday] = useState<number | null>(null);
  const goToMatchday = (matchday: number) => {
    setSpielplanMatchday(matchday);
    goToTab('spielplan');
  };

  // Bottom-Dock (Handy-Modus). onEventPage = gerade die Testspiel-Seite offen.
  const renderMobileDock = (onEventPage = false) =>
    mobileMode ? (
      <MobileDock
        activeTab={activeTab}
        onNavigate={goToTab}
        hasHighlights={hasHighlights}
        eventActive={!!activeEvent}
        eventTitle={activeEvent?.title}
        onOpenEvent={() => navigateTo('/testspiel')}
        onEventPage={onEventPage}
      />
    ) : null;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-brand-dark text-white flex items-center justify-center font-sans">
        <img src="/assets/hero-league-logo.png" alt="Hero League" className="h-24 w-auto" />
      </div>
    );
  }

  // Fester Einstiegs-Link für Schiedsrichter: <website>/schiedsrichter.
  // Nicht eingeloggt ⇒ Login-Maske; eingeloggt mit Spiel-Rechten ⇒ Modus (unten).
  // Groß-/Kleinschreibung egal: /schiedsrichter, /Schiedsrichter, /SCHIRI-URL …
  const onRefereePath = /^\/schiedsrichter(\/|$)/i.test(currentPath) || /^\/schiri(\/|$)/i.test(currentPath);
  if (onRefereePath && !sessionUser) {
    return (
      <div className="min-h-screen text-hl-text font-sans flex flex-col justify-between">
        <PageBackground page="default" />
        <header
          className="border-b border-white/[.07] bg-[rgba(7,10,8,.72)] backdrop-blur-xl px-6 py-4"
          style={{ paddingTop: 'calc(env(safe-area-inset-top) + 1rem)' }}
        >
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <img src="/assets/hero-league-logo.png" alt="Hero League" className="h-9 w-auto" />
              <span className="font-sans font-semibold text-[11px] tracking-[2px] text-hl-dim uppercase">Schiedsrichter</span>
            </div>
            <button
              onClick={() => navigateTo('/')}
              className="flex items-center space-x-1 text-xs text-hl-mute hover:text-white transition-colors uppercase tracking-wider font-semibold font-sans cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Zurück zur Website</span>
            </button>
          </div>
        </header>
        <main className="flex-1 flex items-center justify-center p-6">
          <AdminLogin onLoginSuccess={(user) => setSessionUser(user)} />
        </main>
      </div>
    );
  }

  // Schiedsrichtermodus ist eine echte Route (/schiedsrichter): Schiedsrichter und
  // Match-Admins gelangen über das Hamburger-Menü rein und können jederzeit zurück
  // zur normalen Website. Weil es in der URL steckt, bleibt man beim Aktualisieren
  // / Runterziehen im Modus (kein Sprung zur Startseite mehr).
  if (sessionUser && onRefereePath && (isReferee || canManageMatches)) {
    return (
      <RefereeMode
        user={sessionUser}
        teams={visibleTeams}
        matches={currentSeasonMatches}
        seasonId={currentSeason?.id ?? ''}
        roster={roster}
        onUpdateMatch={handleRefereeUpdateMatch}
        onSaveRoster={handleSaveRoster}
        onRefresh={async () => { await fetchData(); await refetchEventArchive(); }}
        onLogout={handleLogout}
        onExit={() => navigateTo('/')}
        eventTeams={shownEvent ? eventTeamsAsTeams(shownEvent, visibleTeams) : undefined}
        eventMatches={shownEvent ? eventMatchesAsMatches(shownEvent) : undefined}
        eventLabel={shownEvent?.title || 'Testspiel'}
        onUpdateEventMatch={handleRefereeUpdateEventMatch}
        onSaveEventAttendance={handleRefereeEventAttendance}
      />
    );
  }

  // ROUTE: /impressum & /datenschutz – rechtliche Pflichtseiten (aus dem Footer erreichbar)
  if (currentPath === '/impressum' || currentPath === '/datenschutz') {
    const kind = currentPath === '/impressum' ? 'impressum' : 'datenschutz';
    return (
      <div className="min-h-screen text-hl-text font-sans flex flex-col">
        <PageBackground page="default" />
        <Navbar
          activeTab={activeTab}
          setActiveTab={goToTab}
          isAdmin={isAdmin}
          canAccessBackoffice={canAccessBackoffice}
          onLogout={handleLogout}
          onOpenLogin={() => navigateTo('/admin')}
          onOpenBackoffice={() => navigateTo('/admin')} onOpenChat={canUseTeamApp ? () => navigateTo('/chat') : undefined}
          onOpenReferee={(canManageMatches || isReferee) ? () => navigateTo('/schiedsrichter') : undefined}
          demoActive={demo.active}
          seasonLabel={selectedSeasonName}
          seasonNumber={currentSeasonNumber}
          hasLiveMatch={hasLiveMatch}
          eventActive={!!activeEvent}
          eventTitle={activeEvent?.title}
          onOpenEvent={() => navigateTo('/testspiel')}
          hasHighlights={hasHighlights}
          mobileMode={mobileMode}
          onToggleMobileMode={toggleMobileMode}
          teams={visibleTeams}
          matches={currentSeasonMatches}
          onSelectTeam={openTeamDetail}
          onGoToMatchday={goToMatchday}
          albums={highlights.albums}
          onOpenAlbum={openHighlightsAlbum}
        />
        <main className="flex-1">
          <LegalPage kind={kind} onBack={goBack} />
        </main>
        <Footer onNavigate={goToTab} onNavigatePath={navigateTo} />
      </div>
    );
  }

  // ROUTE: /wertungen – öffentliche Auszeichnungen aus getrackten Daten
  if (currentPath.startsWith('/wertungen')) {
    return (
      <div className="min-h-screen text-hl-text font-sans flex flex-col overflow-x-clip">
        <PageBackground page="heroone" />
        {renderMobileDock()}
        <Navbar
          activeTab={activeTab}
          setActiveTab={goToTab}
          isAdmin={isAdmin}
          canAccessBackoffice={canAccessBackoffice}
          onLogout={handleLogout}
          onOpenLogin={() => navigateTo('/admin')}
          onOpenBackoffice={() => navigateTo('/admin')} onOpenChat={canUseTeamApp ? () => navigateTo('/chat') : undefined}
          onOpenReferee={(canManageMatches || isReferee) ? () => navigateTo('/schiedsrichter') : undefined}
          demoActive={demo.active}
          seasonLabel={selectedSeasonName}
          seasonNumber={currentSeasonNumber}
          hasLiveMatch={hasLiveMatch}
          eventActive={!!activeEvent}
          eventTitle={activeEvent?.title}
          onOpenEvent={() => navigateTo('/testspiel')}
          hasHighlights={hasHighlights}
          mobileMode={mobileMode}
          onToggleMobileMode={toggleMobileMode}
          teams={visibleTeams}
          matches={currentSeasonMatches}
          onSelectTeam={openTeamDetail}
          onGoToMatchday={goToMatchday}
          albums={highlights.albums}
          onOpenAlbum={openHighlightsAlbum}
        />
        <main className="flex-1">
          <WertungenPage
            rows={trackingRows}
            cfg={scoring}
            teams={visibleTeams}
            matches={currentSeasonMatches}
            seasonLabel={selectedSeasonName}
            onBack={goBack}
            onSelectPlayer={(teamId, name) =>
              navigateTo(`/verein/${encodeURIComponent(teamId)}/spieler/${encodeURIComponent(name)}`)
            }
          />
        </main>
        <Footer onNavigate={goToTab} onNavigatePath={navigateTo} />
      </div>
    );
  }

  // ROUTE: /spiel/:id – öffentlicher Spielbericht (Einzelnoten aus getrackten Daten)
  if (currentPath.startsWith('/spiel/')) {
    const matchId = decodeURIComponent(currentPath.slice('/spiel/'.length).replace(/\/+$/, ''));
    const match = matches.find((m) => m.id === matchId) ?? null;
    return (
      <div className="min-h-screen text-hl-text font-sans flex flex-col overflow-x-clip">
        <PageBackground page="tabelle" />
        {renderMobileDock()}
        <Navbar
          activeTab={activeTab}
          setActiveTab={goToTab}
          isAdmin={isAdmin}
          canAccessBackoffice={canAccessBackoffice}
          onLogout={handleLogout}
          onOpenLogin={() => navigateTo('/admin')}
          onOpenBackoffice={() => navigateTo('/admin')} onOpenChat={canUseTeamApp ? () => navigateTo('/chat') : undefined}
          onOpenReferee={(canManageMatches || isReferee) ? () => navigateTo('/schiedsrichter') : undefined}
          demoActive={demo.active}
          seasonLabel={selectedSeasonName}
          seasonNumber={currentSeasonNumber}
          hasLiveMatch={hasLiveMatch}
          eventActive={!!activeEvent}
          eventTitle={activeEvent?.title}
          onOpenEvent={() => navigateTo('/testspiel')}
          hasHighlights={hasHighlights}
          mobileMode={mobileMode}
          onToggleMobileMode={toggleMobileMode}
          teams={visibleTeams}
          matches={currentSeasonMatches}
          onSelectTeam={openTeamDetail}
          onGoToMatchday={goToMatchday}
          albums={highlights.albums}
          onOpenAlbum={openHighlightsAlbum}
        />
        <main className="flex-1">
          {match ? (
            <SpielberichtPage
              match={match}
              teams={visibleTeams}
              rows={trackingRows}
              cfg={scoring}
              onBack={goBack}
              onSelectPlayer={(teamId, name) =>
                navigateTo(`/verein/${encodeURIComponent(teamId)}/spieler/${encodeURIComponent(name)}`)
              }
              onSelectTeam={openTeamDetail}
            />
          ) : (
            <div className="text-center py-24 space-y-4">
              <p className="text-hl-mute font-sans">Dieses Spiel gibt es nicht (mehr).</p>
              <button
                onClick={() => navigateTo('/')}
                className="inline-flex items-center gap-1.5 text-xs font-sans font-bold uppercase tracking-wider text-brand-accent-light hover:underline cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Zurück zur Übersicht
              </button>
            </div>
          )}
        </main>
        <Footer onNavigate={goToTab} onNavigatePath={navigateTo} />
      </div>
    );
  }

  // ROUTE: /verein/:id – öffentliche Vereins-Detailseite
  if (currentPath.startsWith('/verein/')) {
    // Pfad: /verein/<id>  oder  /verein/<id>/spieler/<name> (Spieler direkt geöffnet)
    const rest = currentPath.slice('/verein/'.length).replace(/\/+$/, '');
    const sepIdx = rest.indexOf('/spieler/');
    const teamId = decodeURIComponent(sepIdx >= 0 ? rest.slice(0, sepIdx) : rest);
    const initialPlayer = sepIdx >= 0 ? decodeURIComponent(rest.slice(sepIdx + '/spieler/'.length)) : undefined;
    const team = visibleTeams.find((t) => t.id === teamId);
    return (
      <div className="min-h-screen text-hl-text font-sans flex flex-col overflow-x-clip">
        <PageBackground page="tabelle" teamColor={team?.logoColor} teamLogoUrl={team?.logoUrl} />
        {renderMobileDock()}
        <Navbar
          activeTab={activeTab}
          setActiveTab={goToTab}
          isAdmin={isAdmin}
          canAccessBackoffice={canAccessBackoffice}
          onLogout={handleLogout}
          onOpenLogin={() => navigateTo('/admin')}
          onOpenBackoffice={() => navigateTo('/admin')} onOpenChat={canUseTeamApp ? () => navigateTo('/chat') : undefined}
          onOpenReferee={(canManageMatches || isReferee) ? () => navigateTo('/schiedsrichter') : undefined}
          demoActive={demo.active}
          seasonLabel={selectedSeasonName}
          seasonNumber={currentSeasonNumber}
          hasLiveMatch={hasLiveMatch}
          eventActive={!!activeEvent}
          eventTitle={activeEvent?.title}
          onOpenEvent={() => navigateTo('/testspiel')}
          hasHighlights={hasHighlights}
          mobileMode={mobileMode}
          onToggleMobileMode={toggleMobileMode}
          teams={visibleTeams}
          matches={currentSeasonMatches}
          onSelectTeam={openTeamDetail}
          onGoToMatchday={goToMatchday}
          albums={highlights.albums}
          onOpenAlbum={openHighlightsAlbum}
        />
        <main className="flex-1">
          {team ? (
            <TeamDetail
              team={team}
              teams={leagueTeams}
              matches={seasonMatches}
              players={players}
              seasonLabel={selectedSeasonName}
              initialPlayer={initialPlayer}
              onBack={goBack}
              onSelectTeam={openTeamDetail}
              trackingRows={trackingRows}
              scoringConfig={scoring}
              onOpenMatch={(id) => navigateTo(`/spiel/${encodeURIComponent(id)}`)}
              onOpenPlayer={(name) => navigateTo(`/verein/${encodeURIComponent(teamId)}/spieler/${encodeURIComponent(name)}`)}
            />
          ) : (
            <div className="text-center py-24 space-y-4">
              <p className="text-hl-mute font-sans">Dieser Verein existiert nicht (mehr).</p>
              <button
                onClick={() => navigateTo('/')}
                className="inline-flex items-center gap-1.5 text-xs font-sans font-bold uppercase tracking-wider text-brand-accent-light hover:underline cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Zurück zur Übersicht
              </button>
            </div>
          )}
        </main>
        <Footer onNavigate={goToTab} onNavigatePath={navigateTo} />
      </div>
    );
  }

  // ROUTE: /anmeldung – öffentliche, unverbindliche Season-2-Team-Anmeldung.
  if (currentPath.startsWith('/anmeldung')) {
    return <SeasonSignup onNavigate={navigateTo} />;
  }

  // ROUTE: /testspiel/tickets – öffentliche Zuschauer-Ticket-Anmeldung. Muss VOR
  // dem generischen /testspiel stehen.
  if (currentPath.startsWith('/testspiel/tickets')) {
    return <EventTickets onNavigate={navigateTo} />;
  }

  // ROUTE: /testspiel/spiel/:id – öffentlicher Event-Spielbericht (Einzelnoten aus
  // dem Event-Tracking; komplett isoliert von der Liga). Muss VOR /testspiel stehen.
  if (currentPath.startsWith('/testspiel/spiel/')) {
    const matchId = decodeURIComponent(currentPath.slice('/testspiel/spiel/'.length).replace(/\/+$/, ''));
    const evTeams = shownEvent ? eventTeamsAsTeams(shownEvent, visibleTeams) : [];
    const evMatch = shownEvent ? eventMatchesAsMatches(shownEvent).find((m) => m.id === matchId) ?? null : null;
    return (
      <div className="min-h-screen text-hl-text font-sans flex flex-col overflow-x-clip">
        <PageBackground page="tabelle" />
        {renderMobileDock()}
        <Navbar
          activeTab={activeTab}
          setActiveTab={goToTab}
          isAdmin={isAdmin}
          canAccessBackoffice={canAccessBackoffice}
          onLogout={handleLogout}
          onOpenLogin={() => navigateTo('/admin')}
          onOpenBackoffice={() => navigateTo('/admin')} onOpenChat={canUseTeamApp ? () => navigateTo('/chat') : undefined}
          onOpenReferee={(canManageMatches || isReferee) ? () => navigateTo('/schiedsrichter') : undefined}
          demoActive={demo.active}
          seasonLabel={selectedSeasonName}
          seasonNumber={currentSeasonNumber}
          hasLiveMatch={hasLiveMatch}
          eventActive={!!activeEvent}
          eventTitle={activeEvent?.title}
          onOpenEvent={() => navigateTo('/testspiel')}
          hasHighlights={hasHighlights}
          mobileMode={mobileMode}
          onToggleMobileMode={toggleMobileMode}
          teams={visibleTeams}
          matches={currentSeasonMatches}
          onSelectTeam={openTeamDetail}
          onGoToMatchday={goToMatchday}
          albums={highlights.albums}
          onOpenAlbum={openHighlightsAlbum}
        />
        <main className="flex-1">
          {evMatch ? (
            <SpielberichtPage
              match={evMatch}
              teams={evTeams}
              rows={eventTrackingRows}
              cfg={scoring}
              onBack={() => navigateTo('/testspiel')}
              onSelectPlayer={(teamId, name) => navigateTo(`/testspiel/team/${encodeURIComponent(teamId)}/spieler/${encodeURIComponent(name)}`)}
              onSelectTeam={(teamId) => navigateTo(`/testspiel/team/${encodeURIComponent(teamId)}`)}
            />
          ) : (
            <div className="text-center py-24 space-y-4">
              <p className="text-hl-mute font-sans">Dieses Testspiel-Spiel gibt es nicht (mehr) oder ist noch nicht veröffentlicht.</p>
              <button
                onClick={() => navigateTo('/testspiel')}
                className="inline-flex items-center gap-1.5 text-xs font-sans font-bold uppercase tracking-wider text-brand-accent-light hover:underline cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Zurück zum Testspieltag
              </button>
            </div>
          )}
        </main>
        <Footer onNavigate={goToTab} onNavigatePath={navigateTo} />
      </div>
    );
  }

  // ROUTE: /testspiel/team/:name – Event-Team-Seite (Kader, Einzelnoten, beste
  // Aufstellung – exakt wie die Liga-Vereinsseite, aber mit Event-Daten). Muss
  // VOR /testspiel stehen. Optional /spieler/:name für den direkt geöffneten Spieler.
  if (currentPath.startsWith('/testspiel/team/')) {
    const rest = currentPath.slice('/testspiel/team/'.length).replace(/\/+$/, '');
    const sepIdx = rest.indexOf('/spieler/');
    const teamName = decodeURIComponent(sepIdx >= 0 ? rest.slice(0, sepIdx) : rest);
    const initialPlayer = sepIdx >= 0 ? decodeURIComponent(rest.slice(sepIdx + '/spieler/'.length)) : undefined;
    const evTeams = shownEvent ? eventTeamsAsTeams(shownEvent, visibleTeams) : [];
    const evTeam = evTeams.find((t) => t.id === teamName) ?? null;
    const evMatches = shownEvent ? eventMatchesAsMatches(shownEvent) : [];
    const evPlayers = shownEvent ? eventPlayers(shownEvent, visibleTeams) : [];
    return (
      <div className="min-h-screen text-hl-text font-sans flex flex-col overflow-x-clip">
        <PageBackground page="tabelle" teamColor={evTeam?.logoColor} teamLogoUrl={evTeam?.logoUrl} />
        {renderMobileDock()}
        <Navbar
          activeTab={activeTab}
          setActiveTab={goToTab}
          isAdmin={isAdmin}
          canAccessBackoffice={canAccessBackoffice}
          onLogout={handleLogout}
          onOpenLogin={() => navigateTo('/admin')}
          onOpenBackoffice={() => navigateTo('/admin')} onOpenChat={canUseTeamApp ? () => navigateTo('/chat') : undefined}
          onOpenReferee={(canManageMatches || isReferee) ? () => navigateTo('/schiedsrichter') : undefined}
          demoActive={demo.active}
          seasonLabel={selectedSeasonName}
          seasonNumber={currentSeasonNumber}
          hasLiveMatch={hasLiveMatch}
          eventActive={!!activeEvent}
          eventTitle={activeEvent?.title}
          onOpenEvent={() => navigateTo('/testspiel')}
          hasHighlights={hasHighlights}
          mobileMode={mobileMode}
          onToggleMobileMode={toggleMobileMode}
          teams={visibleTeams}
          matches={currentSeasonMatches}
          onSelectTeam={openTeamDetail}
          onGoToMatchday={goToMatchday}
          albums={highlights.albums}
          onOpenAlbum={openHighlightsAlbum}
        />
        <main className="flex-1">
          {evTeam ? (
            <TeamDetail
              team={evTeam}
              teams={evTeams}
              matches={evMatches}
              players={evPlayers}
              seasonLabel={shownEvent?.title || 'Testspiel'}
              initialPlayer={initialPlayer}
              onBack={() => navigateTo('/testspiel')}
              onSelectTeam={(id) => navigateTo(`/testspiel/team/${encodeURIComponent(id)}`)}
              trackingRows={eventTrackingRows}
              scoringConfig={scoring}
              onOpenMatch={(id) => navigateTo(`/testspiel/spiel/${encodeURIComponent(id)}`)}
              onOpenPlayer={(name) => navigateTo(`/testspiel/team/${encodeURIComponent(teamName)}/spieler/${encodeURIComponent(name)}`)}
            />
          ) : (
            <div className="text-center py-24 space-y-4">
              <p className="text-hl-mute font-sans">Dieses Testspiel-Team gibt es nicht (mehr).</p>
              <button
                onClick={() => navigateTo('/testspiel')}
                className="inline-flex items-center gap-1.5 text-xs font-sans font-bold uppercase tracking-wider text-brand-accent-light hover:underline cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Zurück zum Testspieltag
              </button>
            </div>
          )}
        </main>
        <Footer onNavigate={goToTab} onNavigatePath={navigateTo} />
      </div>
    );
  }

  // ROUTE: /testspiel-zettel – Ergebniszettel zum Ausdrucken (nur Admin)
  if (currentPath.startsWith('/testspiel-zettel')) {
    const printEvent = activeEvent ?? eventArchive?.events?.[(eventArchive.events?.length ?? 0) - 1] ?? null;
    if (canManageChannels && printEvent) {
      return <EventErgebniszettel event={printEvent} teams={visibleTeams} onBack={() => navigateTo('/testspiel')} />;
    }
    // Kein Admin / kein Event -> fällt auf die normale Event-Seite zurück
  }

  // ROUTE: /testspiel – Sonder-Event-Seite (zeigt das aktive Event; Admin darf das
  // zuletzt angelegte Event vorab prüfen, auch wenn keins aktiv ist)
  if (currentPath.startsWith('/testspiel')) {
    const previewEvent =
      activeEvent ?? (canManageChannels ? eventArchive?.events?.[(eventArchive.events?.length ?? 0) - 1] ?? null : null);
    const isPreviewOnly = !activeEvent && !!previewEvent;
    // Aktiver Reiter steckt im Pfad (/testspiel, /testspiel/spielplan, …), damit er
    // beim Aktualisieren und „Zurück" erhalten bleibt. Unbekannt ⇒ Tabelle.
    const rawEvTab = currentPath.slice('/testspiel'.length).replace(/^\/+|\/+$/g, '');
    const evTab: EventTab = (['tabelle', 'spielplan', 'statistiken', 'auszeichnungen'] as EventTab[]).includes(
      rawEvTab as EventTab
    )
      ? (rawEvTab as EventTab)
      : 'tabelle';
    return (
      <div className="min-h-screen bg-brand-dark text-hl-text font-sans flex flex-col">
        {renderMobileDock(true)}
        <Navbar
          activeTab={activeTab}
          setActiveTab={goToTab}
          isAdmin={isAdmin}
          canAccessBackoffice={canAccessBackoffice}
          onLogout={handleLogout}
          onOpenLogin={() => navigateTo('/admin')}
          onOpenBackoffice={() => navigateTo('/admin')} onOpenChat={canUseTeamApp ? () => navigateTo('/chat') : undefined}
          onOpenReferee={(canManageMatches || isReferee) ? () => navigateTo('/schiedsrichter') : undefined}
          demoActive={demo.active}
          seasonLabel={currentSeasonName}
          seasonNumber={currentSeasonNumber}
          hasLiveMatch={hasLiveMatch}
          eventActive={!!activeEvent}
          eventTitle={activeEvent?.title}
          onOpenEvent={() => navigateTo('/testspiel')}
          hasHighlights={hasHighlights}
          mobileMode={mobileMode}
          onToggleMobileMode={toggleMobileMode}
          teams={visibleTeams}
          matches={currentSeasonMatches}
          onSelectTeam={openTeamDetail}
          onGoToMatchday={goToMatchday}
          albums={highlights.albums}
          onOpenAlbum={openHighlightsAlbum}
        />
        <main className="flex-1">
          {previewEvent ? (
            <>
              {isPreviewOnly && (
                <div className="max-w-[1320px] xl:max-w-[1600px] 2xl:max-w-[1780px] mx-auto px-4 sm:px-10 pt-4">
                  <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/10 px-4 py-2.5 text-xs font-sans text-yellow-200">
                    Vorschau: Dieses Event ist noch <strong>nicht aktiv</strong> und für Besucher unsichtbar. Im Backoffice
                    unter „Testspiel / Event" aktivieren.
                  </div>
                </div>
              )}
              <EventPage
                event={previewEvent}
                teams={visibleTeams}
                onBack={goBack}
                onSelectTeam={openTeamDetail}
                isAdmin={canManageChannels}
                onPrint={() => navigateTo('/testspiel-zettel')}
                reportMatchIds={eventReportMatchIds}
                onOpenReport={(id) => navigateTo(`/testspiel/spiel/${encodeURIComponent(id)}`)}
                onOpenEventTeam={(name) => navigateTo(`/testspiel/team/${encodeURIComponent(name)}`)}
                onOpenEventPlayer={(team, name) => navigateTo(`/testspiel/team/${encodeURIComponent(team)}/spieler/${encodeURIComponent(name)}`)}
                staffPreview={eventStaffPreview}
                trackingRows={eventTrackingRows}
                scoringConfig={scoring}
                tab={evTab}
                onSelectTab={(t) => navigateTo(t === 'tabelle' ? '/testspiel' : `/testspiel/${t}`, { keepScroll: true })}
                onOpenTickets={() => navigateTo('/testspiel/tickets')}
              />
            </>
          ) : (
            <div className="text-center py-24 space-y-4">
              <p className="text-hl-mute font-sans">Aktuell ist kein Testspiel aktiv.</p>
              <button
                onClick={() => navigateTo('/')}
                className="inline-flex items-center gap-1.5 text-xs font-sans font-bold uppercase tracking-wider text-brand-accent-light hover:underline cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Zur Startseite
              </button>
            </div>
          )}
        </main>
        <Footer onNavigate={goToTab} onNavigatePath={navigateTo} />
      </div>
    );
  }

  // ROUTE: /chat – eigenständige „Team-App" (installierbar, Vollbild mit
  // unterer Tab-Leiste Chats · Aufgaben · Tickets). Ohne Login: Anmeldemaske.
  if (currentPath.startsWith('/chat')) {
    if (!isAdmin) {
      return (
        <div className="h-screen flex flex-col bg-[#060E0F] text-hl-text">
          <div className="flex-1 flex items-center justify-center p-6">
            <AdminLogin onLoginSuccess={(user) => setSessionUser(user)} />
          </div>
        </div>
      );
    }
    // Schiedsrichter haben KEINEN Zugang zur Team-App (nur Website + Schiri-Modus).
    if (!canUseTeamApp) {
      return (
        <div className="h-screen flex flex-col items-center justify-center gap-4 bg-[#060E0F] text-hl-text p-6 text-center">
          <Shield className="w-10 h-10 text-brand-accent-light" />
          <h1 className="font-display font-black text-xl text-white uppercase tracking-tight">Kein Zugriff</h1>
          <p className="text-sm text-hl-mute max-w-xs">
            Die Team-App ist dem internen Team vorbehalten. Als Schiedsrichter nutzt du die Website und den Schiedsrichtermodus.
          </p>
          <button
            onClick={() => navigateTo('/')}
            className="mt-2 px-5 py-2.5 rounded-xl bg-brand-accent-light hover:bg-brand-accent text-white text-xs font-bold uppercase tracking-wider cursor-pointer"
          >
            Zur Website
          </button>
        </div>
      );
    }
    return (
      <ChatApp
        user={sessionUser!}
        currentUserId={sessionUser?.id ?? ''}
        canManageTickets={canManageTickets}
        isSuperadmin={isSuperadmin}
        initialConversationId={new URLSearchParams(window.location.search).get('c')}
        onBack={() => navigateTo(canAccessBackoffice ? '/admin' : '/')}
        onUpdateUser={(p) => setSessionUser((u) => (u ? { ...u, ...p } : u))}
        onGoWebsite={() => navigateTo('/')}
        onLogout={handleLogout}
      />
    );
  }

  // ROUTE: /tracking – Statistics Center (Erfassungs-Editor). Eigene, app-artige
  // Vollbildseite. Nur für Spiel-Admins/Super-Admins; ohne Login: Anmeldemaske.
  if (currentPath.startsWith('/tracking')) {
    if (!isAdmin) {
      return (
        <div className="h-screen flex flex-col bg-[#060E0F] text-hl-text">
          <div className="flex-1 flex items-center justify-center p-6">
            <AdminLogin onLoginSuccess={(user) => setSessionUser(user)} />
          </div>
        </div>
      );
    }
    if (!canManageMatches) {
      return (
        <div className="h-screen flex flex-col items-center justify-center gap-4 bg-[#060E0F] text-hl-text p-6 text-center">
          <p className="text-hl-mute">Für das Statistics Center brauchst du Spiel-Admin-Rechte.</p>
          <button
            onClick={() => navigateTo('/admin')}
            className="px-5 py-2 rounded-xl text-xs font-bold uppercase tracking-wider bg-white/5 border border-white/10 hover:bg-white/10 cursor-pointer"
          >
            Zurück zum Backoffice
          </button>
        </div>
      );
    }
    return (
      <TrackingCenter
        teams={visibleTeams}
        matches={demo.active ? currentSeasonMatches : matches}
        seasons={demo.active && demoSeason ? [demoSeason] : visibleSeasons}
        roster={roster}
        eventArchive={eventArchive}
        activeSeasonId={currentSeason?.id ?? ''}
        demoActive={demo.active}
        onBack={() => navigateTo('/admin')}
      />
    );
  }

  // ROUTE: /admin – geschütztes Backoffice. Team-Mitglieder haben hier nichts zu
  // suchen (siehe Redirect-Effekt oben) – kurz nichts zeigen, bis er greift.
  if (currentPath === '/admin') {
    if (isAdmin && (isTeamMember || isReferee)) return null;
    return (
      <div className="min-h-screen text-hl-text font-sans flex flex-col justify-between">
        <PageBackground page="default" />
        <header
          className="border-b border-white/[.07] bg-[rgba(7,10,8,.72)] backdrop-blur-xl px-6 py-4"
          style={{ paddingTop: 'calc(env(safe-area-inset-top) + 1rem)' }}
        >
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <img src="/assets/hero-league-logo.png" alt="Hero League" className="h-9 w-auto" />
              <span className="font-sans font-semibold text-[11px] tracking-[2px] text-hl-dim uppercase">Backoffice</span>
            </div>

            <button
              onClick={() => navigateTo('/')}
              className="flex items-center space-x-1 text-xs text-hl-mute hover:text-white transition-colors uppercase tracking-wider font-semibold font-sans cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Zurück zur Website</span>
            </button>
          </div>
        </header>

        <main className="flex-1 flex items-center justify-center p-6">
          {!isAdmin ? (
            <AdminLogin onLoginSuccess={(user) => setSessionUser(user)} />
          ) : (
            <div className="w-full max-w-7xl mx-auto space-y-8 py-4">
              <div className="hl-card p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-center space-x-3">
                  {sessionUser ? (
                    <Avatar name={sessionUser.name || sessionUser.email || 'Admin'} url={sessionUser.avatarUrl} status={sessionUser.status} size={40} showStatus ring="#0b1210" />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-[rgba(67,229,160,.1)] flex items-center justify-center text-hl-green border border-[rgba(67,229,160,.2)]">
                      <Shield className="w-5 h-5" />
                    </div>
                  )}
                  <div>
                    <h2 className="font-display font-black text-lg text-white uppercase tracking-tight">
                      {isSuperadmin
                        ? 'Eingeloggt als Super-Admin'
                        : isReferee
                          ? 'Eingeloggt als Schiedsrichter'
                          : sessionUser?.role === 'team_member'
                            ? 'Eingeloggt als Team-Mitglied'
                            : 'Eingeloggt als Spiel-Admin'}
                    </h2>
                    <p className="text-xs text-hl-green-soft font-sans mt-0.5">
                      {sessionUser?.name || sessionUser?.email ? `${sessionUser?.name || sessionUser?.email} · ` : ''}
                      Aktive Saison: {currentSeasonName || '–'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => navigateTo('/chat')}
                    className="px-4 py-2 bg-brand-accent-light/10 border border-brand-accent-light/30 hover:bg-brand-accent-light/20 rounded-xl text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-2 text-brand-accent-light cursor-pointer"
                    title="Team-App öffnen"
                  >
                    <img src="/assets/hero-league-logo.png" alt="Hero Team" className="w-5 h-5 rounded" />
                    <span>Team-App</span>
                  </button>
                  <button
                    onClick={handleLogout}
                    className="px-5 py-2 bg-[rgba(255,84,66,.15)] border border-[rgba(255,84,66,.3)] hover:bg-[rgba(255,84,66,.25)] rounded-xl text-xs font-bold uppercase transition-all flex items-center gap-1.5 text-hl-red-soft cursor-pointer"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Abmelden</span>
                  </button>
                </div>
              </div>

              {/* Statistics Center: eigene große Seite zum Auswerten der Spieltage. */}
              {canManageMatches && (
                <button
                  onClick={() => navigateTo('/tracking')}
                  className="hl-card p-5 w-full flex items-center gap-4 text-left hover:border-brand-accent/40 transition-colors cursor-pointer group"
                >
                  <div className="w-12 h-12 rounded-2xl bg-brand-accent/15 border border-brand-accent/30 grid place-items-center text-brand-accent-light shrink-0">
                    <Trophy className="w-6 h-6" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-display font-black uppercase tracking-tight text-lg text-white">Statistics Center</div>
                    <div className="text-xs text-hl-mute mt-0.5">
                      Spieltag Sekunde für Sekunde auswerten · Noten, Quoten &amp; FIFA-Karten
                    </div>
                  </div>
                  <ChevronRight className="w-5 h-5 text-hl-faint group-hover:text-brand-accent-light transition-colors shrink-0" />
                </button>
              )}

              {/* Backend als eigener Bereich: Übersicht (Dashboard) als Startseite,
                  darunter die Rubriken-Leiste (am Handy unten, am PC oben). */}
              <AccordionGroup
                searchable
                dashboard={
                  <AdminDashboard
                    teamsCount={visibleTeams.length}
                    matchesCount={currentSeasonMatches.length}
                    canSeeSponsors={canManagePom}
                    canManageClubs={canManageMatches}
                  />
                }
                categories={[
                  ...(canSeeLeagueArea ? [{ id: 'spiele', label: 'Spiele & Liga' }] : []),
                  ...(canSeeStartseiteArea ? [{ id: 'startseite', label: 'Startseite' }] : []),
                  ...(canSeeChannelsArea ? [{ id: 'kanaele', label: 'Kanäle & Event' }] : []),
                  ...(isSuperadmin ? [{ id: 'anmeldungen', label: 'Anmeldungen' }] : []),
                  ...(canManageUsers ? [{ id: 'zugaenge', label: 'Zugänge' }] : []),
                ]}
              >
                <div className="space-y-4">
                  {canManageMatches && (
                    <>
                      <AccordionSection
                        id="results"
                        category="spiele"
                        title="Spielplan-Ergebnisse eintragen"
                        subtitle="Ergebnisse, Torschützen & Vorlagen zuweisen, Spiele LIVE stellen"
                        icon={<Sparkles className="w-5 h-5" />}
                      >
                        <Spielplan
                          teams={visibleTeams}
                          matches={currentSeasonMatches}
                          isAdmin={isAdmin}
                          onUpdateMatchScore={handleUpdateMatchScore}
                          onUpdateMatchMeta={handleUpdateMatchMeta}
                        />
                      </AccordionSection>

                      <AccordionSection
                        id="schedule"
                        category="spiele"
                        title="Spielplan verwalten"
                        subtitle="Spiele anlegen oder löschen"
                        icon={<CalendarPlus className="w-5 h-5" />}
                      >
                        <MatchManager
                          teams={visibleTeams}
                          matches={currentSeasonMatches}
                          onAddMatch={handleAddMatch}
                          onDeleteMatch={handleDeleteMatch}
                        />
                      </AccordionSection>
                    </>
                  )}

                  {(canManageMatches || canManageSeason || canEditHomepage || canManagePom || canManageChannels) && (
                    <AdminPanel
                      teams={visibleTeams}
                      matches={currentSeasonMatches}
                      currentSeasonLabel={currentSeasonName}
                      nextSeasonLabel={nextSeasonName}
                      seasons={seasons.filter((s) => s.id !== demo.seasonId)}
                      currentSeasonId={currentSeason?.id ?? ''}
                      isSuperadmin={isSuperadmin}
                      canManageClubs={canManageMatches}
                      canManageSeason={canManageSeason}
                      canEditHomepage={canEditHomepage}
                      canManagePom={canManagePom}
                      canManageChannels={canManageChannels}
                      onAddTeam={handleAddTeam}
                      onEditTeam={handleEditTeam}
                      onDeleteTeam={handleDeleteTeam}
                      onStartSeason={handleStartSeason}
                      demoActive={demo.active}
                      onToggleDemo={handleToggleDemo}
                    />
                  )}

                  {isSuperadmin && (
                    <>
                      <AccordionSection
                        id="season-draft"
                        category="spiele"
                        title="Saisons & Season 2 vorbereiten"
                        subtitle="Saisons umschalten (aktuell/Archiv) und neue Saison versteckt aufbauen"
                        icon={<FlaskConical className="w-5 h-5" />}
                        accent="#2F5BFF"
                      >
                        <SeasonDraftManager
                          seasons={seasons}
                          publishedSeasons={visibleSeasons}
                          teams={visibleTeams}
                          currentSeason={currentSeason}
                          currentSeasonName={currentSeasonName}
                          defaultLabel={nextSeasonName}
                          onCreateDraft={handleCreateDraftSeason}
                          onPublish={handlePublishSeason}
                          onDeleteDraft={handleDeleteDraftSeason}
                          onSetCurrent={handleSetCurrentSeason}
                          onAddTeam={handleAddTeamToSeason}
                          onRemoveTeam={handleRemoveTeamFromSeason}
                          onCreateTeam={handleAddTeamForSeason}
                        />
                      </AccordionSection>
                      <AccordionSection
                        id="season-signups"
                        category="anmeldungen"
                        title="Season 2 – Team-Anmeldungen"
                        subtitle="Vorregistrierungen ansehen, Captains hinterlegen, Fenster steuern"
                        icon={<Trophy className="w-5 h-5" />}
                        accent="#12A594"
                      >
                        <SignupAdmin />
                      </AccordionSection>
                      <AccordionSection
                        id="event-tickets"
                        category="anmeldungen"
                        title="Testspieltag – Zuschauer-Tickets"
                        subtitle="Anmeldungen, Einlass/Check-in, Plätze & Spenden-Link"
                        icon={<Ticket className="w-5 h-5" />}
                        accent="#E6238E"
                      >
                        <TicketAdmin />
                      </AccordionSection>
                    </>
                  )}

                  {isSuperadmin && (
                    <AccordionSection
                      id="users"
                      category="zugaenge"
                      title="Benutzerverwaltung"
                      subtitle="Admin-Zugänge anlegen und verwalten"
                      icon={<Users className="w-5 h-5" />}
                      accent="#C9D1CC"
                    >
                      <UserManager />
                    </AccordionSection>
                  )}
                </div>
              </AccordionGroup>
            </div>
          )}
        </main>

        <footer className="border-t border-white/5 bg-[#080b09] py-6 text-center text-xs text-hl-faint font-sans">
          <p>© 2026 Hero League. Geschützter Administrationsbereich.</p>
        </footer>

        {/* Aus einer Benachrichtigung direkt geöffnetes Ticket/Aufgabe */}
        {deepOpen && (
          <DeepLinkModal
            target={deepOpen}
            currentUserId={sessionUser?.id ?? ''}
            isSuperadmin={isSuperadmin}
            canManageTickets={canManageTickets}
            onClose={() => setDeepOpen(null)}
          />
        )}
      </div>
    );
  }

  // ROUTE: /ergebniszettel – druckbare Ergebnis-Vorlage (nur für angemeldete Admins)
  if (currentPath === '/ergebniszettel' && canManageMatches) {
    return <Ergebniszettel teams={visibleTeams} matches={currentSeasonMatches} onBack={() => navigateTo('/')} />;
  }

  // ÖFFENTLICHE WEBSITE
  const showSeasonSwitcher = visibleSeasons.length > 1 && activeTab !== 'home';

  const seasonSwitcher = showSeasonSwitcher && (
    <div className="max-w-[1320px] xl:max-w-[1600px] 2xl:max-w-[1780px] mx-auto px-4 sm:px-10 flex items-center justify-end gap-2 pb-4">
      <History className="w-4 h-4 text-hl-dim" />
      <label className="text-xs font-sans font-bold text-hl-dim uppercase tracking-wider">Saison:</label>
      <select
        value={selectedSeason?.id ?? ''}
        onChange={(e) => setSelectedSeasonId(e.target.value)}
        className="bg-brand-dark border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white font-sans font-semibold focus:outline-none focus:border-brand-accent-light cursor-pointer"
      >
        {visibleSeasons.map((s, i) => (
          <option key={s.id} value={s.id}>
            {seasonName(i + 1)}
            {s.isCurrent ? ' (aktiv)' : ''}
          </option>
        ))}
      </select>
    </div>
  );

  return (
    <div className="min-h-screen text-hl-text font-sans overflow-x-hidden">
      <PageBackground page={activeTab} />
      {renderMobileDock()}
      <LiveBanner />
      <Navbar
        activeTab={activeTab}
        setActiveTab={goToTab}
        isAdmin={isAdmin}
        canAccessBackoffice={canAccessBackoffice}
        onLogout={handleLogout}
        onOpenLogin={() => navigateTo('/admin')}
        onOpenBackoffice={() => navigateTo('/admin')} onOpenChat={canUseTeamApp ? () => navigateTo('/chat') : undefined}
        onOpenReferee={(canManageMatches || isReferee) ? () => navigateTo('/schiedsrichter') : undefined}
        demoActive={demo.active}
        seasonLabel={currentSeasonName}
        seasonNumber={currentSeasonNumber}
        hasLiveMatch={hasLiveMatch}
        eventActive={!!activeEvent}
        eventTitle={activeEvent?.title}
        onOpenEvent={() => navigateTo('/testspiel')}
        hasHighlights={hasHighlights}
        mobileMode={mobileMode}
        onToggleMobileMode={toggleMobileMode}
        teams={visibleTeams}
        matches={currentSeasonMatches}
        onSelectTeam={openTeamDetail}
        onGoToMatchday={goToMatchday}
        albums={highlights.albums}
        onOpenAlbum={openHighlightsAlbum}
      />
      {activeTab === 'home' && <SeasonSignupBanner onOpen={() => navigateTo('/anmeldung')} />}
      <LiveTicker news={news} />

      <div key={activeTab} className={`hl-fade ${mobileMode ? 'pb-36 lg:pb-0' : ''}`}>
      {activeTab === 'home' && (
        <>
          {countdown.active && <Countdown target={countdown.target} title={countdown.title} />}
          <Hero teams={leagueTeams} matches={currentSeasonMatches} players={players} seasonLabel={currentSeasonName} seasonNumber={currentSeasonNumber} heroImages={heroImages} pom={pom} onNavigate={goToTab} onSelectTeam={openTeamDetail} onOpenMatch={(id) => navigateTo(`/spiel/${encodeURIComponent(id)}`)} reportMatchIds={reportMatchIds} />
          <HighlightsHome
            highlights={highlights}
            editMode={editMode && canEditHighlights}
            onOpenGallery={() => goToTab('highlights')}
            onOpenAlbum={openHighlightsAlbum}
            onSave={persistHighlights}
          />
        </>
      )}

      {activeTab === 'highlights' && (
        <HighlightsPage
          highlights={highlights}
          editMode={editMode && canEditHighlights}
          onSave={persistHighlights}
          initialAlbumId={highlightsAlbumId}
          onInitialAlbumConsumed={() => setHighlightsAlbumId(null)}
        />
      )}

      {activeTab === 'spielplan' && (
        <>
          <PageHeader
            kicker={selectedSeasonName || 'HERO LEAGUE'}
            title="Spielplan"
          />
          {seasonSwitcher}
          {canManageMatches && (
            <div className="max-w-[1320px] xl:max-w-[1600px] 2xl:max-w-[1780px] mx-auto px-4 sm:px-10 flex justify-end pb-4">
              <button
                onClick={() => navigateTo('/ergebniszettel')}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full border border-brand-accent-light/30 bg-[rgba(34,223,201,.08)] text-brand-accent-light hover:bg-[rgba(34,223,201,.16)] text-xs font-bold uppercase tracking-wider transition-all cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                Ergebniszettel drucken
              </button>
            </div>
          )}
          <div className="max-w-[1320px] xl:max-w-[1600px] 2xl:max-w-[1780px] mx-auto px-4 sm:px-10 pb-10">
            <Spielplan
              teams={visibleTeams}
              matches={seasonMatches}
              isAdmin={canManageMatches && isCurrentSeasonSelected}
              onUpdateMatchScore={handleUpdateMatchScore}
              onUpdateMatchMeta={handleUpdateMatchMeta}
              onSelectTeam={openTeamDetail}
              onOpenReport={(id) => navigateTo(`/spiel/${encodeURIComponent(id)}`)}
              reportMatchIds={reportMatchIds}
              initialMatchday={spielplanMatchday}
              onInitialMatchdayConsumed={() => setSpielplanMatchday(null)}
            />
          </div>
        </>
      )}

      {activeTab === 'tabelle' && (
        <>
          <PageHeader
            kicker={selectedSeasonName || 'HERO LEAGUE'}
            title="Ligatabelle"
          />
          {seasonSwitcher}
          <div className="max-w-[1320px] xl:max-w-[1600px] 2xl:max-w-[1780px] mx-auto px-4 sm:px-10 pb-10">
            <Tabelle
              teams={leagueTeams}
              matches={seasonMatches}
              seasonLabel={selectedSeasonName}
              onSelectTeam={openTeamDetail}
            />
          </div>
        </>
      )}

      {activeTab === 'heroone' && (
        <>
          {seasonSwitcher}
          <HeroOne
            players={players}
            teams={leagueTeams}
            seasonNumber={selectedSeasonNumber}
            seasonLabel={selectedSeasonName}
            onSelectTeam={openTeamDetail}
            onOpenWertungen={() => navigateTo('/wertungen')}
          />
        </>
      )}

      {activeTab === 'statistiken' && (
        <>
          <PageHeader
            kicker={selectedSeasonName || 'HERO LEAGUE'}
            title="Statistiken"
          />
          {seasonSwitcher}
          <Statistiken players={players} matches={seasonMatches} teams={leagueTeams} trackingRows={trackingRows} scoringConfig={scoring} onSelectTeam={openTeamDetail} />
        </>
      )}
      </div>

      {activeEvent && activeTab === 'home' && (
        <EventBanner event={activeEvent} isLive={eventHasLive} staffPreview={eventStaffPreview} onOpen={() => navigateTo('/testspiel')} onOpenTickets={() => navigateTo('/testspiel/tickets')} />
      )}

      <InstallPrompt />

      {isAdmin && (
        <section className="border-t border-white/10 bg-[rgba(34,223,201,.04)] py-8 px-4">
          <div className="max-w-[1320px] mx-auto flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center space-x-2.5">
              <span className="w-2.5 h-2.5 bg-hl-green rounded-full animate-ping" />
              <h2 className="font-display font-black text-xl text-white uppercase tracking-tight">Admin-Modus aktiv</h2>
            </div>
            <button
              onClick={() => navigateTo('/admin')}
              className="px-4 py-1.5 border border-[rgba(67,229,160,.3)] text-hl-green-soft bg-[rgba(67,229,160,.1)] hover:bg-[rgba(67,229,160,.2)] rounded-full text-xs font-semibold font-sans uppercase tracking-wider transition-all cursor-pointer"
            >
              Backoffice öffnen →
            </button>
          </div>
        </section>
      )}

      {canEditHighlights && (activeTab === 'home' || activeTab === 'highlights') && (
        <button
          onClick={() => setEditMode((v) => !v)}
          title="Highlights direkt auf der Seite bearbeiten"
          className={`fixed right-5 z-[80] inline-flex items-center gap-2 px-4 py-3 rounded-full shadow-xl font-sans font-bold text-xs uppercase tracking-wider transition-all cursor-pointer ${
            mobileMode ? 'bottom-[calc(env(safe-area-inset-bottom)+104px)] lg:bottom-5' : 'bottom-5'
          } ${
            editMode
              ? 'bg-brand-accent-light text-brand-dark shadow-[0_0_24px_rgba(34,223,201,.5)]'
              : 'bg-brand-dark/90 backdrop-blur border border-brand-accent-light/40 text-brand-accent-light hover:bg-brand-dark'
          }`}
        >
          <Pencil className="w-4 h-4" />
          {editMode ? 'Bearbeiten beenden' : 'Highlights bearbeiten'}
        </button>
      )}

      <Footer onNavigate={goToTab} onNavigatePath={navigateTo} />
    </div>
  );
}
