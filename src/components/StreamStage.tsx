import { useEffect, useMemo, useRef, useState } from 'react';
import { Radio, ExternalLink, Maximize2, Twitch, Volume2, VolumeX, MonitorPlay } from 'lucide-react';
import type { EventConfig, Match, StreamsConfig } from '../types';
import { twitchPlayerSrc, twitchChannelUrl } from '../lib/streams';

// ---------------------------------------------------------------------------
// Zwei parallele Twitch-Streams (Feld 1 / Feld 2) auf der Website – OHNE eigene
// Einblendungen: Scoreboard, Uhr, Tor-Animation & Co. kommen jetzt direkt aus
// OBS (Browser-Quelle /overlay?feld=1|2) und sind damit im Stream selbst, also
// auch auf Twitch zu sehen. Hier nur noch Player, „Live"-Kennzeichen je Feld,
// Ton-Schalter, „Auf Twitch öffnen" und Vollbild.
// Zwei Anwendungsfälle über dieselbe Anzeige-Maschine:
//  • Testspieltag  → <StreamStage>        (Live-Status aus dem Event-Archiv)
//  • echte Liga    → <LeagueStreamStage>  (Live-Status aus den Liga-Spielen)
// ---------------------------------------------------------------------------

const PURPLE = '#9147FF';

// Ist der Bildschirm breit genug für zwei Streams nebeneinander? (>= Tailwind xl)
function useWideScreen(query = '(min-width: 1280px)'): boolean {
  const [wide, setWide] = useState(() => (typeof window !== 'undefined' ? window.matchMedia(query).matches : false));
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setWide(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [query]);
  return wide;
}

