import React, { useEffect, useMemo } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { ArrowDown, Hand, Shirt } from 'lucide-react';
import type { PlayerStat, Team } from '../types';
import { sortStatRows, type StatTableCol, type StatTableRow } from './StatTable';
import { TeamCrest, TeamLogoImg, monogram, shade } from './ui';
import { validCutout } from '../lib/playerPhoto';
import { useHistoryState } from '../lib/historyState';

// ===========================================================================
// Bestenlisten der Saison – statt Aufklapp-Liste ein „Leaderboard":
//   1. Umschalter Feldspieler / Torhüter
//   2. Kategorien als Chips (Tore, Vorlagen, Pässe …) – ein Tipp, sofort da
//   3. Podest für Platz 1–3 (groß: Foto/Wappen, Name, dicke Zahl)
//   4. Platz 4–10 als Liste mit Balken bzw. als sortierbare Tabelle
// Sortierbare Tabellen (Gesamt · Quote · Wert …) bleiben sortierbar – über die
// Sortier-Chips oben UND über die Spaltenköpfe. Gleiche Daten wie bisher.
// ===========================================================================

export interface BoardEntry {
  teamId: string;
  playerName: string;
  value: number; // für den Balken
  display: string; // angezeigter Wert
  sub?: string;
}

interface BoardBase {
  id: string;
  label: string; // kurzer Chip-Text
  title: string; // Überschrift über dem Podest
  accent: string;
  icon: React.ReactNode;
  note?: string;
}
export type Board =
  | (BoardBase & { kind: 'list'; unit: string; entries: BoardEntry[] })
  | (BoardBase & { kind: 'table'; rows: StatTableRow[]; cols: StatTableCol[]; defaultSort: string });

type Group = 'field' | 'keeper';

const MEDAL = ['#E9C46A', '#C7D0DA', '#E0A46B'];
const plain = (s: string) => s.replace(/­/g, '');

