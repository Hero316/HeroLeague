import React, { useState, useEffect } from 'react';
import { Team, Match, PlayerStat, ActiveTab } from './types';
import Navbar from './components/Navbar';
import Hero from './components/Hero';
import Tabelle from './components/Tabelle';
import Spielplan from './components/Spielplan';
import Torschuetzenliste from './components/Torschuetzenliste';
import Statistiken from './components/Statistiken';
import AdminPanel from './components/AdminPanel';
import AdminLogin from './components/AdminLogin';
import { Shield, Sparkles, LogOut, ArrowLeft, ArrowRight, CheckCircle2 } from 'lucide-react';

export default function App() {
  // Navigation & UI States
  const [activeTab, setActiveTab] = useState<ActiveTab>('home');
  const [currentPath, setCurrentPath] = useState<string>(window.location.pathname);

  // Core Data States - loaded dynamically from full-stack backend APIs
  const [teams, setTeams] = useState<Team[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [players, setPlayers] = useState<PlayerStat[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const [isAdmin, setIsAdmin] = useState<boolean>(() => {
    return localStorage.getItem('heroleague_isadmin') === 'true';
  });

  // Fetch all data from full-stack server
  const fetchData = async () => {
    try {
      const resTeams = await fetch('/api/teams');
      const dataTeams = await resTeams.json();
      setTeams(dataTeams);

      const resMatches = await fetch('/api/matches');
      const dataMatches = await resMatches.json();
      setMatches(dataMatches);

      const resPlayers = await fetch('/api/players');
      const dataPlayers = await resPlayers.json();
      setPlayers(dataPlayers);
    } catch (err) {
      console.error("Error loading league data from API", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    
    // Sync browser back/forward buttons with lightweight router
    const handlePopState = () => {
      setCurrentPath(window.location.pathname);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    localStorage.setItem('heroleague_isadmin', isAdmin.toString());
  }, [isAdmin]);

  // Navigate to path safely and sync state
  const navigateTo = (path: string) => {
    window.history.pushState({}, '', path);
    setCurrentPath(path);
  };

  // Handler: Update a match score, goals & status ('geplant', 'live', 'beendet')
  const handleUpdateMatchScore = async (
    matchId: string,
    homeScore: number | null,
    awayScore: number | null,
    status: 'geplant' | 'live' | 'beendet',
    scorers?: { playerName: string; teamId: string }[]
  ) => {
    try {
      const oldMatch = matches.find((m) => m.id === matchId);
      
      const res = await fetch(`/api/matches/${matchId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ homeScore, awayScore, status, scorers })
      });

      if (!res.ok) throw new Error("Could not update match");

      await fetchData();
    } catch (err) {
      console.error("Error updating match score", err);
    }
  };

  // Handler: Simulate scores for a specific matchday
  const handleSimulateMatchday = async (matchday: number) => {
    try {
      await fetch('/api/matches/simulate-day', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matchday })
      });
      await fetchData();
    } catch (err) {
      console.error("Error simulating matchday", err);
    }
  };

  // Handler: Simulate scores for all remaining unplayed matches in the season
  const handleSimulateRemaining = async () => {
    try {
      await fetch('/api/matches/simulate-remaining', { method: 'POST' });
      await fetchData();
      setActiveTab('tabelle');
    } catch (err) {
      console.error("Error simulating remaining games", err);
    }
  };

  // Handler: Reset all matches back to unplayed (null goals)
  const handleResetSaison = async () => {
    try {
      await fetch('/api/reset', { method: 'POST' });
      await fetchData();
    } catch (err) {
      console.error("Error resetting season", err);
    }
  };

  // Handler: Dynamically add a custom new team to the league
  const handleAddTeam = async (newTeam: Team) => {
    try {
      await fetch('/api/teams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newTeam)
      });
      await fetchData();
    } catch (err) {
      console.error("Error adding team", err);
    }
  };

  // Handler: Edit an existing team name and roster
  const handleEditTeam = async (teamId: string, updatedData: Partial<Team>) => {
    try {
      const res = await fetch(`/api/teams/${teamId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedData)
      });
      if (res.ok) {
        await fetchData();
      }
    } catch (err) {
      console.error("Error editing team details", err);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0A0118] text-white flex flex-col items-center justify-center font-sans space-y-4">
        <div className="w-12 h-12 border-4 border-brand-accent-light border-t-transparent rounded-full animate-spin"></div>
        <p className="text-sm font-mono text-gray-400 uppercase tracking-wider animate-pulse">Lade Liga-Daten...</p>
      </div>
    );
  }

  // PROTECTED ROUTE RENDERING: /admin
  if (currentPath === '/admin') {
    return (
      <div className="min-h-screen bg-[#0A0118] text-white font-sans flex flex-col justify-between selection:bg-brand-accent selection:text-white">
        {/* Simple secure header */}
        <header className="border-b border-white/10 bg-[#0A0118]/80 backdrop-blur-md px-6 py-4">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-9 h-9 rounded-lg bg-brand-accent-light flex items-center justify-center font-bold italic text-lg shadow-md">
                HL
              </div>
              <span className="font-display font-bold text-lg tracking-tight uppercase">
                HERO <span className="text-brand-accent-light">LEAGUE</span> <span className="text-xs text-gray-400 font-mono font-light tracking-wide ml-1">BACKOFFICE</span>
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

        {/* Dynamic Inner protected content */}
        <main className="flex-1 flex items-center justify-center p-6">
          {!isAdmin ? (
            <AdminLogin onLoginSuccess={() => setIsAdmin(true)} />
          ) : (
            <div className="w-full max-w-7xl mx-auto space-y-8 py-4">
              {/* Backoffice Hero Banner */}
              <div className="bg-[#1E1B4B]/30 border border-emerald-500/20 rounded-2xl p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-400 border border-emerald-500/20">
                    <Shield className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="font-display font-bold text-lg text-white uppercase tracking-tight">Eingeloggt als Administrator</h2>
                    <p className="text-xs text-emerald-400 font-sans mt-0.5">Sichere Telefon-2FA abgeschlossen • Berechtigt zum Editieren</p>
                  </div>
                </div>
                
                <button
                  onClick={() => setIsAdmin(false)}
                  className="px-5 py-2 bg-rose-600 hover:bg-rose-500 rounded-xl text-xs font-bold uppercase transition-all shadow-lg flex items-center gap-1.5 text-white cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Abmelden (Logout)</span>
                </button>
              </div>

              {/* Main Admin Panels split screen */}
              <div className="space-y-12">
                <div className="bg-[#1E1B4B]/20 border border-white/5 rounded-2xl p-6">
                  <h3 className="font-display font-black text-xl text-white uppercase tracking-tight mb-4 flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-brand-accent-light" />
                    Spielplan-Ergebnisse eintragen
                  </h3>
                  <p className="text-xs text-gray-400 font-sans mb-6">
                    Wähle oben im Spielplan-Widget einen Spieltag aus, um Ergebnisse einzutragen und Torschützen zuzuweisen.
                  </p>
                  <Spielplan
                    teams={teams}
                    matches={matches}
                    isAdmin={isAdmin}
                    onUpdateMatchScore={handleUpdateMatchScore}
                    onSimulateMatchday={handleSimulateMatchday}
                  />
                </div>

                <div className="bg-[#1E1B4B]/20 border border-white/5 rounded-2xl p-6">
                  <AdminPanel
                    teams={teams}
                    onAddTeam={handleAddTeam}
                    onResetSaison={handleResetSaison}
                    onSimulateRemaining={handleSimulateRemaining}
                    onEditTeam={handleEditTeam}
                  />
                </div>
              </div>
            </div>
          )}
        </main>

        <footer className="border-t border-white/5 bg-[#070114] py-6 text-center text-xs text-gray-500 font-sans">
          <p>© 2026 Hero League Sports Group. Geschützter Administrationsbereich.</p>
        </footer>
      </div>
    );
  }

  // PUBLIC WEBSITE RENDERING
  return (
    <div className="min-h-screen bg-[#0A0118] text-white font-sans selection:bg-brand-accent selection:text-white">
      {/* Global Navbar */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={(tab) => {
          navigateTo('/');
          setActiveTab(tab);
        }}
        isAdmin={isAdmin}
        onLogout={() => setIsAdmin(false)}
        onOpenLogin={() => navigateTo('/admin')}
      />

      {/* Hero Header Area - Only visible on Home Tab for elegant display */}
      {activeTab === 'home' && (
        <Hero
          teams={teams}
          matches={matches}
          onExploreSchedule={() => setActiveTab('spielplan')}
          onExploreStandings={() => setActiveTab('tabelle')}
        />
      )}

      {/* Main Container Content */}
      <main className="max-w-7xl mx-auto px-4 py-10">
        {activeTab === 'home' && (
          <div className="space-y-12">
            {/* Quick Preview Dashboard Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
              {/* Standings preview (half-width on home) */}
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
                <Tabelle teams={teams} matches={matches} />
              </div>

              {/* Match preview (half-width on home) */}
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
                  matches={matches}
                  isAdmin={isAdmin}
                  onUpdateMatchScore={handleUpdateMatchScore}
                  onSimulateMatchday={handleSimulateMatchday}
                />
              </div>
            </div>
          </div>
        )}

        {activeTab === 'spielplan' && (
          <div className="max-w-4xl mx-auto">
            <Spielplan
              teams={teams}
              matches={matches}
              isAdmin={isAdmin}
              onUpdateMatchScore={handleUpdateMatchScore}
              onSimulateMatchday={handleSimulateMatchday}
            />
          </div>
        )}

        {activeTab === 'tabelle' && (
          <div className="max-w-5xl mx-auto">
            <Tabelle teams={teams} matches={matches} />
          </div>
        )}

        {activeTab === 'torschuetzen' && (
          <div className="max-w-4xl mx-auto">
            <Torschuetzenliste matches={matches} teams={teams} />
          </div>
        )}

        {activeTab === 'statistiken' && (
          <Statistiken players={players} matches={matches} teams={teams} />
        )}
      </main>

      {/* Secondary Quick link to backoffice at bottom if logged out */}
      {!isAdmin && (
        <div className="text-center pb-12">
          <button
            onClick={() => navigateTo('/admin')}
            className="inline-flex items-center gap-1 text-[11px] font-mono uppercase text-gray-500 hover:text-brand-accent-light tracking-widest border border-white/5 bg-[#1E1B4B]/10 px-4 py-2 rounded-full transition-all cursor-pointer"
          >
            <Shield className="w-3.5 h-3.5" />
            <span>Admin-Bereich betreten</span>
          </button>
        </div>
      )}

      {/* Permanent visual Admin Deck Toggle at bottom if Admin is logged in */}
      {isAdmin && (
        <section className="bg-[#1E1B4B]/50 border-t border-white/10 py-12 px-4 mt-16">
          <div className="max-w-7xl mx-auto">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center space-x-2.5">
                <span className="w-2.5 h-2.5 bg-emerald-500 rounded-full animate-ping" />
                <h2 className="font-display font-bold text-xl text-white uppercase tracking-tight">Admin-Kontrollzentrum</h2>
              </div>
              <button
                onClick={() => navigateTo('/admin')}
                className="px-4 py-1.5 border border-emerald-500/30 text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 rounded-full text-xs font-semibold font-mono uppercase tracking-wider transition-all cursor-pointer"
              >
                Vollständiges Backoffice öffnen →
              </button>
            </div>
            <AdminPanel
              teams={teams}
              onAddTeam={handleAddTeam}
              onResetSaison={handleResetSaison}
              onSimulateRemaining={handleSimulateRemaining}
              onEditTeam={handleEditTeam}
            />
          </div>
        </section>
      )}

      {/* Footer Branding */}
      <footer className="border-t border-white/10 bg-[#0A0118] py-8 text-center text-xs text-gray-500 font-sans">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row justify-between items-center gap-4">
          <div className="flex items-center space-x-2">
            <span className="font-display font-bold text-sm text-white uppercase">HERO <span className="text-brand-accent-light">LEAGUE</span></span>
            <span className="text-[10px] text-gray-600 font-mono">v1.0.0</span>
          </div>
          <p className="font-light">
            © 2026 Hero League Sports Group. Alle Rechte vorbehalten. Entwickelt für die Bundesliga.
          </p>
        </div>
      </footer>
    </div>
  );
}