function StreamCard({ field, channel, live, muted, onToggleAudio }: { field: number; channel: string; live: boolean; muted: boolean; onToggleAudio?: () => void }) {
  const wrapRef = useRef<HTMLDivElement>(null);

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
        {live ? (
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
          src={twitchPlayerSrc(channel, { muted, autoplay: true })}
          className="absolute inset-0 w-full h-full"
          allowFullScreen
          allow="autoplay; fullscreen; picture-in-picture"
          frameBorder={0}
          scrolling="no"
        />
      </div>

      <div className="flex items-center gap-2 px-3 py-2.5 flex-wrap">
        {onToggleAudio && (
          <button
            onClick={onToggleAudio}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-sans font-black uppercase tracking-wider cursor-pointer active:scale-95 transition-all border ${muted ? 'hl-surf-soft border-white/10 text-hl-mute hover:text-white' : 'border-transparent text-[#04120d]'}`}
            style={muted ? undefined : { background: 'var(--color-brand-accent-light, #22DFC9)' }}
          >
            {muted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
            {muted ? 'Ton an' : 'Ton aus'}
          </button>
        )}
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

// Gemeinsame Anzeige-Maschine für beide Anwendungsfälle.
//  • mode='home' → Startseite: schmal nur Feld 1, breiter Bildschirm beide
//    nebeneinander (Feld 2 wird nur bei breitem Screen wirklich geladen);
//    dazu ein Knopf zur Stream-Seite, solange nicht beide zu sehen sind.
//  • mode='page' → alle Felder untereinander, je eigener Ton-Schalter (nur einer an)
function Stage({ streams, subtitle, isLive, mode = 'home', onOpenFull }: {
  streams: StreamsConfig | null;
  subtitle: string;
  isLive: (field: number) => boolean;
  mode?: 'home' | 'page';
  onOpenFull?: () => void;
}) {
  const allFields = useMemo(() => {
    const list: { field: number; channel: string }[] = [];
    if (streams?.field1.trim()) list.push({ field: 1, channel: streams.field1.trim() });
    if (streams?.field2.trim()) list.push({ field: 2, channel: streams.field2.trim() });
    return list;
  }, [streams?.field1, streams?.field2]);

  // Welches Feld hat auf der Stream-Seite gerade Ton? (immer nur eins gleichzeitig).
  // Start: alles stumm – so spielt der Autoplay zuverlässig, der Besucher tippt
  // dann bei einem Feld „Ton an" (echte Nutzer-Geste, kein Ton-Durcheinander).
  const [audioField, setAudioField] = useState<number | null>(null);
  const wide = useWideScreen();

  if (!streams?.active || allFields.length === 0) return null;

  // Auf der Startseite bei schmalem Screen nur Feld 1 (Feld 2 wird gar nicht erst
  // geladen → spart am Handy Daten). Breiter Screen: beide nebeneinander.
  const bothOnHome = mode === 'home' && wide && allFields.length > 1;
  const shownFields = mode === 'page' || bothOnHome ? allFields : allFields.slice(0, 1);
  const showButton = mode === 'home' && allFields.length > 1 && !bothOnHome;

  const gridClass =
    mode === 'page'
      ? 'space-y-5 max-w-4xl'
      : bothOnHome
        ? 'grid grid-cols-2 gap-4'
        : 'grid grid-cols-1 max-w-3xl gap-4';

  return (
    <div className="relative border-b border-white/8" style={{ background: `radial-gradient(120% 100% at 50% 0%, ${PURPLE}22, transparent 62%), #070510` }}>
      <div className="max-w-[1320px] xl:max-w-[1600px] 2xl:max-w-[1780px] mx-auto px-4 sm:px-10 py-6 sm:py-8">
        <div className="flex items-center gap-2.5 mb-4">
          <Radio className="w-5 h-5" style={{ color: PURPLE }} />
          <h2 className="font-display font-black uppercase tracking-tight text-white text-xl sm:text-2xl">Live auf Twitch</h2>
          <span className="text-[11px] font-sans font-semibold text-hl-mute hidden sm:inline">· {subtitle}</span>
        </div>

        <div className={gridClass}>
          {shownFields.map((f) => (
            <StreamCard
              key={f.field}
              field={f.field}
              channel={f.channel}
              live={isLive(f.field)}
              muted={mode === 'page' ? audioField !== f.field : true}
              onToggleAudio={mode === 'page' ? () => setAudioField((cur) => (cur === f.field ? null : f.field)) : undefined}
            />
          ))}
        </div>

        {showButton && onOpenFull && (
          <button
            onClick={onOpenFull}
            className="mt-4 inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-sans font-black uppercase tracking-wider text-white cursor-pointer active:scale-[0.98] transition-transform shadow-[0_10px_30px_-10px_rgba(145,71,255,.8)]"
            style={{ background: PURPLE }}
          >
            <MonitorPlay className="w-4 h-4" /> Beide Felder ansehen
          </button>
        )}
      </div>
    </div>
  );
}

// --- Adapter: Testspieltag (Event-Archiv) --------------------------------------
export default function StreamStage({ streams, event, mode = 'home', onOpenFull }: { streams: StreamsConfig | null; event: EventConfig | null; mode?: 'home' | 'page'; onOpenFull?: () => void }) {
  const isLive = (field: number) => !!event?.matches?.some((x) => x.field === field && x.status === 'live');
  const subtitle = mode === 'home' ? 'Feld 1 – beide Felder auf der Stream-Seite' : 'beide Felder gleichzeitig';
  return <Stage streams={streams} subtitle={subtitle} isLive={isLive} mode={mode} onOpenFull={onOpenFull} />;
}

// --- Adapter: echte Liga (Liga-Spiele) ------------------------------------------
export function LeagueStreamStage({ streams, matches, mode = 'home', onOpenFull }: { streams: StreamsConfig | null; matches: Match[]; mode?: 'home' | 'page'; onOpenFull?: () => void }) {
  const isLive = (field: number) => matches.some((x) => (x.field || 1) === field && x.status === 'live');
  const subtitle = mode === 'home' ? 'Feld 1 – beide Felder auf der Stream-Seite' : 'beide Felder gleichzeitig';
  return <Stage streams={streams} subtitle={subtitle} isLive={isLive} mode={mode} onOpenFull={onOpenFull} />;
}
