import React, { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { X, ArrowLeftRight, Swords } from 'lucide-react';
import type { MatchPlayerStat, PlayerStat, ScoringConfig, Team } from '../types';
import { cardForPlayer } from '../lib/playerCards';
import { useBackClose } from '../lib/backStack';
import FifaCard from './FifaCard';
import StatRadar, { type RadarSeries } from './StatRadar';
import { ModalPortal, monogram } from './ui';

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

function PlayerSelect({
  value,
  onChange,
  players,
  teams,
  accent,
}: {
  value: string;
  onChange: (id: string) => void;
  players: PlayerStat[];
  teams: Team[];
  accent: string;
}) {
  // Nach Team gruppiert, damit man Spieler schnell findet.
  const byTeam = useMemo(() => {
    const map = new Map<string, PlayerStat[]>();
    players.forEach((p) => {
      const arr = map.get(p.teamId) ?? [];
      arr.push(p);
      map.set(p.teamId, arr);
    });
    return teams
      .map((t) => ({ team: t, list: (map.get(t.id) ?? []).sort((a, b) => a.name.localeCompare(b.name)) }))
      .filter((g) => g.list.length > 0);
  }, [players, teams]);

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full bg-brand-dark border rounded-xl px-3 py-2.5 text-sm text-white font-sans font-semibold focus:outline-none cursor-pointer truncate"
      style={{ borderColor: `${accent}66` }}
    >
      {byTeam.map((g) => (
        <optgroup key={g.team.id} label={g.team.name}>
          {g.list.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

export default function CompareOverlay({ open, onClose, players, teams, trackingRows, scoringConfig }: Props) {
  useBackClose(open, onClose);

  // Standardauswahl: die zwei punktbesten Spieler.
  const ranked = useMemo(() => [...players].sort((a, b) => b.points - a.points), [players]);
  const [idA, setIdA] = useState<string>('');
  const [idB, setIdB] = useState<string>('');

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
    out.push({ label: 'Tore', a: pA.goals, b: pB.goals });
    out.push({ label: 'Vorlagen', a: pA.assists, b: pB.assists });
    out.push({ label: 'Spiele', a: pA.matchesPlayed, b: pB.matchesPlayed });
    out.push({ label: 'Siegquote', a: winRate(pA), b: winRate(pB), decimals: 0, suffix: '%' });
    out.push({ label: 'Bester Spieler', a: pA.motmCount, b: pB.motmCount });
    out.push({ label: 'Ballon-Punkte', a: pA.points, b: pB.points });
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
              <PlayerSelect value={idA} onChange={setIdA} players={players} teams={teams} accent={COLOR_A} />
              <button
                onClick={swap}
                aria-label="Tauschen"
                className="w-9 h-9 shrink-0 rounded-full hl-surf-soft border border-white/10 text-hl-soft hover:text-white flex items-center justify-center cursor-pointer active:scale-90 transition-transform"
                title="Spieler tauschen"
              >
                <ArrowLeftRight className="w-4 h-4" />
              </button>
              <PlayerSelect value={idB} onChange={setIdB} players={players} teams={teams} accent={COLOR_B} />
            </div>

            {/* FC-Karten */}
            <div className="grid grid-cols-2 gap-3 sm:gap-6 mb-7 items-start">
              {[{ p: pA, team: teamA, card: cardA, color: COLOR_A }, { p: pB, team: teamB, card: cardB, color: COLOR_B }].map(
                (side, i) => (
                  <div key={i} className="flex flex-col items-center gap-2">
                    <div className="w-full max-w-[190px]">
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
                    </div>
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
