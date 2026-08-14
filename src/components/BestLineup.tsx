import React from 'react';
import { motion } from 'motion/react';
import { Team } from '../types';
import { shade } from './ui';

// Beste Aufstellung als team-farbiges Mini-Fußballfeld – NICHT die historische
// Anwesenheits-Kombination, sondern die individuell besten Spieler nach Siegquote:
// fester Torwart unten, die 4 besten Feldspieler auf dem Platz (2-2, beste oben),
// der 5. und 6. beste als Auswechselbank rechts daneben.

export interface XIEntry {
  name: string;
  firstName: string;
  imageUrl?: string;
  winRate: number | null; // Siegquote in % (null = noch kein Einsatz)
  matchesPlayed: number;
}

interface BestLineupProps {
  goalkeeper: XIEntry | null;
  field: XIEntry[]; // bis zu 4, bereits nach Siegquote sortiert (best zuerst)
  bench: XIEntry[]; // bis zu 2 (5./6. bester)
  team: Team;
  onSelectPlayer?: (name: string) => void;
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');
}

// Spieler-Chip. Auf Modulebene + memoisiert, damit die Einblend-Animation nur EINMAL
// beim Laden läuft (nicht bei jedem Re-Render). Props bewusst primitiv.
const Chip = React.memo(function Chip({
  name,
  firstName,
  imageUrl,
  winRate,
  color,
  accent,
  index,
  size = 'field',
  badge,
  onSelect,
}: {
  name: string;
  firstName: string;
  imageUrl?: string;
  winRate: number | null;
  color: string;
  accent: string;
  index: number;
  size?: 'field' | 'bench';
  badge?: string; // z. B. "TW" oder Rang
  onSelect?: (name: string) => void;
}) {
  const av = size === 'bench' ? 'w-9 h-9' : 'w-11 h-11';
  return (
    <motion.button
      type="button"
      onClick={onSelect ? () => onSelect(name) : undefined}
      initial={{ opacity: 0, scale: 0.6, y: 8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ delay: 0.05 * index, type: 'spring', stiffness: 260, damping: 20 }}
      whileHover={onSelect ? { scale: 1.09, y: -2 } : undefined}
      whileTap={onSelect ? { scale: 0.96 } : undefined}
      className={`relative flex flex-col items-center gap-0.5 ${size === 'bench' ? 'w-[54px]' : 'w-[64px]'} focus:outline-none ${onSelect ? 'cursor-pointer' : 'cursor-default'}`}
      title={onSelect ? `${name} – Details anzeigen` : name}
    >
      <div className="relative">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={name}
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            className={`${av} rounded-full object-cover border-2 shadow-[0_4px_12px_rgba(0,0,0,.45)]`}
            style={{ borderColor: color }}
          />
        ) : (
          <span
            className={`grid place-items-center ${av} rounded-full font-display font-black text-white text-sm border-2 shadow-[0_4px_12px_rgba(0,0,0,.45)]`}
            style={{ borderColor: color, background: `linear-gradient(140deg, ${color}, ${shade(color, 0.45)})` }}
          >
            {initials(name) || '?'}
          </span>
        )}
        {badge && (
          <span
            className="absolute -top-1 -left-1 grid place-items-center min-w-[15px] h-[15px] px-[3px] rounded-full font-display font-black text-[8px] text-[#0b0f10]"
            style={{ background: accent }}
          >
            {badge}
          </span>
        )}
      </div>
      <span className="font-sans font-semibold text-[10px] leading-tight text-white text-center truncate max-w-full drop-shadow-[0_1px_2px_rgba(0,0,0,.9)]">
        {firstName}
      </span>
      <span
        className={`font-display font-black leading-none drop-shadow-[0_1px_2px_rgba(0,0,0,.95)] ${
          size === 'bench' ? 'text-[12px]' : 'text-[14px]'
        }`}
        style={{ color: accent }}
      >
        {winRate === null ? '–' : `${winRate}%`}
      </span>
    </motion.button>
  );
});

export default function BestLineup({ goalkeeper, field, bench, team, onSelectPlayer }: BestLineupProps) {
  const color = team.logoColor || '#22DFC9';
  const accent = shade(color, 1.15);

  // Feld in 2 Reihen (oben = beste): [0,1] oben, [2,3] unten.
  const topRow = field.slice(0, 2);
  const bottomRow = field.slice(2, 4);
  let idx = 0;

  return (
    <div className="hl-card rounded-[20px] p-[22px]">
      <div className="font-sans font-extrabold text-[11px] tracking-[2px] mb-1.5" style={{ color: accent }}>
        BESTE AUFSTELLUNG
      </div>
      <p className="font-sans text-[11px] text-hl-dim mb-4">
        Beste Spieler nach Siegquote · fester Torwart – automatisch aus den Ergebnissen.
      </p>

      <div className="flex gap-2 items-stretch">
        {/* Fußballfeld */}
        <div
          className="relative flex-1 min-w-0 rounded-2xl overflow-hidden border border-white/10 px-2 py-4"
          style={{ background: `linear-gradient(180deg, ${shade(color, 0.5)}, ${shade(color, 0.22)})` }}
        >
          {/* Feldmarkierungen */}
          <div className="pointer-events-none absolute inset-0 opacity-40">
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-16 h-16 rounded-full border-2 border-white/50" />
            <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-px bg-white/50" />
            <div className="absolute left-1/2 -translate-x-1/2 bottom-0 w-24 h-9 border-2 border-b-0 border-white/50 rounded-t-md" />
            <div className="absolute left-1/2 -translate-x-1/2 top-0 w-24 h-9 border-2 border-t-0 border-white/50 rounded-b-md" />
          </div>

          <div className="relative flex flex-col gap-5">
            {topRow.length > 0 && (
              <div className="flex justify-around gap-2">
                {topRow.map((p) => (
                  <Chip key={p.name} name={p.name} firstName={p.firstName} imageUrl={p.imageUrl} winRate={p.winRate} color={color} accent={accent} index={idx++} onSelect={onSelectPlayer} />
                ))}
              </div>
            )}
            {bottomRow.length > 0 && (
              <div className="flex justify-around gap-2">
                {bottomRow.map((p) => (
                  <Chip key={p.name} name={p.name} firstName={p.firstName} imageUrl={p.imageUrl} winRate={p.winRate} color={color} accent={accent} index={idx++} onSelect={onSelectPlayer} />
                ))}
              </div>
            )}
            {goalkeeper && (
              <div className="flex justify-center pt-1">
                <Chip
                  name={goalkeeper.name}
                  firstName={goalkeeper.firstName}
                  imageUrl={goalkeeper.imageUrl}
                  winRate={goalkeeper.winRate}
                  color={color}
                  accent={accent}
                  index={idx++}
                  badge="TW"
                  onSelect={onSelectPlayer}
                />
              </div>
            )}
          </div>
        </div>

        {/* Auswechselbank (5./6. bester) – seitlich am Feld */}
        {bench.length > 0 && (
          <div className="w-[70px] shrink-0 rounded-2xl border border-white/10 bg-white/[.03] flex flex-col items-center gap-3 py-3 px-1">
            <span className="font-sans font-bold text-[8px] tracking-[1.5px] text-hl-dim uppercase">Bank</span>
            {bench.map((p, i) => (
              <Chip
                key={p.name}
                name={p.name}
                firstName={p.firstName}
                imageUrl={p.imageUrl}
                winRate={p.winRate}
                color={color}
                accent={accent}
                index={idx++}
                size="bench"
                badge={`${i + 5}`}
                onSelect={onSelectPlayer}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
