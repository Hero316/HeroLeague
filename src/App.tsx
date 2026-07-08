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

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0A0118] text-white flex flex-col items-center justify-center font-sans space-y-4">
        <div className="w-12 h-12 border-4 border-brand-accent-light border-t-transparent rounded-full animate-spin"></div>
        <p className="text-sm font-mono text-gray-400 uppercase tracking-wider animate-pulse">Lade Liga-Daten...</p>
      </div>
    );
  }

  // ROUTE: /verein/:id – öffentliche Vereins-Detailseite
  if (currentPath.startsWith('/verein/')) {
    const teamId = decodeURIComponent(currentPath.slice('/verein/'.length).replace(/\/+$/, ''));
    const team = teams.find((t) => t.id === teamId);
    return (
      <div className="min-h-screen bg-[#0A0118] text-white font-sans selection:bg-brand-accent selection:text-white">
        <Navbar
          activeTab={activeTab}
          setActiveTab={(tab) => {
            navigateTo('/');
            setActiveTab(tab);
          }}
          isAdmin={isAdmin}
          onLogout={handleLogout}
          onOpenLogin={() => navigateTo('/admin')}
        />
        <main className="max-w-5xl mx-auto px-4 py-10">
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
              <p className="text-gray-400 font-sans">Dieser Verein existiert nicht (mehr).</p>
              <button
                onClick={() => navigateTo('/')}
                className="inline-flex items-center gap-1.5 text-xs font-mono uppercase text-brand-accent-light hover:underline cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Zurück zur Übersicht
              </button>
            </div>
          )}
        </main>
      </div>
    );
  }

  // ROUTE: /admin – geschütztes Backoffice
  if (currentPath === '/admin') {
    return (
      <div className="min-h-screen bg-[#0A0118] text-white font-sans flex flex-col justify-between selection:bg-brand-accent selection:text-white">
        <header className="border-b border-white/10 bg-[#0A0118]/80 backdrop-blur-md px-6 py-4">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-9 h-9 rounded-lg bg-brand-accent-light flex items-center justify-center font-bold italic text-lg shadow-md">
                HL
              </div>
              <span className="font-display font-bold text-lg tracking-tight uppercase">
                HERO <span className="text-brand-accent-light">LEAGUE</span>{' '}
                <span className="text-xs text-gray-400 font-mono font-light tracking-wide ml-1">BACKOFFICE</span>
              </span>
            </div>

            <button
              onClick={() => navigateTo('/')}
              className="flex items-center space-x-1 text-xs text-gray-400 hover:text-white transition-colors uppercase tracking-wider font-semibold font-mono"
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
              <div className="bg-[#1E1B4B]/30 border border-emerald-500/20 rounded-2xl p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-400 border border-emerald-500/20">
                    <Shield className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="font-display font-bold text-lg text-white uppercase tracking-tight">
                      Eingeloggt als Administrator
                    </h2>
                    <p className="text-xs text-emerald-400 font-sans mt-0.5">
                      Aktive Saison: {currentSeason?.label ?? '–'}
                    </p>
                  </div>
                </div>

                <button
                  onClick={handleLogout}
                  className="px-5 py-2 bg-rose-600 hover:bg-rose-500 rounded-xl text-xs font-bold uppercase transition-all shadow-lg flex items-center gap-1.5 text-white cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Abmelden</span>
                </button>
              </div>

              <div className="space-y-12">
                <div className="bg-[#1E1B4B]/20 border border-white/5 rounded-2xl p-6">
                  <h3 className="font-display font-black text-xl text-white uppercase tracking-tight mb-4 flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-brand-accent-light" />
                    Spielplan-Ergebnisse eintragen
                  </h3>
                  <p className="text-xs text-gray-400 font-sans mb-6">
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

                <div className="bg-[#1E1B4B]/20 border border-white/5 rounded-2xl p-6">
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

                <div className="bg-[#1E1B4B]/20 border border-white/5 rounded-2xl p-6">
                  <AdminPanel
                    teams={teams}
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

        <footer className="border-t border-white/5 bg-[#070114] py-6 text-center text-xs text-gray-500 font-sans">
          <p>© 2026 Hero League. Geschützter Administrationsbereich.</p>
        </footer>
      </div>
    );
  }

  // ÖFFENTLICHE WEBSITE
  const showSeasonSwitcher = seasons.length > 1 && activeTab !== 'home';

  return (
    <div className="min-h-screen bg-[#0A0118] text-white font-sans selection:bg-brand-accent selection:text-white">
      <Navbar
        activeTab={activeTab}
        setActiveTab={(tab) => {
          navigateTo('/');
          setActiveTab(tab);
        }}
        isAdmin={isAdmin}
        onLogout={handleLogout}
        onOpenLogin={() => navigateTo('/admin')}
      />

      {activeTab === 'home' && (
        <Hero
          teams={teams}
          matches={currentSeasonMatches}
          seasonLabel={currentSeason?.label ?? ''}
          onExploreSchedule={() => setActiveTab('spielplan')}
          onExploreStandings={() => setActiveTab('tabelle')}
        />
      )}

      <main className="max-w-7xl mx-auto px-4 py-10">
        {showSeasonSwitcher && (
          <div className="flex items-center justify-end gap-2 mb-6">
            <History className="w-4 h-4 text-gray-400" />
            <label className="text-xs font-mono text-gray-400 uppercase tracking-wider">Saison:</label>
            <select
              value={selectedSeason?.id ?? ''}
              onChange={(e) => setSelectedSeasonId(e.target.value)}
              className="bg-[#0A0118] border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-brand-accent-light cursor-pointer"
            >
              {seasons.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                  {s.isCurrent ? ' (aktiv)' : ''}
                </option>
              ))}
            </select>
          </div>
        )}

        {activeTab === 'home' && (
          <div className="space-y-12">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
              <div className="lg:col-span-8 space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="font-display font-bold text-lg text-white uppercase tracking-tight">Tabellenführung</h3>
                  <button
                    onClick={() => setActiveTab('tabelle')}
                    className="text-xs text-brand-accent-light hover:underline font-mono uppercase tracking-wider"
                  >
                    Vollständige Tabelle →
                  </button>
                </div>
                <Tabelle
                  teams={teams}
                  matches={currentSeasonMatches}
                  seasonLabel={currentSeason?.label ?? ''}
                  onSelectTeam={openTeamDetail}
                />
              </div>

              <div className="lg:col-span-4 space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="font-display font-bold text-lg text-white uppercase tracking-tight">Nächste Partien</h3>
                  <button
                    onClick={() => setActiveTab('spielplan')}
                    className="text-xs text-brand-accent-light hover:underline font-mono uppercase tracking-wider"
                  >
                    Gesamter Spielplan →
                  </button>
                </div>
                <Spielplan
                  teams={teams}
                  matches={currentSeasonMatches}
                  isAdmin={false}
                  onUpdateMatchScore={handleUpdateMatchScore}
                  onSelectTeam={openTeamDetail}
                />
              </div>
            </div>
          </div>
        )}

        {activeTab === 'spielplan' && (
          <div className="max-w-6xl mx-auto">
            <Spielplan
              teams={teams}
              matches={seasonMatches}
              isAdmin={isAdmin && isCurrentSeasonSelected}
              onUpdateMatchScore={handleUpdateMatchScore}
              onSelectTeam={openTeamDetail}
            />
          </div>
        )}

        {activeTab === 'tabelle' && (
          <div className="max-w-5xl mx-auto">
            <Tabelle
              teams={teams}
              matches={seasonMatches}
              seasonLabel={selectedSeason?.label ?? ''}
              onSelectTeam={openTeamDetail}
            />
          </div>
        )}

        {activeTab === 'torschuetzen' && (
          <div className="max-w-4xl mx-auto">
            <Torschuetzenliste matches={seasonMatches} teams={teams} onSelectTeam={openTeamDetail} />
          </div>
        )}

        {activeTab === 'statistiken' && <Statistiken players={players} matches={seasonMatches} teams={teams} />}
      </main>

      {!isAdmin && (
        <div className="text-center pb-12">
          <button
            onClick={() => navigateTo('/admin')}
            className="inline-flex items-center gap-1 text-[11px] font-mono uppercase text-gray-500 hover:text-brand-accent-light tracking-widest border border-white/5 bg-[#1E1B4B]/10 px-4 py-2 rounded-full transition-all cursor-pointer"
          >
            <Shield className="w-3.5 h-3.5" />
            <span>Admin-Bereich</span>
          </button>
        </div>
      )}

      {isAdmin && (
        <section className="bg-[#1E1B4B]/50 border-t border-white/10 py-8 px-4 mt-16">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <div className="flex items-center space-x-2.5">
              <span className="w-2.5 h-2.5 bg-emerald-500 rounded-full animate-ping" />
              <h2 className="font-display font-bold text-xl text-white uppercase tracking-tight">Admin-Modus aktiv</h2>
            </div>
            <button
              onClick={() => navigateTo('/admin')}
              className="px-4 py-1.5 border border-emerald-500/30 text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 rounded-full text-xs font-semibold font-mono uppercase tracking-wider transition-all cursor-pointer"
            >
              Backoffice öffnen →
            </button>
          </div>
        </section>
      )}

      <footer className="border-t border-white/10 bg-[#0A0118] py-8 text-center text-xs text-gray-500 font-sans">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row justify-between items-center gap-4">
          <span className="font-display font-bold text-sm text-white uppercase">
            HERO <span className="text-brand-accent-light">LEAGUE</span>
          </span>
          <p className="font-light">© 2026 Hero League. Alle Rechte vorbehalten.</p>
        </div>
      </footer>
    </div>
  );
}
