import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { ArrowLeft, MessageSquare, CalendarDays, ListChecks, Ticket as TicketIcon, Smartphone, X, Sun, Moon, Settings, Bell, Lightbulb } from 'lucide-react';
import ChatSystem from './ChatSystem';
import SoccerGame from './SoccerGame';
import TaskBoard from './TaskBoard';
import TicketSystem from './TicketSystem';
import IdeasBoard from './IdeasBoard';
import TeamSettings from './TeamSettings';
import DeepLinkModal from './DeepLinkModal';
import { useInstall } from './InstallProvider';
import { pushDebug, enablePush } from '../lib/push';
import { fetchNotifications, fetchIdeas, fetchAllTasks } from '../lib/collab';
import { fetchConversations } from '../lib/chat';
import { setNotifUnread } from '../lib/badge';
import { getUrlParam, setUrlParam } from '../lib/urlState';
import { useBackClose } from '../lib/backStack';
import { AudioPlayerProvider, MiniPlayer } from './AudioPlayer';
import type { SessionUser, UserStatus, Conversation, Idea, Task } from '../types';

// Eigenständige „Team-App" unter /chat: Vollbild auf iPhone & Android, mit
// unterer Tab-Leiste (Chats · Aufgaben · Tickets). Bewusst getrennt vom
// aufklappbaren Backoffice, damit sich der Chat wie eine echte App anfühlt und
// zum Home-Bildschirm hinzugefügt werden kann (eigenes Manifest chat.webmanifest).

type Tab = 'chats' | 'aufgaben' | 'kalender' | 'tickets' | 'ideen' | 'mehr';

