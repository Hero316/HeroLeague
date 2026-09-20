import React, { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, ArrowLeft, ChevronRight, IdCard, Share2 } from 'lucide-react';
import type { MatchPlayerStat, PlayerStat, ScoringConfig, Team } from '../types';
import { cardForPlayer } from '../lib/playerCards';
import { playerPlacements } from '../lib/trackingAwards';
import { DEFAULT_SCORING } from '../lib/scoring';
import { useBackClose } from '../lib/backStack';
import { useBackdropDismiss, ModalPortal, TeamCrest, monogram, readable } from './ui';
import { ShareSheet } from './ShareCard';
import { TIER } from './FifaCard';

// ===========================================================================
// „Mein Steckbrief": Team wählen → Spieler wählen → eine Story-Karte (9:16)
// mit Foto, Kartenwerten, Kennzahlen und allen Top-10-Platzierungen – mit
// Hero-League-Wasserzeichen, zum Speichern oder direkt in die Story teilen.
// Alles kommt aus denselben getrackten Daten wie Karte und Bestenlisten.
// ===========================================================================

interface Props {
  open: boolean;
  onClose: () => void;
  players: PlayerStat[];
  teams: Team[];
  trackingRows: MatchPlayerStat[];
  scoringConfig?: ScoringConfig;
  seasonLabel?: string;
}

export default function PlayerSteckbrief({ open, onClose, players, teams, trackingRows, scoringConfig, seasonLabel }: Props) {
  useBackClose(open, onClose);
  const backdrop = useBackdropDismiss(onClose);
  const cfg = scoringConfig ?? DEFAULT_SCORING;
  const [teamId, setTeamId] = useState<string | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  // Zurück-Geste geht eine Stufe zurück (Spieler → Team), nicht gleich raus.
  useBackClose(open && teamId !== null && playerId === null, () => setTeamId(null));
  useBackClose(open && playerId !== null, () => setPlayerId(null));

  const team = teams.find((t) => t.id === teamId) ?? null;
  const roster = useMemo(
    () => players.filter((p) => p.teamId === teamId).sort((a, b) => a.name.localeCompare(b.name)),
    [players, teamId]
  );
  const player = players.find((p) => p.id === playerId) ?? null;

  const card = useMemo(
    () => (player ? cardForPlayer(player.name, player.teamId, trackingRows, cfg) : null),
    [player, trackingRows, cfg]
  );
  const placements = useMemo(
    () => (player ? playerPlacements(trackingRows, cfg, player.teamId, player.name) : []),
    [player, trackingRows, cfg]
  );

  const accent = team?.logoColor ?? '#22DFC9';
  const reset = () => {
    setTeamId(null);
    setPlayerId(null);
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
          <div className="max-w-2xl mx-auto px-4 sm:px-8">
            <div
              className="sticky top-0 z-10 -mx-4 sm:-mx-8 px-4 sm:px-8 pb-3 bg-[#05100e]/95 backdrop-blur-md flex items-center gap-3"
              style={{ paddingTop: 'calc(env(safe-area-inset-top) + 0.75rem)' }}
            >
              {teamId ? (
                <button
                  onClick={() => (playerId ? setPlayerId(null) : setTeamId(null))}
                  className="w-10 h-10 rounded-xl grid place-items-center bg-white/5 border border-white/10 text-hl-mute hover:text-white cursor-pointer shrink-0 active:scale-95 transition-transform"
                  aria-label="Zurück"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
              ) : (
                <span className="w-10 h-10 rounded-xl grid place-items-center bg-brand-accent-light/15 text-brand-accent-light shrink-0">
                  <IdCard className="w-5 h-5" />
                </span>
              )}
              <div className="min-w-0 flex-1">
                <h2 className="font-display font-black text-xl sm:text-3xl uppercase tracking-tight text-white leading-none truncate">
                  {player ? player.name : team ? team.name : 'Mein Steckbrief'}
                </h2>
                <p className="font-sans text-[12px] text-hl-mute mt-1 truncate">
                  {player ? 'Dein Steckbrief' : team ? 'Wer bist du?' : 'Dein Team'}
                </p>
              </div>
              <button
                onClick={onClose}
                className="w-10 h-10 rounded-xl grid place-items-center bg-white/5 border border-white/10 text-hl-mute hover:text-white cursor-pointer shrink-0 active:scale-95 transition-transform"
                aria-label="Schließen"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <AnimatePresence mode="wait" initial={false}>
              {!teamId ? (
                <motion.div key="teams" initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} transition={{ duration: 0.18 }}>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 mt-4">
                    {teams.map((t) => (
                      <button
                        key={t.id}
                        onClick={() => setTeamId(t.id)}
                        className="hl-card rounded-2xl p-3.5 flex flex-col items-center gap-2.5 text-center cursor-pointer transition-transform active:scale-[.97] hover:border-white/20"
                      >
                        <TeamCrest name={t.name} shortName={t.shortName} color={t.logoColor} logoUrl={t.logoUrl} size="lg" />
                        <span className="font-display font-bold text-sm uppercase tracking-tight text-white leading-tight line-clamp-2">{t.name}</span>
                      </button>
                    ))}
                  </div>
                </motion.div>
              ) : !player ? (
                <motion.div key="players" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} transition={{ duration: 0.18 }}>
                  <div className="mt-4 rounded-2xl border border-white/10 bg-white/[.02] divide-y divide-white/[.06] overflow-hidden">
                    {roster.length === 0 && <p className="text-center text-sm text-hl-mute font-sans py-10">Noch keine Spieler in diesem Team.</p>}
                    {roster.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => setPlayerId(p.id)}
                        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/[.04] cursor-pointer"
                      >
                        <Avatar p={p} color={accent} size={40} />
                        <span className="min-w-0 flex-1 font-sans font-bold text-[15px] text-white truncate">{p.name}</span>
                        <ChevronRight className="w-4 h-4 text-hl-faint shrink-0" />
                      </button>
                    ))}
                  </div>
                </motion.div>
              ) : (
                <motion.div key="card" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 12 }} transition={{ duration: 0.2 }}>
                  <div className="mt-4 mx-auto w-full max-w-[340px]">
                    <div className="rounded-3xl overflow-hidden" style={{ boxShadow: '0 30px 70px -25px rgba(0,0,0,.9)' }}>
                      <Steckbrief player={player} team={team} card={card} placements={placements} seasonLabel={seasonLabel} />
                    </div>
                    <button
                      onClick={() => setShareOpen(true)}
                      className="mt-4 w-full inline-flex items-center justify-center gap-2 rounded-2xl px-5 py-3.5 text-sm font-sans font-bold uppercase tracking-wider text-[#04120d] cursor-pointer transition-transform active:scale-95"
                      style={{ background: '#22DFC9' }}
                    >
                      <Share2 className="w-4 h-4" /> Speichern oder teilen
                    </button>
                    <button onClick={reset} className="mt-3 w-full text-center text-[12px] font-sans font-semibold text-hl-mute hover:text-white cursor-pointer py-2">
                      Anderen Spieler wählen
                    </button>
                  </div>
                  <ShareSheet
                    open={shareOpen}
                    onClose={() => setShareOpen(false)}
                    accent={accent}
                    filename={`hero-league-steckbrief-${player.name.replace(/\s+/g, '-').toLowerCase()}.png`}
                    shareText={`${player.name} · ${player.teamName} – mein Hero League Steckbrief ⚽ hero-league.de`}
                  >
                    <Steckbrief player={player} team={team} card={card} placements={placements} seasonLabel={seasonLabel} inFrame />
                  </ShareSheet>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </motion.div>
    </ModalPortal>
  );
}

