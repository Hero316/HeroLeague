import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Play, Pause, X, Mic } from 'lucide-react';

// Globaler Sprachnachrichten-Player (wie WhatsApp): EIN Audio-Element lebt über
// den Tab-Wechsel hinweg weiter, sodass man während des Hörens in Aufgaben/
// Tickets wechseln kann. Nachrichten-Blasen und die Mini-Leiste steuern es.

type Current = { src: string; title: string } | null;

interface AudioCtx {
  current: Current;
  playing: boolean;
  time: number;
  duration: number;
  rate: number;
  isActive: (src: string) => boolean;
  playSrc: (src: string, title: string) => void;
  toggle: () => void;
  seek: (t: number) => void;
  cycleRate: () => void;
  stop: () => void;
}

const Ctx = createContext<AudioCtx | null>(null);
export function useAudio(): AudioCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('useAudio muss innerhalb von <AudioPlayerProvider> stehen');
  return c;
}

const RATES = [1, 1.5, 2];

export function fmtDur(sec: number): string {
  if (!isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function AudioPlayerProvider({ children }: { children: React.ReactNode }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  if (!audioRef.current && typeof Audio !== 'undefined') audioRef.current = new Audio();
  const [current, setCurrent] = useState<Current>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [rate, setRate] = useState(1);

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    const onTime = () => setTime(a.currentTime);
    const onDur = () => setDuration(isFinite(a.duration) ? a.duration : 0);
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onEnd = () => {
      setPlaying(false);
      setTime(0);
    };
    a.addEventListener('timeupdate', onTime);
    a.addEventListener('loadedmetadata', onDur);
    a.addEventListener('durationchange', onDur);
    a.addEventListener('play', onPlay);
    a.addEventListener('pause', onPause);
    a.addEventListener('ended', onEnd);
    return () => {
      a.removeEventListener('timeupdate', onTime);
      a.removeEventListener('loadedmetadata', onDur);
      a.removeEventListener('durationchange', onDur);
      a.removeEventListener('play', onPlay);
      a.removeEventListener('pause', onPause);
      a.removeEventListener('ended', onEnd);
    };
  }, []);

  const playSrc = useCallback(
    (src: string, title: string) => {
      const a = audioRef.current;
      if (!a) return;
      if (current?.src === src) {
        if (a.paused) a.play().catch(() => {});
        else a.pause();
        return;
      }
      a.src = src;
      a.playbackRate = rate;
      setCurrent({ src, title });
      setTime(0);
      setDuration(0);
      a.play().catch(() => {});
    },
    [current, rate]
  );

  const toggle = useCallback(() => {
    const a = audioRef.current;
    if (!a || !current) return;
    if (a.paused) a.play().catch(() => {});
    else a.pause();
  }, [current]);

  const seek = useCallback((t: number) => {
    const a = audioRef.current;
    if (!a) return;
    a.currentTime = t;
    setTime(t);
  }, []);

  const cycleRate = useCallback(() => {
    const a = audioRef.current;
    const next = RATES[(RATES.indexOf(rate) + 1) % RATES.length];
    setRate(next);
    if (a) a.playbackRate = next;
  }, [rate]);

  const stop = useCallback(() => {
    const a = audioRef.current;
    if (a) {
      a.pause();
      a.removeAttribute('src');
      try {
        a.load();
      } catch {
        /* ignore */
      }
    }
    setCurrent(null);
    setPlaying(false);
    setTime(0);
    setDuration(0);
  }, []);

  const isActive = useCallback((src: string) => current?.src === src, [current]);

  const value: AudioCtx = { current, playing, time, duration, rate, isActive, playSrc, toggle, seek, cycleRate, stop };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

// Fortschrittsbalken mit Klick-zum-Springen (auch ziehbar).
function SeekBar({ pct, onSeek }: { pct: number; onSeek: (p: number) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const at = (clientX: number) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    onSeek(Math.min(1, Math.max(0, (clientX - r.left) / r.width)));
  };
  return (
    <div
      ref={ref}
      onPointerDown={(e) => {
        dragging.current = true;
        (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
        at(e.clientX);
      }}
      onPointerMove={(e) => dragging.current && at(e.clientX)}
      onPointerUp={(e) => {
        dragging.current = false;
        (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
      }}
      className="relative h-4 flex items-center cursor-pointer touch-none"
    >
      <div className="h-1.5 w-full rounded-full bg-white/20">
        <div className="h-full rounded-full bg-brand-accent-light" style={{ width: `${pct}%` }} />
      </div>
      <div className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-white shadow" style={{ left: `calc(${pct}% - 6px)` }} />
    </div>
  );
}

// Sprachnachricht in der Chat-Blase (kompakter Player).
export function VoiceMessage({ url, mine = false }: { url: string; mine?: boolean }) {
  const { isActive, playing, time, duration, rate, playSrc, seek, cycleRate } = useAudio();
  const active = isActive(url);
  const dur = active ? duration : 0;
  const cur = active ? time : 0;
  const pct = dur ? (cur / dur) * 100 : 0;
  return (
    <div className="mt-1.5 flex items-center gap-2.5 w-60 max-w-full">
      <button
        onClick={() => playSrc(url, 'Sprachnachricht')}
        className={`w-9 h-9 shrink-0 rounded-full flex items-center justify-center cursor-pointer ${mine ? 'bg-white/25 text-white' : 'bg-brand-accent-light text-[#04120f]'}`}
      >
        {active && playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
      </button>
      <div className="flex-1 min-w-0">
        <SeekBar pct={pct} onSeek={(p) => active && dur && seek(p * dur)} />
        <div className="flex items-center justify-between mt-0.5">
          <span className={`text-[10px] font-mono ${mine ? 'text-white/70' : 'text-hl-faint'}`}>
            {fmtDur(active ? cur : 0)} / {fmtDur(dur)}
          </span>
          <button
            onClick={cycleRate}
            className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${mine ? 'bg-white/20 text-white' : 'bg-white/10 text-hl-soft'} cursor-pointer`}
            title="Geschwindigkeit"
          >
            {rate}×
          </button>
        </div>
      </div>
    </div>
  );
}

// Mini-Leiste (bleibt beim Tab-Wechsel sichtbar, damit man weiterhören kann).
export function MiniPlayer() {
  const { current, playing, time, duration, rate, toggle, seek, cycleRate, stop } = useAudio();
  if (!current) return null;
  const pct = duration ? (time / duration) * 100 : 0;
  return (
    <div
      className="shrink-0 flex items-center gap-2.5 px-3 py-2 border-t border-white/10 bg-[#10201d]"
      style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) * 0)' }}
    >
      <span className="w-8 h-8 shrink-0 rounded-full bg-brand-accent/20 border border-brand-accent-light/30 flex items-center justify-center text-brand-accent-light">
        <Mic className="w-4 h-4" />
      </span>
      <button onClick={toggle} className="w-9 h-9 shrink-0 rounded-full bg-brand-accent-light text-[#04120f] flex items-center justify-center cursor-pointer">
        {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
      </button>
      <div className="flex-1 min-w-0">
        <div className="text-[11px] font-sans text-white truncate mb-0.5">{current.title}</div>
        <SeekBar pct={pct} onSeek={(p) => duration && seek(p * duration)} />
      </div>
      <span className="text-[10px] font-mono text-hl-faint shrink-0 w-16 text-right">
        {fmtDur(time)} / {fmtDur(duration)}
      </span>
      <button onClick={cycleRate} className="text-[11px] font-mono font-bold px-2 py-1 rounded bg-white/10 text-hl-soft cursor-pointer shrink-0" title="Geschwindigkeit">
        {rate}×
      </button>
      <button onClick={stop} className="p-1 text-hl-mute hover:text-white cursor-pointer shrink-0" title="Schließen">
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