export default function StatBoards({
  title,
  field,
  keeper,
  teams,
  players,
  onSelectTeam,
}: {
  title: string;
  field: Board[];
  keeper: Board[];
  teams: Team[];
  players: PlayerStat[];
  onSelectTeam?: (teamId: string, playerName?: string) => void;
}) {
  // Auswahl gehört zur Seite in der Browser-History → „Zurück" (z. B. von einer
  // Spielerseite) zeigt wieder dieselbe Liste.
  const [group, setGroup] = useHistoryState<Group>('bestenlisten-gruppe', 'field');
  const [picked, setPicked] = useHistoryState<Record<Group, string | null>>('bestenlisten-kategorie', { field: null, keeper: null });
  const [sortBy, setSortBy] = useHistoryState<Record<string, string>>('bestenlisten-sortierung', {});
  const reduce = useReducedMotion();

  const boards = group === 'field' ? field : keeper;
  // Gewählte Kategorie – fällt sie weg (z. B. anderer Spieltag), die erste nehmen.
  const board = boards.find((b) => b.id === picked[group]) ?? boards[0];
  // Gibt es (noch) keine Torhüter-Listen, bleibt der Umschalter auf Feldspieler.
  // Umgekehrt: nur Torhüter-Daten → gleich die Torhüter zeigen.
  useEffect(() => {
    if (group === 'keeper' && keeper.length === 0 && field.length > 0) setGroup('field');
    if (group === 'field' && field.length === 0 && keeper.length > 0) setGroup('keeper');
  }, [group, keeper.length, field.length]);

  if (!board) return null;
  const sortKey = board.kind === 'table' ? sortBy[board.id] ?? board.defaultSort : '';

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3 mb-4">
        <h2 className="font-display font-black text-[26px] sm:text-4xl uppercase tracking-tight text-white leading-none">{title}</h2>
        {keeper.length > 0 && (
          <div className="inline-flex p-1 rounded-2xl bg-white/[.04] border border-white/10" role="tablist" aria-label="Feldspieler oder Torhüter">
            {(
              [
                { id: 'field', label: 'Feldspieler', icon: <Shirt className="w-4 h-4" /> },
                { id: 'keeper', label: 'Torhüter', icon: <Hand className="w-4 h-4" /> },
              ] as const
            ).map((g) => {
              const on = g.id === group;
              return (
                <button
                  key={g.id}
                  type="button"
                  role="tab"
                  aria-selected={on}
                  onClick={() => setGroup(g.id)}
                  className={`relative inline-flex items-center gap-2 px-4 sm:px-5 py-2 sm:py-2.5 rounded-xl font-display font-black uppercase tracking-tight text-[15px] sm:text-lg cursor-pointer transition-colors ${
                    on ? 'text-[#04201c]' : 'text-hl-mute hover:text-white'
                  }`}
                >
                  {on && (
                    <motion.span
                      layoutId="hl-board-group"
                      className="absolute inset-0 rounded-xl bg-brand-accent-light shadow-[0_8px_24px_-8px_rgba(34,223,201,.7)]"
                      transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 36 }}
                    />
                  )}
                  <span className="relative">{g.icon}</span>
                  <span className="relative">{g.label}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Kategorien: am Handy eine wischbare Reihe, am PC umbrechend */}
      {/* Innenabstand rundum (mit Gegen-Rand): Die Leiste schneidet sonst den Schein
          der gewählten Taste ab – overflow-x schneidet auch oben/unten. */}
      <div className="-mx-4 px-4 sm:-mx-3 sm:px-3 -my-4 py-4 overflow-x-auto no-scrollbar">
        <div className="flex sm:flex-wrap gap-2 w-max sm:w-auto" role="tablist" aria-label="Kategorie wählen">
          {boards.map((b) => {
            const on = b.id === board.id;
            return (
              <button
                key={b.id}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => setPicked((p) => ({ ...p, [group]: b.id }))}
                className="shrink-0 inline-flex items-center gap-2 px-3.5 sm:px-4 py-2 sm:py-2.5 rounded-full border font-sans font-extrabold text-[12.5px] sm:text-sm uppercase tracking-wider cursor-pointer transition-[color,background-color,border-color] duration-200"
                style={
                  on
                    ? { color: '#fff', borderColor: `${b.accent}aa`, background: `linear-gradient(135deg, ${b.accent}38, ${b.accent}12)`, boxShadow: `0 6px 18px -10px ${b.accent}99` }
                    : { color: 'rgba(255,255,255,.62)', borderColor: 'rgba(255,255,255,.12)', background: 'rgba(255,255,255,.03)' }
                }
              >
                <span style={{ color: on ? b.accent : undefined }}>{b.icon}</span>
                {b.label}
              </button>
            );
          })}
        </div>
      </div>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={`${group}:${board.id}`}
          initial={reduce ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduce ? undefined : { opacity: 0, y: -6 }}
          transition={{ duration: 0.22, ease: 'easeOut' }}
          className="mt-4"
        >
          <BoardView
            board={board}
            sortKey={sortKey}
            onSort={(k) => setSortBy((s) => ({ ...s, [board.id]: k }))}
            teams={teams}
            players={players}
            onSelectTeam={onSelectTeam}
          />
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Eine Kategorie: Titel, ggf. Sortier-Chips, Podest, Rest
// ---------------------------------------------------------------------------
function BoardView({
  board,
  sortKey,
  onSort,
  teams,
  players,
  onSelectTeam,
}: {
  board: Board;
  sortKey: string;
  onSort: (k: string) => void;
  teams: Team[];
  players: PlayerStat[];
  onSelectTeam?: (teamId: string, playerName?: string) => void;
}) {
  const [all, setAll] = useHistoryState(`bestenlisten-alle-${board.id}`, false);
  const sorted = useMemo(() => (board.kind === 'table' ? sortStatRows(board.rows, sortKey) : []), [board, sortKey]);

  // Podest-Einträge (Platz 1–3) – bei Tabellen nach der gewählten Spalte.
  const podium: BoardEntry[] =
    board.kind === 'list'
      ? board.entries.slice(0, 3)
      : sorted
          .filter((r) => r.values[sortKey] != null)
          .slice(0, 3)
          .map((r) => {
            const col = board.cols.find((c) => c.key === sortKey)!;
            const v = r.values[sortKey]!;
            return {
              teamId: r.teamId,
              playerName: r.playerName,
              value: v,
              display: col.fmt ? col.fmt(v) : String(v),
              sub: board.cols
                .filter((c) => c.key !== sortKey && r.values[c.key] != null)
                .map((c) => `${plain(c.label)} ${c.fmt ? c.fmt(r.values[c.key]!) : r.values[c.key]}`)
                .join(' · '),
            };
          });
  const unit = board.kind === 'list' ? board.unit : plain(board.cols.find((c) => c.key === sortKey)?.label ?? '');

  return (
    <div
      className="relative rounded-[24px] border border-white/10 overflow-hidden p-3 sm:p-5 lg:p-6"
      style={{ background: `linear-gradient(180deg, ${board.accent}14, rgba(255,255,255,.015) 38%)` }}
    >
      <div className="pointer-events-none absolute -top-24 left-1/2 -translate-x-1/2 w-[70%] h-48 rounded-full blur-3xl opacity-50" style={{ background: board.accent }} aria-hidden="true" />

      <div className="relative flex flex-wrap items-center justify-between gap-x-4 gap-y-2.5 mb-4 px-1">
        <h3 className="font-display font-black uppercase tracking-tight text-white text-xl sm:text-3xl leading-none flex items-center gap-2.5">
          <span style={{ color: board.accent }}>{board.icon}</span>
          {board.title}
        </h3>
        {board.kind === 'table' && (
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Sortieren nach">
            {board.cols.map((c) => {
              const on = c.key === sortKey;
              return (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => onSort(c.key)}
                  aria-pressed={on}
                  className="px-3 py-1.5 rounded-full text-[11px] sm:text-xs font-bold uppercase tracking-wider border cursor-pointer transition-colors"
                  style={
                    on
                      ? { color: '#04201c', background: board.accent, borderColor: board.accent }
                      : { color: 'rgba(255,255,255,.65)', borderColor: 'rgba(255,255,255,.14)', background: 'rgba(255,255,255,.03)' }
                  }
                >
                  {plain(c.label)}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <Podium entries={podium} unit={unit} accent={board.accent} teams={teams} players={players} onSelectTeam={onSelectTeam} />

      {board.kind === 'list' ? (
        board.entries.length > 3 && (
          <ol className="relative mt-3 sm:mt-4 space-y-1.5">
            {board.entries.slice(3).map((e, i) => (
              <ListRow key={`${e.teamId}::${e.playerName}`} rank={i + 4} e={e} max={board.entries[0]?.value || 1} accent={board.accent} teams={teams} onSelectTeam={onSelectTeam} />
            ))}
          </ol>
        )
      ) : (
        <TableRest
          rows={(all ? sorted : sorted.slice(0, 10)).slice(podium.length)}
          start={podium.length}
          cols={board.cols}
          sortKey={sortKey}
          onSort={onSort}
          accent={board.accent}
          teams={teams}
          onSelectTeam={onSelectTeam}
        />
      )}

      {(board.note || (board.kind === 'table' && sorted.length > 10)) && (
        <div className="relative flex flex-wrap items-center justify-between gap-2 px-1 pt-3">
          {board.note ? <span className="text-[11px] lg:text-[13px] text-hl-faint font-sans">{board.note}</span> : <span />}
          {board.kind === 'table' && sorted.length > 10 && (
            <button type="button" onClick={() => setAll((v) => !v)} className="text-[11px] lg:text-xs font-bold uppercase tracking-wider cursor-pointer" style={{ color: board.accent }}>
              {all ? 'Nur Top 10' : `Alle ${sorted.length} anzeigen`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Podest: Handy = Platz 1 breit, 2 + 3 nebeneinander · PC = 2 · 1 · 3
// ---------------------------------------------------------------------------
function Podium({
  entries,
  unit,
  accent,
  teams,
  players,
  onSelectTeam,
}: {
  entries: BoardEntry[];
  unit: string;
  accent: string;
  teams: Team[];
  players: PlayerStat[];
  onSelectTeam?: (teamId: string, playerName?: string) => void;
}) {
  if (entries.length === 0) return <div className="relative py-10 text-center text-sm text-hl-mute">Noch keine Werte.</div>;
  const order = ['order-1 col-span-2 lg:col-span-1 lg:order-2', 'order-2 lg:order-1', 'order-3 lg:order-3'];
  return (
    <div className="relative grid grid-cols-2 lg:grid-cols-3 gap-2.5 sm:gap-3 lg:items-end">
      {entries.map((e, i) => {
        const team = teams.find((t) => t.id === e.teamId);
        const first = i === 0;
        const open = onSelectTeam && team ? () => onSelectTeam(team.id, e.playerName) : undefined;
        return (
          <div
            key={`${e.teamId}::${e.playerName}`}
            className={`${order[i]} relative min-w-0 rounded-[20px] border overflow-hidden ${first ? 'lg:pb-3' : ''}`}
            style={{
              borderColor: `${MEDAL[i]}${first ? '88' : '44'}`,
              background: `linear-gradient(160deg, ${MEDAL[i]}${first ? '26' : '14'}, rgba(8,17,15,.6) 60%)`,
              boxShadow: first ? `0 18px 44px -22px ${MEDAL[i]}` : undefined,
            }}
          >
            <button
              type="button"
              onClick={open}
              className={`w-full text-left min-w-0 ${open ? 'cursor-pointer' : 'cursor-default'} ${
                first ? 'flex lg:flex-col items-center lg:items-stretch gap-3 sm:gap-4 p-3.5 sm:p-5' : 'flex flex-col p-3 sm:p-4'
              }`}
            >
              <div className={`relative shrink-0 ${first ? 'w-[96px] sm:w-[120px] lg:w-full' : 'w-full'}`}>
                {/* Medaille mit Platz-Nummer */}
                <span
                  className={`absolute z-[1] -top-1 -left-1 rounded-full grid place-items-center font-display font-black leading-none text-[#0b1415] shadow-[0_6px_16px_rgba(0,0,0,.5)] ring-2 ring-[#0b1415]/60 ${
                    first ? 'w-9 h-9 text-[20px] sm:w-11 sm:h-11 sm:text-2xl lg:w-12 lg:h-12 lg:text-[26px]' : 'w-8 h-8 text-lg sm:w-9 sm:h-9 sm:text-xl'
                  }`}
                  style={{ background: `linear-gradient(145deg, ${MEDAL[i]}, ${shade(MEDAL[i], 0.7)})` }}
                >
                  {i + 1}
                </span>
                <Visual entry={e} team={team} players={players} big={first} />
              </div>
              <div className={`min-w-0 ${first ? 'flex-1 lg:mt-3 lg:text-center' : 'mt-2.5 text-center'}`}>
                <div className={`font-display font-black uppercase leading-[.95] text-white truncate ${first ? 'text-[22px] sm:text-[28px] lg:text-[30px]' : 'text-[16px] sm:text-[20px]'}`}>{e.playerName}</div>
                <div className={`mt-1 flex items-center gap-1.5 min-w-0 ${first ? 'lg:justify-center' : 'justify-center'}`}>
                  {team && <TeamCrest name={team.name} shortName={team.shortName} color={team.logoColor} logoUrl={team.logoUrl} size="xs" />}
                  <span className="truncate font-sans font-semibold text-[11.5px] sm:text-[13px] text-hl-mute">{team?.name ?? ''}</span>
                </div>
                <div className={`flex items-baseline gap-1.5 ${first ? 'mt-2.5 sm:mt-3 lg:justify-center' : 'mt-2 justify-center'}`}>
                  <span className={`font-display font-black leading-[.85] tabular-nums ${first ? 'text-[48px] sm:text-[60px] lg:text-[72px]' : 'text-[34px] sm:text-[44px]'}`} style={{ color: first ? accent : '#fff' }}>
                    {e.display}
                  </span>
                  {!!unit && <span className="font-sans font-bold text-[10px] sm:text-xs uppercase tracking-wider text-hl-dim truncate">{unit}</span>}
                </div>
                {e.sub && <div className="mt-1.5 font-sans text-[11px] sm:text-[12.5px] text-hl-dim line-clamp-2">{e.sub}</div>}
              </div>
            </button>
          </div>
        );
      })}
    </div>
  );
}

// Großes Bild im Podest: freigestelltes Foto → Foto → Vereinslogo → Initialen.
function Visual({ entry, team, players, big }: { entry: BoardEntry; team?: Team; players: PlayerStat[]; big: boolean }) {
  const squad = team?.spielerliste?.find((x) => x.name === entry.playerName);
  const cut = validCutout(squad);
  const photo = players.find((p) => p.teamId === entry.teamId && p.name === entry.playerName)?.imageUrl || squad?.imageUrl;
  const color = team?.logoColor || '#22DFC9';
  const box = big ? 'h-[96px] sm:h-[120px] lg:h-[170px]' : 'h-[86px] sm:h-[110px]';
  if (cut)
    return (
      <div className={`${box} flex items-end justify-center`}>
        <img src={cut} alt={entry.playerName} loading="lazy" decoding="async" className="h-full w-auto max-w-full object-contain object-bottom drop-shadow-[0_10px_22px_rgba(0,0,0,.55)]" />
      </div>
    );
  if (photo)
    return (
      <div className={`${box} flex items-center justify-center`}>
        <img src={photo} alt={entry.playerName} loading="lazy" decoding="async" className="h-full aspect-square object-cover rounded-2xl border-2 shadow-[0_12px_30px_rgba(0,0,0,.45)]" style={{ borderColor: color }} />
      </div>
    );
  return (
    <div className={`${box} flex items-center justify-center`}>
      {team?.logoUrl ? (
        <TeamLogoImg url={team.logoUrl} alt={team.name} className="h-[88%] aspect-square drop-shadow-[0_10px_22px_rgba(0,0,0,.5)]" />
      ) : (
        <span
          className="h-[88%] aspect-square rounded-[22%] grid place-items-center font-display font-black text-white leading-none shadow-[0_12px_30px_rgba(0,0,0,.45)]"
          style={{ background: `linear-gradient(140deg, ${color}, ${shade(color, 0.45)})`, fontSize: big ? 'clamp(30px, 4vw, 54px)' : 'clamp(24px, 3vw, 38px)' }}
        >
          {monogram(team?.shortName || team?.name || entry.playerName)}
        </span>
      )}
    </div>
  );
}

// Platz 4–10 einer Mengenliste: Wappen, dicker Name, Balken, dicke Zahl.
function ListRow({
  rank,
  e,
  max,
  accent,
  teams,
  onSelectTeam,
}: {
  rank: number;
  e: BoardEntry;
  max: number;
  accent: string;
  teams: Team[];
  onSelectTeam?: (teamId: string, playerName?: string) => void;
}) {
  const t = teams.find((x) => x.id === e.teamId);
  const pct = Math.max(4, Math.min(100, (e.value / (max || 1)) * 100));
  return (
    <li>
      <button
        type="button"
        onClick={onSelectTeam && t ? () => onSelectTeam(t.id, e.playerName) : undefined}
        className="w-full flex items-center gap-3 sm:gap-4 rounded-2xl px-3 sm:px-4 py-2.5 sm:py-3 bg-white/[.03] hover:bg-white/[.06] border border-white/[.06] transition-colors cursor-pointer text-left min-w-0"
      >
        <span className="w-6 sm:w-8 shrink-0 text-center font-display font-black tabular-nums text-xl sm:text-2xl text-hl-dim">{rank}</span>
        {t && (
          <span className="shrink-0">
            <TeamCrest name={t.name} shortName={t.shortName} color={t.logoColor} logoUrl={t.logoUrl} size="lg" />
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate font-sans font-extrabold text-[15px] sm:text-lg text-white">{e.playerName}</span>
          <span className="mt-1.5 block h-1.5 rounded-full bg-white/[.07] overflow-hidden">
            <span className="block h-full rounded-full" style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${accent}66, ${accent})` }} />
          </span>
          {e.sub && <span className="mt-1 block truncate font-sans text-[11px] sm:text-xs text-hl-dim">{e.sub}</span>}
        </span>
        <span className="shrink-0 pl-1 font-display font-black tabular-nums text-[26px] sm:text-[34px] leading-none text-white">{e.display}</span>
      </button>
    </li>
  );
}

// Platz 4+ einer sortierbaren Tabelle – dicke Schrift, sortierte Spalte farbig.
function TableRest({
  rows,
  start,
  cols,
  sortKey,
  onSort,
  accent,
  teams,
  onSelectTeam,
}: {
  rows: StatTableRow[];
  start: number;
  cols: StatTableCol[];
  sortKey: string;
  onSort: (k: string) => void;
  accent: string;
  teams: Team[];
  onSelectTeam?: (teamId: string, playerName?: string) => void;
}) {
  if (rows.length === 0) return null;
  // Viele Spalten: am Handy steht der Name in einer eigenen Zeile über den Zahlen.
  const wide = cols.length >= 5;
  const colW = 'w-[46px] sm:w-[84px] lg:w-[104px]';
  return (
    <div className="relative mt-3 sm:mt-4 min-w-0">
      <div className="flex items-end gap-1.5 sm:gap-3 px-3 sm:px-4 pb-2">
        <span className="w-6 sm:w-8 shrink-0" />
        <span className={`flex-1 min-w-0 text-[10px] lg:text-xs font-bold uppercase tracking-wider text-hl-faint ${wide ? 'invisible sm:visible' : ''}`}>Spieler</span>
        {cols.map((c) => {
          const on = c.key === sortKey;
          return (
            <button
              key={c.key}
              type="button"
              onClick={() => onSort(c.key)}
              aria-pressed={on}
              title={`Nach „${plain(c.label)}" sortieren`}
              className={`shrink-0 ${colW} flex items-end justify-end gap-0.5 text-[9px] sm:text-[11px] lg:text-xs font-bold uppercase sm:tracking-wider cursor-pointer transition-colors ${on ? '' : 'text-hl-dim hover:text-white'}`}
              style={on ? { color: accent } : undefined}
            >
              <span className="min-w-0 text-right leading-tight hyphens-manual break-words">{c.label}</span>
              {on && <ArrowDown className="w-3 h-3 shrink-0 mb-px" />}
            </button>
          );
        })}
      </div>
      <ol className="space-y-1.5">
        {rows.map((r, i) => {
          const t = teams.find((x) => x.id === r.teamId);
          return (
            <li key={`${r.teamId}::${r.playerName}`}>
              <button
                type="button"
                onClick={onSelectTeam && t ? () => onSelectTeam(t.id, r.playerName) : undefined}
                className={`w-full flex items-center ${wide ? 'flex-wrap sm:flex-nowrap gap-y-1.5' : ''} gap-1.5 sm:gap-3 rounded-2xl px-3 sm:px-4 py-2.5 sm:py-3 bg-white/[.03] hover:bg-white/[.06] border border-white/[.06] transition-colors cursor-pointer text-left min-w-0`}
              >
                <span className="w-6 sm:w-8 shrink-0 text-center font-display font-black tabular-nums text-lg sm:text-2xl text-hl-dim">{start + i + 1}</span>
                <span className={`${wide ? 'basis-[calc(100%-2.5rem)] sm:basis-0' : ''} flex-1 min-w-0 flex items-center gap-2 sm:gap-3`}>
                  {t && (
                    <span className="shrink-0">
                      <TeamCrest name={t.name} shortName={t.shortName} color={t.logoColor} logoUrl={t.logoUrl} size="md" />
                    </span>
                  )}
                  <span className="min-w-0 truncate font-sans font-extrabold text-[14.5px] sm:text-lg text-white">{r.playerName}</span>
                </span>
                {wide && <span className="sm:hidden flex-1" />}
                {cols.map((c) => {
                  const v = r.values[c.key];
                  const on = c.key === sortKey;
                  return (
                    <span
                      key={c.key}
                      className={`shrink-0 ${colW} text-right tabular-nums ${on ? 'font-display font-black text-[17px] sm:text-2xl' : 'font-sans font-bold text-[12.5px] sm:text-[15px] text-hl-soft'}`}
                      style={on ? { color: accent } : undefined}
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
    </div>
  );
}
