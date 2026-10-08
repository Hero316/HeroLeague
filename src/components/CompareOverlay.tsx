import React, { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { X, ArrowLeftRight, Swords, Search, ChevronDown } from 'lucide-react';
import type { Match, MatchPlayerStat, PlayerStat, ScoringConfig, Team } from '../types';
import { cardForPlayer } from '../lib/playerCards';
import { useBackClose } from '../lib/backStack';
import FifaCard from './FifaCard';
import StatRadar, { type RadarSeries } from './StatRadar';
import { ModalPortal, monogram, TeamCrest } from './ui';

// ---------------------------------------------------------------------------
// Head-to-Head: zwei Spieler direkt gegenüberstellen – FC-Karten, ein
// überlagertes Werte-Radar und eine Kennzahl-Tabelle mit Sieger je Zeile.
// Öffnet als Vollbild-Overlay (Handy-Zurück schließt es korrekt).
// ---------------------------------------------------------------------------

const COLOR_A = '#22DFC9';
const COLOR_B = '#E9C46A';

interface Props {
  open: boolean;
  onClose: () => void;
  players: PlayerStat[];
  teams: Team[];
  trackingRows: MatchPlayerStat[];
  matches?: Match[]; // für die HERO-ONE-Punkte (Sieg-Bonus)
  scoringConfig?: ScoringConfig;
}

interface StatRow {
  label: string;
  a: number;
  b: number;
  decimals?: number;
  suffix?: string;
  higherWins?: boolean; // default true
}

// Spieler-Auswahl: Knopf mit aktuellem Spieler → Auswahl-Fenster mit Suche,
// Team-Wappen-Leiste und den Spielern des gewählten Teams (wie im Steckbrief).
function PlayerSelect({
  value,
  onChange,
  players,
  teams,
  accent,
  open,
  setOpen,
}: {
  value: string;
  onChange: (id: string) => void;
  players: PlayerStat[];
  teams: Team[];
  accent: string;
  open: boolean;
  setOpen: (v: boolean) => void;
}) {
  const current = players.find((p) => p.id === value) ?? null;
  const currentTeam = teams.find((t) => t.id === current?.teamId);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full min-w-0 flex items-center gap-2 bg-brand-dark border rounded-xl px-2.5 py-2 text-left cursor-pointer hover:bg-white/[.04] transition-colors"
        style={{ borderColor: `${accent}66` }}
      >
        {currentTeam && (
          <span className="shrink-0">
            <TeamCrest name={currentTeam.name} shortName={currentTeam.shortName} color={currentTeam.logoColor} logoUrl={currentTeam.logoUrl} size="sm" />
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] sm:text-sm font-sans font-bold text-white truncate">{current?.name ?? 'Spieler wählen'}</span>
          {currentTeam && <span className="block text-[10.5px] text-hl-mute truncate">{currentTeam.name}</span>}
        </span>
        <ChevronDown className="w-4 h-4 shrink-0" style={{ color: accent }} />
      </button>
      {open && (
        <PlayerPicker
          players={players}
          teams={teams}
          accent={accent}
          initialTeam={current?.teamId ?? null}
          selected={value}
          onPick={(id) => {
            onChange(id);
            setOpen(false);
          }}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function PlayerPicker({
  players,
  teams,
  accent,
  initialTeam,
  selected,
  onPick,
  onClose,
}: {
  players: PlayerStat[];
  teams: Team[];
  accent: string;
  initialTeam: string | null;
  selected: string;
  onPick: (id: string) => void;
  onClose: () => void;
}) {
  useBackClose(true, onClose);
  const [query, setQuery] = useState('');
  const teamsWithPlayers = useMemo(() => teams.filter((t) => players.some((p) => p.teamId === t.id)), [teams, players]);
  const [teamId, setTeamId] = useState<string | null>(initialTeam ?? teamsWithPlayers[0]?.id ?? null);
  const q = query.trim().toLowerCase();
  // Mit Suchbegriff: alle Teams durchsuchen (Name oder Verein), sonst nur das gewählte Team.
  const list = useMemo(() => {
    const base = q
      ? players.filter((p) => p.name.toLowerCase().includes(q) || (p.teamName || '').toLowerCase().includes(q))
      : players.filter((p) => p.teamId === teamId);
    return [...base].sort((a, b) => a.name.localeCompare(b.name, 'de'));
  }, [players, q, teamId]);
  const teamOf = (id: string) => teams.find((t) => t.id === id);

  return (
    <div className="fixed inset-0 z-[130] flex items-end sm:items-center justify-center sm:p-6" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div
        className="hl-modal-card relative w-full sm:max-w-lg max-h-[85vh] flex flex-col rounded-t-3xl sm:rounded-3xl border border-white/10 overflow-hidden"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="px-4 pt-5 pb-3 border-b border-white/10 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <span className="font-display font-black uppercase tracking-tight text-white text-lg">Spieler wählen</span>
            <button onClick={onClose} aria-label="Schließen" className="w-9 h-9 grid place-items-center rounded-xl text-hl-mute hover:text-white hover:bg-white/10 cursor-pointer">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="relative">
            <Search className="w-4 h-4 text-hl-faint absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Spieler oder Verein suchen…"
              className="w-full bg-white/[.05] border border-white/10 rounded-xl pl-9 pr-3 py-2.5 text-[14px] text-white placeholder-hl-faint focus:outline-none"
              style={{ borderColor: query ? `${accent}88` : undefined }}
            />
          </div>
          {!q && (
            <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {teamsWithPlayers.map((t) => {
                const on = t.id === teamId;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTeamId(t.id)}
                    title={t.name}
                    className="shrink-0 flex flex-col items-center gap-1 w-[64px] rounded-xl py-1.5 cursor-pointer transition-colors"
                    style={on ? { background: `${accent}22`, boxShadow: `inset 0 0 0 1.5px ${accent}` } : undefined}
                  >
                    <TeamCrest name={t.name} shortName={t.shortName} color={t.logoColor} logoUrl={t.logoUrl} size="lg" />
                    <span className={`text-[9.5px] font-bold uppercase tracking-wide truncate max-w-full px-0.5 ${on ? 'text-white' : 'text-hl-mute'}`}>
                      {t.shortName || t.name}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <div className="overflow-y-auto p-2">
          {list.length === 0 ? (
            <div className="text-center text-hl-mute text-sm py-8">Kein Spieler gefunden.</div>
          ) : (
            list.map((p) => {
              const t = teamOf(p.teamId);
              const on = p.id === selected;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => onPick(p.id)}
                  className="w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-left cursor-pointer hover:bg-white/[.06] transition-colors min-w-0"
                  style={on ? { background: `${accent}1f` } : undefined}
                >
                  {p.imageUrl ? (
                    <img src={p.imageUrl} alt="" loading="lazy" className="w-9 h-9 rounded-full object-cover shrink-0" />
                  ) : (
                    <span className="w-9 h-9 rounded-full grid place-items-center shrink-0 text-[12px] font-display font-black text-white" style={{ background: t?.logoColor || '#22DFC9' }}>
                      {monogram(p.name)}
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14px] font-semibold text-white truncate">{p.name}</span>
                    {q && <span className="block text-[11px] text-hl-mute truncate">{t?.name ?? p.teamName}</span>}
                  </span>
                  {on && <span className="text-[10px] font-bold uppercase tracking-wider shrink-0" style={{ color: accent }}>Gewählt</span>}
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

export default function CompareOverlay({ open, onClose, players, teams, trackingRows, matches, scoringConfig }: Props) {
  useBackClose(open, onClose);

  // Standardauswahl: die zwei torgefährlichsten Spieler. (Bewusst NICHT nach
  // HERO-ONE-Wertung – die bleibt geheim, nur die Nominierten sind öffentlich.)
  const ranked = useMemo(
    () => [...players].sort((a, b) => b.goals - a.goals || b.assists - a.assists || a.name.localeCompare(b.name)),
    [players]
  );
  const [idA, setIdA] = useState<string>('');
  const [idB, setIdB] = useState<string>('');
  // Welche Seite gerade ihr Auswahl-Fenster offen hat (links A / rechts B).
  const [pickSide, setPickSide] = useState<'a' | 'b' | null>(null);

  // Beim Öffnen sinnvolle Startwerte setzen (nur wenn noch leer).
  React.useEffect(() => {
    if (!open) return;
    if (!idA && ranked[0]) setIdA(ranked[0].id);
    if (!idB && ranked[1]) setIdB(ranked[1].id);
  }, [open, ranked, idA, idB]);

  const pA = players.find((p) => p.id === idA) ?? null;
  const pB = players.find((p) => p.id === idB) ?? null;
  const teamA = teams.find((t) => t.id === pA?.teamId);
  const teamB = teams.find((t) => t.id === pB?.teamId);

  const cardA = useMemo(
    () => (pA && scoringConfig ? cardForPlayer(pA.name, pA.teamId, trackingRows, scoringConfig) : null),
    [pA, trackingRows, scoringConfig]
  );
  const cardB = useMemo(
    () => (pB && scoringConfig ? cardForPlayer(pB.name, pB.teamId, trackingRows, scoringConfig) : null),
    [pB, trackingRows, scoringConfig]
  );

  const swap = () => {
    setIdA(idB);
    setIdB(idA);
  };

  // Kennzahlen-Zeilen (aus PlayerStat – immer vorhanden, unabhängig vom Tracking).
  const rows: StatRow[] = useMemo(() => {
    if (!pA || !pB) return [];
    const winRate = (p: PlayerStat) => (p.matchesPlayed > 0 ? (p.wins / p.matchesPlayed) * 100 : 0);
    const out: StatRow[] = [];
    if (cardA && cardB) out.push({ label: 'Gesamtwertung', a: cardA.card.ges, b: cardB.card.ges });
    // Tore/Vorlagen: getrackt oder aus den Ergebnissen – der höhere Wert.
    const g = (p: PlayerStat, c: typeof cardA) => Math.max(p.goals, c ? c.total.goal + c.total.penalty_goal : 0);
    const as = (p: PlayerStat, c: typeof cardA) => Math.max(p.assists, c ? c.total.assist : 0);
    out.push({ label: 'Tore', a: g(pA, cardA), b: g(pB, cardB) });
    out.push({ label: 'Vorlagen', a: as(pA, cardA), b: as(pB, cardB) });
    out.push({ label: 'Spiele', a: pA.matchesPlayed, b: pB.matchesPlayed });
    out.push({ label: 'Siegquote', a: winRate(pA), b: winRate(pB), decimals: 0, suffix: '%' });
    out.push({ label: 'Bester Spieler', a: pA.motmCount, b: pB.motmCount });
    return out;
  }, [pA, pB, cardA, cardB]);

  // Radar nur überlagern, wenn beide dieselbe Rolle haben (gleiche Achsen).
  const sameRole = cardA && cardB && cardA.role === cardB.role;
  const radarAxes = (cardA ?? cardB)?.card.attrs.map((x) => ({ key: x.key })) ?? [];
  const radarSeries: RadarSeries[] = useMemo(() => {
    const s: RadarSeries[] = [];
    if (cardA) s.push({ color: COLOR_A, values: cardA.card.attrs.map((x) => x.value), name: pA?.name });
    if (cardB && sameRole) s.push({ color: COLOR_B, values: cardB.card.attrs.map((x) => x.value), name: pB?.name });
    return s;
  }, [cardA, cardB, sameRole, pA?.name, pB?.name]);

  if (!open) return null;

  const fmt = (v: number, r?: StatRow) => (r?.decimals != null ? v.toFixed(r.decimals) : String(v)) + (r?.suffix ?? '');

  return (
    <ModalPortal>
      <AnimatePresence>
        <motion.div
          className="fixed inset-0 z-[120] bg-brand-deep/95 backdrop-blur-md overflow-y-auto"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="min-h-full max-w-3xl mx-auto px-4 sm:px-6 py-5 sm:py-8">
            {/* Kopf */}
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <Swords className="w-5 h-5 text-brand-accent-light" />
                <h2 className="font-display font-black text-lg sm:text-xl uppercase tracking-tight text-white">Spieler-Vergleich</h2>
              </div>
              <button
                onClick={onClose}
                aria-label="Schließen"
                className="w-9 h-9 rounded-full hl-surf-soft border border-white/10 text-hl-soft hover:text-white flex items-center justify-center cursor-pointer active:scale-90 transition-transform"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Auswahl */}
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 sm:gap-3 mb-6">
              <PlayerSelect value={idA} onChange={setIdA} players={players} teams={teams} accent={COLOR_A} open={pickSide === 'a'} setOpen={(v) => setPickSide(v ? 'a' : null)} />
              <button
                onClick={swap}
                aria-label="Tauschen"
                className="w-9 h-9 shrink-0 rounded-full hl-surf-soft border border-white/10 text-hl-soft hover:text-white flex items-center justify-center cursor-pointer active:scale-90 transition-transform"
                title="Spieler tauschen"
              >
                <ArrowLeftRight className="w-4 h-4" />
              </button>
              <PlayerSelect value={idB} onChange={setIdB} players={players} teams={teams} accent={COLOR_B} open={pickSide === 'b'} setOpen={(v) => setPickSide(v ? 'b' : null)} />
            </div>

            {/* FC-Karten */}
            <div className="grid grid-cols-2 gap-3 sm:gap-6 mb-7 items-start">
              {[{ p: pA, team: teamA, card: cardA, color: COLOR_A }, { p: pB, team: teamB, card: cardB, color: COLOR_B }].map(
                (side, i) => (
                  <div key={i} className="flex flex-col items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setPickSide(i === 0 ? 'a' : 'b')}
                      title="Anderen Spieler wählen"
                      className="w-full max-w-[190px] cursor-pointer active:scale-[.98] transition-transform"
                    >
                      {side.card ? (
                        <FifaCard card={side.card.card} name={side.p!.name} imageUrl={side.p!.imageUrl} team={side.team} />
                      ) : (
                        <div
                          className="w-full rounded-3xl border border-white/10 hl-surf-soft flex flex-col items-center justify-center text-center px-3"
                          style={{ aspectRatio: '0.7' }}
                        >
                          <div className="w-14 h-14 rounded-2xl grid place-items-center mb-2 font-display font-black text-white" style={{ background: `${side.color}22`, color: side.color }}>
                            {side.p ? monogram(side.p.name) : '?'}
                          </div>
                          <p className="text-[11px] font-sans text-hl-mute leading-snug">Noch keine getrackten Werte für diese Saison.</p>
                        </div>
                      )}
                    </button>
                    <p className="text-xs font-sans font-bold uppercase tracking-wider text-center" style={{ color: side.color }}>
                      {side.p?.teamName ?? ''}
                    </p>
                  </div>
                )
              )}
            </div>

            {/* Radar */}
            {radarSeries.length > 0 && radarAxes.length > 0 && (
              <div className="hl-card rounded-3xl border border-white/10 p-4 sm:p-6 mb-6 flex flex-col items-center">
                {!sameRole && cardA && cardB && (
                  <p className="text-[11px] font-sans text-hl-mute mb-2 text-center">
                    Torwart- und Feldspieler-Werte sind nicht direkt vergleichbar – nur {pA?.name} wird im Radar gezeigt.
                  </p>
                )}
                <StatRadar axes={radarAxes} series={radarSeries} size={280} />
                <div className="flex items-center gap-4 mt-3">
                  <span className="flex items-center gap-1.5 text-xs font-sans font-semibold text-hl-soft">
                    <span className="w-3 h-3 rounded-sm" style={{ background: COLOR_A }} /> {pA?.name}
                  </span>
                  {sameRole && (
                    <span className="flex items-center gap-1.5 text-xs font-sans font-semibold text-hl-soft">
                      <span className="w-3 h-3 rounded-sm" style={{ background: COLOR_B }} /> {pB?.name}
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Kennzahlen */}
            <div className="hl-card rounded-3xl border border-white/10 overflow-hidden">
              {rows.map((r, i) => {
                const higher = r.higherWins !== false;
                const aWins = r.a !== r.b && (higher ? r.a > r.b : r.a < r.b);
                const bWins = r.a !== r.b && (higher ? r.b > r.a : r.b < r.a);
                return (
                  <motion.div
                    key={r.label}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1], delay: 0.04 * i }}
                    className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 px-4 py-3 border-b border-white/5 last:border-b-0"
                  >
                    <div className="text-right font-display font-black tabular-nums text-lg" style={{ color: aWins ? COLOR_A : 'rgba(255,255,255,0.85)' }}>
                      {fmt(r.a, r)}
                    </div>
                    <div className="text-center text-[10px] font-sans font-bold uppercase tracking-wider text-hl-mute px-1 min-w-[92px]">{r.label}</div>
                    <div className="text-left font-display font-black tabular-nums text-lg" style={{ color: bWins ? COLOR_B : 'rgba(255,255,255,0.85)' }}>
                      {fmt(r.b, r)}
                    </div>
                  </motion.div>
                );
              })}
            </div>

            <div className="h-6" />
          </div>
        </motion.div>
      </AnimatePresence>
    </ModalPortal>
  );
}
