import { Loader2 } from 'lucide-react';
import type { TrackingDayProgress } from '../lib/trackingProgress';

// „Das Team ist am Tracken" – Live-Fortschritt eines Spieltags, der gerade
// getrackt wird (Prozent = Spiele auf „Fertig" im Tracking Center).
export default function TrackingProgressBanner({
  day,
  compact = false,
  className = '',
}: {
  day: TrackingDayProgress;
  compact?: boolean;
  className?: string;
}) {
  const finishing = day.done >= day.total;
  const title = finishing ? 'Auswertung wird abgeschlossen' : 'Das Team ist am Tracken';
  // Kompakt (Startseite): eine schlanke Pille mit Fortschritt als Unterstrich.
  if (compact) {
    return (
      <div className={`flex justify-center ${className}`} role="status" aria-live="polite">
        <div className="relative overflow-hidden inline-flex items-center gap-2 max-w-full rounded-full border border-[#22DFC9]/35 bg-[#0b1f1d]/80 backdrop-blur-sm pl-3 pr-3.5 py-1.5">
          <Loader2 className="w-3.5 h-3.5 text-[#22DFC9] animate-spin shrink-0" />
          <span className="text-[11px] sm:text-[12px] font-bold uppercase tracking-wider text-white truncate">
            {title} · {day.matchday}. Spieltag
          </span>
          <span className="text-[12px] font-display font-black tabular-nums text-[#22DFC9] shrink-0">{day.pct}%</span>
          <span className="absolute left-0 bottom-0 h-[2px] bg-white/10 w-full" />
          <span
            className="absolute left-0 bottom-0 h-[2px] transition-[width] duration-700"
            style={{ width: `${Math.max(3, day.pct)}%`, background: 'linear-gradient(90deg,#22DFC9,#E9C46A)' }}
          />
        </div>
      </div>
    );
  }
  return (
    <div
      className={`relative overflow-hidden rounded-2xl border border-[#22DFC9]/30 bg-[linear-gradient(100deg,rgba(34,223,201,.10),rgba(233,196,106,.06))] ${
        compact ? 'px-3.5 py-2.5' : 'px-4 py-3.5 sm:px-5'
      } ${className}`}
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center gap-3 min-w-0">
        <Loader2 className={`${compact ? 'w-4 h-4' : 'w-5 h-5'} text-[#22DFC9] animate-spin shrink-0`} />
        <div className="min-w-0 flex-1">
          <div className={`font-display font-black uppercase tracking-tight text-white leading-none ${compact ? 'text-[13px]' : 'text-[15px] sm:text-base'}`}>
            {title}
          </div>
          <div className="text-[11.5px] text-hl-mute mt-1 truncate">
            {day.matchday}. Spieltag · {day.done} von {day.total} Spielen fertig
          </div>
        </div>
        <div className={`font-display font-black tabular-nums text-[#22DFC9] shrink-0 leading-none ${compact ? 'text-xl' : 'text-2xl sm:text-3xl'}`}>
          {day.pct}%
        </div>
      </div>
      <div className="mt-2.5 h-1.5 rounded-full bg-white/10 overflow-hidden">
        <div
          className="h-full rounded-full transition-[width] duration-700"
          style={{ width: `${Math.max(3, day.pct)}%`, background: 'linear-gradient(90deg,#22DFC9,#E9C46A)' }}
        />
      </div>
    </div>
  );
}
