import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { ArrowLeft, MessageSquare, CalendarDays, ListChecks, Ticket as TicketIcon, Smartphone, X, Sun, Moon, Settings } from 'lucide-react';
import ChatSystem from './ChatSystem';
import TaskBoard from './TaskBoard';
import TicketSystem from './TicketSystem';
import TeamSettings from './TeamSettings';
import DeepLinkModal from './DeepLinkModal';
import { useInstall } from './InstallProvider';
import { getUrlParam, setUrlParam } from '../lib/urlState';
import { AudioPlayerProvider, MiniPlayer } from './AudioPlayer';
import type { SessionUser, UserStatus } from '../types';

// Eigenständige „Team-App" unter /chat: Vollbild auf iPhone & Android, mit
// unterer Tab-Leiste (Chats · Aufgaben · Tickets). Bewusst getrennt vom
// aufklappbaren Backoffice, damit sich der Chat wie eine echte App anfühlt und
// zum Home-Bildschirm hinzugefügt werden kann (eigenes Manifest chat.webmanifest).

type Tab = 'chats' | 'aufgaben' | 'kalender' | 'tickets' | 'mehr';

const TABS: { id: Tab; label: string; icon: typeof MessageSquare }[] = [
  { id: 'chats', label: 'Chats', icon: MessageSquare },
  { id: 'aufgaben', label: 'Aufgaben', icon: ListChecks },
  { id: 'kalender', label: 'Kalender', icon: CalendarDays },
  { id: 'tickets', label: 'Tickets', icon: TicketIcon },
  { id: 'mehr', label: 'Mehr', icon: Settings },
];

