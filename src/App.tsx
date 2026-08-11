import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Absence, BestPlayer, Goalkeeper, Match, PlayerStat, Scorer, Season, SessionUser, Team, ActiveTab, EventArchive, HighlightsConfig, HeroImages, CountdownConfig, NewsItem, RosterMap, EveningRoster, PlayerOfMonth } from './types';
import { apiFetch, setUnauthorizedHandler } from './lib/api';
import { startPresence } from './lib/presence';
import { seasonName } from './lib/heroAward';
import Navbar from './components/Navbar';
import Hero from './components/Hero';
import Tabelle from './components/Tabelle';
import Spielplan from './components/Spielplan';
import HeroOne from './components/HeroOne';
import Statistiken from './components/Statistiken';
import AdminPanel from './components/AdminPanel';
import AdminLogin from './components/AdminLogin';
import UserManager from './components/UserManager';
import MatchManager from './components/MatchManager';
import RefereeMode from './components/RefereeMode';
import TeamDetail from './components/TeamDetail';
import LiveBanner from './components/LiveBanner';
import LiveTicker from './components/LiveTicker';
import LiveVisitors from './components/LiveVisitors';
import InstallPrompt from './components/InstallPrompt';
import Ergebniszettel from './components/Ergebniszettel';
import LegalPage from './components/LegalPage';
import PageBackground from './components/PageBackground';
import MobileDock from './components/MobileDock';
import Countdown from './components/Countdown';
import EventPage from './components/EventPage';
import EventBanner from './components/EventBanner';
import EventErgebniszettel from './components/EventErgebniszettel';
import HighlightsHome from './components/HighlightsHome';
import HighlightsPage from './components/HighlightsPage';
import TicketSystem from './components/TicketSystem';
import TaskBoard from './components/TaskBoard';
import ChatSystem from './components/ChatSystem';
import ProfileEditor from './components/ProfileEditor';
import Avatar from './components/Avatar';
import NotificationBell from './components/NotificationBell';
import { PageHeader, Footer, AccordionGroup, AccordionSection } from './components/ui';
import { Shield, Sparkles, LogOut, ArrowLeft, CalendarPlus, History, Users, Printer, Pencil, Ticket, CalendarDays, MessageSquare, UserCircle } from 'lucide-react';

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

  // Aktuell sichtbares Event (per activeId). null = keins sichtbar.
  const activeEvent = eventArchive?.events?.find((e) => e.id === eventArchive.activeId) ?? null;
  // Läuft gerade ein Spiel im aktiven Event?
  const eventHasLive = !!activeEvent?.matches?.some((m) => m.status === 'live');
  const [sessionUser, setSessionUser] = useState<SessionUser | null>(null);
  const isAdmin = sessionUser !== null;
  const isSuperadmin = sessionUser?.role === 'superadmin';
  const isReferee = sessionUser?.role === 'referee';
  // Team-Zusammenarbeit: Ticket-Manager darf Tickets verwalten; die
  // Liga-Bereiche (Spiele/Startseite/Kanäle) sieht nur, wer sie pflegen darf.
  const isTicketManager = sessionUser?.role === 'ticket_manager';
  const canManageTickets = isSuperadmin || isTicketManager || !!sessionUser?.permissions?.includes('manage_tickets');
  const canEditLeague = isSuperadmin || sessionUser?.role === 'match_admin';
  // Admin hat den Schiedsrichtermodus manuell geöffnet (per Navbar-Schnellzugang).
  const [refereeView, setRefereeView] = useState(false);
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
  // Saison-Umschalter: die interne Demo-Saison nie als wählbare Historie zeigen
  const visibleSeasons = useMemo(() => seasons.filter((s) => s.id !== demo.seasonId), [seasons, demo.seasonId]);

  const selectedSeason = useMemo(
    () => visibleSeasons.find((s) => s.id === selectedSeasonId) ?? currentSeason,
    [visibleSeasons, selectedSeasonId, currentSeason]
  );
  const isCurrentSeasonSelected = !selectedSeason || selectedSeason.id === currentSeason?.id;

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
  useEffect(() => {
    if (!hasLiveMatch) return;
    const interval = setInterval(fetchData, 15000);
    return () => clearInterval(interval);
  }, [hasLiveMatch, fetchData]);

  // Beim Zurückkehren zum Tab sofort den aktuellen Stand holen
  useEffect(() => {
    const onFocus = () => fetchData();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [fetchData]);

  // Anonyme Besucherzählung: nur echte Website-Besucher melden, nicht das
  // Backoffice oder den Ergebniszettel. Speist die Live-Anzeige im Backend.
  const isPublicPath = !currentPath.startsWith('/admin') && !currentPath.startsWith('/ergebniszettel');
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
  useEffect(() => {
    const iv = setInterval(() => {
      apiFetch<EventArchive>('/api/twitch?resource=event')
        .then((data) => setEventArchive(data))
        .catch(() => {});
    }, 20000);
    return () => clearInterval(iv);
  }, []);

  // Merkt sich, ob innerhalb der App navigiert wurde (für „Zurück").
  const navigatedInApp = useRef(false);

  const navigateTo = (path: string) => {
    window.history.pushState({}, '', path);
    navigatedInApp.current = true;
    setCurrentPath(path);
    window.scrollTo({ top: 0 }); // neue Seite (z.B. Vereinsseite) immer oben starten
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
    if (!isAdmin) setEditMode(false);
  }, [isAdmin]);

  // Aufstellungen laden, sobald jemand angemeldet ist (für den Schiedsrichtermodus).
  useEffect(() => {
    if (sessionUser) fetchRoster();
  }, [sessionUser, fetchRoster]);

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
  const hasHighlights = highlights.items.length > 0 || highlights.albums.length > 0 || isAdmin;

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

  // Schiedsrichtermodus: für die Rolle „Schiedsrichter" der einzige Bildschirm
  // (alles andere gesperrt); für Admins optional über den Navbar-Schnellzugang.
  // Admins können ihn wieder verlassen (onExit) – Schiedsrichter nicht.
  if (sessionUser && (isReferee || refereeView)) {
    return (
      <RefereeMode
        user={sessionUser}
        teams={visibleTeams}
        matches={currentSeasonMatches}
        seasonId={currentSeason?.id ?? ''}
        roster={roster}
        onUpdateMatch={handleRefereeUpdateMatch}
        onSaveRoster={handleSaveRoster}
        onRefresh={fetchData}
        onLogout={handleLogout}
        onExit={isReferee ? undefined : () => setRefereeView(false)}
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
          onLogout={handleLogout}
          onOpenLogin={() => navigateTo('/admin')}
          onOpenBackoffice={() => navigateTo('/admin')}
          onOpenReferee={() => setRefereeView(true)}
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
          onLogout={handleLogout}
          onOpenLogin={() => navigateTo('/admin')}
          onOpenBackoffice={() => navigateTo('/admin')}
          onOpenReferee={() => setRefereeView(true)}
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
              teams={visibleTeams}
              matches={seasonMatches}
              players={players}
              seasonLabel={selectedSeasonName}
              initialPlayer={initialPlayer}
              onBack={goBack}
              onSelectTeam={openTeamDetail}
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

  // ROUTE: /testspiel-zettel – Ergebniszettel zum Ausdrucken (nur Admin)
  if (currentPath.startsWith('/testspiel-zettel')) {
    const printEvent = activeEvent ?? eventArchive?.events?.[(eventArchive.events?.length ?? 0) - 1] ?? null;
    if (isAdmin && printEvent) {
      return <EventErgebniszettel event={printEvent} teams={visibleTeams} onBack={() => navigateTo('/testspiel')} />;
    }
    // Kein Admin / kein Event -> fällt auf die normale Event-Seite zurück
  }

  // ROUTE: /testspiel – Sonder-Event-Seite (zeigt das aktive Event; Admin darf das
  // zuletzt angelegte Event vorab prüfen, auch wenn keins aktiv ist)
  if (currentPath.startsWith('/testspiel')) {
    const previewEvent =
      activeEvent ?? (isAdmin ? eventArchive?.events?.[(eventArchive.events?.length ?? 0) - 1] ?? null : null);
    const isPreviewOnly = !activeEvent && !!previewEvent;
    return (
      <div className="min-h-screen bg-brand-dark text-hl-text font-sans flex flex-col">
        {renderMobileDock(true)}
        <Navbar
          activeTab={activeTab}
          setActiveTab={goToTab}
          isAdmin={isAdmin}
          onLogout={handleLogout}
          onOpenLogin={() => navigateTo('/admin')}
          onOpenBackoffice={() => navigateTo('/admin')}
          onOpenReferee={() => setRefereeView(true)}
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
                <div className="max-w-[1320px] mx-auto px-4 sm:px-10 pt-4">
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
                isAdmin={isAdmin}
                onPrint={() => navigateTo('/testspiel-zettel')}
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

  // ROUTE: /admin – geschütztes Backoffice
  if (currentPath === '/admin') {
    return (
      <div className="min-h-screen text-hl-text font-sans flex flex-col justify-between">
        <PageBackground page="default" />
        <header className="border-b border-white/[.07] bg-[rgba(7,10,8,.72)] backdrop-blur-xl px-6 py-4">
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
                        : isTicketManager
                          ? 'Eingeloggt als Ticket-Manager'
                          : 'Eingeloggt als Spiel-Admin'}
                    </h2>
                    <p className="text-xs text-hl-green-soft font-sans mt-0.5">
                      {sessionUser?.name || sessionUser?.email ? `${sessionUser?.name || sessionUser?.email} · ` : ''}
                      Aktive Saison: {currentSeasonName || '–'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <NotificationBell />
                  <button
                    onClick={handleLogout}
                    className="px-5 py-2 bg-[rgba(255,84,66,.15)] border border-[rgba(255,84,66,.3)] hover:bg-[rgba(255,84,66,.25)] rounded-xl text-xs font-bold uppercase transition-all flex items-center gap-1.5 text-hl-red-soft cursor-pointer"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Abmelden</span>
                  </button>
                </div>
              </div>

              {/* Live-Besucher: ganz oben im Backoffice */}
              <LiveVisitors />

              {/* Aufgeräumtes Backoffice: Reiter nach Rubrik, darunter „dicke Tasten" */}
              <AccordionGroup
                searchable
                defaultOpenId="tickets"
                categories={[
                  { id: 'team', label: '★ Team' },
                  ...(canEditLeague
                    ? [
                        { id: 'spiele', label: 'Spiele & Liga' },
                        { id: 'startseite', label: 'Startseite' },
                        { id: 'kanaele', label: 'Kanäle & Event' },
                      ]
                    : []),
                  ...(isSuperadmin ? [{ id: 'zugaenge', label: 'Zugänge' }] : []),
                ]}
              >
                <div className="space-y-4">
                  {canEditLeague && (
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

                      <AdminPanel
                        teams={visibleTeams}
                        matches={currentSeasonMatches}
                        currentSeasonLabel={currentSeasonName}
                        nextSeasonLabel={nextSeasonName}
                        isSuperadmin={isSuperadmin}
                        onAddTeam={handleAddTeam}
                        onEditTeam={handleEditTeam}
                        onDeleteTeam={handleDeleteTeam}
                        onStartSeason={handleStartSeason}
                        demoActive={demo.active}
                        onToggleDemo={handleToggleDemo}
                      />
                    </>
                  )}

                  {/* Team-Zusammenarbeit: Profil, Tickets, Aufgaben, Chat (für jeden eingeloggten Nutzer) */}
                  <AccordionSection
                    id="profil"
                    category="team"
                    title="Mein Profil"
                    subtitle="Name, Profilbild & Status (online, Urlaub, außer Haus …)"
                    icon={<UserCircle className="w-5 h-5" />}
                    accent="#22DFC9"
                  >
                    {sessionUser && (
                      <ProfileEditor user={sessionUser} onSaved={(p) => setSessionUser((u) => (u ? { ...u, ...p } : u))} />
                    )}
                  </AccordionSection>

                  <AccordionSection
                    id="tickets"
                    category="team"
                    title="Tickets"
                    subtitle="Ideen & Aufgaben melden, priorisieren, mit Screenshots – und bearbeiten"
                    icon={<Ticket className="w-5 h-5" />}
                    accent="#22DFC9"
                  >
                    <TicketSystem currentUserId={sessionUser?.id ?? ''} canManage={canManageTickets} />
                  </AccordionSection>

                  <AccordionSection
                    id="aufgaben"
                    category="team"
                    title="Aufgaben-Board"
                    subtitle="Wochenplanung, Personen zuweisen, Status – Monday-Style"
                    icon={<CalendarDays className="w-5 h-5" />}
                    accent="#22DFC9"
                  >
                    <TaskBoard currentUserId={sessionUser?.id ?? ''} isSuperadmin={isSuperadmin} />
                  </AccordionSection>

                  <AccordionSection
                    id="chat"
                    category="team"
                    title="Chat"
                    subtitle="Gruppen & Direktnachrichten, Threads, Tickets/Aufgaben anhängen"
                    icon={<MessageSquare className="w-5 h-5" />}
                    accent="#22DFC9"
                  >
                    <ChatSystem currentUserId={sessionUser?.id ?? ''} />
                  </AccordionSection>

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
      </div>
    );
  }

  // ROUTE: /ergebniszettel – druckbare Ergebnis-Vorlage (nur für angemeldete Admins)
  if (currentPath === '/ergebniszettel' && isAdmin) {
    return <Ergebniszettel teams={visibleTeams} matches={currentSeasonMatches} onBack={() => navigateTo('/')} />;
  }

  // ÖFFENTLICHE WEBSITE
  const showSeasonSwitcher = visibleSeasons.length > 1 && activeTab !== 'home';

  const seasonSwitcher = showSeasonSwitcher && (
    <div className="max-w-[1320px] mx-auto px-4 sm:px-10 flex items-center justify-end gap-2 pb-4">
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
        onLogout={handleLogout}
        onOpenLogin={() => navigateTo('/admin')}
        onOpenBackoffice={() => navigateTo('/admin')}
        onOpenReferee={() => setRefereeView(true)}
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
      {activeEvent && activeTab === 'home' && (
        <EventBanner event={activeEvent} isLive={eventHasLive} onOpen={() => navigateTo('/testspiel')} />
      )}
      <LiveTicker news={news} />

      <div key={activeTab} className={`hl-fade ${mobileMode ? 'pb-36 lg:pb-0' : ''}`}>
      {activeTab === 'home' && (
        <>
          {countdown.active && <Countdown target={countdown.target} title={countdown.title} />}
          <Hero teams={visibleTeams} matches={currentSeasonMatches} players={players} seasonLabel={currentSeasonName} seasonNumber={currentSeasonNumber} heroImages={heroImages} pom={pom} onNavigate={goToTab} onSelectTeam={openTeamDetail} />
          <HighlightsHome
            highlights={highlights}
            editMode={editMode && isAdmin}
            onOpenGallery={() => goToTab('highlights')}
            onOpenAlbum={openHighlightsAlbum}
            onSave={persistHighlights}
          />
        </>
      )}

      {activeTab === 'highlights' && (
        <HighlightsPage
          highlights={highlights}
          editMode={editMode && isAdmin}
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
          {isAdmin && (
            <div className="max-w-[1320px] mx-auto px-4 sm:px-10 flex justify-end pb-4">
              <button
                onClick={() => navigateTo('/ergebniszettel')}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full border border-brand-accent-light/30 bg-[rgba(34,223,201,.08)] text-brand-accent-light hover:bg-[rgba(34,223,201,.16)] text-xs font-bold uppercase tracking-wider transition-all cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                Ergebniszettel drucken
              </button>
            </div>
          )}
          <div className="max-w-[1320px] mx-auto px-4 sm:px-10 pb-10">
            <Spielplan
              teams={visibleTeams}
              matches={seasonMatches}
              isAdmin={isAdmin && isCurrentSeasonSelected}
              onUpdateMatchScore={handleUpdateMatchScore}
              onUpdateMatchMeta={handleUpdateMatchMeta}
              onSelectTeam={openTeamDetail}
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
          <div className="max-w-[1320px] mx-auto px-4 sm:px-10 pb-10">
            <Tabelle
              teams={visibleTeams}
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
            teams={visibleTeams}
            seasonNumber={selectedSeasonNumber}
            seasonLabel={selectedSeasonName}
            onSelectTeam={openTeamDetail}
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
          <Statistiken players={players} matches={seasonMatches} teams={visibleTeams} onSelectTeam={openTeamDetail} />
        </>
      )}
      </div>

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

      {isAdmin && (activeTab === 'home' || activeTab === 'highlights') && (
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
