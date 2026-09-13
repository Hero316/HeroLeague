import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Radio, ExternalLink, Maximize2, Twitch } from 'lucide-react';
import type { EventConfig, EventMatch, Player, StreamsConfig } from '../types';
import { twitchPlayerSrc, twitchChannelUrl } from '../lib/streams';
import { LiveBadge } from './ui';

// ---------------------------------------------------------------------------
// Zwei parallele Twitch-Streams (Feld 1 / Feld 2) mit selbstgebauten Overlays:
//  • oben links: Live-Scoreboard (Teams, Tore, Minute) – sobald der Schiri live macht
//  • Tor-Einblendung mit Foto des Torschützen (animiert), wenn ein Tor fällt
//  • kurzer Aufstellungs-Durchlauf unten beim Anpfiff
// Alles aus den Live-Daten des laufenden Event-Spiels. Anschauen & Vollbild vor Ort;
// „Auf Twitch öffnen" führt zum Interagieren/Chatten zu Twitch.
// ---------------------------------------------------------------------------

const PURPLE = '#9147FF';

function initials(name: string): string {
  const p = name.trim().split(/\s+/);
  return ((p[0]?.[0] ?? '') + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase() || '?';
}

function Avatar({ name, imageUrl, size = 40 }: { name: string; imageUrl?: string; size?: number }) {
  return imageUrl ? (
    <img src={imageUrl} alt={name} referrerPolicy="no-referrer" className="rounded-full object-cover shrink-0 border border-white/20" style={{ width: size, height: size }} />
  ) : (
    <span className="rounded-full grid place-items-center shrink-0 font-display font-black text-white bg-white/15 border border-white/20" style={{ width: size, height: size, fontSize: size * 0.4 }}>
      {initials(name)}
    </span>
  );
}

// Live-Scoreboard oben links.
function Scoreboard({ match }: { match: EventMatch }) {
  return (
    <div className="absolute top-0 left-0 p-2 sm:p-3 pointer-events-none z-10">
      <motion.div
        initial={{ opacity: 0, x: -16 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -16 }}
        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
        className="inline-flex items-center gap-2 sm:gap-2.5 rounded-xl bg-black/72 backdrop-blur-md border border-white/12 px-2.5 sm:px-3 py-1.5 sm:py-2 shadow-[0_8px_28px_-8px_rgba(0,0,0,.85)] max-w-full"
      >
        <span className="font-display font-black uppercase tracking-tight text-white text-xs sm:text-sm truncate max-w-[24vw] sm:max-w-[150px]">{match.home}</span>
        <span className="relative shrink-0 font-display font-black tabular-nums text-white text-lg sm:text-2xl leading-none px-0.5">
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span
              key={`${match.homeScore ?? 0}-${match.awayScore ?? 0}`}
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.5, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 500, damping: 22 }}
              className="inline-block"
            >
              {match.homeScore ?? 0}<span className="text-hl-dim mx-0.5 sm:mx-1">:</span>{match.awayScore ?? 0}
            </motion.span>
          </AnimatePresence>
        </span>
        <span className="font-display font-black uppercase tracking-tight text-white text-xs sm:text-sm truncate max-w-[24vw] sm:max-w-[150px]">{match.away}</span>
        <span className="shrink-0 ml-0.5"><LiveBadge liveStartedAt={match.liveStartedAt} durationMinutes={match.durationMinutes} pausedAt={match.pausedAt} /></span>
      </motion.div>
    </div>
  );
}

// Tor-Einblendung mit Foto (links, fliegt rein und wieder raus).
function GoalCard({ name, team, imageUrl }: { name: string; team: string; imageUrl?: string }) {
  return (
    <div className="absolute left-0 top-1/2 -translate-y-1/2 p-2 sm:p-4 pointer-events-none z-20">
      <motion.div
        initial={{ opacity: 0, x: -60, scale: 0.9 }}
        animate={{ opacity: 1, x: 0, scale: 1 }}
        exit={{ opacity: 0, x: -40, scale: 0.95 }}
        transition={{ type: 'spring', stiffness: 320, damping: 24 }}
        className="flex items-center gap-3 rounded-2xl border px-3 py-2.5 sm:px-4 sm:py-3 shadow-[0_12px_40px_-10px_rgba(0,0,0,.9)]"
        style={{ background: 'linear-gradient(120deg, rgba(20,165,148,.96), rgba(12,122,112,.96))', borderColor: 'rgba(255,255,255,.22)' }}
      >
        <Avatar name={name} imageUrl={imageUrl} size={54} />
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <motion.span
              initial={{ scale: 0.6, rotate: -8 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: 'spring', stiffness: 400, damping: 12, delay: 0.05 }}
              className="font-display font-black uppercase tracking-tight text-white text-lg sm:text-2xl leading-none"
            >
              Tor!
            </motion.span>
            <span className="text-[10px]">⚽️</span>
          </div>
          <div className="font-display font-black uppercase tracking-tight text-white text-sm sm:text-base leading-tight truncate">{name}</div>
          <div className="text-[11px] font-sans font-semibold text-white/80 truncate">{team}</div>
        </div>
      </motion.div>
    </div>
  );
}

