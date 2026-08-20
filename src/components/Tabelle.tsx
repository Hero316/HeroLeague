import React from 'react';
import { motion } from 'motion/react';
import { Team, Match, Standing } from '../types';
import { calculateStandings } from '../lib/standings';
import { TeamCrest, FormPill } from './ui';
import { useSettledList } from './anim';

interface TabelleProps {
  teams: Team[];
  matches: Match[];
  seasonLabel?: string;
  onSelectTeam?: (teamId: string) => void;
  compact?: boolean; // kompakte Variante für die Home-Karte (ohne Zonen-Balken/Legende)
}

// Ligatabelle im Glas-Karten-Design mit Zonen-Markierung und Form-Pillen.
// Mobil: weniger Spalten, volle Vereinsnamen dürfen zweizeilig umbrechen (kein Abschneiden).
export default function Tabelle({ teams, matches, seasonLabel, onSelectTeam, compact = false }: TabelleProps) {
  const standings: Standing[] = React.useMemo(() => calculateStandings(teams, matches), [teams, matches]);

  // Einsortier-Animation: startet alphabetisch und rutscht in die echte Tabelle.
  const { ref: listRef, items: displayStandings } = useSettledList(standings, (s) => s.teamName);

  // Zonen: Meisterschaftsrunde = Top 3, Abstiegszone = letzte 2 (nur bei genug Teams)
  const championsEnd = 3;
  const relegationStart = standings.length >= 6 ? standings.length - 2 : Number.POSITIVE_INFINITY;

  const rankColors: Record<number, string> = { 1: '#E9C46A', 2: '#C9D1CC', 3: '#C98A5A' };

  // Spaltenraster: kompakt = #, Club, SP, (TORE ab sm), TD, PKT
  // voll = mobil wie kompakt (+ Zonen-Balken), ab md zusätzlich S/U/N + TORE, ab xl Form
  const gridCols = compact
    ? 'grid-cols-[24px_minmax(0,1fr)_26px_36px_38px] sm:grid-cols-[28px_minmax(0,1fr)_34px_56px_42px_46px]'
    : 'grid-cols-[32px_minmax(0,1fr)_26px_36px_38px] sm:grid-cols-[36px_minmax(0,1fr)_34px_56px_42px_46px] lg:grid-cols-[38px_minmax(0,1fr)_34px_30px_30px_30px_56px_44px_46px] xl:grid-cols-[38px_minmax(0,1fr)_34px_30px_30px_30px_56px_44px_46px_92px]';

  // Sichtbarkeit der Zusatzspalten je Variante
  const goalsCls = compact ? 'hidden sm:block' : 'hidden sm:block lg:block';
  const sunCls = compact ? 'hidden' : 'hidden lg:block';
  const formCls = compact ? 'hidden' : 'hidden xl:flex';

  if (standings.length === 0) {
    return (
      <div className="hl-card p-8 text-center text-hl-mute font-sans text-sm">
        Noch keine Vereine angelegt.
      </div>
    );
  }

  return (
    <div ref={listRef} className={compact ? '' : 'hl-card px-2.5 sm:px-[22px] py-3 sm:pt-3 sm:pb-[18px] hl-cascade-soft'}>
      {/* Kopfzeile */}
      <div
        className={`grid ${gridCols} gap-1.5 sm:gap-2 px-1.5 sm:px-2.5 pt-3 pb-3 border-b border-white/[.08] font-sans font-bold text-[10px] sm:text-[10.5px] tracking-wider text-hl-faint`}
      >
        <span>#</span>
        <span>CLUB</span>
        <span className="text-center">SP</span>
        <span className={`text-center ${sunCls}`}>S</span>
        <span className={`text-center ${sunCls}`}>U</span>
        <span className={`text-center ${sunCls}`}>N</span>
        <span className={`text-center ${goalsCls}`}>TORE</span>
        <span className="text-center">TD</span>
        <span className="text-center">PKT</span>
        <span className={`text-right ${formCls === 'hidden' ? 'hidden' : 'hidden xl:block'}`}>FORM</span>
      </div>

      {displayStandings.map((standing, index) => {
        const rank = index + 1;
        const isReleg = rank > relegationStart;

        return (
          <motion.button
            layout="position"
            transition={{ type: 'spring', stiffness: 240, damping: 32 }}
            key={standing.teamId}
            onClick={onSelectTeam ? () => onSelectTeam(standing.teamId) : undefined}
            title={onSelectTeam ? `${standing.teamName} – Vereinsseite öffnen` : undefined}
            className={`grid ${gridCols} gap-1.5 sm:gap-2 items-center w-full text-left px-1.5 sm:px-2.5 py-[9px] rounded-[11px] border-b border-white/[.04] transition-colors ${
              onSelectTeam ? 'cursor-pointer hover:bg-white/5' : ''
            } ${
              rank === 1
                ? 'bg-[rgba(233,196,106,.10)]'
                : isReleg
                ? 'bg-[rgba(255,84,66,.07)]'
                : ''
            }`}
          >
            {/* Rang */}
            <span className="flex items-center gap-1 sm:gap-1.5">
              {rankColors[rank] ? (
                <span
                  className="grid place-items-center w-[22px] h-[22px] sm:w-6 sm:h-6 lg:w-7 lg:h-7 rounded-[7px] font-display font-black text-[13px] sm:text-sm lg:text-base text-[#0b0f0b] shrink-0"
                  style={{ background: rankColors[rank] }}
                >
                  {rank}
                </span>
              ) : (
                <span
                  className={`grid place-items-center w-[22px] h-[22px] sm:w-6 sm:h-6 lg:w-7 lg:h-7 font-sans font-bold text-[13px] sm:text-sm lg:text-base shrink-0 ${
                    isReleg ? 'text-hl-red-soft' : 'text-hl-dim'
                  }`}
                >
                  {rank}
                </span>
              )}
            </span>

            {/* Verein: voller Name, darf mobil zweizeilig umbrechen.
                Form kompakt darunter, wo keine eigene Form-Spalte sichtbar ist (mobil + Home-Karte). */}
            <span className="flex items-center gap-2 sm:gap-2.5 min-w-0">
              <TeamCrest
                name={standing.teamName}
                shortName={standing.shortName}
                color={standing.logoColor}
                logoUrl={standing.logoUrl}
                size="md"
              />
              <span className="flex flex-col gap-1 min-w-0">
                <span className="font-sans font-semibold text-[13px] sm:text-sm text-hl-text leading-tight break-words">
                  {standing.teamName}
                </span>
                {standing.form.length > 0 && (
                  <span className={`gap-1 ${compact ? 'flex' : 'flex xl:hidden'}`}>
                    {standing.form.map((res, i) => (
                      <FormPill key={i} result={res} size="sm" />
                    ))}
                  </span>
                )}
              </span>
            </span>

            <span className="text-center font-sans text-xs sm:text-[13px] lg:text-[15px] text-hl-mute">
              {standing.played}
            </span>
            <span className={`text-center font-sans text-[13px] lg:text-[15px] text-hl-mute ${sunCls}`}>{standing.won}</span>
            <span className={`text-center font-sans text-[13px] lg:text-[15px] text-hl-mute ${sunCls}`}>{standing.drawn}</span>
            <span className={`text-center font-sans text-[13px] lg:text-[15px] text-hl-mute ${sunCls}`}>{standing.lost}</span>
            <span className={`text-center font-sans text-[13px] lg:text-[15px] text-hl-soft ${goalsCls}`}>
              {standing.goalsFor}:{standing.goalsAgainst}
            </span>
            <span
              className={`text-center font-sans font-bold text-xs sm:text-[13px] lg:text-[15px] ${
                standing.goalDifference > 0
                  ? 'text-hl-green-soft'
                  : standing.goalDifference < 0
                  ? 'text-hl-red-soft'
                  : 'text-hl-dim'
              }`}
            >
              {standing.goalDifference > 0 ? '+' : ''}{standing.goalDifference}
            </span>
            <span className="text-center font-display font-black text-base sm:text-lg lg:text-xl text-white">
              {standing.points}
            </span>
            <span className={`gap-1 justify-end ${formCls}`}>
              {standing.form.map((res, i) => (
                <FormPill key={i} result={res} />
              ))}
            </span>
          </motion.button>
        );
      })}

      {/* Fußzeile */}
      {compact ? (
        <div className="pt-4 px-1.5 sm:px-2.5 font-sans font-semibold text-[10px] sm:text-[10.5px] tracking-wider text-hl-faint">
          SORTIERUNG: 1. PUNKTE · 2. TORDIFFERENZ · 3. DIREKTER VERGLEICH · 4. ERZIELTE TORE
        </div>
      ) : (
        <div className="flex flex-wrap gap-3 sm:gap-5 items-center pt-[18px] px-1.5 sm:px-2.5 pb-1 font-sans font-semibold text-[10.5px] sm:text-[11px] tracking-[.5px] text-hl-dim">
          <span className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-[3px] bg-[#E9C46A]" />
            Meisterschaftsrunde (1–{Math.min(championsEnd, standings.length)})
          </span>
          {Number.isFinite(relegationStart) && (
            <span className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-[3px] bg-hl-red" />
              Abstiegszone ({relegationStart + 1}–{standings.length})
            </span>
          )}
          <span className="sm:ml-auto">
            SORTIERUNG: 1. PUNKTE · 2. TORDIFFERENZ · 3. DIREKTER VERGLEICH · 4. ERZIELTE TORE
            {seasonLabel ? ` · ${seasonLabel}` : ''}
          </span>
        </div>
      )}
    </div>
  );
}