function Avatar({ p, color, size }: { p: PlayerStat; color: string; size: number }) {
  return p.imageUrl ? (
    <img src={p.imageUrl} alt="" className="rounded-full object-cover shrink-0 border" style={{ width: size, height: size, borderColor: `${color}80` }} />
  ) : (
    <span
      className="rounded-full grid place-items-center font-display font-black shrink-0"
      style={{ width: size, height: size, background: `${color}26`, color: readable(color), fontSize: size * 0.38 }}
    >
      {monogram(p.name)}
    </span>
  );
}

// Der eigentliche Steckbrief. Inline-Styles (keine Tailwind-Klassen mit
// backdrop-filter o.ä.), damit der Bild-Export sauber und identisch aussieht.
// inFrame=true ⇒ liegt im ShareCardFrame (der bringt Hintergrund + Wasserzeichen
// mit), sonst zeigen wir denselben Inhalt mit eigenem Hintergrund als Vorschau.
function Steckbrief({
  player,
  team,
  card,
  placements,
  seasonLabel,
  inFrame = false,
}: {
  player: PlayerStat;
  team: Team | null;
  card: ReturnType<typeof cardForPlayer>;
  placements: ReturnType<typeof playerPlacements>;
  seasonLabel?: string;
  inFrame?: boolean;
}) {
  const accent = team?.logoColor ?? '#22DFC9';
  // Für Schrift die lesbare Variante – Tints/Rahmen behalten die echte Farbe.
  const ink = readable(accent);
  const tier = card ? TIER[card.card.tier] : null;
  const keeper = card?.role === 'keeper';
  const games = keeper ? player.gamesInGoal || player.matchesPlayed : player.matchesPlayed;
  const winRate = player.matchesPlayed > 0 ? Math.round((player.wins / player.matchesPlayed) * 100) : null;
  const stats: { v: string; l: string }[] = keeper
    ? [
        { v: String(games), l: 'IM TOR' },
        { v: String(player.cleanSheets), l: 'ZU NULL' },
        { v: String(player.goalsConceded), l: 'GEGENTORE' },
        { v: winRate == null ? '–' : `${winRate}%`, l: 'SIEGE' },
      ]
    : [
        { v: String(player.matchesPlayed), l: 'SPIELE' },
        { v: String(player.goals), l: 'TORE' },
        { v: String(player.assists), l: 'VORLAGEN' },
        { v: winRate == null ? '–' : `${winRate}%`, l: 'SIEGE' },
      ];
  const top = placements.slice(0, 5);
  const font = '"Saira", ui-sans-serif, system-ui, sans-serif';
  const display = '"Saira Condensed", "Saira", sans-serif';

  const body = (
    <div style={{ fontFamily: font, color: '#fff' }}>
      {/* Kopf: Foto + Name */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <div
          style={{
            width: 76, height: 76, borderRadius: 22, overflow: 'hidden', flexShrink: 0,
            border: `2px solid ${accent}`, background: `${accent}26`,
            display: 'grid', placeItems: 'center', fontFamily: display, fontWeight: 900, fontSize: 30, color: ink,
          }}
        >
          {player.imageUrl ? <img src={player.imageUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} /> : monogram(player.name)}
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontFamily: display, fontWeight: 900, textTransform: 'uppercase', fontSize: 26, lineHeight: 0.92, letterSpacing: '-0.01em' }}>{player.name}</div>
          <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: ink, marginTop: 6 }}>
            {player.teamName}
            {seasonLabel ? ` · ${seasonLabel}` : ''}
          </div>
        </div>
        {card && tier && (
          <div style={{ textAlign: 'center', flexShrink: 0 }}>
            <div style={{ fontFamily: display, fontWeight: 900, fontSize: 40, lineHeight: 0.9, color: tier.accent }}>{card.card.ges}</div>
            <div style={{ fontFamily: display, fontWeight: 900, fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase', color: tier.accent, marginTop: 3 }}>{tier.label}</div>
          </div>
        )}
      </div>

      {/* Kartenwerte */}
      {card && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginTop: 14 }}>
          {card.card.attrs.map((a) => (
            <div key={a.key} style={{ textAlign: 'center', background: 'rgba(255,255,255,.06)', borderRadius: 10, padding: '7px 0 6px' }}>
              <div style={{ fontFamily: display, fontWeight: 900, fontSize: 20, lineHeight: 1 }}>{a.value}</div>
              <div style={{ fontSize: 9, letterSpacing: '0.14em', color: 'rgba(255,255,255,.55)', marginTop: 3 }}>{a.key}</div>
            </div>
          ))}
        </div>
      )}

      {/* Kennzahlen */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginTop: 8 }}>
        {stats.map((s) => (
          <div key={s.l} style={{ textAlign: 'center', border: '1px solid rgba(255,255,255,.1)', borderRadius: 10, padding: '7px 0 6px' }}>
            <div style={{ fontFamily: display, fontWeight: 900, fontSize: 18, lineHeight: 1, color: ink }}>{s.v}</div>
            <div style={{ fontSize: 8.5, letterSpacing: '0.12em', color: 'rgba(255,255,255,.55)', marginTop: 3 }}>{s.l}</div>
          </div>
        ))}
      </div>

      {/* Platzierungen */}
      <div style={{ marginTop: 14 }}>
        <div style={{ fontFamily: display, fontWeight: 900, fontSize: 11, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(255,255,255,.6)', marginBottom: 6 }}>
          Meine Platzierungen
        </div>
        {top.length === 0 ? (
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,.5)' }}>Noch keine Top-10-Platzierung – nächster Spieltag!</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {top.map((p) => {
              const gold = p.rank === 1 ? '#E9C46A' : p.rank === 2 ? '#C7D0DA' : p.rank === 3 ? '#E0A46B' : 'rgba(255,255,255,.7)';
              return (
                <div key={p.label} style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(255,255,255,.05)', borderRadius: 10, padding: '7px 10px' }}>
                  <span style={{ fontFamily: display, fontWeight: 900, fontSize: 18, lineHeight: 1, color: gold, width: 34, flexShrink: 0 }}>#{p.rank}</span>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.label}</span>
                  <span style={{ fontFamily: display, fontWeight: 900, fontSize: 15, flexShrink: 0 }}>{p.value}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );

  if (inFrame) return body;
  return (
    <div
      style={{
        padding: '22px 20px 26px',
        background: `radial-gradient(120% 80% at 50% 0%, ${accent}22 0%, transparent 55%), linear-gradient(180deg, #0a1512 0%, #060b0d 55%, #04070a 100%)`,
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 24,
      }}
    >
      {body}
      <div style={{ marginTop: 18, display: 'flex', alignItems: 'center', gap: 10 }}>
        <img src="/assets/hero-league-logo.png" alt="Hero League" style={{ height: 30, width: 'auto', display: 'block' }} />
        <span style={{ fontFamily: display, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.14em', fontSize: 11, color: 'rgba(255,255,255,.6)' }}>heroleague.de</span>
      </div>
    </div>
  );
}