// Untere Leiste (5 Tabs). „Mehr"/Einstellungen ist bewusst NICHT hier, sondern
// oben als Zahnrad neben Tag/Nacht.
const TABS: { id: Tab; label: string; icon: typeof MessageSquare }[] = [
  { id: 'chats', label: 'Chats', icon: MessageSquare },
  { id: 'aufgaben', label: 'Aufgaben', icon: ListChecks },
  { id: 'kalender', label: 'Kalender', icon: CalendarDays },
  { id: 'ideen', label: 'Ideen', icon: Lightbulb },
  { id: 'tickets', label: 'Tickets', icon: TicketIcon },
];
const SETTINGS_TAB = { id: 'mehr' as Tab, label: 'Einstellungen', icon: Settings };

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
  // Aktive Sektion nach einem Reload zuverlässig wiederherstellen.
  // WICHTIG: Der URL-Parameter (?tab=…) allein ist auf dem Handy nicht
  // verlässlich – history.replaceState „vergisst" die Änderung teils über einen
  // Reload/PWA-Neustart hinweg, wodurch man vom Chat plötzlich bei „Aufgaben"
  // landete. Deshalb ist localStorage die maßgebliche Quelle; die URL dient nur
  // als Rückfall und für frische Deep-Links (Benachrichtigungen).
  const TAB_KEY = 'hl-chat-tab';
  const isTab = (v: unknown): v is Tab =>
    v === 'chats' || v === 'aufgaben' || v === 'kalender' || v === 'tickets' || v === 'ideen' || v === 'mehr';
  const readTab = (): Tab => {
    if (getUrlParam('openIdea')) return 'ideen'; // Deep-Link Idee (Benachrichtigung)
    const urlTab = getUrlParam('tab');
    // Frischer Konversations-Deep-Link (c ohne gültigen tab-Parameter) → Chats,
    // damit der verlinkte Chat sicher sichtbar ist.
    if (getUrlParam('c') && !isTab(urlTab)) return 'chats';
    // Zuletzt genutzte Sektion (überlebt Reloads zuverlässig).
    try {
      const saved = localStorage.getItem(TAB_KEY);
      if (isTab(saved)) return saved;
    } catch {
      /* localStorage evtl. blockiert */
    }
    // Rückfall: URL-Parameter, sonst Chats.
    return isTab(urlTab) ? urlTab : 'chats';
  };
  const [tab, setTabState] = useState<Tab>(readTab);
  const setTab = (t: Tab) => {
    setTabState(t);
    // Nur den 'tab'-Parameter ändern – c/thread/av/ad usw. bleiben erhalten.
    setUrlParam('tab', t === 'chats' ? null : t);
    // Zusätzlich zuverlässig merken (maßgeblich beim nächsten Laden).
    try {
      localStorage.setItem(TAB_KEY, t);
    } catch {
      /* localStorage evtl. blockiert – dann bleibt nur der URL-Parameter */
    }
  };
  const [showInstall, setShowInstall] = useState(true);
  const [showGame, setShowGame] = useState(false);
  useBackClose(showGame, () => setShowGame(false));
  const { isStandalone, isIos, canInstall, promptInstall } = useInstall();
  const current = TABS.find((t) => t.id === tab) ?? SETTINGS_TAB;
  // Deep-Link: aus einer Benachrichtigung direkt eine bestimmte Idee öffnen.
  // Einmalig lesen und danach den Parameter aus der URL entfernen.
  const [initialOpenIdeaId] = useState(() => getUrlParam('openIdea'));
  useEffect(() => {
    if (initialOpenIdeaId) setUrlParam('openIdea', null);
  }, [initialOpenIdeaId]);

  // Zurück-Geste/-Taste (iPhone-Kantenwisch, Android-Zurück): Ist man NICHT auf
  // dem Chats-Tab, geht „zurück" zuerst auf den Chats-Tab, statt die App zu
  // verlassen. So landet man von Einstellungen/Aufgaben/… wieder im Chat.
  useBackClose(tab !== 'chats', () => setTab('chats'));

  // „Chats-Home"-Signal: Tippt man unten auf das Chats-Symbol, soll ein offener
  // Chat/Thread zugehen (zurück zur Liste) – ein Zähler, den ChatSystem beobachtet.
  const [chatHomeSignal, setChatHomeSignal] = useState(0);
  const goChatsHome = () => {
    setUrlParam('c', null);
    setUrlParam('thread', null);
    setChatHomeSignal((n) => n + 1);
  };

  // Reaktivierungs-Hinweis: Manche Handys setzen die Benachrichtigungs-Erlaubnis
  // beim Schließen der App zurück (Wunsch bleibt gemerkt, Erlaubnis geht weg).
  // Ist das der Fall, bieten wir oben einen Ein-Tipp-Knopf zum Wieder-Einschalten
  // an – statt dass man jedes Mal in die Einstellungen muss.
  const [needsPush, setNeedsPush] = useState(false);
  const [reactivating, setReactivating] = useState(false);
  useEffect(() => {
    const check = () => {
      if (document.visibilityState !== 'visible') return;
      pushDebug()
        .then((d) =>
          // Ein-Tipp-Knopf zeigen, wenn Push hier (Team-App) noch nicht scharf ist:
          // - Erlaubnis noch nie gefragt (frische Installation) ODER
          // - Push war gewünscht, aber die Erlaubnis ist weg.
          // Bei erteilter Erlaubnis heilt syncPush das Abo ohnehin automatisch.
          setNeedsPush(d.supported && d.permission !== 'granted' && (d.intended || d.permission === 'default'))
        )
        .catch(() => {});
    };
    check();
    document.addEventListener('visibilitychange', check);
    return () => document.removeEventListener('visibilitychange', check);
  }, []);
  const reactivatePush = async () => {
    setReactivating(true);
    try {
      await enablePush();
      setNeedsPush(false);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Konnte nicht aktivieren.');
    } finally {
      setReactivating(false);
    }
  };

  // Benachrichtigungs-Zähler (Aufgaben/Tickets/Ideen) in die App-Icon-Zahl einrechnen.
  // Der Chat-Anteil kommt aus ChatSystem; seit die Glocke im Backoffice weg ist, muss
  // die Team-App den Benachrichtigungs-Anteil selbst pflegen.
  useEffect(() => {
    let alive = true;
    const tick = () => {
      if (document.visibilityState !== 'visible') return;
      fetchNotifications()
        .then((r) => {
          if (alive) setNotifUnread(r.unreadCount);
        })
        .catch(() => {});
    };
    tick();
    const iv = setInterval(tick, 20000);
    document.addEventListener('visibilitychange', tick);
    return () => {
      alive = false;
      clearInterval(iv);
      document.removeEventListener('visibilitychange', tick);
    };
  }, []);

  // „Verpasst"-Zähler pro Tab (kleine Zahl unten in der Leiste). Ohne Push –
  // rein in der App. Chat/Ideen = server-seitig gezählt (ungelesen); Kalender/
  // Aufgaben = neue Einträge seit dem letzten Öffnen (pro Gerät gemerkt).
  const [badges, setBadges] = useState({ chats: 0, ideen: 0, kalender: 0, aufgaben: 0 });
  const SEEN_KEY = (t: 'kalender' | 'aufgaben') => `hl-app-seen-${t}`;
  const getSeen = (t: 'kalender' | 'aufgaben'): number => {
    try {
      return Number(localStorage.getItem(SEEN_KEY(t))) || 0;
    } catch {
      return 0;
    }
  };
  const setSeen = (t: 'kalender' | 'aufgaben', v: number) => {
    try {
      localStorage.setItem(SEEN_KEY(t), String(v));
    } catch {
      /* egal */
    }
  };
  // Beim allerersten Start die „gesehen"-Marke auf jetzt setzen, damit nicht alle
  // bestehenden Termine/Aufgaben sofort als „neu" gezählt werden.
  useEffect(() => {
    (['kalender', 'aufgaben'] as const).forEach((t) => {
      if (!getSeen(t)) setSeen(t, Date.now());
    });
  }, []);
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const [convs, ideas, tasks] = await Promise.all([
          fetchConversations().catch(() => [] as Conversation[]),
          fetchIdeas().catch(() => [] as Idea[]),
          fetchAllTasks().catch(() => [] as Task[]),
        ]);
        if (!alive) return;
        const chats = convs.reduce((s, c) => s + (c.unread || 0), 0);
        const ideen = ideas.reduce((s, i) => s + (i.unread || 0), 0);
        const seenK = getSeen('kalender');
        const seenA = getSeen('aufgaben');
        const ts = (iso: string) => new Date(iso).getTime();
        const kalender = tasks.filter(
          (t) =>
            (t.type === 'termin' || t.type === 'beides') &&
            t.createdBy !== currentUserId &&
            ts(t.createdAt) > seenK
        ).length;
        const aufgaben = tasks.filter(
          (t) =>
            (t.type === 'aufgabe' || t.type === 'beides') &&
            t.createdBy !== currentUserId &&
            (t.assignees ?? []).some((a) => a.userId === currentUserId) &&
            ts(t.createdAt) > seenA
        ).length;
        setBadges({ chats, ideen, kalender, aufgaben });
      } catch {
        /* egal – Zähler bleiben beim letzten Stand */
      }
    };
    tick();
    const iv = setInterval(tick, 20000);
    document.addEventListener('visibilitychange', tick);
    return () => {
      alive = false;
      clearInterval(iv);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [currentUserId]);
  // Öffnet man Kalender/Aufgaben, gilt alles als gesehen ⇒ Zähler sofort auf 0.
  useEffect(() => {
    if (tab === 'kalender') {
      setSeen('kalender', Date.now());
      setBadges((b) => ({ ...b, kalender: 0 }));
    } else if (tab === 'aufgaben') {
      setSeen('aufgaben', Date.now());
      setBadges((b) => ({ ...b, aufgaben: 0 }));
    }
  }, [tab]);
  const badgeFor = (id: Tab): number =>
    id === 'chats' ? badges.chats : id === 'ideen' ? badges.ideen : id === 'kalender' ? badges.kalender : id === 'aufgaben' ? badges.aufgaben : 0;

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
        {/* Rechts oben: Einstellungen (Zahnrad) + Tag/Nacht. Abmelden bewusst
            nicht hier – das steckt in den Einstellungen. */}
        <div className="flex items-center gap-0.5 shrink-0">
          <button
            onClick={() => setShowGame(true)}
            title="Hero Kicker – Mini-Spiel"
            aria-label="Hero Kicker – Mini-Spiel"
            className="p-2.5 rounded-full text-hl-mute hover:text-brand-accent-light active:bg-white/10 cursor-pointer transition-colors text-[19px] leading-none"
          >
            ⚽
          </button>
          <button
            onClick={() => setTab('mehr')}
            title="Einstellungen"
            aria-label="Einstellungen"
            className={`p-2.5 rounded-full active:bg-white/10 cursor-pointer transition-colors ${
              tab === 'mehr' ? 'text-brand-accent-light' : 'text-hl-mute hover:text-brand-accent-light'
            }`}
          >
            <Settings className="w-5 h-5" />
          </button>
          <button
            onClick={() => setTheme((t) => (t === 'light' ? 'dark' : 'light'))}
            title={theme === 'light' ? 'Dunkle Ansicht' : 'Helle Ansicht'}
            aria-label={theme === 'light' ? 'Dunkle Ansicht' : 'Helle Ansicht'}
            className="p-2.5 rounded-full text-hl-mute hover:text-brand-accent-light active:bg-white/10 cursor-pointer transition-colors"
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
        </div>
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

      {/* Benachrichtigungen reaktivieren: erscheint, wenn Push gewünscht ist, die
          Handy-Erlaubnis aber (z.B. nach App-Neustart) fehlt. Ein Tipp genügt. */}
      {needsPush && (
        <button
          onClick={reactivatePush}
          disabled={reactivating}
          className="w-full flex items-center gap-2 px-3 py-2.5 bg-amber-500/15 border-b border-amber-500/30 text-left shrink-0 cursor-pointer disabled:opacity-60"
        >
          <Bell className="w-4 h-4 text-amber-500 shrink-0" />
          <span className="flex-1 text-[12px] text-hl-soft leading-snug">
            <span className="font-semibold text-white">Benachrichtigungen sind aus.</span> Hier tippen, um sie für dieses Gerät einzuschalten.
          </span>
          <span className="text-[11px] font-bold uppercase tracking-wider text-amber-500 shrink-0">
            {reactivating ? '…' : 'Einschalten'}
          </span>
        </button>
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
              homeSignal={chatHomeSignal}
              onChatUnread={(n) => setBadges((b) => (b.chats === n ? b : { ...b, chats: n }))}
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
          ) : tab === 'ideen' ? (
            <IdeasBoard currentUserId={currentUserId} isSuperadmin={isSuperadmin} initialOpenIdeaId={initialOpenIdeaId} />
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

      {/* Mini-Spiel „Hero Kicker" (⚽ oben rechts) */}
      {showGame && <SoccerGame currentUserId={currentUserId} onClose={() => setShowGame(false)} />}

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
          const count = badgeFor(t.id);
          return (
            <button
              key={t.id}
              onClick={() => {
                // Tippt man auf „Chats", immer zurück zur Chat-Liste (offenen
                // Chat/Thread schließen) – egal ob man schon auf dem Tab ist.
                if (t.id === 'chats') goChatsHome();
                setTab(t.id);
              }}
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
                <span className="relative inline-block">
                  <Icon className="w-[22px] h-[22px]" />
                  {count > 0 && (
                    <span className="absolute -top-2 -right-2.5 min-w-[16px] h-4 px-1 inline-flex items-center justify-center rounded-full bg-[#E6238E] text-white text-[9px] font-bold leading-none tabular-nums shadow-[0_2px_6px_rgba(230,35,142,.5)] ring-2 ring-brand-dark">
                      {count > 99 ? '99+' : count}
                    </span>
                  )}
                </span>
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
