import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowLeft, ChevronRight, IdCard } from 'lucide-react';
import type { ActionCounts, Match, MatchPlayerStat, ScoringConfig, Team } from '../types';
import { notesForMatch, type MatchNoteEntry } from '../lib/trackingView';
import { ACTION_META, type ActionTone } from '../lib/scoring';
import { sumCounts, gesamtschuesse, passversuche } from '../lib/rating';
import { ImageZoom } from './ui';
import { useBackClose, goBackLayer } from '../lib/backStack';

// ===========================================================================
// Spielbericht: Ergebnis + Einzelnoten aller Spieler beider Teams für EIN Spiel.
// Klick auf einen Spieler öffnet OBEN – mit Wisch-Animation – seine Einzel-
// wertung für GENAU dieses Spiel (Bild + erfasste Aktionen), damit die Spieler
// sehen, wie sie individuell gespielt haben. Von dort optional zur Saison-Karte.
// ===========================================================================

interface Props {
  match: Match;
  teams: Team[];
  rows: MatchPlayerStat[];
  cfg: ScoringConfig;
  onBack: () => void;
  onSelectPlayer: (teamId: string, name: string) => void;
  onSelectTeam?: (teamId: string) => void;
}

function noteColor(note: number, cfg: ScoringConfig): string {
  const span = cfg.rating.max - cfg.rating.min || 1;
  const t = Math.max(0, Math.min(1, (note - cfg.rating.min) / span));
  if (t < 0.5) return '#FF5442';
  if (t < 0.7) return '#E9C46A';
  return '#43E5A0';
}

function toneColor(tone: ActionTone): string {
  switch (tone) {
    case 'positive':
      return '#43E5A0';
    case 'negative':
      return '#FF5442';
    case 'special':
      return '#E9C46A';
    case 'goal':
      return '#84cc16';
    default:
      return '#c3ccc4';
  }
}

