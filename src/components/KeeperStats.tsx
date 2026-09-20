import React, { useMemo } from 'react';
import { motion } from 'motion/react';
import { X, Hand } from 'lucide-react';
import type { MatchPlayerStat, PlayerStat, ScoringConfig, Team } from '../types';
import { keeperBoards, KEEPER_MIN_GAMES, type KeeperBoard } from '../lib/trackingAwards';
import { DEFAULT_SCORING } from '../lib/scoring';
import { useBackClose } from '../lib/backStack';
import { useBackdropDismiss, ModalPortal } from './ui';
import PlayerCrest from './PlayerCrest';

// ===========================================================================
// Torhüter-Statistiken: eigene Rubrik, damit Keeper nicht nur als eine Zeile im
// Goldenen Handschuh vorkommen. Jede Liste ist eine Top 10 und sagt in ihrem
// Untertitel, wonach sie sortiert – damit niemand raten muss, wie die Zahl
// zustande kommt.
//
// Alle Werte kommen aus DENSELBEN getrackten Aktionen wie die Karten und der
// Goldene Handschuh (keine zweite Datenquelle, keine gespeicherten Tabellen).
// ===========================================================================

interface Props {
  open: boolean;
  onClose: () => void;
  rows: MatchPlayerStat[];
  teams: Team[];
  players: PlayerStat[];
  scoringConfig?: ScoringConfig;
  onSelectTeam?: (teamId: string, playerName?: string) => void;
}

const RANK_COLOR = (i: number) =>
  i === 0 ? 'text-hl-gold' : i === 1 ? 'text-[#C7D0DA]' : i === 2 ? 'text-[#E0A46B]' : 'text-hl-dim';

export default function KeeperStats({ open, onClose, rows, teams, players, scoringConfig, onSelectTeam }: Props) {
  useBackClose(open, onClose);
  const backdrop = useBackdropDismiss(onClose);
  const cfg = scoringConfig ?? DEFAULT_SCORING;
  const boards = useMemo(() => (open ? keeperBoards(rows, cfg) : []), [open, rows, cfg]);

  // Für Foto/Wappen: den Spieler in der Liga-Spielerliste suchen, sonst ein
  // minimales Ersatzobjekt bauen (Name + Verein reichen fürs Wappen).
  const crestFor = (teamId: string, name: string): Parameters<typeof PlayerCrest>[0]['player'] => {
    const found = players.find((p) => p.teamId === teamId && p.name === name);
    if (found) return found;
    const t = teams.find((x) => x.id === teamId);
    return { name, teamId, teamName: t?.name ?? teamId, teamLogoColor: t?.logoColor ?? '#22dfc9' };
  };

  if (!open) return null;

  return (
    <ModalPortal>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[80] bg-black/85 backdrop-blur-sm overflow-y-auto"
        {...backdrop}
      >
        <div className="min-h-full pb-16" onClick={(e) => e.stopPropagation()}>
          <div className="max-w-[1320px] mx-auto px-4 sm:px-8">
            {/* Kopf – klebt oben, damit das X am iPhone immer erreichbar bleibt
                (Notch/Statusleiste über env(safe-area-inset-top) freigehalten). */}
            <div
              className="sticky top-0 z-10 -mx-4 sm:-mx-8 px-4 sm:px-8 pb-3 bg-[#05100e]/95 backdrop-blur-md flex items-center gap-3"
              style={{ paddingTop: 'calc(env(safe-area-inset-top) + 0.75rem)' }}
            >
              <span className="w-10 h-10 rounded-xl grid place-items-center bg-brand-accent-light/15 text-brand-accent-light shrink-0">
                <Hand className="w-5 h-5" />
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="font-display font-black text-xl sm:text-3xl uppercase tracking-tight text-white leading-none truncate">
                  Torhüter-Statistiken
                </h2>
                <p className="font-sans text-[11.5px] sm:text-xs text-hl-mute mt-1">
                  Alles aus den getrackten Torwart-Aktionen · jeweils Top 10
                </p>
              </div>
              <button
                onClick={onClose}
                title="Schließen"
                className="w-10 h-10 rounded-xl grid place-items-center bg-white/5 border border-white/10 text-hl-mute hover:text-white cursor-pointer shrink-0 active:scale-95 transition-transform"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {boards.length === 0 ? (
              <div className="hl-card text-center py-14 text-hl-mute font-sans text-sm mt-4">
                Noch keine getrackten Torwart-Daten. Sobald ein Spieltag getrackt und veröffentlicht ist,
                stehen hier die Torhüter-Ranglisten.
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mt-4">
                {boards.map((b) => (
                  <BoardCard key={b.id} board={b} crestFor={crestFor} teams={teams} onSelectTeam={onSelectTeam} />
                ))}
              </div>
            )}

            <p className="text-[11px] font-sans text-hl-faint leading-relaxed mt-6 max-w-2xl">
              Quoten-Listen haben bewusst eine Mindestanzahl – sonst führt ein Torwart mit „1 von 1 gehalten"
              jede Tabelle an. Spiele im Tor zählen nur Partien, in denen jemand wirklich als Torwart getrackt wurde.
              Alle Grenzwerte lassen sich im Tracking Center anpassen.
            </p>
          </div>
        </div>
      </motion.div>
    </ModalPortal>
  );
}

