import { useRef } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Radio, ExternalLink, Maximize2, Twitch } from 'lucide-react';
import type { EventConfig, EventMatch, StreamsConfig } from '../types';
import { twitchPlayerSrc, twitchChannelUrl } from '../lib/streams';
import { LiveBadge } from './ui';

// ---------------------------------------------------------------------------
// Zwei parallele Twitch-Streams (Feld 1 / Feld 2) mit selbstgebautem Live-
// Scoreboard-Overlay. Das Overlay erscheint automatisch, sobald der Schiedsrichter
// das Spiel auf dem jeweiligen Feld live schaltet (Teams, Tore, Minute – alles
// aus dem laufenden Event-Spiel). Anschauen & Vollbild direkt auf der Website;
// zum Interagieren/Chatten führt „Auf Twitch öffnen" zu Twitch.
// ---------------------------------------------------------------------------

const PURPLE = '#9147FF';

function Scoreboard({ match }: { match: EventMatch }) {
  return (
    <div className="absolute top-0 inset-x-0 p-2 sm:p-3 flex justify-center pointer-events-none z-10">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
        className="inline-flex items-center gap-2 sm:gap-3 rounded-xl bg-black/72 backdrop-blur-md border border-white/12 px-2.5 sm:px-3.5 py-1.5 sm:py-2 shadow-[0_8px_28px_-8px_rgba(0,0,0,.8)] max-w-full"
      >
        <span className="font-display font-black uppercase tracking-tight text-white text-xs sm:text-sm truncate max-w-[26vw] sm:max-w-[180px]">
          {match.home}
        </span>
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
        <span className="font-display font-black uppercase tracking-tight text-white text-xs sm:text-sm truncate max-w-[26vw] sm:max-w-[180px]">
          {match.away}
        </span>
        <span className="shrink-0 ml-0.5 sm:ml-1">
          <LiveBadge liveStartedAt={match.liveStartedAt} durationMinutes={match.durationMinutes} pausedAt={match.pausedAt} />
        </span>
      </motion.div>
    </div>
  );
}

function StreamCard({ field, channel, liveMatch }: { field: number; channel: string; liveMatch: EventMatch | null }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const goFullscreen = () => {
    const el = wrapRef.current;
    if (!el) return;
    if (document.fullscreenElement) document.exitFullscreen();
    else el.requestFullscreen?.().catch(() => {});
  };

  return (
    <div className="rounded-2xl overflow-hidden border border-white/10 bg-[#0b0710]">
      {/* Kopf: Feld + Live-Status */}
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

      {/* Video + Overlay */}
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
      </div>

      {/* Aktionen */}
      <div className="flex items-center gap-2 px-3 py-2.5">
        <a
          href={twitchChannelUrl(channel)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-sans font-bold uppercase tracking-wider text-white cursor-pointer active:scale-95 transition-transform"
          style={{ background: PURPLE }}
        >
          <ExternalLink className="w-3.5 h-3.5" /> Auf Twitch öffnen
        </a>
        <button
          onClick={goFullscreen}
          className="inline-flex items-center gap-1.5 rounded-lg hl-surf-soft border border-white/10 px-3 py-2 text-xs font-sans font-bold uppercase tracking-wider text-hl-mute hover:text-white cursor-pointer active:scale-95 transition-all"
        >
          <Maximize2 className="w-3.5 h-3.5" /> Vollbild
        </button>
      </div>
    </div>
  );
}

export default function StreamStage({ streams, event }: { streams: StreamsConfig | null; event: EventConfig | null }) {
  if (!streams?.active) return null;
  const fields: { field: number; channel: string }[] = [];
  if (streams.field1.trim()) fields.push({ field: 1, channel: streams.field1.trim() });
  if (streams.field2.trim()) fields.push({ field: 2, channel: streams.field2.trim() });
  if (fields.length === 0) return null;

  const liveOn = (field: number): EventMatch | null =>
    event?.matches?.find((m) => m.field === field && m.status === 'live') ?? null;

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
            <StreamCard key={f.field} field={f.field} channel={f.channel} liveMatch={liveOn(f.field)} />
          ))}
        </div>
      </div>
    </div>
  );
}
