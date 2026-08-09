import React from 'react';
import { motion } from 'motion/react';
import { Player, Team } from '../types';
import { LineupStat } from '../lib/lineups';
import { shade } from './ui';

// Kleines, team-farbiges Fußballfeld, das die erfolgreichste Aufstellung eines
// Teams zeigt (aus den Spieldaten berechnet, siehe src/lib/lineups.ts). Da wir
// keine echten Positionen erfassen, verteilen wir die Feldspieler gleichmäßig auf
// Reihen; der Torwart steht unten im Tor.

interface BestLineupProps {
  lineup: LineupStat;
  team: Team;
}

// Feldspieler möglichst gleichmäßig auf Reihen verteilen (Abwehr unten … Sturm oben).
function rows(count: number): number[] {
  if (count <= 0) return [];
  if (count <= 3) return [count];
  const rowCount = count <= 6 ? 2 : 3;
  const base = Math.floor(count / rowCount);
  const rem = count % rowCount;
  // Rest auf die vorderen (oberen) Reihen legen, damit der Sturm nicht zu dünn wirkt.
  const out: number[] = [];
  for (let i = 0; i < rowCount; i++) out.push(base + (rowCount - 1 - i < rem ? 1 : 0));
  return out; // Index 0 = unterste Reihe (Abwehr)
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');
}

export default function BestLineup({ lineup, team }: BestLineupProps) {
  const color = team.logoColor || '#22DFC9';
  const byName = new Map((team.spielerliste || []).map((p) => [p.name, p] as const));

  const gkName = lineup.goalkeeper && lineup.players.includes(lineup.goalkeeper) ? lineup.goalkeeper : null;
  const outfield = lineup.players.filter((n) => n !== gkName);
  const rowSizes = rows(outfield.length);

  // Feldspieler den Reihen zuordnen (von unten nach oben füllen).
  const rowPlayers: string[][] = [];
  let idx = 0;
  for (const size of rowSizes) {
    rowPlayers.push(outfield.slice(idx, idx + size));
    idx += size;
  }
  // Für die Anzeige oben (Sturm) → unten (Abwehr): Reihenfolge umkehren.
  const displayRows = [...rowPlayers].reverse();

  const Chip = ({ name, index }: { name: string; index: number }) => {
    const p: Player | undefined = byName.get(name);
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.6, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ delay: 0.05 * index, type: 'spring', stiffness: 260, damping: 20 }}
        className="flex flex-col items-center gap-1 w-[62px]"
        title={name}
      >
        {p?.imageUrl ? (
          <img
            src={p.imageUrl}
            alt={name}
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            className="w-11 h-11 rounded-full object-cover border-2 shadow-[0_4px_12px_rgba(0,0,0,.45)]"
            style={{ borderColor: color }}
          />
        ) : (
          <span
            className="grid place-items-center w-11 h-11 rounded-full font-display font-black text-white text-sm border-2 shadow-[0_4px_12px_rgba(0,0,0,.45)]"
            style={{
              borderColor: color,
              background: `linear-gradient(140deg, ${color}, ${shade(color, 0.45)})`,
            }}
          >
            {initials(name) || '?'}
          </span>
        )}
        <span className="font-sans font-semibold text-[10px] leading-tight text-white text-center truncate max-w-full drop-shadow-[0_1px_2px_rgba(0,0,0,.9)]">
          {name.split(/\s+/)[0]}
        </span>
      </motion.div>
    );
  };

  let chipIndex = 0;

  return (
    <div className="hl-card rounded-[20px] p-[22px]">
      <div className="font-sans font-extrabold text-[11px] tracking-[2px] mb-1.5" style={{ color: shade(color, 1.15) }}>
        BESTE AUFSTELLUNG
      </div>
      <p className="font-sans text-[11px] text-hl-dim mb-4">
        Meiste Erfolge – automatisch aus den Ergebnissen berechnet.
      </p>

      {/* Bilanz-Kacheln */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        <div className="bg-white/[.03] border border-white/[.07] rounded-xl py-2.5 text-center">
          <div className="font-display font-black text-[22px]" style={{ color: shade(color, 1.15) }}>
            {lineup.winRate}%
          </div>
          <div className="font-sans font-bold text-[8.5px] tracking-[1.2px] text-hl-dim mt-0.5">SIEGQUOTE</div>
        </div>
        <div className="bg-white/[.03] border border-white/[.07] rounded-xl py-2.5 text-center">
          <div className="font-display font-black text-[22px] text-white">{lineup.games}</div>
          <div className="font-sans font-bold text-[8.5px] tracking-[1.2px] text-hl-dim mt-0.5">SPIELE</div>
        </div>
        <div className="bg-white/[.03] border border-white/[.07] rounded-xl py-2.5 text-center">
          <div className="font-display font-black text-[15px] text-white mt-1.5">
            <span className="text-hl-green-soft">{lineup.wins}</span>
            <span className="text-hl-faint">·</span>
            <span className="text-[#F0CE77]">{lineup.draws}</span>
            <span className="text-hl-faint">·</span>
            <span className="text-hl-red-soft">{lineup.losses}</span>
          </div>
          <div className="font-sans font-bold text-[8.5px] tracking-[1.2px] text-hl-dim mt-0.5">S · U · N</div>
        </div>
      </div>

      {/* Fußballfeld */}
      <div
        className="relative rounded-2xl overflow-hidden border border-white/10 px-2 py-4"
        style={{
          background: `linear-gradient(180deg, ${shade(color, 0.5)}, ${shade(color, 0.22)})`,
        }}
      >
        {/* Feldmarkierungen */}
        <div className="pointer-events-none absolute inset-0 opacity-40">
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-16 h-16 rounded-full border-2 border-white/50" />
          <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-px bg-white/50" />
          <div className="absolute left-1/2 -translate-x-1/2 bottom-0 w-24 h-9 border-2 border-b-0 border-white/50 rounded-t-md" />
          <div className="absolute left-1/2 -translate-x-1/2 top-0 w-24 h-9 border-2 border-t-0 border-white/50 rounded-b-md" />
        </div>

        <div className="relative flex flex-col gap-4">
          {displayRows.map((row, r) => (
            <div key={r} className="flex justify-center gap-2 flex-wrap">
              {row.map((name) => (
                <Chip key={name} name={name} index={chipIndex++} />
              ))}
            </div>
          ))}
          {gkName && (
            <div className="flex justify-center pt-1">
              <div className="flex flex-col items-center gap-1">
                <Chip name={gkName} index={chipIndex++} />
                <span className="font-sans font-bold text-[8px] tracking-[1.5px] text-white/70 uppercase">Torwart</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
