import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Match, PlayerStat, Scorer, Season, Team, ActiveTab } from './types';
import { apiFetch, setUnauthorizedHandler } from './lib/api';
import Navbar from './components/Navbar';
import Hero from './components/Hero';
import Tabelle from './components/Tabelle';
import Spielplan from './components/Spielplan';
import Torschuetzenliste from './components/Torschuetzenliste';
import Statistiken from './components/Statistiken';
import AdminPanel from './components/AdminPanel';
import AdminLogin from './components/AdminLogin';
import MatchManager from './components/MatchManager';
import TeamDetail from './components/TeamDetail';
import LiveBanner from './components/LiveBanner';
import LiveTicker from './components/LiveTicker';
import HomeBody from './components/HomeBody';
import { PageHeader, Footer } from './components/ui';
import { Shield, Sparkles, LogOut, ArrowLeft, CalendarPlus, History } from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('home');
  const [currentPath, setCurrentPath] = useState<string>(window.location.pathname);

  const [teams, setTeams] = useState<Team[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [players, setPlayers] = useState<PlayerStat[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [selectedSeasonId, setSelectedSeasonId] = useState<string | null>(null);

  const currentSeason = useMemo(() => seasons.find((s) => s.isCurrent) ?? null, [seasons]);
  const selectedSeason = useMemo(
    () => seasons.find((s) => s.id === selectedSeasonId) ?? currentSeason,
    [seasons, selectedSeasonId, currentSeason]
  );
  const isCurrentSeasonSelected = !selectedSeason || selectedSeason.id === currentSeason?.id;

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
      const [dataTeams, dataMatches, dataSeasons] = await Promise.all([
        apiFetch<Team[]>('/api/teams'),
        apiFetch<Match[]>('/api/matches'),
        apiFetch<Season[]>('/api/seasons'),
      ]);
      setTeams(dataTeams);
      setMatches(dataMatches);
      setSeasons(dataSeasons);
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

  useEffect(() => {
    setUnauthorizedHandler(() => setIsAdmin(false));

    fetchData();
    apiFetch<{ isAdmin: boolean }>('/api/auth/session')
      .then((data) => setIsAdmin(data.isAdmin))
      .catch(() => setIsAdmin(false));

    const handlePopState = () => setCurrentPath(window.location.pathname);
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [fetchData]);

  const navigateTo = (path: string) => {
    window.history.pushState({}, '', path);
    setCurrentPath(path);
  };

  const handleLogout = async () => {
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // Cookie ist ggf. schon abgelaufen – lokal trotzdem abmelden
    }
    setIsAdmin(false);
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

  const handleUpdateMatchScore = (
    matchId: string,
    homeScore: number | null,
    awayScore: number | null,
    status: 'geplant' | 'live' | 'beendet',
    scorers?: Scorer[]
  ) =>
    runAdminAction(() =>
      apiFetch(`/api/matches/${matchId}`, {
        method: 'PUT',
        body: JSON.stringify({ homeScore, awayScore, status, scorers }),
      })
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

  const openTeamDetail = (teamId: string) => navigateTo(`/verein/${encodeURIComponent(teamId)}`);

  const goToTab = (tab: ActiveTab) => {
    if (currentPath !== '/') navigateTo('/');
    setActiveTab(tab);
    window.scrollTo({ top: 0 });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-brand-dark text-white flex flex-col items-center justify-center font-sans space-y-4">
        <div className="w-12 h-12 border-4 border-brand-accent-light border-t-transparent rounded-full animate-spin"></div>
        <p className="text-sm font-sans font-semibold text-hl-mute uppercase tracking-wider animate-pulse">Lade Liga-Daten...</p>
      </div>
    );
  }

  // ROUTE: /verein/:id – öffentliche Vereins-Detailseite
  if (currentPath.startsWith('/verein/')) {
    const teamId = decodeURIComponent(currentPath.slice('/verein/'.length).replace(/\/+$/, ''));
    const team = teams.find((t) => t.id === teamId);
    return (
      <div className="min-h-screen bg-brand-dark text-hl-text font-sans flex flex-col">
        <Navbar
          activeTab={activeTab}
          setActiveTab={goToTab}
          isAdmin={isAdmin}
          onLogout={handleLogout}
          onOpenLogin={() => navigateTo('/admin')}
          seasonLabel={selectedSeason?.label ?? ''}
          hasLiveMatch={hasLiveMatch}
        />
        <main className="flex-1">
          {team ? (
            <TeamDetail
              team={team}
              teams={teams}
              matches={seasonMatches}
              players={players}
              seasonLabel={selectedSeason?.label ?? ''}
              onBack={() => navigateTo('/')}
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
        <Footer onNavigate={goToTab} />
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
            <AdminLogin onLoginSuccess={() => setIsAdmin(true)} />
          ) : (
            <div className="w-full max-w-7xl mx-auto space-y-8 py-4">
              <div className="hl-card p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 rounded-full bg-[rgba(67,229,160,.1)] flex items-center justify-center text-hl-green border border-[rgba(67,229,160,.2)]">
                    <Shield className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="font-display font-black text-lg text-white uppercase tracking-tight">
                      Eingeloggt als Administrator
                    </h2>
                    <p className="text-xs text-hl-green-soft font-sans mt-0.5">
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

              <div className="space-y-12">
                <div className="hl-card p-6">
                  <h3 className="font-display font-black text-xl text-white uppercase tracking-tight mb-4 flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-brand-accent-light" />
                    Spielplan-Ergebnisse eintragen
                  </h3>
                  <p className="text-xs text-hl-mute font-sans mb-6">
                    Wähle einen Spieltag aus, um Ergebnisse einzutragen, Torschützen und Vorlagengeber zuzuweisen oder
                    ein Spiel LIVE zu stellen.
                  </p>
                  <Spielplan
                    teams={teams}
                    matches={currentSeasonMatches}
                    isAdmin={isAdmin}
                    onUpdateMatchScore={handleUpdateMatchScore}
                  />
                </div>

                <div className="hl-card p-6">
                  <h3 className="font-display font-black text-xl text-white uppercase tracking-tight mb-4 flex items-center gap-2">
                    <CalendarPlus className="w-5 h-5 text-brand-accent-light" />
                    Spielplan verwalten
                  </h3>
                  <MatchManager
                    teams={teams}
                    matches={currentSeasonMatches}
                    onAddMatch={handleAddMatch}
                    onDeleteMatch={handleDeleteMatch}
                  />
                </div>

                <div className="hl-card p-6">
                  <AdminPanel
                    teams={teams}
                    matches={currentSeasonMatches}
                    currentSeasonLabel={currentSeason?.label ?? ''}
                    onAddTeam={handleAddTeam}
                    onEditTeam={handleEditTeam}
                    onDeleteTeam={handleDeleteTeam}
                    onStartSeason={handleStartSeason}
                  />
                </div>
              </div>
            </div>
          )}
        </main>

        <footer className="border-t border-white/5 bg-[#080b09] py-6 text-center text-xs text-hl-faint font-sans">
          <p>© 2026 Hero League. Geschützter Administrationsbereich.</p>
        </footer>
      </div>
    );
  }

  // ÖFFENTLICHE WEBSITE
  const showSeasonSwitcher = seasons.length > 1 && activeTab !== 'home';

  const seasonSwitcher = showSeasonSwitcher && (
    <div className="max-w-[1320px] mx-auto px-4 sm:px-10 flex items-center justify-end gap-2 pb-4">
      <History className="w-4 h-4 text-hl-dim" />
      <label className="text-xs font-sans font-bold text-hl-dim uppercase tracking-wider">Saison:</label>
      <select
        value={selectedSeason?.id ?? ''}
        onChange={(e) => setSelectedSeasonId(e.target.value)}
        className="bg-brand-dark border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white font-sans font-semibold focus:outline-none focus:border-brand-accent-light cursor-pointer"
      >
        {seasons.map((s) => (
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
        seasonLabel={currentSeason?.label ?? ''}
        hasLiveMatch={hasLiveMatch}
      />
      <LiveTicker matches={currentSeasonMatches} teams={teams} players={players} />

      {activeTab === 'home' && (
        <>
          <Hero teams={teams} matches={currentSeasonMatches} seasonLabel={currentSeason?.label ?? ''} onNavigate={goToTab} />
          <HomeBody
            teams={teams}
            matches={currentSeasonMatches}
            players={players}
            seasonLabel={currentSeason?.label ?? ''}
            onNavigate={goToTab}
            onSelectTeam={openTeamDetail}
          />
        </>
      )}

      {activeTab === 'spielplan' && (
        <>
          <PageHeader
            kicker={selectedSeason?.label ? `SAISON ${selectedSeason.label}` : 'HERO LEAGUE'}
            title="Spielplan"
            text="Alle Ergebnisse und Anstoßzeiten der Hero League — Spieltag für Spieltag."
          />
          {seasonSwitcher}
          <div className="max-w-[1320px] mx-auto px-4 sm:px-10 pb-10">
            <Spielplan
              teams={teams}
              matches={seasonMatches}
              isAdmin={isAdmin && isCurrentSeasonSelected}
              onUpdateMatchScore={handleUpdateMatchScore}
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
            text="Der komplette Tabellenstand der Hero League. Sortierung nach Punkten, Tordifferenz und erzielten Toren."
          />
          {seasonSwitcher}
          <div className="max-w-[1320px] mx-auto px-4 sm:px-10 pb-10">
            <Tabelle
              teams={teams}
              matches={seasonMatches}
              seasonLabel={selectedSeason?.label ?? ''}
              onSelectTeam={openTeamDetail}
            />
          </div>
        </>
      )}

      {activeTab === 'torschuetzen' && (
        <>
          <PageHeader
            kicker={selectedSeason?.label ? `SAISON ${selectedSeason.label} · TORJÄGERLISTE` : 'TORJÄGERLISTE'}
            title="Torschützenkönig"
            text="Das Rennen um den Goldenen Schuh der Hero League — die treffsichersten Spieler der Saison."
          />
          {seasonSwitcher}
          <Torschuetzenliste players={players} teams={teams} onSelectTeam={openTeamDetail} />
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
          <Statistiken players={players} matches={seasonMatches} teams={teams} />
        </>
      )}

      {!isAdmin && (
        <div className="text-center pb-12">
          <button
            onClick={() => navigateTo('/admin')}
            className="inline-flex items-center gap-1.5 text-[11px] font-sans font-bold uppercase text-hl-faint hover:text-brand-accent-light tracking-widest border border-white/5 bg-white/[.02] px-4 py-2 rounded-full transition-all cursor-pointer"
          >
            <Shield className="w-3.5 h-3.5" />
            <span>Admin-Bereich</span>
          </button>
        </div>
      )}

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

      <Footer onNavigate={goToTab} />
    </div>
  );
}
