import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Home, CalendarDays, ListOrdered, Trophy, BarChart3, Images, Zap } from 'lucide-react';
import { ActiveTab } from '../types';

// Scroll-Position der Pille modulweit merken – überlebt so das Neu-Aufbauen
// des Docks beim Routenwechsel (z. B. Tippen auf den Blitz -> Event-Seite).
let dockScroll = 0;

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
  const scrollRef = useRef<HTMLDivElement>(null);
  // Rand-Verläufe als Scroll-Hinweis: zeigen an, dass links/rechts mehr kommt.
  const [edges, setEdges] = useState({ left: false, right: false });

  const updateEdges = () => {
    const el = scrollRef.current;
    if (!el) return;
    dockScroll = el.scrollLeft;
    const left = el.scrollLeft > 4;
    const right = el.scrollLeft < el.scrollWidth - el.clientWidth - 4;
    setEdges((p) => (p.left === left && p.right === right ? p : { left, right }));
  };

  // Scroll-Position beim (Neu-)Einhängen wiederherstellen + Ränder berechnen.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollLeft = dockScroll;
    updateEdges();
    const onResize = () => updateEdges();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Ränder neu berechnen, wenn sich die Anzahl der Einträge ändert.
  useEffect(() => {
    updateEdges();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasHighlights, eventActive]);

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
    // Der HERO-ONE-Pokal bleibt auch inaktiv dezent golden hervorgehoben.
    if (!active) return accent === 'gold' ? 'text-hl-gold/85' : 'text-hl-mute';
    if (accent === 'gold') return 'bg-[rgba(233,196,106,.16)] text-hl-gold shadow-[0_0_18px_rgba(233,196,106,.28)]';
    if (accent === 'magenta') return 'bg-[rgba(232,62,140,.18)] text-hl-magenta-soft shadow-[0_0_18px_rgba(232,62,140,.3)]';
    return 'bg-[rgba(34,223,201,.16)] text-brand-accent-light shadow-[0_0_18px_rgba(34,223,201,.28)]';
  };

  // Per Portal direkt an <body>: so ist der fixierte Balken garantiert am
  // Viewport-Boden verankert und kann von keinem Vorfahren (overflow/transform/
  // backdrop-filter) „gekapert" werden – behebt das mittige Hängen auf iOS.
  if (typeof document === 'undefined') return null;
  return createPortal(
    <div aria-hidden={!visible} className="lg:hidden fixed inset-x-0 bottom-0 z-40 pointer-events-none">
      <div
        className="will-change-transform transition-[transform,opacity] duration-500 [transition-timing-function:cubic-bezier(0.22,1,0.36,1)]"
        style={{ transform: visible ? 'translateY(0)' : 'translateY(160%)', opacity: visible ? 1 : 0 }}
      >
        {/* Leichter Gradient von unten – das Dock steht bewusst nicht komplett frei */}
        <div className="absolute inset-x-0 bottom-0 h-36 bg-[linear-gradient(to_top,#0A1415_18%,rgba(10,20,21,.6)_46%,transparent)] pointer-events-none" />

        {/* Glas-Pille mit den Icons – horizontal scrollbar.
            Sitzt unten (nur knapp über der Home-Indicator-Safe-Area) – clean
            wie eine native Tableiste. */}
        <div className="relative px-3 pt-4 pb-[calc(env(safe-area-inset-bottom)+10px)] flex justify-center">
          {/* Glas-Wrapper (Rand rund, überläuft nicht) trägt die Verläufe als
              Scroll-Hinweis; die eigentliche Scroll-Fläche liegt darin. */}
          <div className="hl-glass-dock pointer-events-auto relative max-w-full rounded-full overflow-hidden border border-white/[.12] bg-[rgba(12,20,19,.58)] backdrop-blur-2xl backdrop-saturate-150 shadow-[inset_0_1px_0_rgba(255,255,255,.14),0_18px_44px_rgba(0,0,0,.5)]">
            <div ref={scrollRef} onScroll={updateEdges} className="overflow-x-auto no-scrollbar">
              {/* Feste Icon-Größen -> konstante Breite, kein Zappeln/Scroll-Sprung. */}
              <div className="flex items-center gap-1.5 px-3 py-2.5 w-max">
                {items.map((it) => (
                  <button
                    key={it.key}
                    onClick={() => (it.onClick ? it.onClick() : it.tab && onNavigate(it.tab))}
                    aria-label={it.label}
                    title={it.label}
                    aria-current={it.active ? 'page' : undefined}
                    className={`shrink-0 grid place-items-center w-[60px] h-[54px] rounded-full transition-[background-color,box-shadow,color,transform] [transition-duration:300ms,300ms,300ms,100ms] ease-out cursor-pointer active:scale-90 ${accentClasses(
                      it.accent,
                      it.active
                    )} ${it.active ? '' : 'hover:text-hl-text'}`}
                  >
                    <it.Icon className="w-[27px] h-[27px]" />
                  </button>
                ))}
              </div>
            </div>
            {/* Rand-Verläufe: signalisieren „links/rechts kommt noch mehr" */}
            <div
              className={`pointer-events-none absolute inset-y-0 left-0 w-10 transition-opacity duration-200 ${edges.left ? 'opacity-100' : 'opacity-0'}`}
              style={{ background: 'linear-gradient(to right, rgba(9,15,14,.95), transparent)' }}
            />
            <div
              className={`pointer-events-none absolute inset-y-0 right-0 w-10 transition-opacity duration-200 ${edges.right ? 'opacity-100' : 'opacity-0'}`}
              style={{ background: 'linear-gradient(to left, rgba(9,15,14,.95), transparent)' }}
            />
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
