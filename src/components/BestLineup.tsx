import React from 'react';
import { motion } from 'motion/react';
import { Team } from '../types';
import { shade, readable } from './ui';

// Beste Aufstellung als team-farbiges Mini-Fußballfeld: Torwart unten, 2 vorne,
// 2 hinten, 2 auf der Bank. Mit Tracking-Daten aus src/lib/bestLineup.ts
// (Sturm = Offensiv-Wert, Abwehr = Defensiv-Wert, Bank = Ø-Note); ohne Tracking
// die individuell besten Spieler nach Siegquote.

export interface XIEntry {
  name: string;
  firstName: string;
  imageUrl?: string;
  winRate: number | null; // Siegquote in % (null = noch kein Einsatz)
  matchesPlayed: number;
  value?: string; // statt Siegquote anzeigen (z. B. Ø-Note aus dem Tracking)
}

interface BestLineupProps {
  goalkeeper: XIEntry | null;
  field: XIEntry[]; // bis zu 4, bereits nach Siegquote sortiert (best zuerst)
  bench: XIEntry[]; // bis zu 4 (Plätze 6–9)
  team: Team;
  onSelectPlayer?: (name: string) => void;
  tracked?: boolean; // true = aus dem Tracking berechnet (anderer Erklärtext)
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
  value,
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
  value?: string;
  color: string;
  accent: string;
  index: number;
  size?: 'field' | 'bench';
  badge?: string; // z. B. "TW" oder Rang
  onSelect?: (name: string) => void;
}) {
  const av = size === 'bench' ? 'w-9 h-9 lg:w-11 lg:h-11' : 'w-11 h-11 lg:w-14 lg:h-14';
  return (
    <motion.button
      type="button"
      onClick={onSelect ? () => onSelect(name) : undefined}
      initial={{ opacity: 0, scale: 0.6, y: 8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ delay: 0.05 * index, type: 'spring', stiffness: 260, damping: 20 }}
      whileHover={onSelect ? { scale: 1.09, y: -2 } : undefined}
      whileTap={onSelect ? { scale: 0.96 } : undefined}
      className={`relative flex flex-col items-center gap-0.5 ${size === 'bench' ? 'w-[54px] lg:w-[68px]' : 'w-[64px] lg:w-[84px]'} focus:outline-none ${onSelect ? 'cursor-pointer' : 'cursor-default'}`}
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
            className="absolute -top-1 -left-1 grid place-items-center min-w-[15px] h-[15px] lg:min-w-[18px] lg:h-[18px] px-[3px] rounded-full font-display font-black text-[8px] lg:text-[10px] text-[#0b0f10]"
            style={{ background: accent }}
          >
            {badge}
          </span>
        )}
      </div>
      <span className="font-sans font-semibold text-[10px] lg:text-[12px] leading-tight text-white text-center truncate max-w-full drop-shadow-[0_1px_2px_rgba(0,0,0,.9)]">
        {firstName}
      </span>
      <span
        className={`font-display font-black leading-none drop-shadow-[0_1px_2px_rgba(0,0,0,.95)] ${
          size === 'bench' ? 'text-[12px] lg:text-[15px]' : 'text-[14px] lg:text-[18px]'
        }`}
        style={{ color: accent }}
      >
        {value ?? (winRate === null ? '–' : `${winRate}%`)}
      </span>
    </motion.button>
  );
});

// Kleine Beschriftung über einer Feld-Reihe.
function RowLabel({ text }: { text: string }) {
  return (
    <div className="text-center mb-1.5">
      <span className="inline-block px-2 py-0.5 rounded-full bg-black/30 text-[9px] lg:text-[10px] font-sans font-bold uppercase tracking-[1px] text-white/85">
        {text}
      </span>
    </div>
  );
}

