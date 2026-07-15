import React from 'react';
import { PlayerStat, Match, Team } from '../types';
import { rankGoldenGlove } from '../lib/goldenGlove';
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

  // Ballon d'Or: Top 5 nach Wertungspunkten (Tore, Vorlagen, bester Spieler, Team-Ergebnis, Torwart-zu-null)
  const ballonRanking = React.useMemo(
    () =>
      [...players]
        .filter((p) => p.points > 0)
        .sort(
          (a, b) =>
            b.points - a.points ||
            b.goals - a.goals ||
            b.assists - a.assists ||
            a.name.localeCompare(b.name)
        )
        .slice(0, 5),
    [players]
  );

  // Goldener Handschuh: Top 5 Torhüter nach der „Goals Saved Above Average"-Wertung.
  // Der Score wird dynamisch aus dem Liga-Durchschnitt berechnet; angezeigt werden
  // nur Keeper mit mindestens MIN_GAMES Torwart-Spielen, absteigend nach Score.
  const gloveRanking = React.useMemo(() => rankGoldenGlove(players, matches).slice(0, 5), [players, matches]);

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

      {/* Auszeichnungen: Ballon d'Or (Feldwertung) + Goldener Handschuh (Torhüter) nebeneinander */}
      {(ballonRanking.length > 0 || gloveRanking.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-8">
          {/* Ballon d'Or – Spielerwertung (Top 5 nach Punkten) */}
          {ballonRanking.length > 0 && (
            <div>
              <div className="flex items-center gap-2.5 mb-4">
                <span className="text-2xl">🏆</span>
                <h3 className="font-display font-black text-xl sm:text-2xl uppercase tracking-tight text-white">
                  Ballon d'Or
                </h3>
                <span className="font-sans font-bold text-[11px] tracking-[1.5px] text-hl-dim mt-1">TOP 5 · SPIELER</span>
              </div>
              <div className="relative rounded-[20px] overflow-hidden bg-[linear-gradient(180deg,rgba(255,255,255,.05),rgba(255,255,255,.012))] border border-white/10 backdrop-blur-lg shadow-[0_20px_50px_rgba(0,0,0,.35)]">
                <div className="absolute top-0 right-0 w-[220px] h-[220px] pointer-events-none" style={{ background: GLOW.gold }} />
                <div className="relative divide-y divide-white/[.06]">
                  {ballonRanking.map((p, idx) => {
                    const rankColor =
                      idx === 0 ? 'text-hl-gold' : idx === 1 ? 'text-[#C7D0DA]' : idx === 2 ? 'text-[#E0A46B]' : 'text-hl-dim';
                    const breakdown = [
                      p.goals > 0 ? `${p.goals} ⚽` : null,
                      p.assists > 0 ? `${p.assists} 🅰️` : null,
                      p.motmCount > 0 ? `${p.motmCount}× ⭐` : null,
                      p.cleanSheets > 0 ? `${p.cleanSheets}× 🧤` : null,
                    ].filter(Boolean);
                    return (
                      <div key={p.id} className="flex items-center gap-3.5 px-4 sm:px-6 py-3.5">
                        <div className={`font-display font-black text-2xl sm:text-3xl w-8 text-center shrink-0 ${rankColor}`}>
                          {idx + 1}
                        </div>
                        <PlayerAvatar name={p.name} imageUrl={p.imageUrl} color={p.teamLogoColor} size="md" />
                        <div className="min-w-0 flex-1">
                          <div className="font-sans font-bold text-sm sm:text-[15px] text-white truncate">{p.name}</div>
                          <div className="font-sans text-[11.5px] text-hl-mute truncate">
                            {p.teamName}
                            {breakdown.length > 0 && <span className="text-hl-dim"> · {breakdown.join(' · ')}</span>}
                          </div>
                        </div>
                        <div className="flex items-baseline gap-1.5 shrink-0">
                          <span className="font-display font-black text-2xl sm:text-3xl leading-none text-hl-gold">
                            {p.points.toFixed(1)}
                          </span>
                          <span className="font-sans font-bold text-[11px] tracking-wider text-hl-dim">PKT</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Goldener Handschuh – Torhüterwertung (Top 5 nach „zu null") */}
          {gloveRanking.length > 0 && (
            <div>
              <div className="flex items-center gap-2.5 mb-4">
                <span className="text-2xl">🧤</span>
                <h3 className="font-display font-black text-xl sm:text-2xl uppercase tracking-tight text-white">
                  Goldener Handschuh
                </h3>
                <span className="font-sans font-bold text-[11px] tracking-[1.5px] text-hl-dim mt-1">TOP 5 · TORHÜTER</span>
              </div>
              <div className="relative rounded-[20px] overflow-hidden bg-[linear-gradient(180deg,rgba(255,255,255,.05),rgba(255,255,255,.012))] border border-white/10 backdrop-blur-lg shadow-[0_20px_50px_rgba(0,0,0,.35)]">
                <div className="absolute top-0 right-0 w-[220px] h-[220px] pointer-events-none" style={{ background: GLOW.teal }} />
                <div className="relative divide-y divide-white/[.06]">
                  {gloveRanking.map((p, idx) => {
                    const rankColor =
                      idx === 0 ? 'text-hl-gold' : idx === 1 ? 'text-[#C7D0DA]' : idx === 2 ? 'text-[#E0A46B]' : 'text-hl-dim';
                    const sub = [
                      `${p.gamesInGoal} im Tor`,
                      `${p.cleanSheets}× zu null`,
                      `${p.goalsConceded} Gegentore`,
                      p.motmCount > 0 ? `${p.motmCount}× ⭐` : null,
                    ]
                      .filter(Boolean)
                      .join(' · ');
                    return (
                      <div key={p.id} className="flex items-center gap-3.5 px-4 sm:px-6 py-3.5">
                        <div className={`font-display font-black text-2xl sm:text-3xl w-8 text-center shrink-0 ${rankColor}`}>
                          {idx + 1}
                        </div>
                        <PlayerAvatar name={p.name} imageUrl={p.imageUrl} color={p.teamLogoColor} size="md" />
                        <div className="min-w-0 flex-1">
                          <div className="font-sans font-bold text-sm sm:text-[15px] text-white truncate">{p.name}</div>
                          <div className="font-sans text-[11.5px] text-hl-mute truncate">
                            {p.teamName}
                            <span className="text-hl-dim"> · {sub}</span>
                          </div>
                        </div>
                        <div className="flex items-baseline gap-1.5 shrink-0">
                          <span className="font-display font-black text-2xl sm:text-3xl leading-none text-brand-accent-light">
                            {p.score.toFixed(1)}
                          </span>
                          <span className="font-sans font-bold text-[11px] tracking-wider text-hl-dim">PKT</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
