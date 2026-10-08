import React, { useMemo } from 'react';
import { motion } from 'motion/react';
import { X, Hand } from 'lucide-react';
import type { MatchPlayerStat, PlayerStat, ScoringConfig, Team } from '../types';
import { keeperBoards, playerTotals, GOLDEN_GLOVE_EXPLAIN, type KeeperBoard } from '../lib/trackingAwards';
import StatTable, { sortStatRows, type StatTableRow } from './StatTable';
import { DEFAULT_SCORING } from '../lib/scoring';
import { useBackClose } from '../lib/backStack';
import { useBackdropDismiss, ModalPortal } from './ui';
import PlayerCrest from './PlayerCrest';
import StatAccordion from './StatAccordion';

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
  // Paraden · Glanzparaden · Standparaden in EINER sortierbaren Tabelle.
  const saveRows = useMemo<StatTableRow[]>(
    () =>
      open
        ? playerTotals(rows, cfg)
            .filter((p) => p.role === 'keeper' || p.total.save + p.total.gk_position_save > 0)
            .filter((p) => p.total.save + p.total.save_top + p.total.gk_position_save > 0)
            .map((p) => ({
              teamId: p.teamId,
              playerName: p.playerName,
              values: { save: p.total.save, top: p.total.save_top, pos: p.total.gk_position_save },
            }))
        : [],
    [open, rows, cfg]
  );

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
              <div className="mt-4 max-w-2xl mx-auto">
                <StatAccordion
                  defaultOpen={boards[0]?.id ?? null}
                  items={(() => {
                    const item = (b: KeeperBoard) => ({
                      id: b.id,
                      title: b.label,
                      accent: '#22DFC9',
                      icon: <Hand className="w-4 h-4" />,
                      preview: b.rows[0] ? `1. ${b.rows[0].playerName} · ${fmtBoard(b, b.rows[0].value)}${b.unit ? ` ${b.unit}` : ''}` : undefined,
                      content: (
                        <>
                          {b.id === 'glove' && (
                            <ul className="mb-2 px-2 sm:px-3 text-[11.5px] text-hl-mute font-sans space-y-0.5">
                              {GOLDEN_GLOVE_EXPLAIN.map((l) => (
                                <li key={l}>• {l}</li>
                              ))}
                            </ul>
                          )}
                          <BoardRows board={b} crestFor={crestFor} teams={teams} onSelectTeam={onSelectTeam} />
                        </>
                      ),
                    });
                    const merged = new Set(['saves', 'top', 'pos']);
                    const glove = boards.filter((b) => b.id === 'glove').map(item);
                    const rest = boards.filter((b) => b.id !== 'glove' && !merged.has(b.id)).map(item);
                    const top = sortStatRows(saveRows, 'save')[0];
                    const saves = saveRows.length
                      ? [
                          {
                            id: 'saves',
                            title: 'Paraden',
                            accent: '#22DFC9',
                            icon: <Hand className="w-4 h-4" />,
                            preview: top ? `1. ${top.playerName} · ${top.values.save} Paraden` : undefined,
                            content: (
                              <StatTable
                                rows={saveRows}
                                cols={[
                                  { key: 'save', label: 'Paraden' },
                                  { key: 'top', label: 'Glanz\u00ADparaden' },
                                  { key: 'pos', label: 'Stand\u00ADparaden' },
                                ]}
                                defaultSort="save"
                                accent="#22DFC9"
                                teams={teams}
                                note="Glanzparaden zählen auch als Parade · Standparade = sicher gefangen, ohne Gefahr"
                                onSelect={onSelectTeam}
                              />
                            ),
                          },
                        ]
                      : [];
                    return [...glove, ...saves, ...rest];
                  })()}
                />
              </div>
            )}

          </div>
        </div>
      </motion.div>
    </ModalPortal>
  );
}

const fmtBoard = (board: KeeperBoard, v: number) =>
  board.percent ? `${Math.round(v * 100)}%` : board.decimals > 0 ? v.toFixed(board.decimals) : String(v);

function BoardRows({
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
  return (
    <div className="divide-y divide-white/[.06]">
      {board.rows.map((r, i) => (
        <div key={`${r.teamId}::${r.playerName}`} className="flex items-center gap-3 px-2 sm:px-3 py-2.5">
          <div className={`font-display font-black text-xl sm:text-2xl w-6 sm:w-7 text-center shrink-0 ${RANK_COLOR(i)}`}>{i + 1}</div>
          <div className="shrink-0">
            <PlayerCrest player={crestFor(r.teamId, r.playerName)} teams={teams} photoSize="sm" crestSize="md" onSelectTeam={onSelectTeam} />
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
          <div className="flex flex-col items-end shrink-0 pl-2 max-w-[84px]">
            <span className="font-display font-black text-xl sm:text-2xl leading-none text-brand-accent-light tabular-nums">{fmtBoard(board, r.value)}</span>
            {!!board.unit && (
              <span className="mt-0.5 font-sans font-bold text-[9px] uppercase tracking-wider text-hl-dim text-right leading-tight">{board.unit}</span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
