import React, { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, ArrowLeft, Shield, Share2 } from 'lucide-react';
import type { MatchPlayerStat, PlayerStat, ScoringConfig, Team } from '../types';
import { seasonRanking, scorerRanking, assistRanking } from '../lib/trackingAwards';
import { DEFAULT_SCORING } from '../lib/scoring';
import { cardForPlayer } from '../lib/playerCards';
import { normalizeCounts, sumCounts } from '../lib/rating';
import { TIER } from './FifaCard';
import { useBackClose } from '../lib/backStack';
import { useBackdropDismiss, ModalPortal, TeamCrest, monogram, readable } from './ui';
import { ShareSheet } from './ShareCard';

// ===========================================================================
// „Team-Steckbrief": dasselbe wie der Spieler-Steckbrief, nur für eine ganze
// Mannschaft – Platzierung, Bilanz, die besten Spieler des Teams und alle
// Ergebnisse, als teilbare Story-Karte mit Hero-League-Wasserzeichen.
// ===========================================================================

// Tabellenzeile eines Teams – bewusst als schlichte Werte übergeben, damit die
// Karte sowohl fürs Event als auch später für die Liga funktioniert.
export interface TeamRecord {
  rank: number;
  totalTeams: number;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  points: number;
}
export interface TeamResult {
  opponent: string;
  gf: number;
  ga: number;
}

interface Props {
  open: boolean;
  onClose: () => void;
  teams: Team[];
  players: PlayerStat[]; // für Fotos/Initialen der Spieler
  trackingRows: MatchPlayerStat[];
  recordFor: (teamId: string) => TeamRecord | null;
  resultsFor: (teamId: string) => TeamResult[];
  scoringConfig?: ScoringConfig;
  subtitle?: string; // z.B. „2. Testspieltag"
  // Liga: ganzer Kader auf der Karte (mit Kartenwert, Toren, Auszeichnungen)
  // plus Team-Werte aus dem Tracking; die Ergebnisliste wird zur Form-Leiste.
  showSquad?: boolean;
}

// Ein Spieler im Kader-Raster der Karte.
interface SquadMember {
  name: string;
  imageUrl?: string;
  goals: number;
  assists: number;
  ges: number | null; // Kartenwert (nur mit Tracking)
  tierAccent: string | null;
  keeper: boolean;
  badge: string; // ⚽ / 🅰 / ⭐ / 🧤 – Bester des Teams in dieser Kategorie
}
// Team-Werte aus den getrackten Aktionen aller Spieler.
interface TeamTotals {
  passQuote: number | null;
  duelQuote: number | null;
  shots: number;
  rating: number | null; // Ø Kartenwert der besten (bis zu 8) Spieler
}