// Aufstellungs-Durchlauf unten (dünnes Laufband, verdeckt kaum etwas).
function LineupFlyby({ homeTeam, awayTeam, homePlayers, awayPlayers }: { homeTeam: string; awayTeam: string; homePlayers: Player[]; awayPlayers: Player[] }) {
  const chips = [
    { label: homeTeam, players: homePlayers },
    { label: awayTeam, players: awayPlayers },
  ];
  const Row = () => (
    <div className="inline-flex items-center gap-2 pr-2">
      {chips.map((c, ci) => (
        <span key={ci} className="inline-flex items-center gap-2 pr-2">
          <span className="inline-flex items-center rounded-md bg-white/15 px-2 py-1 font-display font-black uppercase tracking-tight text-white text-[11px] shrink-0">{c.label}</span>
          {c.players.map((p, i) => (
            <span key={i} className="inline-flex items-center gap-1.5 rounded-full bg-black/45 border border-white/10 pl-1 pr-2.5 py-1 shrink-0">
              <Avatar name={p.name} imageUrl={p.imageUrl} size={22} />
              <span className="text-[11px] font-sans font-semibold text-white whitespace-nowrap">{p.number ? `${p.number} ` : ''}{p.name}</span>
            </span>
          ))}
        </span>
      ))}
    </div>
  );
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className="absolute bottom-0 inset-x-0 pb-1.5 pt-3 pointer-events-none z-10 overflow-hidden"
      style={{ background: 'linear-gradient(0deg, rgba(0,0,0,.6), transparent)' }}
    >
      <div className="hl-marquee-track">
        <Row />
        <Row />
      </div>
    </motion.div>
  );
}

