import React, { useEffect, useRef, useState } from 'react';
import { Home, CalendarDays, ListOrdered, Trophy, BarChart3, Images, Zap } from 'lucide-react';
import { ActiveTab } from '../types';

interface MobileDockProps {
  activeTab: ActiveTab;
  onNavigate: (tab: ActiveTab) => void;
  hasHighlights?: boolean;
  eventActive?: boolean;
  eventTitle?: string;
  onOpenEvent?: () => void;
  onEventPage?: boolean; // gerade die Event-Seite offen?
}

type DockItem = {
  key: string;
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
  tab?: ActiveTab; // interner Tab-Wechsel
  onClick?: () => void; // Sonderziel (Event)
  active: boolean;
  accent?: 'teal' | 'gold' | 'magenta';
};

// Glasiges Bottom-Dock für den „Handy-Modus": Icons statt Text, horizontal
// scrollbar, aktiver Punkt hervorgehoben. Fährt nach ein paar Sekunden Ruhe
// smooth nach unten raus und taucht bei der nächsten Berührung wieder auf.
export default function MobileDock({
  activeTab,
  onNavigate,
  hasHighlights,
  eventActive,
  eventTitle,
  onOpenEvent,
  onEventPage,
}: MobileDockProps) {
  const [visible, setVisible] = useState(true);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeRef = useRef<HTMLButtonElement>(null);

  // Sichtbarkeit steuern: jede Berührung/Scroll zeigt das Dock und startet den
  // Ruhe-Timer neu; nach ~3,5 s ohne Interaktion fährt es nach unten raus.
  useEffect(() => {
    const show = () => {
      setVisible(true);
      if (hideTimer.current) clearTimeout(hideTimer.current);
      hideTimer.current = setTimeout(() => setVisible(false), 3500);
    };
    show(); // beim Einblenden sichtbar starten, dann Timer laufen lassen
    const opts: AddEventListenerOptions = { passive: true };
    window.addEventListener('touchstart', show, opts);
    window.addEventListener('pointerdown', show, opts);
    window.addEventListener('scroll', show, opts);
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
      window.removeEventListener('touchstart', show);
      window.removeEventListener('pointerdown', show);
      window.removeEventListener('scroll', show);
    };
  }, []);

  // Aktives Icon bei Wechsel in die Mitte scrollen (falls das Dock überläuft).
  useEffect(() => {
    activeRef.current?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }, [activeTab, onEventPage]);

  const items: DockItem[] = [
    { key: 'home', label: 'Start', Icon: Home, tab: 'home', active: activeTab === 'home' && !onEventPage },
    { key: 'spielplan', label: 'Spielplan', Icon: CalendarDays, tab: 'spielplan', active: activeTab === 'spielplan' && !onEventPage },
    { key: 'tabelle', label: 'Tabelle', Icon: ListOrdered, tab: 'tabelle', active: activeTab === 'tabelle' && !onEventPage },
    { key: 'heroone', label: 'Hero One', Icon: Trophy, tab: 'heroone', active: activeTab === 'heroone' && !onEventPage, accent: 'gold' },
    { key: 'statistiken', label: 'Statistiken', Icon: BarChart3, tab: 'statistiken', active: activeTab === 'statistiken' && !onEventPage },
    ...(hasHighlights
      ? [{ key: 'highlights', label: 'Highlights', Icon: Images, tab: 'highlights' as ActiveTab, active: activeTab === 'highlights' && !onEventPage }]
      : []),
    ...(eventActive && onOpenEvent
      ? [{ key: 'event', label: eventTitle || 'Testspiel', Icon: Zap, onClick: onOpenEvent, active: !!onEventPage, accent: 'magenta' as const }]
      : []),
  ];

  const accentClasses = (accent: DockItem['accent'], active: boolean) => {
    if (!active) return 'text-hl-mute';
    if (accent === 'gold') return 'bg-[rgba(233,196,106,.16)] text-hl-gold shadow-[0_0_18px_rgba(233,196,106,.28)]';
    if (accent === 'magenta') return 'bg-[rgba(232,62,140,.18)] text-hl-magenta-soft shadow-[0_0_18px_rgba(232,62,140,.3)]';
    return 'bg-[rgba(34,223,201,.16)] text-brand-accent-light shadow-[0_0_18px_rgba(34,223,201,.28)]';
  };

  return (
    <div aria-hidden={!visible} className="lg:hidden fixed inset-x-0 bottom-0 z-40 pointer-events-none">
      <div
        className="will-change-transform transition-[transform,opacity] duration-500 [transition-timing-function:cubic-bezier(0.34,1.28,0.64,1)]"
        style={{ transform: visible ? 'translateY(0)' : 'translateY(160%)', opacity: visible ? 1 : 0 }}
      >
        {/* Leichter Gradient von unten – das Dock steht bewusst nicht komplett frei */}
        <div className="absolute inset-x-0 bottom-0 h-36 bg-[linear-gradient(to_top,#0A1415_18%,rgba(10,20,21,.6)_46%,transparent)] pointer-events-none" />

        {/* Glas-Pille mit den Icons – horizontal scrollbar */}
        <div className="relative px-3 pt-4 pb-[calc(env(safe-area-inset-bottom)+12px)] flex justify-center">
          <div className="pointer-events-auto max-w-full overflow-x-auto no-scrollbar rounded-full border border-white/[.12] bg-[rgba(12,20,19,.55)] backdrop-blur-2xl backdrop-saturate-150 shadow-[inset_0_1px_0_rgba(255,255,255,.14),0_18px_44px_rgba(0,0,0,.5)]">
            <div className="flex items-center gap-1 px-2 py-2 w-max mx-auto">
              {items.map((it) => (
                <button
                  key={it.key}
                  ref={it.active ? activeRef : undefined}
                  onClick={() => (it.onClick ? it.onClick() : it.tab && onNavigate(it.tab))}
                  aria-label={it.label}
                  aria-current={it.active ? 'page' : undefined}
                  className={`shrink-0 flex items-center gap-2 rounded-full px-3.5 py-2.5 transition-all duration-300 cursor-pointer active:scale-95 ${accentClasses(
                    it.accent,
                    it.active
                  )} ${it.active ? '' : 'hover:text-hl-text'}`}
                >
                  <it.Icon className="w-[22px] h-[22px] shrink-0" />
                  {/* Aktiver Punkt zeigt zusätzlich sein Label – schön hervorgehoben */}
                  <span
                    className={`overflow-hidden whitespace-nowrap font-sans font-bold text-[12px] tracking-wide transition-all duration-300 ${
                      it.active ? 'max-w-[130px] opacity-100' : 'max-w-0 opacity-0'
                    }`}
                  >
                    {it.label}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
