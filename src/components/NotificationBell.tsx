import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Bell, Check, Loader2 } from 'lucide-react';
import type { AppNotification } from '../types';
import { fetchNotifications, markNotificationRead, markAllNotificationsRead } from '../lib/collab';

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

export default function NotificationBell() {
  const [items, setItems] = useState<AppNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const data = await fetchNotifications();
      setItems(data.items);
      setUnread(data.unreadCount);
    } catch {
      /* still – Bereich bleibt leer */
    }
  }, []);

  // Erstladen + Polling alle 20 s.
  useEffect(() => {
    load();
    const iv = setInterval(load, 20000);
    return () => clearInterval(iv);
  }, [load]);

  // Klick außerhalb schließt das Menü.
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const toggle = async () => {
    const next = !open;
    setOpen(next);
    if (next) {
      setLoading(true);
      await load();
      setLoading(false);
    }
  };

  const onItemClick = async (n: AppNotification) => {
    if (n.isRead) return;
    setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, isRead: true } : x)));
    setUnread((u) => Math.max(0, u - 1));
    try {
      await markNotificationRead(n.id);
    } catch {
      load();
    }
  };

  const markAll = async () => {
    setItems((prev) => prev.map((x) => ({ ...x, isRead: true })));
    setUnread(0);
    try {
      await markAllNotificationsRead();
    } catch {
      load();
    }
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={toggle}
        title="Benachrichtigungen"
        className="relative p-2.5 rounded-xl bg-white/5 border border-white/10 text-hl-soft hover:text-white transition-colors cursor-pointer"
      >
        <Bell className="w-5 h-5" />
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 bg-rose-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            className="absolute right-0 mt-2 w-80 max-w-[90vw] bg-[#0a1110] border border-white/10 rounded-2xl shadow-2xl shadow-black/50 z-50 overflow-hidden"
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
              <span className="font-display font-bold text-sm text-white uppercase tracking-tight">Benachrichtigungen</span>
              {items.some((i) => !i.isRead) && (
                <button onClick={markAll} className="text-[11px] text-brand-accent-light hover:underline font-sans flex items-center gap-1 cursor-pointer">
                  <Check className="w-3 h-3" /> Alle gelesen
                </button>
              )}
            </div>
            <div className="max-h-96 overflow-y-auto">
              {loading ? (
                <div className="flex items-center justify-center py-8 text-hl-mute">
                  <Loader2 className="w-5 h-5 animate-spin" />
                </div>
              ) : items.length === 0 ? (
                <p className="text-center text-sm text-hl-mute font-sans py-8">Keine Benachrichtigungen.</p>
              ) : (
                items.map((n) => (
                  <button
                    key={n.id}
                    onClick={() => onItemClick(n)}
                    className={`w-full text-left px-4 py-3 border-b border-white/5 last:border-0 transition-colors cursor-pointer hover:bg-white/[.03] ${
                      n.isRead ? 'opacity-60' : ''
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      {!n.isRead && <span className="mt-1.5 w-2 h-2 rounded-full bg-brand-accent-light shrink-0" />}
                      <div className={n.isRead ? 'pl-4' : ''}>
                        <p className="text-sm text-hl-soft font-sans leading-snug break-words">{n.body}</p>
                        <p className="text-[10px] font-mono text-hl-faint mt-0.5">{fmtDate(n.createdAt)}</p>
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