export default function BestLineup({ goalkeeper, field, bench, team, onSelectPlayer, tracked = false }: BestLineupProps) {
  const color = team.logoColor || '#22DFC9';
  const accent = readable(color);

  // Feld in 2 Reihen (oben = beste): [0,1] oben, [2,3] unten.
  const topRow = field.slice(0, 2);
  const bottomRow = field.slice(2, 4);
  let idx = 0;

  return (
    <div className="hl-card rounded-[20px] p-[22px]">
      <div className="font-sans font-extrabold text-[11px] lg:text-[13px] tracking-[2px] mb-1.5" style={{ color: accent }}>
        BESTE AUFSTELLUNG
      </div>
      <p className="font-sans text-[11px] lg:text-[12px] text-hl-dim mb-4">
        {tracked
          ? 'Erst vorne die 2 Besten nach ⅔ Schuss + ⅓ Dribbling, dann hinten aus dem Rest nach ⅔ Zweikampf + ⅓ Pass (jeweils Menge × Quote pro Spiel, im Teamvergleich) · Bank nach Ø-Note · Zahl = Ø-Note.'
          : 'Beste Spieler nach Siegquote · fester Torwart – automatisch aus den Ergebnissen.'}
      </p>

      <div className="flex flex-col gap-2">
        {/* Fußballfeld */}
        <div
          className="relative flex-1 min-w-0 rounded-2xl overflow-hidden border border-white/10 px-2 py-4 lg:px-3 lg:py-6"
          style={{ background: `linear-gradient(180deg, ${shade(color, 0.5)}, ${shade(color, 0.22)})` }}
        >
          {/* Feldmarkierungen */}
          <div className="pointer-events-none absolute inset-0 opacity-40">
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-16 h-16 rounded-full border-2 border-white/50" />
            <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-px bg-white/50" />
            <div className="absolute left-1/2 -translate-x-1/2 bottom-0 w-24 h-9 border-2 border-b-0 border-white/50 rounded-t-md" />
            <div className="absolute left-1/2 -translate-x-1/2 top-0 w-24 h-9 border-2 border-t-0 border-white/50 rounded-b-md" />
          </div>

          <div className="relative flex flex-col gap-5 lg:gap-7">
            {topRow.length > 0 && (
              <div>
              {tracked && <RowLabel text="Beste Offensivspieler des Teams" />}
              <div className="flex justify-around gap-2">
                {topRow.map((p) => (
                  <Chip key={p.name} name={p.name} firstName={p.firstName} imageUrl={p.imageUrl} winRate={p.winRate} value={p.value} color={color} accent={accent} index={idx++} onSelect={onSelectPlayer} />
                ))}
              </div>
              </div>
            )}
            {bottomRow.length > 0 && (
              <div>
              {tracked && <RowLabel text="Beste Defensivspieler des Teams" />}
              <div className="flex justify-around gap-2">
                {bottomRow.map((p) => (
                  <Chip key={p.name} name={p.name} firstName={p.firstName} imageUrl={p.imageUrl} winRate={p.winRate} value={p.value} color={color} accent={accent} index={idx++} onSelect={onSelectPlayer} />
                ))}
              </div>
              </div>
            )}
            {goalkeeper && (
              <div className="flex justify-center pt-1">
                <Chip
                  name={goalkeeper.name}
                  firstName={goalkeeper.firstName}
                  imageUrl={goalkeeper.imageUrl}
                  winRate={goalkeeper.winRate}
                  value={goalkeeper.value}
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

        {/* Auswechselbank (bis zu 4) – unter dem Feld */}
        {bench.length > 0 && (
          <div className="rounded-2xl border border-white/10 bg-white/[.03] px-2 py-2.5 lg:py-3">
            <div className="font-sans font-bold text-[8px] lg:text-[10px] tracking-[1.5px] text-hl-dim uppercase text-center mb-1.5">Bank</div>
            <div className="flex justify-around gap-1">
            {bench.map((p, i) => (
              <Chip
                key={p.name}
                name={p.name}
                firstName={p.firstName}
                imageUrl={p.imageUrl}
                winRate={p.winRate}
                value={p.value}
                color={color}
                accent={accent}
                index={idx++}
                size="bench"
                badge={`${i + 6}`}
                onSelect={onSelectPlayer}
              />
            ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
