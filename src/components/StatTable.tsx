import { useMemo, useState } from 'react';
import { ArrowDown } from 'lucide-react';
import type { Team } from '../types';
import { TeamCrest } from './ui';

// ===========================================================================
// Sortierbare Statistik-Tabelle (z. B. Torschüsse: Gesamt · Aufs Tor · Quote).
// Spaltenkopf antippen = danach sortieren. Werte ohne genug Versuche (null)
// stehen unten und zeigen „–".
// ===========================================================================

export interface StatTableCol {
  key: string;
  label: string;
  fmt?: (v: number) => string;
}
export interface StatTableRow {
  teamId: string;
  playerName: string;
  values: Record<string, number | null>;
}

export const pctFmt = (v: number) => `${Math.round(v * 100)}%`;

export function sortStatRows(rows: StatTableRow[], key: string): StatTableRow[] {
  return [...rows].sort((a, b) => {
    const x = a.values[key];
    const y = b.values[key];
    if (x == null && y == null) return a.playerName.localeCompare(b.playerName);
    if (x == null) return 1;
    if (y == null) return -1;
    return y - x || a.playerName.localeCompare(b.playerName);
  });
}

export default function StatTable({
  rows,
  cols,
  defaultSort,
  accent,
  teams,
  note,
  onSelect,
  limit = 10,
}: {
  rows: StatTableRow[];
  cols: StatTableCol[];
  defaultSort: string;
  accent: string;
  teams: Team[];
  note?: string;
  onSelect?: (teamId: string, playerName?: string) => void;
  limit?: number;
}) {
  const [sortKey, setSortKey] = useState(defaultSort);
  const [all, setAll] = useState(false);
  const sorted = useMemo(() => sortStatRows(rows, sortKey), [rows, sortKey]);
  const shown = all ? sorted : sorted.slice(0, limit);

  return (
    <div className="pt-1 min-w-0">
      <div className="flex items-end gap-1.5 sm:gap-2 px-1.5 pb-1.5 border-b border-white/[.08]">
        <span className="w-5 shrink-0" />
        <span className="flex-1 min-w-0 text-[10px] font-bold uppercase tracking-wider text-hl-faint">Spieler</span>
        {cols.map((c) => {
          const on = c.key === sortKey;
          return (
            <button
              key={c.key}
              type="button"
              onClick={() => setSortKey(c.key)}
              aria-pressed={on}
              title={`Nach „${c.label}" sortieren`}
              className={`shrink-0 w-[44px] sm:w-[84px] flex items-end justify-end gap-0.5 text-[9px] sm:text-[10px] font-bold uppercase sm:tracking-wider cursor-pointer transition-colors ${
                on ? '' : 'text-hl-dim hover:text-white'
              }`}
              style={on ? { color: accent } : undefined}
            >
              {/* Ausgeschrieben; lange Wörter dürfen umbrechen (weiche Trennung). */}
              <span className="min-w-0 text-right leading-tight hyphens-manual break-words">{c.label}</span>
              {on && <ArrowDown className="w-3 h-3 shrink-0 mb-px" />}
            </button>
          );
        })}
      </div>
      <ol className="space-y-0.5 pt-1">
        {shown.map((r, i) => {
          const t = teams.find((x) => x.id === r.teamId);
          return (
            <li key={`${r.teamId}::${r.playerName}`}>
              <button
                type="button"
                onClick={onSelect ? () => onSelect(r.teamId, r.playerName) : undefined}
                className="w-full flex items-center gap-1.5 sm:gap-2 rounded-lg px-1.5 py-1.5 hover:bg-white/[.05] transition-colors cursor-pointer text-left min-w-0"
              >
                <span className="w-5 shrink-0 text-center font-display font-black tabular-nums text-xs text-hl-soft" style={{ color: i === 0 ? accent : undefined }}>
                  {i + 1}
                </span>
                <span className="flex-1 min-w-0 flex items-center gap-1.5">
                  {/* Wappen erst ab sm – am Handy braucht der Name den Platz. */}
                  {t && (
                    <span className="hidden sm:inline-flex shrink-0">
                      <TeamCrest name={t.name} shortName={t.shortName} color={t.logoColor} logoUrl={t.logoUrl} size="xs" />
                    </span>
                  )}
                  <span className="min-w-0 truncate font-sans font-semibold text-sm text-white">{r.playerName}</span>
                </span>
                {cols.map((c) => {
                  const v = r.values[c.key];
                  const on = c.key === sortKey;
                  return (
                    <span
                      key={c.key}
                      className={`shrink-0 w-[44px] sm:w-[84px] text-right tabular-nums ${on ? 'font-display font-black text-sm text-white' : 'font-mono text-[12px] text-hl-soft'}`}
                    >
                      {v == null ? '–' : c.fmt ? c.fmt(v) : v}
                    </span>
                  );
                })}
              </button>
            </li>
          );
        })}
      </ol>
      <div className="flex flex-wrap items-center justify-between gap-2 px-1.5 pt-2">
        {note ? <span className="text-[11px] text-hl-faint font-sans">{note}</span> : <span />}
        {sorted.length > limit && (
          <button type="button" onClick={() => setAll((v) => !v)} className="text-[11px] font-bold uppercase tracking-wider cursor-pointer" style={{ color: accent }}>
            {all ? `Nur Top ${limit}` : `Alle ${sorted.length} anzeigen`}
          </button>
        )}
      </div>
    </div>
  );
}
