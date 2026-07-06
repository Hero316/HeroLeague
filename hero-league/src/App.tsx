import React, { useState, useEffect } from 'react';
import { INITIAL_TEAMS, INITIAL_MATCHES, INITIAL_PLAYERS } from './data/initialData';
import { Team, Match, PlayerStat, ActiveTab } from './types';
import Navbar from './components/Navbar';
import Hero from './components/Hero';
import Tabelle from './components/Tabelle';
import Spielplan from './components/Spielplan';
import Statistiken from './components/Statistiken';
import AdminPanel from './components/AdminPanel';
import LoginModal from './components/LoginModal';
import { Shield, Sparkles, CheckCircle2, RefreshCw } from 'lucide-react';

export default function App() {
  // Navigation & UI States
  const [activeTab, setActiveTab] = useState<ActiveTab>('home');
  const [isLoginOpen, setIsLoginOpen] = useState(false);

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
    
    // Automatically enable Admin Mode if path is /admin
    if (window.location.pathname === '/admin') {
      setIsAdmin(true);
      localStorage.setItem('heroleague_isadmin', 'true');
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('heroleague_isadmin', isAdmin.toString());
  }, [isAdmin]);

  // Handler: Update a match score, goals & status ('geplant', 'live', 'beendet')
  const handleUpdateMatchScore = async (
    matchId: string,
    homeScore: number | null,
    awayScore: number | null,
    status: 'geplant' | 'live' | 'beendet'
  ) => {
    try {
      // Find old match to allocate stats if status becomes 'beendet'
      const oldMatch = matches.find((m) => m.id === matchId);
      
      const res = await fetch(`/api/matches/${matchId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ homeScore, awayScore, status })
      });

      if (!res.ok) throw new Error("Could not update match");

      // Handle live goal updates attribution to player stats dynamically
      if (status === 'beendet' && homeScore !== null && awayScore !== null && oldMatch && oldMatch.status !== 'beendet') {
        const homeTeamObj = teams.find((t) => t.id === oldMatch.homeTeamId);
        const awayTeamObj = teams.find((t) => t.id === oldMatch.awayTeamId);

        if (homeTeamObj && awayTeamObj) {
          let updatedPlayers = [...players];
          
          if (homeScore > 0) {
            // Pick a player from team's spielerliste (or fallback if empty)
            const homeRoster = homeTeamObj.spielerliste || [];
            if (homeRoster.length > 0) {
              for (let i = 0; i < homeScore; i++) {
                const scorerName = homeRoster[Math.floor(Math.random() * homeRoster.length)];
                let pIndex = updatedPlayers.findIndex(p => p.name === scorerName);
                if (pIndex === -1) {
                  // Enroll player
                  updatedPlayers.push({
                    id: `p-${Date.now()}-${i}`,
                    name: scorerName,
                    teamName: homeTeamObj.name,
                    teamLogoColor: homeTeamObj.logoColor,
                    goals: 1,
                    assists: 0,
                    matchesPlayed: 1
                  });
                } else {
                  updatedPlayers[pIndex].goals += 1;
                  updatedPlayers[pIndex].matchesPlayed += 1;
                }
              }
            }
          }

          if (awayScore > 0) {
            const awayRoster = awayTeamObj.spielerliste || [];
            if (awayRoster.length > 0) {
              for (let i = 0; i < awayScore; i++) {
                const scorerName = awayRoster[Math.floor(Math.random() * awayRoster.length)];
                let pIndex = updatedPlayers.findIndex(p => p.name === scorerName);
                if (pIndex === -1) {
                  // Enroll player
                  updatedPlayers.push({
                    id: `p-away-${Date.now()}-${i}`,
                    name: scorerName,
                    teamName: awayTeamObj.name,
                    teamLogoColor: awayTeamObj.logoColor,
                    goals: 1,
                    assists: 0,
                    matchesPlayed: 1
                  });
                } else {
                  updatedPlayers[pIndex].goals += 1;
                  updatedPlayers[pIndex].matchesPlayed += 1;
                }
              }
            }
          }

          // Save players to server
          await fetch('/api/players', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ players: updatedPlayers })
          });
        }
      }

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

  return (
    <div className="min-h-screen bg-[#0A0118] text-white font-sans selection:bg-brand-accent selection:text-white">
      {/* Dynamic top alert if logged in as Admin */}
      {isAdmin && (
        <div className="bg-gradient-to-r from-brand-accent via-brand-accent-light to-brand-dark border-b border-white/10 px-4 py-2 text-center text-xs font-mono font-semibold text-white flex items-center justify-center space-x-2 relative z-50">
          <Shield className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>ADMIN-MODUS AKTIV: Du kannst jetzt im Spielplan beliebige Tore eintragen!</span>
          <button 
            onClick={() => setIsAdmin(false)}
            className="underline hover:text-rose-300 ml-3 cursor-pointer text-[10px] font-sans"
          >
            Modus beenden
          </button>
        </div>
      )}

      {/* Global Navbar */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        isAdmin={isAdmin}
        onLogout={() => setIsAdmin(false)}
        onOpenLogin={() => setIsLoginOpen(true)}
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

        {activeTab === 'statistiken' && (
          <Statistiken players={players} matches={matches} teams={teams} />
        )}
      </main>

      {/* Permanent visual Admin Deck Toggle at bottom if Admin is logged in */}
      {isAdmin && (
        <section className="bg-[#1E1B4B]/50 border-t border-white/10 py-12 px-4 mt-16">
          <div className="max-w-7xl mx-auto">
            <div className="flex items-center space-x-2.5 mb-6">
              <span className="w-2.5 h-2.5 bg-emerald-500 rounded-full animate-ping" />
              <h2 className="font-display font-bold text-xl text-white uppercase tracking-tight">Admin-Kontrollzentrum</h2>
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

      {/* Authentication Modal */}
      <LoginModal
        isOpen={isLoginOpen}
        onClose={() => setIsLoginOpen(false)}
        onLoginSuccess={() => {
          setIsAdmin(true);
          // Auto switch to schedule tab to show them how to edit scorecards
          setActiveTab('spielplan');
        }}
      />
    </div>
  );
}