export default function TeamSteckbrief({
  open,
  onClose,
  teams,
  players,
  trackingRows,
  recordFor,
  resultsFor,
  scoringConfig,
  subtitle,
  showSquad = false,
}: Props) {
  useBackClose(open, onClose);
  const backdrop = useBackdropDismiss(onClose);
  const cfg = scoringConfig ?? DEFAULT_SCORING;
  const [teamId, setTeamId] = useState<string | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  // Zurück-Geste geht erst eine Stufe zurück (Karte → Auswahl).
  useBackClose(open && teamId !== null, () => setTeamId(null));

  const team = teams.find((t) => t.id === teamId) ?? null;
  const record = teamId ? recordFor(teamId) : null;
  const results = teamId ? resultsFor(teamId) : [];

  // Die Besten DIESES Teams – dieselben Ranglisten wie auf der Seite, nur auf
  // die Zeilen dieses Teams eingegrenzt.
  const best = useMemo(() => {
    if (!teamId) return null;
    const rows = trackingRows.filter((r) => r.teamId === teamId);
    if (rows.length === 0) return null;
    const ranked = seasonRanking(rows, cfg);
    const keeper = ranked.find((p) => p.role === 'keeper') ?? null;
    const field = ranked.find((p) => p.role !== 'keeper') ?? null;
    return {
      scorer: scorerRanking(rows, cfg)[0] ?? null,
      assist: assistRanking(rows, cfg)[0] ?? null,
      player: field,
      keeper,
    };
  }, [teamId, trackingRows, cfg]);

  // Ganzer Kader mit Kartenwert – sortiert nach Kartenwert, dann Toren.
  const squad = useMemo<SquadMember[]>(() => {
    if (!showSquad || !teamId) return [];
    const b = best as { scorer: { playerName: string } | null; assist: { playerName: string } | null; player: { playerName: string } | null; keeper: { playerName: string } | null } | null;
    const badgeOf = (n: string) =>
      b?.scorer?.playerName === n ? '⚽' : b?.player?.playerName === n ? '⭐' : b?.keeper?.playerName === n ? '🧤' : b?.assist?.playerName === n ? '🅰' : '';
    return players
      .filter((p) => p.teamId === teamId)
      .map((p) => {
        const c = cardForPlayer(p.name, teamId, trackingRows, cfg);
        const t = c?.total;
        return {
          name: p.name,
          imageUrl: p.imageUrl,
          goals: Math.max(p.goals, t ? t.goal + t.penalty_goal : 0),
          assists: Math.max(p.assists, t ? t.assist : 0),
          ges: c ? c.card.ges : null,
          tierAccent: c ? TIER[c.card.tier].accent : null,
          keeper: c?.role === 'keeper' || (p.gamesInGoal > 0 && p.gamesInGoal >= p.matchesPlayed / 2),
          badge: badgeOf(p.name),
        };
      })
      .sort((x, y) => (y.ges ?? -1) - (x.ges ?? -1) || y.goals - x.goals || x.name.localeCompare(y.name));
  }, [showSquad, teamId, players, trackingRows, cfg, best]);

  const totals = useMemo<TeamTotals | null>(() => {
    if (!showSquad || !teamId) return null;
    const rows = trackingRows.filter((r) => r.teamId === teamId);
    if (rows.length === 0) return null;
    const t = sumCounts(rows.map((r) => normalizeCounts(r.counts)));
    const q = (a: number, b: number) => (a + b > 0 ? Math.round((a / (a + b)) * 100) : null);
    const ges = squad.map((m) => m.ges).filter((g): g is number => g !== null).slice(0, 8);
    return {
      passQuote: q(t.pass_ok, t.pass_fail),
      duelQuote: q(t.duel_won, t.duel_lost),
      shots: t.goal + t.shot_on + t.shot_miss + t.shot_blocked_off,
      rating: ges.length ? Math.round(ges.reduce((a, g) => a + g, 0) / ges.length) : null,
    };
  }, [showSquad, teamId, trackingRows, squad]);

  if (!open) return null;

  const accent = team?.logoColor ?? '#22DFC9';

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
                  onClick={() => setTeamId(null)}
                  aria-label="Zurück"
                  className="w-10 h-10 rounded-xl grid place-items-center bg-white/5 border border-white/10 text-hl-mute hover:text-white cursor-pointer shrink-0 active:scale-95 transition-transform"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
              ) : (
                <span className="w-10 h-10 rounded-xl grid place-items-center bg-brand-accent-light/15 text-brand-accent-light shrink-0">
                  <Shield className="w-5 h-5" />
                </span>
              )}
              <div className="min-w-0 flex-1">
                <h2 className="font-display font-black text-xl sm:text-3xl uppercase tracking-tight text-white leading-none truncate">
                  {team ? team.name : 'Team-Steckbrief'}
                </h2>
                <p className="font-sans text-[12px] text-hl-mute mt-1 truncate">{team ? subtitle ?? '' : 'Welches Team?'}</p>
              </div>
              <button
                onClick={onClose}
                aria-label="Schließen"
                className="w-10 h-10 rounded-xl grid place-items-center bg-white/5 border border-white/10 text-hl-mute hover:text-white cursor-pointer shrink-0 active:scale-95 transition-transform"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <AnimatePresence mode="wait" initial={false}>
              {!team ? (
                <motion.div key="pick" initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} transition={{ duration: 0.18 }}>
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
              ) : (
                <motion.div key="card" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 12 }} transition={{ duration: 0.2 }}>
                  <div className="mt-4 mx-auto w-full max-w-[340px]">
                    <div className="rounded-3xl overflow-hidden" style={{ boxShadow: '0 30px 70px -25px rgba(0,0,0,.9)' }}>
                      <TeamCard team={team} record={record} results={results} best={best} players={players} subtitle={subtitle} squad={showSquad ? squad : null} totals={totals} />
                    </div>
                    <button
                      onClick={() => setShareOpen(true)}
                      className="mt-4 w-full inline-flex items-center justify-center gap-2 rounded-2xl px-5 py-3.5 text-sm font-sans font-bold uppercase tracking-wider text-[#04120d] cursor-pointer transition-transform active:scale-95"
                      style={{ background: '#22DFC9' }}
                    >
                      <Share2 className="w-4 h-4" /> Speichern oder teilen
                    </button>
                    <button onClick={() => setTeamId(null)} className="mt-3 w-full text-center text-[12px] font-sans font-semibold text-hl-mute hover:text-white cursor-pointer py-2">
                      Anderes Team wählen
                    </button>
                  </div>
                  <ShareSheet
                    open={shareOpen}
                    onClose={() => setShareOpen(false)}
                    accent={accent}
                    filename={`hero-league-team-${team.name.replace(/\s+/g, '-').toLowerCase()}.png`}
                    shareText={`${team.name} – unser Hero League Steckbrief ⚽ hero-league.de`}
                  >
                    <TeamCard team={team} record={record} results={results} best={best} players={players} subtitle={subtitle} squad={showSquad ? squad : null} totals={totals} inFrame />
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

