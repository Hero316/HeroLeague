import React from 'react';
import { PlayerStat, Match, Team } from '../types';
import PlayerAvatar from './PlayerAvatar';
import { TeamCrest } from './ui';

interface StatistikenProps {
  players: PlayerStat[];
  matches: Match[];
  teams: Team[];
}

type Accent = 'teal' | 'gold' | 'magenta';

const GLOW: Record<Accent, string> = {
  teal: 'radial-gradient(circle,rgba(34,223,201,.16),transparent 68%)',
  gold: 'radial-gradient(circle,rgba(233,196,106,.16),transparent 68%)',
  magenta: 'radial-gradient(circle,rgba(232,62,140,.14),transparent 68%)',
};

const VALUE_COLOR: Record<Accent, string> = {
  teal: 'text-brand-accent-light',
  gold: 'text-hl-gold',
  magenta: 'text-[#F0559E]',
};

// Statistik-Seite: Liga-Kennzahlen als Kachelzeile + Leader-Cards für Spieler und Teams.
export default function Statistiken({ players, matches, teams }: StatistikenProps) {
  const finished = matches.filter((m) => m.status === 'beendet' && m.homeScore !== null && m.awayScore !== null);
  const totalGoals = finished.reduce((acc, m) => acc + (m.homeScore || 0) + (m.awayScore || 0), 0);
  const avgGoals = finished.length ? (totalGoals / finished.length).toFixed(1) : '0.0';

  const leagueTiles = [
    { value: String(totalGoals), label: 'TORE GESAMT' },
    { value: avgGoals, label: 'Ø TORE / SPIEL' },
    { value: String(finished.length), label: 'GESPIELTE PARTIEN' },
    { value: String(teams.length), label: 'CLUBS' },
  ];

  // Team-Auswertungen
  const clubStats = React.useMemo(() => {
    const stats: {
      [teamId: string]: { team: Team; played: number; goalsFor: number; goalsAgainst: number; cleanSheets: number };
    } = {};
    teams.forEach((t) => {
      stats[t.id] = { team: t, played: 0, goalsFor: 0, goalsAgainst: 0, cleanSheets: 0 };
    });
    finished.forEach((m) => {
      const home = stats[m.homeTeamId];
      const away = stats[m.awayTeamId];
      if (!home || !away) return;
      home.played += 1;
      away.played += 1;
      home.goalsFor += m.homeScore!;
      home.goalsAgainst += m.awayScore!;
      away.goalsFor += m.awayScore!;
      away.goalsAgainst += m.homeScore!;
      if (m.awayScore === 0) home.cleanSheets += 1;
      if (m.homeScore === 0) away.cleanSheets += 1;
    });
    const played = Object.values(stats).filter((s) => s.played > 0);
    return {
      bestAttack: played.length ? [...played].sort((a, b) => b.goalsFor - a.goalsFor)[0] : null,
      bestDefense: played.length ? [...played].sort((a, b) => a.goalsAgainst - b.goalsAgainst)[0] : null,
      mostCleanSheets: played.length ? [...played].sort((a, b) => b.cleanSheets - a.cleanSheets)[0] : null,
    };
  }, [teams, finished]);

  // Spieler-Auswertungen
  const topScorer = [...players].filter((p) => p.goals > 0).sort((a, b) => b.goals - a.goals)[0] ?? null;
  const topAssist = [...players].filter((p) => p.assists > 0).sort((a, b) => b.assists - a.assists)[0] ?? null;
  const bestRatio =
    [...players]
      .filter((p) => p.goals > 0 && p.matchesPlayed > 0)
      .sort((a, b) => b.goals / b.matchesPlayed - a.goals / a.matchesPlayed)[0] ?? null;

  interface LeaderCard {
    kind: 'SPIELER' | 'TEAM';
    category: string;
    accent: Accent;
    value: string;
    unit: string;
    name: string;
    sub: string;
    avatar: React.ReactNode;
  }

  const cards: LeaderCard[] = [];

  if (topScorer) {
    cards.push({
      kind: 'SPIELER',
      category: 'MEISTE TORE',
      accent: 'gold',
      value: String(topScorer.goals),
      unit: 'Tore',
      name: topScorer.name,
      sub: topScorer.teamName,
      avatar: <PlayerAvatar name={topScorer.name} imageUrl={topScorer.imageUrl} color={topScorer.teamLogoColor} size="lg" />,
    });
  }
  if (topAssist) {
    cards.push({
      kind: 'SPIELER',
      category: 'MEISTE ASSISTS',
      accent: 'teal',
      value: String(topAssist.assists),
      unit: 'Vorlagen',
      name: topAssist.name,
      sub: topAssist.teamName,
      avatar: <PlayerAvatar name={topAssist.name} imageUrl={topAssist.imageUrl} color={topAssist.teamLogoColor} size="lg" />,
    });
  }
  if (bestRatio) {
    cards.push({
      kind: 'SPIELER',
      category: 'BESTE QUOTE',
      accent: 'magenta',
      value: (bestRatio.goals / bestRatio.matchesPlayed).toFixed(1),
      unit: 'Tore/Spiel',
      name: bestRatio.name,
      sub: bestRatio.teamName,
      avatar: <PlayerAvatar name={bestRatio.name} imageUrl={bestRatio.imageUrl} color={bestRatio.teamLogoColor} size="lg" />,
    });
  }
  if (clubStats.bestAttack && clubStats.bestAttack.goalsFor > 0) {
    const t = clubStats.bestAttack.team;
    cards.push({
      kind: 'TEAM',
      category: 'BESTE OFFENSIVE',
      accent: 'teal',
      value: String(clubStats.bestAttack.goalsFor),
      unit: 'Tore',
      name: t.name,
      sub: `${clubStats.bestAttack.goalsFor} erzielte Tore`,
      avatar: <TeamCrest name={t.name} shortName={t.shortName} color={t.logoColor} logoUrl={t.logoUrl} size="lg" />,
    });
  }
  if (clubStats.bestDefense) {
    const t = clubStats.bestDefense.team;
    cards.push({
      kind: 'TEAM',
      category: 'BESTE DEFENSIVE',
      accent: 'teal',
      value: String(clubStats.bestDefense.goalsAgainst),
      unit: clubStats.bestDefense.goalsAgainst === 1 ? 'Gegentor' : 'Gegentore',
      name: t.name,
      sub: `Nur ${clubStats.bestDefense.goalsAgainst} Gegentore`,
      avatar: <TeamCrest name={t.name} shortName={t.shortName} color={t.logoColor} logoUrl={t.logoUrl} size="lg" />,
    });
  }
  if (clubStats.mostCleanSheets && clubStats.mostCleanSheets.cleanSheets > 0) {
    const t = clubStats.mostCleanSheets.team;
    cards.push({
      kind: 'TEAM',
      category: 'MEISTE WEISSE WESTEN',
      accent: 'gold',
      value: String(clubStats.mostCleanSheets.cleanSheets),
      unit: clubStats.mostCleanSheets.cleanSheets === 1 ? 'Spiel' : 'Spiele',
      name: t.name,
      sub: `Zu null in ${clubStats.mostCleanSheets.cleanSheets} ${clubStats.mostCleanSheets.cleanSheets === 1 ? 'Spiel' : 'Spielen'}`,
      avatar: <TeamCrest name={t.name} shortName={t.shortName} color={t.logoColor} logoUrl={t.logoUrl} size="lg" />,
    });
  }

  return (
    <div className="max-w-[1320px] mx-auto px-4 sm:px-10 pb-10">
      {/* Liga-Kennzahlen */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 pt-2">
        {leagueTiles.map((tile) => (
          <div
            key={tile.label}
            className="relative rounded-2xl overflow-hidden bg-[linear-gradient(180deg,rgba(255,255,255,.045),rgba(255,255,255,.012))] border border-white/10 p-5 backdrop-blur-md"
          >
            <div className="font-display font-black text-[42px] leading-[.9] text-brand-accent-light">{tile.value}</div>
            <div className="font-sans font-bold text-[11px] tracking-[1.5px] text-hl-dim mt-1.5">{tile.label}</div>
          </div>
        ))}
      </div>

      {/* Leader-Cards */}
      {cards.length === 0 ? (
        <div className="hl-card text-center py-12 text-hl-mute font-sans text-sm mt-5">
          Noch keine Statistiken verfügbar. Sobald Spiele beendet sind, erscheinen hier die Bestwerte.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mt-5">
          {cards.map((c) => (
            <div
              key={c.category}
              className="relative rounded-[20px] overflow-hidden bg-[linear-gradient(180deg,rgba(255,255,255,.05),rgba(255,255,255,.012))] border border-white/10 p-6 backdrop-blur-lg shadow-[0_20px_50px_rgba(0,0,0,.35)]"
            >
              <div className="absolute top-0 right-0 w-[180px] h-[180px] pointer-events-none" style={{ background: GLOW[c.accent] }} />
              <div className="relative">
                <span
                  className={`inline-block px-[11px] py-[5px] rounded-[7px] font-sans font-extrabold text-[10px] tracking-[1.5px] ${
                    c.kind === 'SPIELER'
                      ? 'bg-[rgba(34,223,201,.12)] text-brand-accent-light'
                      : 'bg-[rgba(232,62,140,.12)] text-hl-magenta-soft'
                  }`}
                >
                  {c.kind}
                </span>
                <div className="font-sans font-extrabold text-xs tracking-[2px] text-hl-dim mt-4">{c.category}</div>
                <div className="flex items-center gap-3.5 mt-3.5">
                  {c.avatar}
                  <div className="min-w-0">
                    <div className="font-display font-black text-[26px] leading-[.95] uppercase text-white truncate">{c.name}</div>
                    <div className="font-sans text-[12.5px] text-hl-mute mt-1 truncate">{c.sub}</div>
                  </div>
                </div>
                <div className="flex items-baseline gap-2 mt-5">
                  <span className={`font-display font-black text-[52px] leading-[.9] ${VALUE_COLOR[c.accent]}`}>{c.value}</span>
                  <span className="font-sans font-bold text-[13px] tracking-wider text-hl-dim">{c.unit}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
