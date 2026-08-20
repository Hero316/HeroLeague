import { useEffect, useState } from 'react';
import { MessageSquare } from 'lucide-react';
import { fetchConversations } from '../lib/chat';
import { setChatUnread } from '../lib/badge';

// Ungelesen-Anzeige für Chats (oben im Backoffice). Setzt zusätzlich – wo vom
// Browser unterstützt (installierte PWA) – die Zahl am App-Icon.
export default function ChatUnreadBadge({ onClick }: { onClick?: () => void }) {
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    const load = () =>
      fetchConversations()
        .then((cs) => {
          const total = cs.reduce((s, c) => s + (c.unread || 0), 0);
          setUnread(total);
          setChatUnread(total); // App-Icon-Zahl (kombiniert mit Benachrichtigungen)
        })
        .catch(() => {});
    load();
    const iv = setInterval(load, 25000);
    return () => clearInterval(iv);
  }, []);

  return (
    <button
      onClick={onClick}
      title={`${unread} ungelesene Nachricht(en)`}
      className="relative p-2.5 rounded-xl bg-white/5 border border-white/10 text-hl-soft hover:text-white transition-colors cursor-pointer"
    >
      <MessageSquare className="w-5 h-5" />
      {unread > 0 && (
        <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 bg-rose-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
          {unread > 9 ? '9+' : unread}
        </span>
      )}
    </button>
  );
}