// Die eigentliche Karte. Inline-Styles (wie beim Spieler-Steckbrief), damit der
// Bild-Export exakt so aussieht wie die Vorschau.
function TeamCard({
  team,
  record,
  results,
  best,
  players,
  subtitle,
  squad = null,
  totals = null,
  inFrame = false,
}: {
  team: Team;
  record: TeamRecord | null;
  results: TeamResult[];
  best: { scorer: unknown; assist: unknown; player: unknown; keeper: unknown } | null;
  players: PlayerStat[];
  subtitle?: string;
  squad?: SquadMember[] | null; // gesetzt ⇒ Liga-Variante mit ganzem Kader
  totals?: TeamTotals | null;
  inFrame?: boolean;
}) {
  const accent = team.logoColor || '#22DFC9';
  const ink = readable(accent);
  const font = '"Saira", ui-sans-serif, system-ui, sans-serif';
  const display = '"Saira Condensed", "Saira", sans-serif';

  const diff = record ? record.goalsFor - record.goalsAgainst : 0;
  const stats = record
    ? [
        { v: String(record.played), l: 'SPIELE' },
        { v: String(record.goalsFor), l: 'TORE' },
        { v: String(record.goalsAgainst), l: 'GEGEN' },
        { v: `${diff > 0 ? '+' : ''}${diff}`, l: 'DIFF' },
      ]
    : [];

  const b = best as {
    scorer: { playerName: string; goals: number } | null;
    assist: { playerName: string; assists: number } | null;
    player: { playerName: string; score: number } | null;
    keeper: { playerName: string; total: { save: number } } | null;
  } | null;
  const bestRows: { icon: string; label: string; name: string; value: string }[] = [];
  if (b?.scorer) bestRows.push({ icon: '⚽', label: 'Torschütze', name: b.scorer.playerName, value: String(b.scorer.goals) });
  if (b?.assist) bestRows.push({ icon: '🅰', label: 'Vorlagen', name: b.assist.playerName, value: String(b.assist.assists) });
  if (b?.player) bestRows.push({ icon: '⭐', label: 'Bester Spieler', name: b.player.playerName, value: b.player.score.toFixed(1) });
  if (b?.keeper) bestRows.push({ icon: '🧤', label: 'Torwart', name: b.keeper.playerName, value: `${b.keeper.total.save} Par.` });

  const photoOf = (name: string) => players.find((p) => p.teamId === team.id && p.name === name)?.imageUrl;

  const body = (
    <div style={{ fontFamily: font, color: '#fff' }}>
      {/* Kopf: Wappen + Name */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <div
          style={{
            width: 72, height: 72, borderRadius: 20, overflow: 'hidden', flexShrink: 0,
            border: `2px solid ${accent}`, background: `${accent}26`,
            display: 'grid', placeItems: 'center', fontFamily: display, fontWeight: 900, fontSize: 26, color: ink,
          }}
        >
          {team.logoUrl ? (
            <img src={team.logoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }} />
          ) : (
            team.shortName || monogram(team.name)
          )}
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontFamily: display, fontWeight: 900, textTransform: 'uppercase', fontSize: 25, lineHeight: 0.92, letterSpacing: '-0.01em' }}>
            {team.name}
          </div>
          {subtitle && (
            <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: ink, marginTop: 6 }}>
              {subtitle}
            </div>
          )}
        </div>
        {totals?.rating != null && (
          <div style={{ textAlign: 'center', flexShrink: 0 }}>
            <div style={{ fontFamily: display, fontWeight: 900, fontSize: 38, lineHeight: 0.9, color: ink }}>{totals.rating}</div>
            <div style={{ fontFamily: display, fontWeight: 900, fontSize: 8.5, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(255,255,255,.6)', marginTop: 3 }}>Teamwert</div>
          </div>
        )}
      </div>

      {/* Platzierung */}
      {record && (
        <div
          style={{
            marginTop: 14, borderRadius: 14, padding: '10px 14px',
            background: `${accent}1f`, border: `1px solid ${accent}4d`,
            display: 'flex', alignItems: 'baseline', gap: 10,
          }}
        >
          <span style={{ fontFamily: display, fontWeight: 900, fontSize: 34, lineHeight: 1, color: ink }}>#{record.rank}</span>
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,.65)' }}>von {record.totalTeams}</span>
          <span style={{ marginLeft: 'auto', textAlign: 'right' }}>
            <span style={{ fontFamily: display, fontWeight: 900, fontSize: 26, lineHeight: 1 }}>{record.points}</span>
            <span style={{ fontSize: 10, letterSpacing: '0.12em', color: 'rgba(255,255,255,.55)', marginLeft: 5 }}>PUNKTE</span>
          </span>
        </div>
      )}

      {/* Kennzahlen */}
      {stats.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginTop: 8 }}>
          {stats.map((s) => (
            <div key={s.l} style={{ textAlign: 'center', background: 'rgba(255,255,255,.06)', borderRadius: 10, padding: '7px 0 6px' }}>
              <div style={{ fontFamily: display, fontWeight: 900, fontSize: 19, lineHeight: 1 }}>{s.v}</div>
              <div style={{ fontSize: 8.5, letterSpacing: '0.12em', color: 'rgba(255,255,255,.55)', marginTop: 3 }}>{s.l}</div>
            </div>
          ))}
        </div>
      )}
      {record && !squad && (
        <div style={{ marginTop: 7, fontSize: 12, color: 'rgba(255,255,255,.6)', textAlign: 'center' }}>
          <b style={{ color: '#5CFFAE' }}>{record.won}S</b> · <b style={{ color: '#F0CE77' }}>{record.drawn}U</b> ·{' '}
          <b style={{ color: '#FF8A7A' }}>{record.lost}N</b>
        </div>
      )}
      {record && squad && (
        <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,.6)', whiteSpace: 'nowrap' }}>
            <b style={{ color: '#5CFFAE' }}>{record.won}S</b> · <b style={{ color: '#F0CE77' }}>{record.drawn}U</b> · <b style={{ color: '#FF8A7A' }}>{record.lost}N</b>
          </span>
          {results.length > 0 && (
            <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 3 }}>
              <span style={{ fontSize: 8.5, letterSpacing: '0.14em', color: 'rgba(255,255,255,.5)', marginRight: 3 }}>FORM</span>
              {results.slice(-5).map((r, i) => {
                const col = r.gf > r.ga ? '#5CFFAE' : r.gf === r.ga ? '#F0CE77' : '#FF8A7A';
                return (
                  <span key={i} style={{ width: 17, height: 17, borderRadius: 5, background: `${col}2b`, color: col, fontSize: 9, fontWeight: 900, display: 'grid', placeItems: 'center' }}>
                    {r.gf > r.ga ? 'S' : r.gf === r.ga ? 'U' : 'N'}
                  </span>
                );
              })}
            </span>
          )}
        </div>
      )}
      {/* Team-Werte aus dem Tracking */}
      {squad && totals && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginTop: 8 }}>
          {[
            { v: totals.passQuote == null ? '–' : `${totals.passQuote}%`, l: 'PÄSSE' },
            { v: totals.duelQuote == null ? '–' : `${totals.duelQuote}%`, l: 'ZWEIKÄMPFE' },
            { v: String(totals.shots), l: 'SCHÜSSE' },
            { v: String(results.filter((r) => r.ga === 0).length), l: 'ZU NULL' },
          ].map((s) => (
            <div key={s.l} style={{ textAlign: 'center', border: '1px solid rgba(255,255,255,.1)', borderRadius: 10, padding: '6px 0 5px' }}>
              <div style={{ fontFamily: display, fontWeight: 900, fontSize: 17, lineHeight: 1, color: ink }}>{s.v}</div>
              <div style={{ fontSize: 7.5, letterSpacing: '0.1em', color: 'rgba(255,255,255,.55)', marginTop: 3 }}>{s.l}</div>
            </div>
          ))}
        </div>
      )}

      {/* Der ganze Kader */}
      {squad && squad.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', marginBottom: 7 }}>
            <span style={{ fontFamily: display, fontWeight: 900, fontSize: 11, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(255,255,255,.6)' }}>Der Kader</span>
            <span style={{ marginLeft: 'auto', fontSize: 10, color: 'rgba(255,255,255,.45)' }}>{squad.length} Spieler</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${squad.length > 8 ? 5 : 4}, 1fr)`, gap: 5 }}>
            {squad.map((m) => {
              const parts = m.name.trim().split(/\s+/);
              const last = parts.length > 1 ? parts[parts.length - 1] : m.name;
              const first = parts.length > 1 ? parts.slice(0, -1).join(' ') : '';
              const size = squad.length > 8 ? 36 : 42;
              return (
                <div key={m.name} style={{ position: 'relative', textAlign: 'center', background: 'rgba(255,255,255,.05)', borderRadius: 10, padding: '6px 2px 5px', minWidth: 0 }}>
                  <div style={{ position: 'relative', width: size, height: size, margin: '0 auto' }}>
                    <div
                      style={{
                        width: size, height: size, borderRadius: 12, overflow: 'hidden',
                        border: `1.5px solid ${m.tierAccent ?? `${accent}80`}`, background: `${accent}26`,
                        display: 'grid', placeItems: 'center', fontFamily: display, fontWeight: 900, fontSize: size * 0.36, color: ink,
                      }}
                    >
                      {m.imageUrl ? <img src={m.imageUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} /> : monogram(m.name)}
                    </div>
                    {m.ges !== null && (
                      <span
                        style={{
                          position: 'absolute', left: -4, bottom: -4, minWidth: 19, height: 15, padding: '0 3px', borderRadius: 6,
                          background: '#05090b', border: `1px solid ${m.tierAccent}`, color: m.tierAccent ?? '#fff',
                          fontFamily: display, fontWeight: 900, fontSize: 10, lineHeight: '13px', textAlign: 'center',
                        }}
                      >
                        {m.ges}
                      </span>
                    )}
                    {m.badge && <span style={{ position: 'absolute', right: -5, top: -5, fontSize: 11, lineHeight: 1 }}>{m.badge}</span>}
                  </div>
                  {first && <div style={{ marginTop: 5, fontSize: 7.5, color: 'rgba(255,255,255,.55)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: 1.1 }}>{first}</div>}
                  <div style={{ marginTop: first ? 0 : 5, fontFamily: display, fontWeight: 900, textTransform: 'uppercase', fontSize: 10, lineHeight: 1.1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{last}</div>
                  <div style={{ marginTop: 2, fontSize: 8, color: 'rgba(255,255,255,.6)', whiteSpace: 'nowrap' }}>
                    {m.keeper ? 'TW' : `${m.goals}T · ${m.assists}V`}
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{ marginTop: 7, fontSize: 8.5, color: 'rgba(255,255,255,.45)', textAlign: 'center' }}>
            ⚽ Top-Torschütze · ⭐ Bester Spieler · 🧤 Bester Torwart · 🅰 Top-Vorlagen
          </div>
        </div>
      )}

      {/* Die Besten des Teams */}
      {!squad && bestRows.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <div style={{ fontFamily: display, fontWeight: 900, fontSize: 11, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(255,255,255,.6)', marginBottom: 6 }}>
            Unsere Besten
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {bestRows.map((r) => {
              const photo = photoOf(r.name);
              return (
                <div key={r.label} style={{ display: 'flex', alignItems: 'center', gap: 9, background: 'rgba(255,255,255,.05)', borderRadius: 10, padding: '6px 10px' }}>
                  {photo ? (
                    <img src={photo} alt="" style={{ width: 26, height: 26, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }} />
                  ) : (
                    <span style={{ width: 26, height: 26, flexShrink: 0, display: 'grid', placeItems: 'center', fontSize: 13 }}>{r.icon}</span>
                  )}
                  <span style={{ minWidth: 0, flex: 1 }}>
                    <span style={{ display: 'block', fontSize: 12.5, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.name}</span>
                    <span style={{ display: 'block', fontSize: 9.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,.5)' }}>{r.label}</span>
                  </span>
                  <span style={{ fontFamily: display, fontWeight: 900, fontSize: 15, flexShrink: 0 }}>{r.value}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Ergebnisse */}
      {!squad && results.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <div style={{ fontFamily: display, fontWeight: 900, fontSize: 11, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(255,255,255,.6)', marginBottom: 6 }}>
            Ergebnisse
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {results.slice(0, 6).map((r, i) => {
              const win = r.gf > r.ga;
              const draw = r.gf === r.ga;
              const col = win ? '#5CFFAE' : draw ? '#F0CE77' : '#FF8A7A';
              return (
                <div key={`${r.opponent}-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                  <span style={{ width: 16, height: 16, flexShrink: 0, borderRadius: 5, background: `${col}26`, color: col, fontSize: 9, fontWeight: 900, display: 'grid', placeItems: 'center' }}>
                    {win ? 'S' : draw ? 'U' : 'N'}
                  </span>
                  <span style={{ flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: 'rgba(255,255,255,.8)' }}>{r.opponent}</span>
                  <span style={{ fontFamily: display, fontWeight: 900, fontSize: 14, flexShrink: 0, color: col }}>
                    {r.gf}:{r.ga}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
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
