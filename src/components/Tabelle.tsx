import React from 'react';
import { Team, Match, Standing } from '../types';
import { calculateStandings } from '../lib/standings';
import { TeamCrest, FormPill } from './ui';

interface TabelleProps {
  teams: Team[];
  matches: Match[];
  seasonLabel?: string;
  onSelectTeam?: (teamId: string) => void;
  compact?: boolean; // kompakte Variante für die Home-Karte (ohne Zonen-Balken/Legende)
}

// Ligatabelle im Glas-Karten-Design mit Zonen-Markierung und Form-Pillen.
export default function Tabelle({ teams, matches, seasonLabel, onSelectTeam, compact = false }: TabelleProps) {
  const standings: Standing[] = React.useMemo(() => calculateStandings(teams, matches), [teams, matches]);

  // Zonen: Meisterschaftsrunde = Top 3, Abstiegszone = letzte 2 (nur bei genug Teams)
  const championsEnd = 3;
  const relegationStart = standings.length >= 6 ? standings.length - 1 : Number.POSITIVE_INFINITY;

  const rankColors: Record<number, string> = { 1: '#E9C46A', 2: '#C9D1CC', 3: '#C98A5A' };

  const gridCols =
    'grid-cols-[30px_minmax(0,1fr)_32px_46px_46px] md:grid-cols-[34px_minmax(0,1fr)_36px_32px_32px_32px_56px_46px_46px] xl:grid-cols-[34px_minmax(0,1fr)_36px_32px_32px_32px_56px_46px_46px_92px]';

  if (standings.length === 0) {
    return (
      <div className="hl-card p-8 text-center text-hl-mute font-sans text-sm">
        Noch keine Vereine angelegt.
      </div>
    );
  }

  return (
    <div className={`hl-card ${compact ? 'p-5 sm:p-6' : 'px-4 sm:px-[22px] py-3 sm:pt-3 sm:pb-[18px]'}`}>
      {/* Kopfzeile */}
      <div
        className={`grid ${gridCols} gap-2 px-2.5 pt-3 pb-3 border-b border-white/[.08] font-sans font-bold text-[10.5px] tracking-wider text-hl-faint`}
      >
        <span>#</span>
        <span>CLUB</span>
        <span className="text-center">SP</span>
        <span className="text-center hidden md:block">S</span>
        <span className="text-center hidden md:block">U</span>
        <span className="text-center hidden md:block">N</span>
        <span className="text-center hidden md:block">TORE</span>
        <span className="text-center">TD</span>
        <span className="text-center">PKT</span>
        <span className="text-right hidden xl:block">FORM</span>
      </div>

      {standings.map((standing, index) => {
        const rank = index + 1;
        const isChamp = rank <= championsEnd;
        const isReleg = rank > relegationStart;
        const zoneColor = isChamp ? '#22DFC9' : isReleg ? '#FF5442' : 'transparent';

        return (
          <button
            key={standing.teamId}
            onClick={onSelectTeam ? () => onSelectTeam(standing.teamId) : undefined}
            title={onSelectTeam ? `${standing.teamName} – Vereinsseite öffnen` : undefined}
            className={`grid ${gridCols} gap-2 items-center w-full text-left px-2.5 py-[9px] rounded-[11px] border-b border-white/[.04] transition-colors ${
              onSelectTeam ? 'cursor-pointer hover:bg-white/5' : ''
            } ${rank === 1 ? 'bg-[rgba(34,223,201,.06)]' : ''}`}
          >
            {/* Rang + Zonen-Balken */}
            <span className="flex items-center gap-1.5">
              {!compact && <span className="w-[3px] h-[26px] rounded-sm shrink-0" style={{ background: zoneColor }} />}
              {rankColors[rank] ? (
                <span
                  className="grid place-items-center w-6 h-6 rounded-[7px] font-display font-black text-sm text-[#0b0f0b]"
                  style={{ background: rankColors[rank] }}
                >
                  {rank}
                </span>
              ) : (
                <span
                  className={`grid place-items-center w-6 h-6 font-sans font-bold text-sm ${
                    isReleg ? 'text-hl-red-soft' : 'text-hl-dim'
                  }`}
                >
                  {rank}
                </span>
              )}
            </span>

            {/* Verein */}
            <span className="flex items-center gap-2.5 min-w-0">
              <TeamCrest
                name={standing.teamName}
                shortName={standing.shortName}
                color={standing.logoColor}
                logoUrl={standing.logoUrl}
                size="md"
              />
              <span className="font-sans font-semibold text-sm text-hl-text truncate">
                <span className="hidden sm:inline">{standing.teamName}</span>
                <span className="sm:hidden">{standing.shortName}</span>
              </span>
            </span>

            <span className="text-center font-sans text-[13px] text-hl-mute">{standing.played}</span>
            <span className="text-center font-sans text-[13px] text-hl-mute hidden md:block">{standing.won}</span>
            <span className="text-center font-sans text-[13px] text-hl-mute hidden md:block">{standing.drawn}</span>
            <span className="text-center font-sans text-[13px] text-hl-mute hidden md:block">{standing.lost}</span>
            <span className="text-center font-sans text-[13px] text-hl-soft hidden md:block">
              {standing.goalsFor}:{standing.goalsAgainst}
            </span>
            <span
              className={`text-center font-sans font-bold text-[13px] ${
                standing.goalDifference > 0
                  ? 'text-hl-green-soft'
                  : standing.goalDifference < 0
                  ? 'text-hl-red-soft'
                  : 'text-hl-dim'
              }`}
            >
              {standing.goalDifference > 0 ? `+${standing.goalDifference}` : standing.goalDifference}
            </span>
            <span className="text-center font-display font-black text-lg text-white">{standing.points}</span>
            <span className="hidden xl:flex gap-1 justify-end">
              {standing.form.map((res, i) => (
                <FormPill key={i} result={res} />
              ))}
            </span>
          </button>
        );
      })}

      {/* Fußzeile */}
      {compact ? (
        <div className="pt-4 px-2.5 font-sans font-semibold text-[10.5px] tracking-wider text-hl-faint">
          SORTIERUNG: 1. PUNKTE · 2. TORDIFFERENZ · 3. ERZIELTE TORE
        </div>
      ) : (
        <div className="flex flex-wrap gap-4 sm:gap-5 items-center pt-[18px] px-2.5 pb-1 font-sans font-semibold text-[11px] tracking-[.5px] text-hl-dim">
          <span className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-[3px] bg-brand-accent-light" />
            Meisterschaftsrunde (1–{Math.min(championsEnd, standings.length)})
          </span>
          {Number.isFinite(relegationStart) && (
            <span className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-[3px] bg-hl-red" />
              Abstiegszone ({relegationStart + 1}–{standings.length})
            </span>
          )}
          <span className="sm:ml-auto">
            SORTIERUNG: 1. PUNKTE · 2. TORDIFFERENZ · 3. ERZIELTE TORE
            {seasonLabel ? ` · SAISON ${seasonLabel}` : ''}
          </span>
        </div>
      )}
    </div>
  );
}
