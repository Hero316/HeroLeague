import React from 'react';
import { motion } from 'motion/react';
import { PlayerStat, Match, Team, MatchPlayerStat, ScoringConfig } from '../types';
import { scorerRanking as trackScorers, assistRanking as trackAssists, goldenGloveRanking } from '../lib/trackingAwards';
import { DEFAULT_SCORING } from '../lib/scoring';
import { Swords } from 'lucide-react';
import PlayerCrest from './PlayerCrest';
import { TeamCrest } from './ui';
import { CountUp, Reveal, useSettledList } from './anim';
import CompareOverlay from './CompareOverlay';

interface StatistikenProps {
  players: PlayerStat[];
  matches: Match[];
  teams: Team[];
  trackingRows?: MatchPlayerStat[]; // veröffentlichte getrackte Werte (für die Award-Rechnung)
  scoringConfig?: ScoringConfig; // Score-Einstellungen (Torschützen/Torwart-Score)
  onSelectTeam?: (teamId: string, playerName?: string) => void;
}

// Torhüter-Zeile: PlayerStat (fürs Wappen) + der getrackte Torwart-Score.
interface GloveRow extends PlayerStat {
  score: number; // Goldener-Handschuh-Score aus den getrackten Aktionen
  saves: number; // Paraden
  penaltySaves: number; // gehaltene Elfmeter
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
export default function Statistiken({ players, matches, teams, trackingRows = [], scoringConfig, onSelectTeam }: StatistikenProps) {
  const [compareOpen, setCompareOpen] = React.useState(false);
  const finished = matches.filter((m) => m.status === 'beendet' && m.homeScore !== null && m.awayScore !== null);
  const totalGoals = finished.reduce((acc, m) => acc + (m.homeScore || 0) + (m.awayScore || 0), 0);
  const avgGoals = finished.length ? totalGoals / finished.length : 0;

  const leagueTiles = [
    { value: totalGoals, decimals: 0, label: 'TORE GESAMT' },
    { value: avgGoals, decimals: 1, label: 'Ø TORE / SPIEL' },
    { value: finished.length, decimals: 0, label: 'GESPIELTE PARTIEN' },
    { value: teams.length, decimals: 0, label: 'CLUBS' },
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

  // Spieler-Auszeichnungen – jetzt komplett aus den GETRACKTEN Daten (identisch
  // zum Testspiel), damit Liga und Event dieselbe, logische Rechnung nutzen:
  // Torschützenkönig & Vorlagen aus getrackten Toren/Vorlagen, bester Torwart
  // nach dem eigenen Torwart-Score (Goldener Handschuh).
  const cfg = scoringConfig ?? DEFAULT_SCORING;

  // Ein getracktes Ranking auf ein PlayerStat-Objekt abbilden (fürs Wappen/Foto),
  // die Zähler aber aus dem Tracking übernehmen. Fehlt der Spieler in der Liste,
  // wird ein minimales Ersatzobjekt gebaut (Name + Team, ohne Foto).
  const resolvePlayer = React.useCallback(
    (teamId: string, name: string): PlayerStat => {
      const found = players.find((p) => p.teamId === teamId && p.name === name);
      if (found) return found;
      const t = teams.find((x) => x.id === teamId);
      return {
        id: `${teamId}:${name}`,
        name,
        teamId,
        teamName: t?.name ?? teamId,
        teamLogoColor: t?.logoColor ?? '#22dfc9',
        goals: 0,
        assists: 0,
        matchesPlayed: 0,
        wins: 0,
        draws: 0,
        losses: 0,
        motmCount: 0,
        cleanSheets: 0,
        gamesInGoal: 0,
        goalsConceded: 0,
        points: 0,
      };
    },
    [players, teams]
  );

  // Torschützen (getrackt) → PlayerStat-Zeilen mit den getrackten Zählern.
  const scorerRows = React.useMemo(
    () =>
      trackScorers(trackingRows, cfg).map((e) => ({
        ...resolvePlayer(e.teamId, e.playerName),
        goals: e.goals,
        assists: e.assists,
        matchesPlayed: e.games,
      })),
    [trackingRows, cfg, resolvePlayer]
  );
  const assistRows = React.useMemo(
    () =>
      trackAssists(trackingRows, cfg).map((e) => ({
        ...resolvePlayer(e.teamId, e.playerName),
        goals: e.goals,
        assists: e.assists,
        matchesPlayed: e.games,
      })),
    [trackingRows, cfg, resolvePlayer]
  );

  // Bester Torwart – eigener Torwart-Score aus den getrackten Torwart-Aktionen
  // (weniger kassieren als der Schnitt, Paraden, Spiele zu null, gehaltene
  // Elfmeter, Stellungsspiel). Top 5 absteigend nach Score.
  const gloveRows = React.useMemo<GloveRow[]>(
    () =>
      goldenGloveRanking(trackingRows, cfg).map((e) => ({
        ...resolvePlayer(e.teamId, e.playerName),
        gamesInGoal: e.games,
        cleanSheets: e.cleanSheets,
        goalsConceded: e.goalsConceded,
        score: e.goldenGloveScore,
        saves: e.saves,
        penaltySaves: e.penaltySaves,
      })),
    [trackingRows, cfg, resolvePlayer]
  );

  const topScorer = scorerRows[0] ?? null;
  const topAssist = assistRows[0] ?? null;
  const bestRatio =
    [...scorerRows]
      .filter((p) => p.goals > 0 && p.matchesPlayed > 0)
      .sort((a, b) => b.goals / b.matchesPlayed - a.goals / a.matchesPlayed)[0] ?? null;

  const scorerRanking = scorerRows.slice(0, 5);
  const gloveRanking = gloveRows.slice(0, 5);

  // Container-Refs für die weiche Umsortier-Animation (motion layout) bei Live-Updates.
  const scorer = useSettledList(scorerRanking, (p) => p.name);
  const glove = useSettledList(gloveRanking, (p) => p.name);

  // Klick auf den Spielernamen öffnet direkt das Spieler-Detail auf der Vereinsseite.
  const teamOf = (p: PlayerStat) => teams.find((t) => t.id === p.teamId);
  const goPlayer = (p: PlayerStat) => {
    const t = teamOf(p);
    if (t && onSelectTeam) onSelectTeam(t.id, p.name);
  };

  interface LeaderCard {
    kind: 'SPIELER' | 'TEAM';
    category: string;
    accent: Accent;
    value: number;
    decimals?: number;
    unit: string;
    name: string;
    sub: string;
    avatar: React.ReactNode;
    onClick?: () => void; // Namensklick: Spieler → Spielerdetail, Team → Teamseite
  }

  const cards: LeaderCard[] = [];

  if (topScorer) {
    cards.push({
      kind: 'SPIELER',
      category: 'MEISTE TORE',
      onClick: onSelectTeam ? () => onSelectTeam(topScorer.teamId, topScorer.name) : undefined,
      accent: 'gold',
      value: topScorer.goals,
      unit: 'Tore',
      name: topScorer.name,
      sub: topScorer.teamName,
      avatar: <PlayerCrest player={topScorer} teams={teams} photoSize="lg" crestSize="xl" onSelectTeam={onSelectTeam} />,
    });
  }
  if (topAssist) {
    cards.push({
      kind: 'SPIELER',
      category: 'MEISTE ASSISTS',
      onClick: onSelectTeam ? () => onSelectTeam(topAssist.teamId, topAssist.name) : undefined,
      accent: 'teal',
      value: topAssist.assists,
      unit: 'Vorlagen',
      name: topAssist.name,
      sub: topAssist.teamName,
      avatar: <PlayerCrest player={topAssist} teams={teams} photoSize="lg" crestSize="xl" onSelectTeam={onSelectTeam} />,
    });
  }
  if (bestRatio) {
    cards.push({
      kind: 'SPIELER',
      category: 'BESTE QUOTE',
      onClick: onSelectTeam ? () => onSelectTeam(bestRatio.teamId, bestRatio.name) : undefined,
      accent: 'magenta',
      value: bestRatio.goals / bestRatio.matchesPlayed,
      decimals: 1,
      unit: 'Tore/Spiel',
      name: bestRatio.name,
      sub: bestRatio.teamName,
      avatar: <PlayerCrest player={bestRatio} teams={teams} photoSize="lg" crestSize="xl" onSelectTeam={onSelectTeam} />,
    });
  }
  if (clubStats.bestAttack && clubStats.bestAttack.goalsFor > 0) {
    const t = clubStats.bestAttack.team;
    cards.push({
      kind: 'TEAM',
      category: 'BESTE OFFENSIVE',
      onClick: onSelectTeam ? () => onSelectTeam(t.id) : undefined,
      accent: 'teal',
      value: clubStats.bestAttack.goalsFor,
      unit: 'Tore',
      name: t.name,
      sub: `${clubStats.bestAttack.goalsFor} erzielte Tore`,
      avatar: (
        <TeamCrest
          name={t.name}
          shortName={t.shortName}
          color={t.logoColor}
          logoUrl={t.logoUrl}
          size="lg"
          onSelect={onSelectTeam ? () => onSelectTeam(t.id) : undefined}
        />
      ),
    });
  }
  if (clubStats.bestDefense) {
    const t = clubStats.bestDefense.team;
    cards.push({
      kind: 'TEAM',
      category: 'BESTE DEFENSIVE',
      onClick: onSelectTeam ? () => onSelectTeam(t.id) : undefined,
      accent: 'teal',
      value: clubStats.bestDefense.goalsAgainst,
      unit: clubStats.bestDefense.goalsAgainst === 1 ? 'Gegentor' : 'Gegentore',
      name: t.name,
      sub: `Nur ${clubStats.bestDefense.goalsAgainst} Gegentore`,
      avatar: (
        <TeamCrest
          name={t.name}
          shortName={t.shortName}
          color={t.logoColor}
          logoUrl={t.logoUrl}
          size="lg"
          onSelect={onSelectTeam ? () => onSelectTeam(t.id) : undefined}
        />
      ),
    });
  }
  if (clubStats.mostCleanSheets && clubStats.mostCleanSheets.cleanSheets > 0) {
    const t = clubStats.mostCleanSheets.team;
    cards.push({
      kind: 'TEAM',
      category: 'MEISTE WEISSE WESTEN',
      onClick: onSelectTeam ? () => onSelectTeam(t.id) : undefined,
      accent: 'gold',
      value: clubStats.mostCleanSheets.cleanSheets,
      unit: clubStats.mostCleanSheets.cleanSheets === 1 ? 'Spiel' : 'Spiele',
      name: t.name,
      sub: `Zu null in ${clubStats.mostCleanSheets.cleanSheets} ${clubStats.mostCleanSheets.cleanSheets === 1 ? 'Spiel' : 'Spielen'}`,
      avatar: (
        <TeamCrest
          name={t.name}
          shortName={t.shortName}
          color={t.logoColor}
          logoUrl={t.logoUrl}
          size="lg"
          onSelect={onSelectTeam ? () => onSelectTeam(t.id) : undefined}
        />
      ),
    });
  }

  return (
    <div className="max-w-[1320px] xl:max-w-[1600px] 2xl:max-w-[1780px] mx-auto px-4 sm:px-10 pb-10">
      {/* Liga-Kennzahlen */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 pt-2 hl-cascade">
        {leagueTiles.map((tile) => (
          <div
            key={tile.label}
            className="relative rounded-2xl overflow-hidden bg-[linear-gradient(180deg,rgba(255,255,255,.045),rgba(255,255,255,.012))] border border-white/10 p-5 backdrop-blur-md"
          >
            <div className="font-display font-black text-[42px] lg:text-[54px] leading-[.9] text-brand-accent-light">
              <CountUp value={tile.value} decimals={tile.decimals} />
            </div>
            <div className="font-sans font-bold text-[11px] tracking-[1.5px] text-hl-dim mt-1.5">{tile.label}</div>
          </div>
        ))}
      </div>

      {/* Head-to-Head: zwei Spieler vergleichen */}
      {players.length >= 2 && (
        <div className="mt-4 flex justify-center sm:justify-end">
          <button
            onClick={() => setCompareOpen(true)}
            className="group inline-flex items-center gap-2 rounded-full bg-brand-accent-light/12 border border-brand-accent-light/35 px-5 py-2.5 text-sm font-sans font-bold uppercase tracking-wider text-brand-accent-light cursor-pointer transition-all duration-200 hover:bg-brand-accent-light/20 active:scale-95"
          >
            <Swords className="w-4 h-4 transition-transform duration-200 group-hover:-rotate-12" />
            Spieler vergleichen
          </button>
        </div>
      )}

      <CompareOverlay
        open={compareOpen}
        onClose={() => setCompareOpen(false)}
        players={players}
        teams={teams}
        trackingRows={trackingRows}
        scoringConfig={scoringConfig}
      />

      {/* Leader-Cards */}
      {cards.length === 0 ? (
        <div className="hl-card text-center py-12 text-hl-mute font-sans text-sm mt-5">
          Noch keine Statistiken verfügbar. Sobald Spiele beendet sind, erscheinen hier die Bestwerte.
        </div>
      ) : (
        <Reveal className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mt-5">
          {cards.map((c) => (
            <div
              key={c.category}
              className="relative rounded-[20px] overflow-hidden bg-[linear-gradient(180deg,rgba(255,255,255,.05),rgba(255,255,255,.012))] border border-white/10 p-6 backdrop-blur-lg shadow-[0_20px_50px_rgba(0,0,0,.35)]"
            >
              <div className="absolute top-0 right-0 w-[180px] h-[180px] pointer-events-none" style={{ background: GLOW[c.accent] }} />
              <div className="relative">
                {/* Große, klare Überschrift der Auszeichnung (kein „SPIELER"-Label mehr). */}
                <div className={`font-display font-black text-xl sm:text-2xl uppercase tracking-tight leading-none ${VALUE_COLOR[c.accent]}`}>
                  {c.category}
                </div>
                <div className="flex items-center gap-3.5 mt-4">
                  {c.avatar}
                  <div className="min-w-0">
                    {c.onClick ? (
                      <button
                        type="button"
                        onClick={c.onClick}
                        className="block max-w-full text-left font-display font-black text-[26px] leading-[.95] uppercase text-white truncate cursor-pointer hover:opacity-80 transition-opacity"
                        title={`${c.name} – ${c.kind === 'SPIELER' ? 'Spieler anzeigen' : 'Verein anzeigen'}`}
                      >
                        {c.name}
                      </button>
                    ) : (
                      <div className="font-display font-black text-[26px] leading-[.95] uppercase text-white truncate">{c.name}</div>
                    )}
                    <div className="font-sans text-[12.5px] text-hl-mute mt-1 truncate">{c.sub}</div>
                  </div>
                </div>
                <div className="flex items-baseline gap-2 mt-5">
                  <span className={`font-display font-black text-[52px] lg:text-[66px] leading-[.9] ${VALUE_COLOR[c.accent]}`}>
                    <CountUp value={c.value} decimals={c.decimals ?? 0} />
                  </span>
                  <span className="font-sans font-bold text-[13px] tracking-wider text-hl-dim">{c.unit}</span>
                </div>
              </div>
            </div>
          ))}
        </Reveal>
      )}

      {/* Auszeichnungen: Torschützenkönig + Goldener Handschuh nebeneinander */}
      {(scorerRanking.length > 0 || gloveRanking.length > 0) && (
        <Reveal className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-8">
          {/* Torschützenkönig – Top 5 nach erzielten Toren */}
          {scorerRanking.length > 0 && (
            <div>
              <div className="flex items-center gap-2.5 mb-4">
                <span className="text-2xl">⚽</span>
                <h3 className="font-display font-black text-xl sm:text-2xl uppercase tracking-tight text-white">
                  Torschützenkönig
                </h3>
                <span className="font-sans font-bold text-[11px] tracking-[1.5px] text-hl-dim mt-1">TOP 5 · SPIELER</span>
              </div>
              <div className="relative rounded-[20px] overflow-hidden bg-[linear-gradient(180deg,rgba(255,255,255,.05),rgba(255,255,255,.012))] border border-white/10 backdrop-blur-lg shadow-[0_20px_50px_rgba(0,0,0,.35)]">
                <div className="absolute top-0 right-0 w-[220px] h-[220px] pointer-events-none" style={{ background: GLOW.gold }} />
                <div ref={scorer.ref} className="relative divide-y divide-white/[.06] hl-cascade-soft">
                  {scorer.items.map((p, idx) => {
                    const rankColor =
                      idx === 0 ? 'text-hl-gold' : idx === 1 ? 'text-[#C7D0DA]' : idx === 2 ? 'text-[#E0A46B]' : 'text-hl-dim';
                    const sub = [
                      `${p.assists} Assists`,
                      p.matchesPlayed > 0 ? `${p.matchesPlayed} Spiele` : null,
                    ]
                      .filter(Boolean)
                      .join(' · ');
                    return (
                      <motion.div
                        layout="position"
                        transition={{ type: 'spring', stiffness: 240, damping: 32 }}
                        key={p.id}
                        className="flex items-center gap-3.5 px-4 sm:px-6 py-3.5"
                      >
                        <div className={`font-display font-black text-2xl sm:text-3xl lg:text-[40px] w-7 sm:w-8 text-center shrink-0 ${rankColor}`}>
                          {idx + 1}
                        </div>
                        <div className="shrink-0">
                          <PlayerCrest player={p} teams={teams} photoSize="md" crestSize="lg" onSelectTeam={onSelectTeam} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <button
                            onClick={() => goPlayer(p)}
                            title={teamOf(p) ? `${p.teamName} – Vereinsseite öffnen` : undefined}
                            className={`block max-w-full text-left font-sans font-bold text-sm sm:text-[15px] text-white truncate ${teamOf(p) && onSelectTeam ? 'cursor-pointer hover:text-hl-gold transition-colors' : 'cursor-default'}`}
                          >
                            {p.name}
                          </button>
                          <div className="font-sans text-[11.5px] text-hl-dim truncate mt-0.5">{sub}</div>
                        </div>
                        <div className="flex items-baseline gap-1 shrink-0 pl-2">
                          <span className="font-display font-black text-2xl sm:text-3xl lg:text-[40px] leading-none text-hl-gold tabular-nums">
                            <CountUp value={p.goals} />
                          </span>
                          <span className="font-sans font-bold text-[10px] tracking-wider text-hl-dim">TORE</span>
                        </div>
                      </motion.div>
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
                <div ref={glove.ref} className="relative divide-y divide-white/[.06] hl-cascade-soft">
                  {glove.items.map((p, idx) => {
                    const rankColor =
                      idx === 0 ? 'text-hl-gold' : idx === 1 ? 'text-[#C7D0DA]' : idx === 2 ? 'text-[#E0A46B]' : 'text-hl-dim';
                    const sub = [
                      `${p.gamesInGoal} im Tor`,
                      `${p.cleanSheets}× zu null`,
                      `${p.goalsConceded} Gegentore`,
                      p.saves > 0 ? `${p.saves} Paraden` : null,
                    ]
                      .filter(Boolean)
                      .join(' · ');
                    return (
                      <motion.div
                        layout="position"
                        transition={{ type: 'spring', stiffness: 240, damping: 32 }}
                        key={p.id}
                        className="flex items-center gap-3.5 px-4 sm:px-6 py-3.5"
                      >
                        <div className={`font-display font-black text-2xl sm:text-3xl lg:text-[40px] w-7 sm:w-8 text-center shrink-0 ${rankColor}`}>
                          {idx + 1}
                        </div>
                        <div className="shrink-0">
                          <PlayerCrest player={p} teams={teams} photoSize="md" crestSize="lg" onSelectTeam={onSelectTeam} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <button
                            onClick={() => goPlayer(p)}
                            title={teamOf(p) ? `${p.teamName} – Vereinsseite öffnen` : undefined}
                            className={`block max-w-full text-left font-sans font-bold text-sm sm:text-[15px] text-white truncate ${teamOf(p) && onSelectTeam ? 'cursor-pointer hover:text-hl-gold transition-colors' : 'cursor-default'}`}
                          >
                            {p.name}
                          </button>
                          <div className="font-sans text-[11.5px] text-hl-dim truncate mt-0.5">{sub}</div>
                        </div>
                        <div className="flex items-baseline gap-1 shrink-0 pl-2">
                          <span className="font-display font-black text-2xl sm:text-3xl lg:text-[40px] leading-none text-brand-accent-light tabular-nums">
                            <CountUp value={p.score} decimals={1} />
                          </span>
                          <span className="font-sans font-bold text-[10px] tracking-wider text-hl-dim">PKT</span>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </Reveal>
      )}
    </div>
  );
}