export default function SpielberichtPage({ match, teams, rows, cfg, onBack, onSelectPlayer, onSelectTeam }: Props) {
  const home = teams.find((t) => t.id === match.homeTeamId);
  const away = teams.find((t) => t.id === match.awayTeamId);
  const entries = useMemo(() => notesForMatch(rows, cfg, match.id), [rows, cfg, match.id]);

  // Aktuell aufgeklappte Einzelwertung (in-page, kein Seitenwechsel).
  const [openKey, setOpenKey] = useState<string | null>(null);
  const selected = useMemo(
    () => entries.find((e) => `${e.teamId}::${e.playerName}` === openKey) ?? null,
    [entries, openKey]
  );

  // Handy-Zurück (Geste/Taste) schließt zuerst die geöffnete Einzelwertung,
  // statt gleich die ganze Spielseite zu verlassen.
  useBackClose(selected !== null, () => setOpenKey(null));

  const photoFor = (teamId: string, name: string) =>
    teams.find((t) => t.id === teamId)?.spielerliste?.find((p) => p.name === name)?.imageUrl;

  const teamEntries = (teamId: string) => entries.filter((e) => e.teamId === teamId);
  const hasData = entries.length > 0;

  // Team-Aggregate aus den Einzelspieler-Daten (nur getrackte Spieler dieses Spiels).
  const aggFor = (teamId: string): TeamAgg => {
    const es = entries.filter((e) => e.teamId === teamId);
    const c = sumCounts(es.map((e) => e.counts as ActionCounts));
    const passAtt = passversuche(c);
    const duels = c.duel_won + c.duel_lost;
    return {
      shots: gesamtschuesse(c),
      shotsOn: c.shot_on + c.goal,
      assists: c.assist,
      passPct: passAtt > 0 ? Math.round((100 * c.pass_ok) / passAtt) : null,
      duelWon: c.duel_won,
      duelPct: duels > 0 ? Math.round((100 * c.duel_won) / duels) : null,
      dribbles: c.dribble_won,
      interceptions: c.interception,
      turnovers: c.turnover,
      saves: c.save,
      avgNote: es.length ? es.reduce((s, e) => s + e.note, 0) / es.length : null,
    };
  };
  const homeAgg = useMemo(() => aggFor(match.homeTeamId), [entries, match.homeTeamId]); // eslint-disable-line react-hooks/exhaustive-deps
  const awayAgg = useMemo(() => aggFor(match.awayTeamId), [entries, match.awayTeamId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Detail taucht smooth zwischen Team-Statistik und Notenliste auf; sanft dorthin scrollen.
  const detailRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (openKey && detailRef.current) {
      try {
        detailRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } catch {
        /* egal */
      }
    }
  }, [openKey]);

  const open = (teamId: string, name: string) => setOpenKey(`${teamId}::${name}`);

  return (
    <div className="max-w-4xl xl:max-w-[1200px] 2xl:max-w-[1360px] mx-auto px-4 py-8">
      <button
        onClick={onBack}
        className="mb-6 text-xs font-bold uppercase tracking-wider text-hl-mute hover:text-white flex items-center gap-1.5 cursor-pointer"
      >
        <ArrowLeft className="w-4 h-4" /> Zurück
      </button>

      {/* Ergebnis-Kopf UND Team-Statistiken in EINEM Block – die Wappen stehen nur
          einmal (außen), darunter direkt die Statistik. */}
      <div className="hl-card p-4 sm:p-6 lg:p-8 mb-6">
        <div className={`flex items-center justify-center gap-2 sm:gap-6 lg:gap-10 ${hasData ? 'pb-5 lg:pb-7 mb-5 lg:mb-7 border-b border-white/[.07]' : ''}`}>
          <TeamHead team={home} onSelect={onSelectTeam} />
          <div className="text-center shrink-0 px-1">
            <div className="font-display font-black text-3xl sm:text-4xl lg:text-5xl tabular-nums leading-none">
              {match.homeScore ?? '–'}<span className="text-hl-faint mx-0.5 sm:mx-1">:</span>{match.awayScore ?? '–'}
            </div>
            <div className="text-[9px] sm:text-[10px] lg:text-[11px] uppercase tracking-[2px] text-hl-dim mt-1 whitespace-nowrap">Spieltag {match.matchday}</div>
          </div>
          <TeamHead team={away} onSelect={onSelectTeam} />
        </div>
        {hasData && <TeamCompare home={home} away={away} homeAgg={homeAgg} awayAgg={awayAgg} />}
      </div>

      {/* Angeklickter Spieler taucht smooth darunter auf – die Notenliste rutscht runter.
          AnimatePresence animiert AUCH das Schließen und den Wechsel auf einen anderen Spieler. */}
      <div ref={detailRef}>
        <AnimatePresence initial={false} mode="wait">
          {selected && (
            <motion.div
              key={openKey ?? ''}
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3, ease: [0.22, 0.61, 0.36, 1] }}
              style={{ overflow: 'hidden' }}
            >
              <PlayerMatchDetail
                entry={selected}
                cfg={cfg}
                photo={photoFor(selected.teamId, selected.playerName)}
                homeName={home?.name ?? '—'}
                awayName={away?.name ?? '—'}
                onClose={goBackLayer}
                onOpenCard={() => onSelectPlayer(selected.teamId, selected.playerName)}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {!hasData ? (
        <div className="hl-card p-8 text-center text-hl-mute">Für dieses Spiel sind noch keine Werte veröffentlicht.</div>
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          {[match.homeTeamId, match.awayTeamId].map((teamId) => (
            <div key={teamId} className="min-w-0">
              <div className="text-[11px] uppercase tracking-[2px] text-hl-dim mb-2 px-1 truncate">
                {teams.find((t) => t.id === teamId)?.name ?? teamId}
              </div>
              <div className="hl-card divide-y divide-white/[.06] overflow-hidden">
                {teamEntries(teamId).map((e) => {
                  const photo = photoFor(e.teamId, e.playerName);
                  const isOpen = openKey === `${e.teamId}::${e.playerName}`;
                  return (
                    <button
                      key={e.playerName}
                      onClick={() => open(e.teamId, e.playerName)}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors cursor-pointer min-w-0 ${
                        isOpen ? 'bg-brand-accent/10' : 'hover:bg-white/[.03]'
                      }`}
                    >
                      {photo ? (
                        <img src={photo} alt="" className="w-9 h-9 rounded-full object-cover shrink-0" />
                      ) : (
                        <div className="w-9 h-9 rounded-full bg-white/5 grid place-items-center text-xs text-hl-faint shrink-0">
                          {e.playerName.charAt(0)}
                        </div>
                      )}
                      <span className="flex-1 min-w-0 truncate font-semibold text-sm">
                        {e.playerName}
                        {e.role === 'keeper' && <span className="ml-1.5 text-[9px] uppercase tracking-wider text-hl-gold">TW</span>}
                      </span>
                      <span className="font-display font-black tabular-nums text-lg lg:text-xl" style={{ color: noteColor(e.note, cfg) }}>
                        {e.note.toFixed(1)}
                      </span>
                      <ChevronRight className={`w-4 h-4 shrink-0 transition-colors ${isOpen ? 'text-brand-accent-light' : 'text-hl-faint'}`} />
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Einzelwertung eines Spielers für DIESES Spiel: Bild, kurze Überschrift, Note
// und die erfassten Aktionen (nur, was wirklich passiert ist).
function PlayerMatchDetail({
  entry,
  cfg,
  photo,
  homeName,
  awayName,
  onClose,
  onOpenCard,
}: {
  entry: MatchNoteEntry;
  cfg: ScoringConfig;
  photo?: string;
  homeName: string;
  awayName: string;
  onClose: () => void;
  onOpenCard: () => void;
}) {
  const isKeeper = entry.role === 'keeper';
  const chips = useMemo(() => {
    const c = entry.counts as ActionCounts;
    return ACTION_META.filter((a) => (c[a.key] || 0) > 0).map((a) => ({
      key: a.key,
      icon: a.icon,
      label: a.label,
      value: c[a.key] || 0,
      color: toneColor(a.tone),
    }));
  }, [entry.counts]);

  return (
    <div className="hl-card p-5 mb-6">
      <button
        onClick={onClose}
        className="mb-4 text-[11px] font-bold uppercase tracking-wider text-hl-mute hover:text-white flex items-center gap-1.5 cursor-pointer"
      >
        <ArrowLeft className="w-3.5 h-3.5" /> Schließen
      </button>

      <div className="flex items-center gap-4 min-w-0">
        {photo ? (
          <ImageZoom
            src={photo}
            alt={entry.playerName}
            className="w-20 h-20 lg:w-24 lg:h-24 rounded-2xl object-cover shrink-0 border border-white/10"
            zoomClassName="w-72 sm:w-96 max-w-[85vw] max-h-[80vh] object-contain"
          />
        ) : (
          <div className="w-20 h-20 lg:w-24 lg:h-24 rounded-2xl bg-white/5 grid place-items-center text-2xl font-black text-hl-faint shrink-0">
            {entry.playerName.charAt(0)}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="text-[10px] uppercase tracking-[2px] text-hl-dim">Bewertung{isKeeper ? ' · Torwart' : ''}</div>
          <button
            type="button"
            onClick={onOpenCard}
            className="block max-w-full text-left font-display font-black text-2xl uppercase tracking-tight leading-tight truncate hover:text-brand-accent-light transition-colors cursor-pointer"
            title={`${entry.playerName} – zur Spielerseite`}
          >
            {entry.playerName}
          </button>
          <div className="text-[11px] text-hl-dim truncate mt-0.5">
            {homeName} <span className="text-hl-faint">gegen</span> {awayName}
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="font-display font-black tabular-nums text-4xl lg:text-5xl leading-none" style={{ color: noteColor(entry.note, cfg) }}>
            {entry.note.toFixed(1)}
          </div>
          <div className="text-[9px] lg:text-[11px] uppercase tracking-[2px] text-hl-dim mt-1">Note</div>
        </div>
      </div>

      {chips.length > 0 ? (
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-2 hl-cascade-soft">
          {chips.map((c) => (
            <div key={c.key} className="rounded-xl border border-white/10 bg-white/[.03] px-3 py-2 flex items-center gap-2 min-w-0">
              <span className="text-base leading-none shrink-0">{c.icon}</span>
              <span className="flex-1 min-w-0 text-[11px] text-hl-soft leading-tight">{c.label}</span>
              <span className="font-display font-black tabular-nums text-base lg:text-lg shrink-0" style={{ color: c.color }}>
                {c.value}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-4 text-sm text-hl-mute">Für dieses Spiel wurden keine Einzelaktionen erfasst.</div>
      )}

      <button
        onClick={onOpenCard}
        className="mt-4 text-[11px] font-bold uppercase tracking-wider text-hl-mute hover:text-brand-accent-light flex items-center gap-1.5 cursor-pointer"
      >
        <IdCard className="w-3.5 h-3.5" /> Saison-Karte ansehen
      </button>
    </div>
  );
}

// Team im Ergebnis-Kopf: Wappen oben, Name darunter mittig – so bekommt der Name
// die volle Spaltenbreite und wird am Handy NICHT abgeschnitten (bricht bei Bedarf um).
function TeamHead({ team, onSelect }: { team?: Team; onSelect?: (teamId: string) => void }) {
  const clickable = !!(onSelect && team);
  return (
    <button
      type="button"
      onClick={clickable ? () => onSelect!(team!.id) : undefined}
      disabled={!clickable}
      className={`flex flex-col items-center gap-2 flex-1 min-w-0 ${clickable ? 'cursor-pointer group' : 'cursor-default'}`}
      title={clickable ? `${team?.name} – Vereinsseite öffnen` : undefined}
    >
      <Crest team={team} />
      <span className={`font-display font-black uppercase tracking-tight text-center leading-tight text-[13px] sm:text-[15px] break-words w-full ${clickable ? 'group-hover:text-brand-accent-light transition-colors' : ''}`}>
        {team?.name ?? '—'}
      </span>
    </button>
  );
}

function Crest({ team }: { team?: Team }) {
  if (!team) return <div className="w-10 h-10 lg:w-12 lg:h-12 rounded-xl bg-white/5 shrink-0" />;
  return team.logoUrl ? (
    <img src={team.logoUrl} alt="" className="w-10 h-10 lg:w-12 lg:h-12 object-contain shrink-0" />
  ) : (
    <div className="w-10 h-10 lg:w-12 lg:h-12 rounded-xl grid place-items-center text-xl shrink-0" style={{ background: `${team.logoColor}22`, color: team.logoColor }}>
      {team.logoIcon || '⚽'}
    </div>
  );
}

// Aggregierte Team-Werte für EIN Spiel (aus den Einzelspieler-Daten summiert).
interface TeamAgg {
  shots: number;
  shotsOn: number;
  assists: number;
  passPct: number | null;
  duelWon: number;
  duelPct: number | null;
  dribbles: number;
  interceptions: number;
  turnovers: number;
  saves: number;
  avgNote: number | null;
}

// Team-Statistiken als Kopf-an-Kopf-Vergleich (heim links, gast rechts). Jede
// Zeile: große Zahlen beider Teams + ein zweifarbiger Balken, der den Anteil zeigt.
// Der bessere Wert wird grün hervorgehoben. Direkt „unter" den beiden Teams.
function TeamCompare({
  home,
  away,
  homeAgg,
  awayAgg,
}: {
  home?: Team;
  away?: Team;
  homeAgg: TeamAgg;
  awayAgg: TeamAgg;
}) {
  const hc = home?.logoColor || '#22DFC9';
  const ac = away?.logoColor || '#E9C46A';

  type Metric = { label: string; icon: string; h: number | null; a: number | null; pct?: boolean; decimal?: boolean; lowerBetter?: boolean };
  const metrics: Metric[] = [
    { label: 'Torschüsse', icon: '⚽', h: homeAgg.shots, a: awayAgg.shots },
    { label: 'Schüsse aufs Tor', icon: '🎯', h: homeAgg.shotsOn, a: awayAgg.shotsOn },
    { label: 'Vorlagen', icon: '🅰️', h: homeAgg.assists, a: awayAgg.assists },
    { label: 'Passquote', icon: '✅', h: homeAgg.passPct, a: awayAgg.passPct, pct: true },
    { label: 'Zweikämpfe gewonnen', icon: '🛡️', h: homeAgg.duelWon, a: awayAgg.duelWon },
    { label: 'Dribblings', icon: '✨', h: homeAgg.dribbles, a: awayAgg.dribbles },
    { label: 'Balleroberungen', icon: '🧲', h: homeAgg.interceptions, a: awayAgg.interceptions },
    { label: 'Ballverluste', icon: '⚠️', h: homeAgg.turnovers, a: awayAgg.turnovers, lowerBetter: true },
    { label: 'Paraden', icon: '🧤', h: homeAgg.saves, a: awayAgg.saves },
    { label: 'Ø Note', icon: '⭐', h: homeAgg.avgNote, a: awayAgg.avgNote, decimal: true },
  ].filter((m) => (m.h ?? 0) + (m.a ?? 0) > 0);

  const fmt = (v: number | null, m: Metric) => (v === null ? '–' : m.pct ? `${v}%` : m.decimal ? v.toFixed(1) : `${v}`);

  return (
    <div className="space-y-3.5 lg:space-y-5">
        {metrics.map((m) => {
          const h = m.h ?? 0;
          const a = m.a ?? 0;
          const total = h + a;
          const hw = total > 0 ? (h / total) * 100 : 50;
          const better = m.lowerBetter ? (h < a ? 'h' : a < h ? 'a' : '') : h > a ? 'h' : a > h ? 'a' : '';
          return (
            <div key={m.label}>
              <div className="flex items-center justify-between gap-3">
                <span
                  className="font-display font-black tabular-nums text-xl sm:text-2xl lg:text-[30px] leading-none shrink-0 w-14 lg:w-20"
                  style={{ color: better === 'h' ? '#43E5A0' : '#d7ded9' }}
                >
                  {fmt(m.h, m)}
                </span>
                <span className="flex items-center gap-1.5 text-[10px] sm:text-[11px] lg:text-[13px] uppercase tracking-wider text-hl-dim text-center whitespace-nowrap min-w-0">
                  <span aria-hidden className="hidden sm:inline">{m.icon}</span>
                  <span className="truncate">{m.label}</span>
                </span>
                <span
                  className="font-display font-black tabular-nums text-xl sm:text-2xl lg:text-[30px] leading-none shrink-0 w-14 lg:w-20 text-right"
                  style={{ color: better === 'a' ? '#43E5A0' : '#d7ded9' }}
                >
                  {fmt(m.a, m)}
                </span>
              </div>
              <div className="mt-1.5 lg:mt-2 flex h-1.5 lg:h-2 rounded-full overflow-hidden bg-white/[.06]">
                <div style={{ width: `${hw}%`, background: hc }} className="h-full" />
                <div style={{ width: `${100 - hw}%`, background: ac }} className="h-full" />
              </div>
            </div>
          );
        })}
    </div>
  );
}
