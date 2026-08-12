import { useState } from 'react';
import { ArrowLeft, LogOut, MessageSquare, CalendarDays, Ticket as TicketIcon, Smartphone, X } from 'lucide-react';
import ChatSystem from './ChatSystem';
import TaskBoard from './TaskBoard';
import TicketSystem from './TicketSystem';
import { useInstall } from './InstallProvider';
import { getUrlParam, setUrlParam } from '../lib/urlState';

// Eigenständige „Team-App" unter /chat: Vollbild auf iPhone & Android, mit
// unterer Tab-Leiste (Chats · Aufgaben · Tickets). Bewusst getrennt vom
// aufklappbaren Backoffice, damit sich der Chat wie eine echte App anfühlt und
// zum Home-Bildschirm hinzugefügt werden kann (eigenes Manifest chat.webmanifest).

type Tab = 'chats' | 'aufgaben' | 'tickets';

const TABS: { id: Tab; label: string; icon: typeof MessageSquare }[] = [
  { id: 'chats', label: 'Chats', icon: MessageSquare },
  { id: 'aufgaben', label: 'Aufgaben', icon: CalendarDays },
  { id: 'tickets', label: 'Tickets', icon: TicketIcon },
];

export default function ChatApp({
  currentUserId,
  canManageTickets,
  isSuperadmin,
  initialConversationId,
  onBack,
  onLogout,
}: {
  currentUserId: string;
  canManageTickets: boolean;
  isSuperadmin: boolean;
  initialConversationId: string | null;
  onBack: () => void;
  onLogout: () => void;
}) {
  // Aktiven Tab in der URL halten (?tab=…), damit ein Reload auf derselben
  // Seite bleibt (Chats/Aufgaben/Tickets) statt immer auf „Chats" zu landen.
  const readTab = (): Tab => {
    const t = getUrlParam('tab');
    return t === 'aufgaben' || t === 'tickets' ? t : 'chats';
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

  return (
    <div className="h-screen flex flex-col bg-[#060E0F] text-hl-text">
      {/* Kopfzeile */}
      <header
        className="flex items-center justify-between gap-2 px-2 py-2 border-b border-white/10 bg-[rgba(7,10,8,.92)] backdrop-blur-xl shrink-0"
        style={{ paddingTop: 'calc(env(safe-area-inset-top) + 0.5rem)' }}
      >
        <div className="flex items-center gap-1 min-w-0">
          <button
            onClick={onBack}
            title="Zurück zum Backoffice"
            className="flex items-center gap-1 px-2.5 py-2 rounded-lg text-hl-soft hover:text-white active:bg-white/10 cursor-pointer shrink-0"
          >
            <ArrowLeft className="w-5 h-5" />
            <span className="text-[11px] font-sans font-semibold uppercase tracking-wider">Zurück</span>
          </button>
          <img src="/assets/hero-league-logo.png" alt="Hero Team" className="h-6 w-auto ml-1 shrink-0" />
          <span className="font-display font-black text-white uppercase tracking-tight text-sm truncate">{current.label}</span>
        </div>
        <button
          onClick={onLogout}
          title="Abmelden"
          className="shrink-0 px-3 py-2 rounded-lg text-hl-mute hover:text-hl-red-soft active:bg-white/10 cursor-pointer flex items-center gap-1.5"
        >
          <LogOut className="w-4 h-4" />
          <span className="text-[11px] font-sans font-semibold uppercase tracking-wider hidden sm:inline">Abmelden</span>
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

      {/* Inhalt des aktiven Tabs */}
      <main className="flex-1 min-h-0">
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
            <TaskBoard currentUserId={currentUserId} isSuperadmin={isSuperadmin} persist />
          </div>
        ) : (
          <div className="h-full overflow-y-auto p-3">
            <TicketSystem currentUserId={currentUserId} canManage={canManageTickets} persist />
          </div>
        )}
      </main>

      {/* Untere Tab-Leiste (wie WhatsApp/Slack) */}
      <nav
        className="shrink-0 grid grid-cols-3 border-t border-white/10 bg-[rgba(7,10,8,.96)] backdrop-blur-xl"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {TABS.map((t) => {
          const active = t.id === tab;
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`relative flex flex-col items-center justify-center gap-0.5 py-2.5 cursor-pointer transition-colors ${
                active ? 'text-brand-accent-light' : 'text-hl-mute hover:text-white'
              }`}
            >
              {active && <span className="absolute top-0 h-0.5 w-10 rounded-full bg-brand-accent-light" />}
              <Icon className="w-5 h-5" />
              <span className="text-[10px] font-sans font-semibold uppercase tracking-wide">{t.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