export default function ChatApp({
  user,
  currentUserId,
  canManageTickets,
  isSuperadmin,
  initialConversationId,
  onBack,
  onUpdateUser,
  onGoWebsite,
  onLogout,
}: {
  user: SessionUser;
  currentUserId: string;
  canManageTickets: boolean;
  isSuperadmin: boolean;
  initialConversationId: string | null;
  onBack: () => void;
  onUpdateUser: (p: { name: string; avatarUrl: string; status: UserStatus }) => void;
  onGoWebsite: () => void;
  onLogout: () => void;
}) {
  // Aktiven Tab in der URL halten (?tab=…), damit ein Reload auf derselben
  // Seite bleibt (Chats/Aufgaben/Tickets) statt immer auf „Chats" zu landen.
  const readTab = (): Tab => {
    const t = getUrlParam('tab');
    return t === 'aufgaben' || t === 'kalender' || t === 'tickets' || t === 'mehr' ? t : 'chats';
  };
  const [tab, setTabState] = useState<Tab>(readTab);
  const setTab = (t: Tab) => {
    setTabState(t);
    // Nur den 'tab'-Parameter ändern – c/thread/av/ad usw. bleiben erhalten.
    setUrlParam('tab', t === 'chats' ? null : t);
  };
  const [showInstall, setShowInstall] = useState(true);
  const { isStandalone, isIos, canInstall, promptInstall } = useInstall();
  const current = TABS.find((t) => t.id === tab)!;

  // Deep-Link aus einer Benachrichtigung: /chat?openTicket=… bzw. …?openTask=…
  // öffnet das Ticket/die Aufgabe direkt als Detail-Fenster – unabhängig vom
  // aktiven Tab. Danach den Parameter aus der URL entfernen, damit ein Neuladen
  // nicht erneut öffnet.
  const [deepOpen, setDeepOpen] = useState<{ type: 'ticket' | 'task'; id: string } | null>(() => {
    const t = getUrlParam('openTicket');
    if (t) return { type: 'ticket', id: t };
    const a = getUrlParam('openTask');
    if (a) return { type: 'task', id: a };
    return null;
  });
  useEffect(() => {
    if (deepOpen) {
      setUrlParam('openTicket', null);
      setUrlParam('openTask', null);
    }
  }, [deepOpen]);

  // Tag-/Nacht-Ansicht der Team-App. Merkt sich die Wahl (localStorage), Standard
  // ist die helle Ansicht. „Hell" = Klasse .hl-team, „Dunkel" = ohne Klasse
  // (dann greifen die dunklen Standard-Töne der geteilten Komponenten).
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    try {
      return localStorage.getItem('hl-theme') === 'dark' ? 'dark' : 'light';
    } catch {
      return 'light';
    }
  });

  // Theme auf <html> markieren, damit AUCH die per Portal an den <body> gehängten
  // Fenster (Modals) es erben. Beim Verlassen wieder weg, damit Website &
  // Backoffice unberührt dunkel bleiben.
  useEffect(() => {
    const el = document.documentElement;
    if (theme === 'light') el.classList.add('hl-team');
    else el.classList.remove('hl-team');
    try {
      localStorage.setItem('hl-theme', theme);
    } catch {
      /* localStorage evtl. blockiert – dann eben nicht merken */
    }
    return () => el.classList.remove('hl-team');
  }, [theme]);

  return (
    <AudioPlayerProvider>
    <div className="h-screen flex flex-col text-hl-text hl-app-bg">
      {/* Kopfzeile */}
      <header
        className="flex items-center justify-between gap-2 px-2 py-2 border-b border-white/10 hl-app-bar backdrop-blur-xl shrink-0"
        style={{ paddingTop: 'calc(env(safe-area-inset-top) + 0.5rem)' }}
      >
        <div className="flex items-center gap-1 min-w-0">
          <button
            onClick={onBack}
            title="Zurück"
            className="flex items-center gap-1 px-2.5 py-2 rounded-lg text-hl-soft hover:text-white active:bg-white/10 cursor-pointer shrink-0"
          >
            <ArrowLeft className="w-5 h-5" />
            <span className="text-[11px] font-sans font-semibold uppercase tracking-wider">Zurück</span>
          </button>
          <img src="/assets/hero-league-logo.png" alt="Hero Team" className="h-6 w-auto ml-1 shrink-0 hl-applogo" />
          <span className="font-display font-black text-white uppercase tracking-tight text-sm truncate">{current.label}</span>
        </div>
        {/* Sonne/Mond: Tag-/Nacht-Ansicht umschalten (merkt sich die Wahl).
            Bewusst KEIN Abmelden-Knopf hier – man flog sonst zu leicht raus.
            Abmelden geht weiterhin im Backoffice (über „Zurück"). */}
        <button
          onClick={() => setTheme((t) => (t === 'light' ? 'dark' : 'light'))}
          title={theme === 'light' ? 'Dunkle Ansicht' : 'Helle Ansicht'}
          aria-label={theme === 'light' ? 'Dunkle Ansicht' : 'Helle Ansicht'}
          className="shrink-0 p-2.5 rounded-full text-hl-mute hover:text-brand-accent-light active:bg-white/10 cursor-pointer transition-colors"
        >
          <motion.span
            key={theme}
            initial={{ rotate: -90, scale: 0.6, opacity: 0 }}
            animate={{ rotate: 0, scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 400, damping: 24 }}
            className="block"
          >
            {theme === 'light' ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
          </motion.span>
        </button>
      </header>

      {/* Hinweis „Zum Home-Bildschirm hinzufügen" – nur wenn nicht schon als App gestartet */}
      {!isStandalone && showInstall && (
        <div className="flex items-center gap-2 px-3 py-2 bg-brand-accent-light/10 border-b border-brand-accent-light/20 shrink-0">
          <Smartphone className="w-4 h-4 text-brand-accent-light shrink-0" />
          <div className="flex-1 text-[12px] text-hl-soft leading-snug">
            {isIos ? (
              <>
                Als App: unten <span className="text-white font-semibold">Teilen</span> →{' '}
                <span className="text-white font-semibold">„Zum Home-Bildschirm“</span>.
              </>
            ) : canInstall ? (
              <button onClick={promptInstall} className="text-brand-accent-light font-semibold underline underline-offset-2 cursor-pointer">
                Zum Startbildschirm hinzufügen
              </button>
            ) : (
              <>
                Als App: Browser-Menü → <span className="text-white font-semibold">„Zum Startbildschirm hinzufügen“</span>.
              </>
            )}
          </div>
          <button onClick={() => setShowInstall(false)} className="text-hl-mute hover:text-white cursor-pointer shrink-0" title="Ausblenden">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Inhalt des aktiven Tabs – sanfter Fade beim Wechsel */}
      <main className="flex-1 min-h-0">
        <motion.div
          key={tab}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className="h-full"
        >
          {tab === 'chats' ? (
            <ChatSystem
              currentUserId={currentUserId}
              canManageTickets={canManageTickets}
              isSuperadmin={isSuperadmin}
              fullHeight
              initialConversationId={initialConversationId ?? getUrlParam('c')}
              initialThreadId={getUrlParam('thread')}
            />
          ) : tab === 'aufgaben' ? (
            <div className="h-full overflow-y-auto p-3">
              <TaskBoard key="tab-aufgaben" currentUserId={currentUserId} isSuperadmin={isSuperadmin} persist mode="tasks" />
            </div>
          ) : tab === 'kalender' ? (
            <div className="h-full overflow-y-auto p-3">
              <TaskBoard key="tab-kalender" currentUserId={currentUserId} isSuperadmin={isSuperadmin} persist mode="calendar" />
            </div>
          ) : tab === 'tickets' ? (
            <div className="h-full overflow-y-auto p-3">
              <TicketSystem currentUserId={currentUserId} canManage={canManageTickets} persist />
            </div>
          ) : (
            <TeamSettings
              user={user}
              onUpdateUser={onUpdateUser}
              theme={theme}
              onToggleTheme={() => setTheme((t) => (t === 'light' ? 'dark' : 'light'))}
              onGoWebsite={onGoWebsite}
              onLogout={onLogout}
            />
          )}
        </motion.div>
      </main>

      {/* Ticket/Aufgabe aus einer Benachrichtigung direkt geöffnet */}
      {deepOpen && (
        <DeepLinkModal
          target={deepOpen}
          currentUserId={currentUserId}
          isSuperadmin={isSuperadmin}
          canManageTickets={canManageTickets}
          onClose={() => setDeepOpen(null)}
        />
      )}

      {/* Läuft weiter beim Tab-Wechsel: Sprachnachrichten-Mini-Leiste */}
      <MiniPlayer />

      {/* Untere Tab-Leiste: schwebende Pille, die zum getippten Tab „fliegt". */}
      <nav
        className="shrink-0 grid grid-cols-5 gap-1 border-t border-white/10 hl-app-dock backdrop-blur-xl px-2 pt-2"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 0.5rem)' }}
      >
        {TABS.map((t) => {
          const active = t.id === tab;
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className="relative flex flex-col items-center justify-center gap-1 py-2 rounded-2xl cursor-pointer active:scale-90 transition-transform"
            >
              {active && (
                <motion.span
                  layoutId="tab-pill"
                  className="absolute inset-0 rounded-2xl bg-brand-accent-light/15 ring-1 ring-brand-accent-light/25"
                  transition={{ type: 'spring', stiffness: 480, damping: 38 }}
                />
              )}
              <motion.span
                animate={{ scale: active ? 1.14 : 1, y: active ? -1 : 0 }}
                transition={{ type: 'spring', stiffness: 500, damping: 26 }}
                className={`relative z-10 transition-colors ${active ? 'text-brand-accent-light' : 'text-hl-mute'}`}
              >
                <Icon className="w-[22px] h-[22px]" />
              </motion.span>
              <span className={`relative z-10 text-[10px] font-sans font-bold uppercase tracking-wide transition-colors ${active ? 'text-brand-accent-light' : 'text-hl-mute'}`}>
                {t.label}
              </span>
            </button>
          );
        })}
      </nav>
    </div>
    </AudioPlayerProvider>
  );
}