function StreamCard({ field, channel, liveMatch, rosterByTeam }: { field: number; channel: string; liveMatch: EventMatch | null; rosterByTeam: Map<string, Player[]> }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const prevId = useRef<string | null>(null);
  const prevScorers = useRef(0);
  const [goal, setGoal] = useState<{ name: string; team: string; imageUrl?: string } | null>(null);
  const [lineup, setLineup] = useState(false);
  const goalTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const lineupTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    const m = liveMatch;
    if (!m) {
      prevId.current = null; prevScorers.current = 0;
      setGoal(null); setLineup(false);
      return;
    }
    const scorers = m.scorers ?? [];
    if (prevId.current !== m.id) {
      // Neues Live-Spiel → Aufstellung einblenden, Torzähler initialisieren (keine alte Feier).
      prevId.current = m.id;
      prevScorers.current = scorers.length;
      setGoal(null);
      setLineup(true);
      clearTimeout(lineupTimer.current);
      lineupTimer.current = setTimeout(() => setLineup(false), 12000);
      return;
    }
    if (scorers.length > prevScorers.current) {
      const s = scorers[scorers.length - 1];
      const photo = rosterByTeam.get(s.team)?.find((p) => p.name === s.player)?.imageUrl;
      setGoal({ name: s.player, team: s.team, imageUrl: photo });
      clearTimeout(goalTimer.current);
      goalTimer.current = setTimeout(() => setGoal(null), 6500);
    }
    prevScorers.current = scorers.length;
  }, [liveMatch, rosterByTeam]);

  useEffect(() => () => { clearTimeout(goalTimer.current); clearTimeout(lineupTimer.current); }, []);

  const goFullscreen = () => {
    const el = wrapRef.current;
    if (!el) return;
    if (document.fullscreenElement) document.exitFullscreen();
    else el.requestFullscreen?.().catch(() => {});
  };

  return (
    <div className="rounded-2xl overflow-hidden border border-white/10 bg-[#0b0710]">
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-white/8" style={{ background: `linear-gradient(90deg, ${PURPLE}22, transparent)` }}>
        <span className="inline-flex items-center gap-1.5 font-display font-black uppercase tracking-tight text-white text-sm">
          <Twitch className="w-4 h-4" style={{ color: PURPLE }} /> Feld {field}
        </span>
        {liveMatch ? (
          <span className="inline-flex items-center gap-1.5 text-[10px] font-sans font-black uppercase tracking-wider text-hl-red-soft">
            <span className="relative flex h-2 w-2"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#FF5442] opacity-70" /><span className="relative inline-flex rounded-full h-2 w-2 bg-[#FF5442]" /></span>
            Live
          </span>
        ) : (
          <span className="text-[10px] font-sans font-bold uppercase tracking-wider text-hl-dim">Stream</span>
        )}
      </div>

      <div ref={wrapRef} className="hl-stream relative w-full aspect-video bg-black">
        <iframe
          title={`Twitch Feld ${field}`}
          src={twitchPlayerSrc(channel, { muted: true, autoplay: true })}
          className="absolute inset-0 w-full h-full"
          allowFullScreen
          allow="autoplay; fullscreen; picture-in-picture"
          frameBorder={0}
          scrolling="no"
        />
        <AnimatePresence>{liveMatch && <Scoreboard key="sb" match={liveMatch} />}</AnimatePresence>
        <AnimatePresence>
          {lineup && liveMatch && (
            <LineupFlyby
              key="lu"
              homeTeam={liveMatch.home}
              awayTeam={liveMatch.away}
              homePlayers={rosterByTeam.get(liveMatch.home) ?? []}
              awayPlayers={rosterByTeam.get(liveMatch.away) ?? []}
            />
          )}
        </AnimatePresence>
        <AnimatePresence>{goal && <GoalCard key={`goal-${goal.name}`} name={goal.name} team={goal.team} imageUrl={goal.imageUrl} />}</AnimatePresence>
      </div>

      <div className="flex items-center gap-2 px-3 py-2.5">
        <a href={twitchChannelUrl(channel)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-sans font-bold uppercase tracking-wider text-white cursor-pointer active:scale-95 transition-transform" style={{ background: PURPLE }}>
          <ExternalLink className="w-3.5 h-3.5" /> Auf Twitch öffnen
        </a>
        <button onClick={goFullscreen} className="inline-flex items-center gap-1.5 rounded-lg hl-surf-soft border border-white/10 px-3 py-2 text-xs font-sans font-bold uppercase tracking-wider text-hl-mute hover:text-white cursor-pointer active:scale-95 transition-all">
          <Maximize2 className="w-3.5 h-3.5" /> Vollbild
        </button>
      </div>
    </div>
  );
}

export default function StreamStage({ streams, event }: { streams: StreamsConfig | null; event: EventConfig | null }) {
  const rosterByTeam = useMemo(() => {
    const m = new Map<string, Player[]>();
    event?.rosters?.forEach((r) => m.set(r.team, r.players ?? []));
    return m;
  }, [event]);

  if (!streams?.active) return null;
  const fields: { field: number; channel: string }[] = [];
  if (streams.field1.trim()) fields.push({ field: 1, channel: streams.field1.trim() });
  if (streams.field2.trim()) fields.push({ field: 2, channel: streams.field2.trim() });
  if (fields.length === 0) return null;

  const liveOn = (field: number): EventMatch | null =>
    event?.matches?.find((mm) => mm.field === field && mm.status === 'live') ?? null;

  return (
    <div className="relative border-b border-white/8" style={{ background: `radial-gradient(120% 100% at 50% 0%, ${PURPLE}22, transparent 62%), #070510` }}>
      <div className="max-w-[1320px] xl:max-w-[1600px] 2xl:max-w-[1780px] mx-auto px-4 sm:px-10 py-6 sm:py-8">
        <div className="flex items-center gap-2.5 mb-4">
          <Radio className="w-5 h-5" style={{ color: PURPLE }} />
          <h2 className="font-display font-black uppercase tracking-tight text-white text-xl sm:text-2xl">Live auf Twitch</h2>
          <span className="text-[11px] font-sans font-semibold text-hl-mute hidden sm:inline">· beide Felder gleichzeitig</span>
        </div>
        <div className={`grid gap-4 ${fields.length > 1 ? 'grid-cols-1 lg:grid-cols-2' : 'grid-cols-1 max-w-3xl'}`}>
          {fields.map((f) => (
            <StreamCard key={f.field} field={f.field} channel={f.channel} liveMatch={liveOn(f.field)} rosterByTeam={rosterByTeam} />
          ))}
        </div>
      </div>
    </div>
  );
}
