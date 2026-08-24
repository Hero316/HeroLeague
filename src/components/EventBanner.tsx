import { Zap, ArrowRight, CalendarDays, MapPin, Lock, Ticket } from 'lucide-react';
import { EventConfig } from '../types';

interface EventBannerProps {
  event: EventConfig;
  isLive?: boolean; // läuft gerade ein Spiel?
  staffPreview?: boolean; // nur für Super-Admins sichtbar (Test-Modus)
  onOpen: () => void;
  onOpenTickets?: () => void; // Zuschauer-Tickets direkt vom Banner sichern
}

// Auffälliges Banner ganz oben auf der Startseite, wenn ein Sonder-Event aktiv
// ist. Eigene Magenta/Gold-Farbwelt + Animation, damit man sofort Bock hat.
// Klick aufs Banner öffnet den Testspieltag; die „Tickets"-Taste ist eine eigene
// Aktion daneben. (Deshalb ein <div> mit Klick-Overlay statt eines <button>, damit
// kein Button im Button steckt.)
export default function EventBanner({ event, isLive, staffPreview, onOpen, onOpenTickets }: EventBannerProps) {
  return (
    <div className="group relative block w-full text-left overflow-hidden border-b border-[rgba(230,35,142,.3)]">
      {/* Hintergrund-Glanz */}
      <div className="absolute inset-0 bg-[linear-gradient(100deg,#12030c_0%,#2a0a1e_45%,#1a0616_100%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(80%_140%_at_15%_0%,rgba(230,35,142,.4),transparent_55%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(70%_120%_at_100%_100%,rgba(233,196,106,.22),transparent_55%)]" />
      {/* wandernder Glanzstreifen beim Hover */}
      <div className="absolute inset-y-0 -left-1/3 w-1/3 bg-[linear-gradient(90deg,transparent,rgba(255,255,255,.12),transparent)] -skew-x-12 translate-x-[-120%] group-hover:translate-x-[520%] transition-transform duration-[1100ms] ease-out" />

      {/* Ganzflächiger Klick öffnet die Testspiel-Seite. */}
      <button onClick={onOpen} aria-label={`${event.title} – Details ansehen`} className="absolute inset-0 z-[1] cursor-pointer" />

      <div className="relative z-[2] max-w-[1320px] mx-auto px-4 sm:px-10 py-4 sm:py-5 flex items-center gap-4 sm:gap-6 pointer-events-none">
        <div className="shrink-0 grid place-items-center w-11 h-11 sm:w-14 sm:h-14 rounded-2xl bg-[rgba(230,35,142,.18)] border border-[rgba(230,35,142,.45)]">
          <Zap className="w-5 h-5 sm:w-7 sm:h-7 text-[#ff7ac4]" fill="currentColor" />
        </div>

        <div className="min-w-0 flex-1">
          {staffPreview && (
            <span className="inline-flex items-center gap-1.5 mb-1 px-2 py-0.5 rounded-full bg-[rgba(230,35,142,.2)] border border-[rgba(230,35,142,.5)] text-[9px] sm:text-[10px] font-sans font-extrabold uppercase tracking-wider text-[#ff9ad4]">
              <Lock className="w-3 h-3" /> Nur für Super-Admins (Test)
            </span>
          )}
          <div className="flex items-center gap-2">
            {isLive ? (
              <span className="inline-flex items-center gap-1.5 font-sans font-extrabold text-[10px] sm:text-[11px] tracking-[2px] uppercase text-red-300">
                <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                Jetzt live · wird gespielt
              </span>
            ) : (
              <span className="font-sans font-extrabold text-[10px] sm:text-[11px] tracking-[2.5px] uppercase text-[#ff7ac4]">
                Jetzt live dabei
              </span>
            )}
          </div>
          <div className="font-display font-black text-xl sm:text-3xl uppercase tracking-tight text-white leading-none mt-0.5">
            {event.title}
          </div>
          <div className="mt-1.5 hidden sm:flex items-center gap-x-5 gap-y-1 flex-wrap text-xs font-sans text-hl-soft">
            {event.dateLabel && (
              <span className="inline-flex items-center gap-1.5">
                <CalendarDays className="w-3.5 h-3.5 text-[#E6238E]" />
                {event.dateLabel}
              </span>
            )}
            {event.location && (
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-[#E6238E]" />
                {event.location}
              </span>
            )}
          </div>
        </div>

        {/* Aktionen rechts: Tickets (eigene Aktion) + „Ansehen" (öffnet Details) */}
        <div className="shrink-0 flex items-center gap-2">
          {onOpenTickets && (
            <button
              onClick={(e) => { e.stopPropagation(); onOpenTickets(); }}
              aria-label="Zuschauer-Tickets sichern"
              className="pointer-events-auto shrink-0 inline-flex items-center gap-1.5 px-3 sm:px-4 py-2 sm:py-2.5 rounded-full text-white font-sans font-bold text-[11px] sm:text-xs uppercase tracking-wider cursor-pointer active:scale-[.97] transition-transform"
              style={{ background: 'linear-gradient(135deg,#7a0f49,#E6238E)', boxShadow: '0 10px 24px -12px rgba(230,35,142,.8)' }}
            >
              <Ticket className="w-4 h-4" />
              Tickets
            </button>
          )}
          <span className="shrink-0 inline-flex items-center gap-1.5 px-3 sm:px-5 py-2 sm:py-2.5 rounded-full bg-white text-[#12030c] font-sans font-bold text-[11px] sm:text-xs uppercase tracking-wider group-hover:bg-[#ffe9f5] transition-colors">
            <span className="hidden sm:inline">Ansehen</span>
            <ArrowRight className="w-4 h-4" />
          </span>
        </div>
      </div>
    </div>
  );
}