function BoardCard({
  board,
  crestFor,
  teams,
  onSelectTeam,
}: {
  board: KeeperBoard;
  crestFor: (teamId: string, name: string) => Parameters<typeof PlayerCrest>[0]['player'];
  teams: Team[];
  onSelectTeam?: (teamId: string, playerName?: string) => void;
}) {
  const fmt = (v: number) =>
    board.percent ? `${Math.round(v * 100)}%` : board.decimals > 0 ? v.toFixed(board.decimals) : String(v);

  return (
    <div className="relative rounded-[20px] overflow-hidden bg-[linear-gradient(180deg,rgba(255,255,255,.05),rgba(255,255,255,.012))] border border-white/10 backdrop-blur-lg shadow-[0_20px_50px_rgba(0,0,0,.35)]">
      <div
        className="absolute top-0 right-0 w-[220px] h-[220px] pointer-events-none"
        style={{ background: 'radial-gradient(circle,rgba(34,223,201,.16),transparent 68%)' }}
      />
      <div className="relative px-4 sm:px-6 pt-5 pb-3">
        <h3 className="font-display font-black text-lg sm:text-xl uppercase tracking-tight text-white leading-none">
          {board.label}
        </h3>
        <p className="font-sans text-[11px] text-hl-dim mt-1.5">{board.hint}</p>
      </div>
      <div className="relative divide-y divide-white/[.06]">
        {board.rows.map((r, i) => (
          <div key={`${r.teamId}::${r.playerName}`} className="flex items-center gap-3 px-4 sm:px-6 py-2.5">
            <div className={`font-display font-black text-xl sm:text-2xl w-6 sm:w-7 text-center shrink-0 ${RANK_COLOR(i)}`}>
              {i + 1}
            </div>
            <div className="shrink-0">
              <PlayerCrest
                player={crestFor(r.teamId, r.playerName)}
                teams={teams}
                photoSize="sm"
                crestSize="md"
                onSelectTeam={onSelectTeam}
              />
            </div>
            <div className="min-w-0 flex-1">
              <button
                onClick={() => onSelectTeam?.(r.teamId, r.playerName)}
                className={`block max-w-full text-left font-sans font-bold text-[13.5px] sm:text-sm text-white truncate ${
                  onSelectTeam ? 'cursor-pointer hover:text-brand-accent-light transition-colors' : 'cursor-default'
                }`}
              >
                {r.playerName}
              </button>
              <div className="font-sans text-[11px] text-hl-dim truncate mt-0.5">{r.sub}</div>
            </div>
            <div className="flex items-baseline gap-1 shrink-0 pl-2">
              <span className="font-display font-black text-xl sm:text-2xl leading-none text-brand-accent-light tabular-nums">
                {fmt(r.value)}
              </span>
              {!!board.unit && (
                <span className="font-sans font-bold text-[9px] tracking-wider text-hl-dim">{board.unit}</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
