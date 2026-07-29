import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Absence, BestPlayer, Goalkeeper, Match, PlayerStat, Scorer, Season, SessionUser, Team, ActiveTab, EventArchive, HighlightsConfig } from './types';
import { apiFetch, setUnauthorizedHandler } from './lib/api';
import { startPresence } from './lib/presence';
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
import TeamDetail from './components/TeamDetail';
import LiveBanner from './components/LiveBanner';
import LiveTicker from './components/LiveTicker';
import HomeBody from './components/HomeBody';
import LiveVisitors from './components/LiveVisitors';
import InstallPrompt from './components/InstallPrompt';
import Ergebniszettel from './components/Ergebniszettel';
import LegalPage from './components/LegalPage';
import EventPage from './components/EventPage';
import EventBanner from './components/EventBanner';
import EventErgebniszettel from './components/EventErgebniszettel';
import HighlightsHome from './components/HighlightsHome';
import HighlightsPage from './components/HighlightsPage';
import { PageHeader, Footer, AccordionGroup, AccordionSection } from './components/ui';
import { Shield, Sparkles, LogOut, ArrowLeft, CalendarPlus, History, Users, Printer, Pencil } from 'lucide-react';

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
  const [eventArchive, setEventArchive] = useState<EventArchive | null>(null);
  const [highlights, setHighlights] = useState<HighlightsConfig>({ items: [], albums: [] });
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
      const [dataTeams, dataMatches, dataSeasons, dataDemo] = await Promise.all([
        apiFetch<Team[]>('/api/teams'),
        apiFetch<Match[]>('/api/matches'),
        apiFetch<Season[]>('/api/seasons'),
        apiFetch<{ active: boolean; seasonId: string; teamIds: string[] }>('/api/seasons?demo=1').catch(() => ({
          active: false,
          seasonId: '',
          teamIds: [],
        })),
      ]);
      setTeams(dataTeams);
      setMatches(dataMatches);
      setSeasons(dataSeasons);
      setDemo(dataDemo);
    } catch (err) {
      console.error('Fehler beim Laden der Liga-Daten', err);
    } finally {
      setIsLoading(false);
    }
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

  // Bearbeiten-Modus nur für Admins – beim Abmelden automatisch verlassen.
  useEffect(() => {
    if (!isAdmin) setEditMode(false);
  }, [isAdmin]);

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

  const openTeamDetail = (teamId: string) => navigateTo(`/verein/${encodeURIComponent(teamId)}`);

  const goToTab = (tab: ActiveTab) => {
    navigateTo(TAB_PATHS[tab]);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-brand-dark text-white flex flex-col items-center justify-center font-sans space-y-4">
        <div className="w-12 h-12 border-4 border-brand-accent-light border-t-transparent rounded-full animate-spin"></div>
        <p className="text-sm font-sans font-semibold text-hl-mute uppercase tracking-wider animate-pulse">Lade Liga-Daten...</p>
      </div>
    );
  }

  // ROUTE: /impressum & /datenschutz – rechtliche Pflichtseiten (aus dem Footer erreichbar)
  if (currentPath === '/impressum' || currentPath === '/datenschutz') {
    const kind = currentPath === '/impressum' ? 'impressum' : 'datenschutz';
    return (
      <div className="min-h-screen bg-brand-dark text-hl-text font-sans flex flex-col">
        <Navbar
          activeTab={activeTab}
          setActiveTab={goToTab}
          isAdmin={isAdmin}
          onLogout={handleLogout}
          onOpenLogin={() => navigateTo('/admin')}
          onOpenBackoffice={() => navigateTo('/admin')}
          seasonLabel={selectedSeason?.label ?? ''}
          seasonNumber={currentSeasonNumber}
          hasLiveMatch={hasLiveMatch}
          eventActive={!!activeEvent}
          eventTitle={activeEvent?.title}
          onOpenEvent={() => navigateTo('/testspiel')}
          hasHighlights={hasHighlights}
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
    const teamId = decodeURIComponent(currentPath.slice('/verein/'.length).replace(/\/+$/, ''));
    const team = visibleTeams.find((t) => t.id === teamId);
    return (
      <div className="min-h-screen bg-brand-dark text-hl-text font-sans flex flex-col">
        <Navbar
          activeTab={activeTab}
          setActiveTab={goToTab}
          isAdmin={isAdmin}
          onLogout={handleLogout}
          onOpenLogin={() => navigateTo('/admin')}
          onOpenBackoffice={() => navigateTo('/admin')}
          seasonLabel={selectedSeason?.label ?? ''}
          seasonNumber={currentSeasonNumber}
          hasLiveMatch={hasLiveMatch}
          eventActive={!!activeEvent}
          eventTitle={activeEvent?.title}
          onOpenEvent={() => navigateTo('/testspiel')}
          hasHighlights={hasHighlights}
        />
        <main className="flex-1">
          {team ? (
            <TeamDetail
              team={team}
              teams={visibleTeams}
              matches={seasonMatches}
              players={players}
              seasonLabel={selectedSeason?.label ?? ''}
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
        <Navbar
          activeTab={activeTab}
          setActiveTab={goToTab}
          isAdmin={isAdmin}
          onLogout={handleLogout}
          onOpenLogin={() => navigateTo('/admin')}
          onOpenBackoffice={() => navigateTo('/admin')}
          seasonLabel={currentSeason?.label ?? ''}
          seasonNumber={currentSeasonNumber}
          hasLiveMatch={hasLiveMatch}
          eventActive={!!activeEvent}
          eventTitle={activeEvent?.title}
          onOpenEvent={() => navigateTo('/testspiel')}
          hasHighlights={hasHighlights}
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
      <div className="min-h-screen bg-brand-dark text-hl-text font-sans flex flex-col justify-between">
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
                  <div className="w-10 h-10 rounded-full bg-[rgba(67,229,160,.1)] flex items-center justify-center text-hl-green border border-[rgba(67,229,160,.2)]">
                    <Shield className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="font-display font-black text-lg text-white uppercase tracking-tight">
                      {isSuperadmin ? 'Eingeloggt als Super-Admin' : 'Eingeloggt als Spiel-Admin'}
                    </h2>
                    <p className="text-xs text-hl-green-soft font-sans mt-0.5">
                      {sessionUser?.name || sessionUser?.email ? `${sessionUser?.name || sessionUser?.email} · ` : ''}
                      Aktive Saison: {currentSeason?.label ?? '–'}
                    </p>
                  </div>
                </div>

                <button
                  onClick={handleLogout}
                  className="px-5 py-2 bg-[rgba(255,84,66,.15)] border border-[rgba(255,84,66,.3)] hover:bg-[rgba(255,84,66,.25)] rounded-xl text-xs font-bold uppercase transition-all flex items-center gap-1.5 text-hl-red-soft cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Abmelden</span>
                </button>
              </div>

              {/* Live-Besucher: ganz oben im Backoffice */}
              <LiveVisitors />

              {/* Aufgeräumtes Backoffice: „dicke Tasten", immer nur eine offen */}
              <AccordionGroup>
                <div className="space-y-4">
                  <AccordionSection
                    id="results"
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
                    currentSeasonLabel={currentSeason?.label ?? ''}
                    isSuperadmin={isSuperadmin}
                    onAddTeam={handleAddTeam}
                    onEditTeam={handleEditTeam}
                    onDeleteTeam={handleDeleteTeam}
                    onStartSeason={handleStartSeason}
                    demoActive={demo.active}
                    onToggleDemo={handleToggleDemo}
                  />

                  {isSuperadmin && (
                    <AccordionSection
                      id="users"
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
        {visibleSeasons.map((s) => (
          <option key={s.id} value={s.id}>
            {s.label}
            {s.isCurrent ? ' (aktiv)' : ''}
          </option>
        ))}
      </select>
    </div>
  );

  return (
    <div className="min-h-screen bg-brand-dark text-hl-text font-sans overflow-x-hidden">
      <LiveBanner />
      <Navbar
        activeTab={activeTab}
        setActiveTab={goToTab}
        isAdmin={isAdmin}
        onLogout={handleLogout}
        onOpenLogin={() => navigateTo('/admin')}
        onOpenBackoffice={() => navigateTo('/admin')}
        seasonLabel={currentSeason?.label ?? ''}
        seasonNumber={currentSeasonNumber}
        hasLiveMatch={hasLiveMatch}
        eventActive={!!activeEvent}
        eventTitle={activeEvent?.title}
        onOpenEvent={() => navigateTo('/testspiel')}
        hasHighlights={hasHighlights}
      />
      {activeEvent && activeTab === 'home' && (
        <EventBanner event={activeEvent} isLive={eventHasLive} onOpen={() => navigateTo('/testspiel')} />
      )}
      <LiveTicker matches={currentSeasonMatches} teams={visibleTeams} players={players} />

      <div key={activeTab} className="hl-fade">
      {activeTab === 'home' && (
        <>
          <Hero teams={visibleTeams} matches={currentSeasonMatches} players={players} seasonLabel={currentSeason?.label ?? ''} seasonNumber={currentSeasonNumber} onNavigate={goToTab} onSelectTeam={openTeamDetail} />
          <HighlightsHome
            highlights={highlights}
            editMode={editMode && isAdmin}
            onOpenGallery={() => goToTab('highlights')}
            onSave={persistHighlights}
          />
          <HomeBody
            teams={visibleTeams}
            matches={currentSeasonMatches}
            players={players}
            seasonLabel={currentSeason?.label ?? ''}
            onNavigate={goToTab}
            onSelectTeam={openTeamDetail}
          />
        </>
      )}

      {activeTab === 'highlights' && (
        <HighlightsPage highlights={highlights} editMode={editMode && isAdmin} onSave={persistHighlights} />
      )}

      {activeTab === 'spielplan' && (
        <>
          <PageHeader
            kicker={selectedSeason?.label ? `SAISON ${selectedSeason.label}` : 'HERO LEAGUE'}
            title="Spielplan"
            text="Alle Ergebnisse und Anstoßzeiten der Hero League — Spieltag für Spieltag."
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
            />
          </div>
        </>
      )}

      {activeTab === 'tabelle' && (
        <>
          <PageHeader
            kicker={selectedSeason?.label ? `SAISON ${selectedSeason.label}` : 'HERO LEAGUE'}
            title="Ligatabelle"
            text="Der komplette Tabellenstand der Hero League. Sortierung nach Punkten, Tordifferenz, direktem Vergleich und erzielten Toren."
          />
          {seasonSwitcher}
          <div className="max-w-[1320px] mx-auto px-4 sm:px-10 pb-10">
            <Tabelle
              teams={visibleTeams}
              matches={seasonMatches}
              seasonLabel={selectedSeason?.label ?? ''}
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
            seasonLabel={selectedSeason?.label ?? ''}
            onSelectTeam={openTeamDetail}
          />
        </>
      )}

      {activeTab === 'statistiken' && (
        <>
          <PageHeader
            kicker={selectedSeason?.label ? `SAISON ${selectedSeason.label}` : 'HERO LEAGUE'}
            title="Statistiken"
            text="Die Bestwerte der Hero League — Spieler und Teams, die den Ton angeben."
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
          className={`fixed bottom-5 right-5 z-[80] inline-flex items-center gap-2 px-4 py-3 rounded-full shadow-xl font-sans font-bold text-xs uppercase tracking-wider transition-all cursor-pointer ${
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
