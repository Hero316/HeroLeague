import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  MessageSquare,
  Plus,
  Send,
  X,
  Users,
  Hash,
  User as UserIcon,
  Paperclip,
  Link2,
  Mic,
  File as FileIcon,
  Ticket as TicketIcon,
  CalendarDays,
  Loader2,
  ArrowLeft,
  Search,
  Info,
  Camera,
  Trash2,
  UserPlus,
  Check,
} from 'lucide-react';
import type { Conversation, ChatMessage, TeamMember, Ticket, Task, UserStatus } from '../types';
import { USER_STATUS } from '../types';
import {
  fetchConversations,
  createGroup,
  startDm,
  fetchMessages,
  sendMessage,
  conversationTitle,
  searchChat,
  updateGroup,
  addGroupMember,
  removeGroupMember,
  type ChatSearchHit,
} from '../lib/chat';
import { fetchTeam, fetchTickets, fetchAllTasks, fetchTask, memberMap } from '../lib/collab';
import { setChatUnread } from '../lib/badge';
import { useBackdropDismiss } from './ui';
import { uploadFile, uploadImage } from '../lib/api';
import Avatar from './Avatar';
import { TicketDetail } from './TicketSystem';
import { TaskDetail } from './TaskBoard';

const inputClass =
  'w-full bg-[#060E0F] border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-accent-light';

function fmtTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}
// Nur die Uhrzeit (hh:mm) – klein in der Nachrichten-Bubble.
function fmtClock(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}
// Tages-Schlüssel zum Erkennen eines Datumswechsels beim Scrollen.
function dayKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}
// Datums-Trenner wie bei WhatsApp: „Heute“, „Gestern“, Wochentag oder Datum.
function fmtDaySeparator(iso: string): string {
  const d = new Date(iso);
  d.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((today.getTime() - d.getTime()) / 86400000);
  if (diff === 0) return 'Heute';
  if (diff === 1) return 'Gestern';
  if (diff > 1 && diff < 7) return d.toLocaleDateString('de-DE', { weekday: 'long' });
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('');
}

// Anhang im Composer (noch nicht gesendet): Verweis (Ticket/Aufgabe) oder Medium (Datei/Audio).
type Attachment =
  | { kind: 'ref'; type: 'ticket' | 'task'; id: string; title: string }
  | { kind: 'media'; type: 'file' | 'audio'; url: string; mime: string; title: string };

function AttachChip({ type, title }: { type: 'ticket' | 'task'; title: string | null }) {
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-brand-accent/15 border border-brand-accent-light/30 text-brand-accent-light text-[11px] font-sans font-semibold max-w-full">
      {type === 'ticket' ? <TicketIcon className="w-3.5 h-3.5 shrink-0" /> : <CalendarDays className="w-3.5 h-3.5 shrink-0" />}
      <span className="truncate">{type === 'ticket' ? 'Ticket' : 'Aufgabe'}: {title || '—'}</span>
    </span>
  );
}

// Anhang einer bereits gesendeten Nachricht darstellen.
function MessageAttachment({ m, onOpen }: { m: ChatMessage; onOpen?: (type: 'ticket' | 'task', id: string) => void }) {
  if (m.attachType === 'ticket' || m.attachType === 'task') {
    const type = m.attachType;
    return (
      <button
        type="button"
        onClick={() => m.attachId && onOpen?.(type, m.attachId)}
        title="Öffnen"
        className="mt-1.5 block text-left cursor-pointer hover:brightness-125 transition"
      >
        <AttachChip type={type} title={m.attachTitle} />
      </button>
    );
  }
  if (m.attachType === 'audio' && m.attachUrl) {
    return <audio controls src={m.attachUrl} className="mt-1.5 w-56 max-w-full h-9" />;
  }
  if (m.attachType === 'file' && m.attachUrl) {
    const isImg = (m.attachMime ?? '').startsWith('image/');
    if (isImg) {
      return (
        <a href={m.attachUrl} target="_blank" rel="noreferrer" className="block mt-1.5">
          <img src={m.attachUrl} alt={m.attachTitle ?? 'Bild'} className="max-h-56 max-w-full rounded-lg border border-white/10" />
        </a>
      );
    }
    return (
      <a
        href={m.attachUrl}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-2 mt-1.5 px-2.5 py-1.5 rounded-lg bg-white/5 border border-white/10 text-hl-soft text-[12px] font-sans hover:text-white max-w-full"
      >
        <FileIcon className="w-4 h-4 shrink-0 text-brand-accent-light" />
        <span className="truncate">{m.attachTitle || 'Datei'}</span>
      </a>
    );
  }
  return null;
}

// Sprachaufnahme per Umschalten (klick = an, klick = aus – nicht gedrückt halten).
function useAudioRecorder(onDone: (file: File) => void) {
  const [recording, setRecording] = useState(false);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);

  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => e.data.size > 0 && chunksRef.current.push(e.data);
      rec.onstop = () => {
        const type = rec.mimeType || 'audio/webm';
        const blob = new Blob(chunksRef.current, { type });
        const ext = type.includes('ogg') ? 'ogg' : type.includes('mp4') ? 'm4a' : 'webm';
        onDone(new File([blob], `sprachnachricht.${ext}`, { type }));
        stream.getTracks().forEach((t) => t.stop());
      };
      rec.start();
      recRef.current = rec;
      setRecording(true);
    } catch {
      alert('Mikrofon nicht verfügbar oder Zugriff verweigert.');
    }
  };
  const stop = () => {
    recRef.current?.stop();
    recRef.current = null;
    setRecording(false);
  };
  return { recording, toggle: () => (recording ? stop() : start()) };
}

// --- Anhang wählen (Ticket/Aufgabe) ----------------------------------------
function AttachPicker({
  onPick,
  onClose,
}: {
  onPick: (a: { type: 'ticket' | 'task'; id: string; title: string }) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<'ticket' | 'task'>('ticket');
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([fetchTickets().catch(() => []), fetchAllTasks().catch(() => [])])
      .then(([ti, ta]) => {
        setTickets(ti);
        setTasks(ta);
      })
      .finally(() => setLoading(false));
  }, []);
  const backdrop = useBackdropDismiss(onClose);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[70] bg-black/80 flex items-center justify-center p-4"
      {...backdrop}
    >
      <motion.div
        initial={{ scale: 0.97 }}
        animate={{ scale: 1 }}
        className="hl-card hl-modal-card w-full max-w-md p-5 max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h4 className="font-display font-bold text-white uppercase tracking-tight">Anhängen</h4>
          <button onClick={onClose} className="p-1 text-hl-mute hover:text-white cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex gap-1.5 mb-3 bg-[#060E0F]/40 border border-white/10 rounded-xl p-1">
          {(['ticket', 'task'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-sans font-semibold transition-colors cursor-pointer ${
                tab === t ? 'bg-brand-accent-light text-white' : 'text-hl-mute hover:text-white'
              }`}
            >
              {t === 'ticket' ? 'Tickets' : 'Aufgaben'}
            </button>
          ))}
        </div>
        <div className="overflow-y-auto flex-1 space-y-1.5">
          {loading ? (
            <div className="flex justify-center py-8 text-hl-mute">
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
          ) : tab === 'ticket' ? (
            tickets.length === 0 ? (
              <p className="text-center text-sm text-hl-mute py-6">Keine Tickets.</p>
            ) : (
              tickets.map((t) => (
                <button
                  key={t.id}
                  onClick={() => onPick({ type: 'ticket', id: t.id, title: t.title })}
                  className="w-full text-left px-3 py-2 rounded-lg bg-[#060E0F]/40 border border-white/5 hover:border-white/20 text-sm text-hl-soft cursor-pointer flex items-center gap-2"
                >
                  <TicketIcon className="w-4 h-4 text-brand-accent-light shrink-0" />
                  <span className="truncate">{t.title}</span>
                </button>
              ))
            )
          ) : tasks.length === 0 ? (
            <p className="text-center text-sm text-hl-mute py-6">Keine Aufgaben.</p>
          ) : (
            tasks.map((t) => (
              <button
                key={t.id}
                onClick={() => onPick({ type: 'task', id: t.id, title: t.title })}
                className="w-full text-left px-3 py-2 rounded-lg bg-[#060E0F]/40 border border-white/5 hover:border-white/20 text-sm text-hl-soft cursor-pointer flex items-center gap-2"
              >
                <CalendarDays className="w-4 h-4 text-brand-accent-light shrink-0" />
                <span className="truncate">{t.title}</span>
              </button>
            ))
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

// --- Composer (wiederverwendet für Haupt-Chat und Threads) ------------------
function PendingAttach({ attach, onRemove }: { attach: Attachment; onRemove: () => void }) {
  return (
    <div className="flex items-center gap-2 mb-2">
      {attach.kind === 'ref' ? (
        <AttachChip type={attach.type} title={attach.title} />
      ) : attach.type === 'audio' ? (
        <audio controls src={attach.url} className="h-9 w-56 max-w-full" />
      ) : attach.mime.startsWith('image/') ? (
        <img src={attach.url} alt={attach.title} className="h-16 w-16 object-cover rounded-lg border border-white/10" />
      ) : (
        <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-white/5 border border-white/10 text-hl-soft text-[12px] max-w-[12rem]">
          <FileIcon className="w-4 h-4 shrink-0 text-brand-accent-light" />
          <span className="truncate">{attach.title}</span>
        </span>
      )}
      <button onClick={onRemove} className="text-hl-mute hover:text-white cursor-pointer" title="Anhang entfernen">
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

function Composer({
  conversationId,
  parentId,
  onSent,
  placeholder,
  mentionable,
}: {
  conversationId: string;
  parentId?: string | null;
  onSent: (m: ChatMessage) => void;
  placeholder: string;
  mentionable?: { id: string; name: string }[];
}) {
  const [body, setBody] = useState('');
  const [attach, setAttach] = useState<Attachment | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  // @-Erwähnung: Token am Textende nach '@' erkennen und passende Mitglieder anbieten.
  const onBodyChange = (val: string) => {
    setBody(val);
    const mm = /@([^\s@]*)$/.exec(val);
    setMentionQuery(mm ? mm[1].toLowerCase() : null);
  };
  const mentionMatches =
    mentionQuery !== null ? (mentionable ?? []).filter((mm) => mm.name.toLowerCase().includes(mentionQuery)).slice(0, 6) : [];
  const pickMention = (name: string) => {
    setBody((prev) => prev.replace(/@([^\s@]*)$/, `@${name} `));
    setMentionQuery(null);
    taRef.current?.focus();
  };

  const recorder = useAudioRecorder(async (file) => {
    setUploading(true);
    try {
      const { url, mime } = await uploadFile(file);
      setAttach({ kind: 'media', type: 'audio', url, mime, title: 'Sprachnachricht' });
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Sprachnachricht konnte nicht hochgeladen werden.');
    } finally {
      setUploading(false);
    }
  });

  const onFileChosen = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    try {
      const { url, name, mime } = await uploadFile(file);
      setAttach({ kind: 'media', type: 'file', url, mime, title: name });
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Datei konnte nicht hochgeladen werden.');
    } finally {
      setUploading(false);
    }
  };

  const submit = async () => {
    if (!body.trim() && !attach) return;
    setBusy(true);
    try {
      const m = await sendMessage({
        conversationId,
        body: body.trim(),
        parentId: parentId ?? null,
        attachType: attach?.type ?? null,
        attachId: attach?.kind === 'ref' ? attach.id : null,
        attachTitle: attach?.title ?? null,
        attachUrl: attach?.kind === 'media' ? attach.url : null,
        attachMime: attach?.kind === 'media' ? attach.mime : null,
      });
      setBody('');
      setAttach(null);
      onSent(m);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Nachricht konnte nicht gesendet werden.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="border-t border-white/5 p-3" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 0.75rem)' }}>
      {attach && <PendingAttach attach={attach} onRemove={() => setAttach(null)} />}
      {uploading && (
        <div className="flex items-center gap-1.5 mb-2 text-[11px] text-hl-faint font-mono">
          <Loader2 className="w-3 h-3 animate-spin" /> lädt hoch…
        </div>
      )}
      <div className="relative flex items-end gap-1.5">
        {mentionMatches.length > 0 && (
          <div className="absolute bottom-full left-0 mb-2 w-56 bg-[#0f1614] border border-white/15 rounded-xl shadow-2xl shadow-black/50 overflow-hidden z-20">
            {mentionMatches.map((mm) => (
              <button
                key={mm.id}
                onClick={() => pickMention(mm.name)}
                className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-white/[.05] cursor-pointer"
              >
                <Avatar name={mm.name} size={22} />
                <span className="text-sm text-hl-soft truncate">{mm.name}</span>
              </button>
            ))}
          </div>
        )}
        <button
          onClick={() => setShowPicker(true)}
          title="Ticket oder Aufgabe anhängen"
          className="p-2.5 rounded-xl bg-white/5 border border-white/10 text-hl-soft hover:text-white cursor-pointer shrink-0"
        >
          <Link2 className="w-4 h-4" />
        </button>
        <button
          onClick={() => fileRef.current?.click()}
          title="Datei / Bild anhängen"
          className="p-2.5 rounded-xl bg-white/5 border border-white/10 text-hl-soft hover:text-white cursor-pointer shrink-0"
        >
          <Paperclip className="w-4 h-4" />
        </button>
        <input
          ref={fileRef}
          type="file"
          className="hidden"
          onChange={(e) => {
            void onFileChosen(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
        <button
          onClick={recorder.toggle}
          title={recorder.recording ? 'Aufnahme stoppen & anhängen' : 'Sprachnachricht aufnehmen'}
          className={`p-2.5 rounded-xl border cursor-pointer shrink-0 transition-colors ${
            recorder.recording
              ? 'bg-rose-500/20 border-rose-500/50 text-rose-300 animate-pulse'
              : 'bg-white/5 border-white/10 text-hl-soft hover:text-white'
          }`}
        >
          <Mic className="w-4 h-4" />
        </button>
        <textarea
          ref={taRef}
          value={body}
          onChange={(e) => onBodyChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              if (mentionMatches.length > 0) {
                e.preventDefault();
                pickMention(mentionMatches[0].name);
                return;
              }
              e.preventDefault();
              submit();
            }
          }}
          rows={1}
          placeholder={placeholder}
          className={`${inputClass} resize-none max-h-32`}
        />
        <button
          onClick={submit}
          disabled={busy || uploading}
          className="p-2.5 rounded-xl bg-brand-accent-light hover:bg-brand-accent text-white cursor-pointer disabled:opacity-50 shrink-0"
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </button>
      </div>
      <AnimatePresence>
        {showPicker && (
          <AttachPicker
            onPick={(a) => {
              setAttach({ kind: 'ref', type: a.type, id: a.id, title: a.title });
              setShowPicker(false);
            }}
            onClose={() => setShowPicker(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// --- Eine Nachricht ---------------------------------------------------------
function MessageRow({
  m,
  mine,
  showAuthor,
  displayName,
  avatarUrl,
  onOpenThread,
  onOpenAttachment,
}: {
  m: ChatMessage;
  mine: boolean;
  showAuthor: boolean;
  displayName?: string;
  avatarUrl?: string;
  onOpenThread?: (m: ChatMessage) => void;
  onOpenAttachment?: (type: 'ticket' | 'task', id: string) => void;
}) {
  const name = displayName || m.authorName;
  return (
    <div className={`flex gap-2 ${mine ? 'justify-end' : 'justify-start'}`}>
      {!mine && <div className="w-7 shrink-0 self-end">{showAuthor && <Avatar name={name} url={avatarUrl} size={28} />}</div>}
      <div className={`max-w-[80%] ${mine ? 'items-end' : 'items-start'} flex flex-col`}>
        {/* Gruppen: Name des Absenders klein über dem ersten Block (wie WhatsApp) */}
        {showAuthor && !mine && <span className="text-[11px] font-sans font-semibold text-brand-accent-light/90 mb-0.5 px-1">{name}</span>}
        <div
          className={`rounded-2xl px-3 py-1.5 ${
            mine ? 'bg-brand-accent-light/90 text-white rounded-br-sm' : 'bg-[#0f1614] border border-white/5 text-hl-soft rounded-bl-sm'
          }`}
        >
          {m.body && <p className="text-sm font-sans whitespace-pre-wrap break-words">{m.body}</p>}
          <MessageAttachment m={m} onOpen={onOpenAttachment} />
          {/* Uhrzeit klein in der Bubble, rechts unten */}
          <div className={`text-[9px] font-mono leading-none text-right mt-1 ${mine ? 'text-white/70' : 'text-hl-faint'}`}>
            {fmtClock(m.createdAt)}
          </div>
        </div>
        {/* Antworten dezent: nur Symbol, mit Zahl wenn schon Antworten da sind */}
        {onOpenThread && (
          <button
            onClick={() => onOpenThread(m)}
            className="mt-0.5 px-1 text-[10px] font-mono text-hl-faint hover:text-brand-accent-light cursor-pointer flex items-center gap-1"
          >
            <MessageSquare className="w-3 h-3" />
            {m.replyCount ? m.replyCount : ''}
          </button>
        )}
      </div>
    </div>
  );
}

// --- Thread (Slack-Style) ---------------------------------------------------
function ThreadModal({
  conversationId,
  parent,
  currentUserId,
  mentionable,
  onClose,
  onReplyAdded,
}: {
  conversationId: string;
  parent: ChatMessage;
  currentUserId: string;
  mentionable?: { id: string; name: string }[];
  onClose: () => void;
  onReplyAdded: () => void;
}) {
  const [replies, setReplies] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    fetchMessages(conversationId, parent.id)
      .then(setReplies)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [conversationId, parent.id]);

  useEffect(() => {
    load();
  }, [load]);
  const backdrop = useBackdropDismiss(onClose);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[65] bg-black/80 flex items-stretch justify-end"
      {...backdrop}
    >
      <motion.div
        initial={{ x: 40 }}
        animate={{ x: 0 }}
        exit={{ x: 40 }}
        className="w-full max-w-md bg-[#0a1110] border-l border-white/10 flex flex-col h-full"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
          <span className="font-display font-bold text-white uppercase tracking-tight flex items-center gap-1.5">
            <MessageSquare className="w-4 h-4 text-brand-accent-light" /> Thread
          </span>
          <button onClick={onClose} className="p-1 text-hl-mute hover:text-white cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          <div className="pb-3 border-b border-white/5">
            <MessageRow m={parent} mine={parent.authorId === currentUserId} showAuthor />
          </div>
          {loading ? (
            <div className="flex justify-center py-6 text-hl-mute">
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
          ) : (
            replies.map((r) => <MessageRow key={r.id} m={r} mine={r.authorId === currentUserId} showAuthor />)
          )}
        </div>
        <Composer
          conversationId={conversationId}
          parentId={parent.id}
          mentionable={mentionable}
          placeholder="Im Thread antworten…"
          onSent={(m) => {
            setReplies((prev) => [...prev, m]);
            onReplyAdded();
          }}
        />
      </motion.div>
    </motion.div>
  );
}

// --- Neue Unterhaltung ------------------------------------------------------
function NewConversationModal({
  team,
  currentUserId,
  onCreated,
  onClose,
}: {
  team: TeamMember[];
  currentUserId: string;
  onCreated: (id: string) => void;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<'dm' | 'group'>('dm');
  const [title, setTitle] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const others = team.filter((m) => m.id !== currentUserId);

  const toggle = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const create = async () => {
    setBusy(true);
    try {
      if (mode === 'dm') {
        if (selected.length !== 1) {
          alert('Bitte genau eine Person auswählen.');
          setBusy(false);
          return;
        }
        const { id } = await startDm(selected[0]);
        onCreated(id);
      } else {
        if (!title.trim()) {
          alert('Bitte einen Gruppennamen angeben.');
          setBusy(false);
          return;
        }
        const { id } = await createGroup(title.trim(), selected);
        onCreated(id);
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Konnte nicht erstellt werden.');
      setBusy(false);
    }
  };
  const backdrop = useBackdropDismiss(onClose);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[65] bg-black/80 flex items-center justify-center p-4"
      {...backdrop}
    >
      <motion.div initial={{ scale: 0.97 }} animate={{ scale: 1 }} className="hl-card hl-modal-card w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h4 className="font-display font-bold text-white uppercase tracking-tight">Neue Unterhaltung</h4>
          <button onClick={onClose} className="p-1 text-hl-mute hover:text-white cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex gap-1.5 mb-4 bg-[#060E0F]/40 border border-white/10 rounded-xl p-1">
          {(['dm', 'group'] as const).map((mo) => (
            <button
              key={mo}
              onClick={() => {
                setMode(mo);
                setSelected([]);
              }}
              className={`flex-1 px-3 py-2 rounded-lg text-xs font-sans font-semibold transition-colors cursor-pointer flex items-center justify-center gap-1.5 ${
                mode === mo ? 'bg-brand-accent-light text-white' : 'text-hl-mute hover:text-white'
              }`}
            >
              {mo === 'dm' ? <UserIcon className="w-3.5 h-3.5" /> : <Hash className="w-3.5 h-3.5" />}
              {mo === 'dm' ? 'Direktnachricht' : 'Gruppe'}
            </button>
          ))}
        </div>

        {mode === 'group' && (
          <div className="mb-3">
            <label className="block text-[10px] font-mono text-hl-dim uppercase mb-1">Gruppenname</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="z.B. Redaktion" className={inputClass} />
          </div>
        )}

        <label className="block text-[10px] font-mono text-hl-dim uppercase mb-1.5">
          {mode === 'dm' ? 'Person' : 'Mitglieder'}
        </label>
        <div className="flex flex-wrap gap-1.5 max-h-48 overflow-y-auto">
          {others.length === 0 && <span className="text-xs text-hl-faint font-sans">Keine weiteren Team-Mitglieder.</span>}
          {others.map((m) => {
            const on = selected.includes(m.id);
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => (mode === 'dm' ? setSelected([m.id]) : toggle(m.id))}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-sans font-semibold border transition-colors cursor-pointer ${
                  on
                    ? 'bg-brand-accent-light/20 border-brand-accent-light/50 text-brand-accent-light'
                    : 'bg-white/5 border-white/10 text-hl-mute hover:text-white'
                }`}
              >
                {on ? '✓ ' : ''}
                {m.name}
              </button>
            );
          })}
        </div>

        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider bg-white/5 border border-white/10 text-hl-mute hover:text-white cursor-pointer">
            Abbrechen
          </button>
          <button
            onClick={create}
            disabled={busy}
            className="px-5 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider bg-brand-accent-light hover:bg-brand-accent text-white cursor-pointer disabled:opacity-50"
          >
            {mode === 'dm' ? 'Chat öffnen' : 'Gruppe erstellen'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// --- Info-Fenster: Gruppe (Superadmin: Name/Bild/Mitglieder) bzw. DM-Profil --
function ConversationInfo({
  conversation,
  members,
  team,
  currentUserId,
  isSuperadmin,
  onClose,
  onChanged,
}: {
  conversation: Conversation;
  members: Map<string, TeamMember>;
  team: TeamMember[];
  currentUserId: string;
  isSuperadmin: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const isGroup = conversation.kind === 'group';
  const canEdit = isGroup && isSuperadmin;
  const [title, setTitle] = useState(conversation.title);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const otherId = !isGroup ? conversation.members.find((m) => m.userId !== currentUserId)?.userId : undefined;
  const other = otherId ? members.get(otherId) : undefined;
  const statusLine = (s?: UserStatus | null) => (s ? `${USER_STATUS[s].emoji} ${USER_STATUS[s].label}` : '');
  const memberIds = new Set(conversation.members.map((m) => m.userId));
  const addable = team.filter((m) => !memberIds.has(m.id));
  const backdrop = useBackdropDismiss(onClose);

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
      onChanged();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Aktion fehlgeschlagen.');
    } finally {
      setBusy(false);
    }
  };
  const onAvatar = (file?: File) => {
    if (!file) return;
    void act(async () => {
      const url = await uploadImage(file, { maxDimension: 512 });
      await updateGroup(conversation.id, { avatarUrl: url });
    });
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[65] bg-black/80 flex items-center justify-center p-4" {...backdrop}>
      <motion.div initial={{ scale: 0.97 }} animate={{ scale: 1 }} className="hl-card hl-modal-card w-full max-w-sm p-5 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h4 className="font-display font-bold text-white uppercase tracking-tight">Infos</h4>
          <button onClick={onClose} className="p-1 text-hl-mute hover:text-white cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>
        {isGroup ? (
          <>
            <div className="flex items-center gap-3 mb-4">
              <div className="relative shrink-0">
                {conversation.avatarUrl ? (
                  <Avatar name={conversation.title || 'Gruppe'} url={conversation.avatarUrl} size={56} />
                ) : (
                  <div className="w-14 h-14 rounded-full bg-brand-accent/20 border border-brand-accent-light/30 flex items-center justify-center text-brand-accent-light">
                    <Hash className="w-7 h-7" />
                  </div>
                )}
                {canEdit && (
                  <>
                    <button onClick={() => fileRef.current?.click()} disabled={busy} title="Gruppenbild ändern" className="absolute -bottom-1 -right-1 p-1.5 rounded-full bg-brand-accent-light text-white border-2 border-[#0b1210] cursor-pointer disabled:opacity-50">
                      {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Camera className="w-3 h-3" />}
                    </button>
                    <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { onAvatar(e.target.files?.[0]); e.target.value = ''; }} />
                  </>
                )}
              </div>
              <div className="min-w-0 flex-1">
                {canEdit ? (
                  <div className="flex items-center gap-1.5">
                    <input value={title} onChange={(e) => setTitle(e.target.value)} className="w-full bg-[#060E0F] border border-white/10 rounded-lg px-2.5 py-1.5 text-sm text-white focus:outline-none focus:border-brand-accent-light" />
                    {title.trim() && title !== conversation.title && (
                      <button onClick={() => act(() => updateGroup(conversation.id, { title: title.trim() }))} disabled={busy} className="p-2 rounded-lg bg-brand-accent-light text-white cursor-pointer disabled:opacity-50 shrink-0" title="Name speichern">
                        <Check className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="font-display font-black text-white text-lg truncate">{conversation.title || 'Gruppe'}</div>
                )}
                <div className="text-[11px] font-mono text-hl-dim mt-0.5">{conversation.members.length} Mitglieder</div>
              </div>
            </div>

            <div className="text-[10px] font-mono uppercase tracking-wider text-hl-dim mb-2">Mitglieder</div>
            <div className="space-y-1.5 mb-4">
              {conversation.members.map((mm) => {
                const mem = members.get(mm.userId);
                return (
                  <div key={mm.userId} className="flex items-center gap-2.5">
                    <Avatar name={mem?.name ?? mm.userName} url={mem?.avatarUrl} status={mem?.status} size={30} showStatus ring="#0b1210" />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-sans text-white truncate">{mem?.name ?? mm.userName}</div>
                    </div>
                    {canEdit && mm.userId !== currentUserId && (
                      <button onClick={() => act(() => removeGroupMember(conversation.id, mm.userId))} disabled={busy} title="Entfernen" className="p-1.5 text-hl-mute hover:text-rose-400 cursor-pointer disabled:opacity-50">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            {canEdit && addable.length > 0 && (
              <>
                <div className="text-[10px] font-mono uppercase tracking-wider text-hl-dim mb-2 flex items-center gap-1">
                  <UserPlus className="w-3.5 h-3.5" /> Hinzufügen
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {addable.map((m) => (
                    <button key={m.id} onClick={() => act(() => addGroupMember(conversation.id, m.id))} disabled={busy} className="px-2.5 py-1.5 rounded-lg text-xs font-sans font-semibold border bg-white/5 border-white/10 text-hl-mute hover:text-white cursor-pointer disabled:opacity-50 flex items-center gap-1.5">
                      <Avatar name={m.name} url={m.avatarUrl} size={18} /> {m.name}
                    </button>
                  ))}
                </div>
              </>
            )}
          </>
        ) : (
          <div className="flex flex-col items-center text-center gap-3 py-4">
            <Avatar name={other?.name ?? conversationTitle(conversation, currentUserId)} url={other?.avatarUrl} status={other?.status} size={84} showStatus ring="#0b1210" />
            <div className="font-display font-black text-white text-lg">{other?.name ?? conversationTitle(conversation, currentUserId)}</div>
            {other?.status && <div className="text-sm text-hl-soft">{statusLine(other.status)}</div>}
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}

// --- Hauptkomponente --------------------------------------------------------
export default function ChatSystem({
  currentUserId,
  canManageTickets = false,
  isSuperadmin = false,
  fullHeight = false,
  initialConversationId = null,
}: {
  currentUserId: string;
  canManageTickets?: boolean;
  isSuperadmin?: boolean;
  fullHeight?: boolean;
  initialConversationId?: string | null;
}) {
  const [convs, setConvs] = useState<Conversation[]>([]);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadingConvs, setLoadingConvs] = useState(true);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [thread, setThread] = useState<ChatMessage | null>(null);
  const [attachView, setAttachView] = useState<{ type: 'ticket'; id: string } | { type: 'task'; task: Task } | null>(null);
  const [showInfo, setShowInfo] = useState(false);
  const [search, setSearch] = useState('');
  const [hits, setHits] = useState<ChatSearchHit[]>([]);
  const [convSearch, setConvSearch] = useState('');
  const [showConvSearch, setShowConvSearch] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Ticket/Aufgabe aus einem Anhang öffnen (lesen/bearbeiten).
  const openAttachment = async (type: 'ticket' | 'task', id: string) => {
    if (type === 'ticket') setAttachView({ type: 'ticket', id });
    else {
      try {
        setAttachView({ type: 'task', task: await fetchTask(id) });
      } catch {
        alert('Aufgabe nicht gefunden (evtl. gelöscht).');
      }
    }
  };

  const loadConvs = useCallback(async () => {
    try {
      const cs = await fetchConversations();
      setConvs(cs);
      setChatUnread(cs.reduce((s, c) => s + (c.unread || 0), 0)); // App-Icon-Zahl
    } catch {
      /* still */
    } finally {
      setLoadingConvs(false);
    }
  }, []);

  // Deep-Link: aus einer Benachrichtigung direkt in diese Unterhaltung springen.
  const didOpenInitial = useRef(false);
  useEffect(() => {
    if (initialConversationId && !didOpenInitial.current) {
      didOpenInitial.current = true;
      setActiveId(initialConversationId);
    }
  }, [initialConversationId]);

  const loadMessages = useCallback(async (id: string, quiet = false) => {
    if (!quiet) setLoadingMsgs(true);
    try {
      setMessages(await fetchMessages(id));
    } catch {
      /* still */
    } finally {
      setLoadingMsgs(false);
    }
  }, []);

  // Erstladen + Team + Polling der Liste.
  useEffect(() => {
    loadConvs();
    fetchTeam().then(setTeam).catch(() => {});
    const iv = setInterval(loadConvs, 8000);
    return () => clearInterval(iv);
  }, [loadConvs]);

  // Aktive Unterhaltung laden + alle 5 s aktualisieren.
  useEffect(() => {
    if (!activeId) return;
    loadMessages(activeId);
    const iv = setInterval(() => loadMessages(activeId, true), 5000);
    return () => clearInterval(iv);
  }, [activeId, loadMessages]);

  // Nach unten scrollen, wenn neue Nachrichten kommen.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Globale Suche (entprellt).
  useEffect(() => {
    if (search.trim().length < 2) {
      setHits([]);
      return;
    }
    const id = setTimeout(() => {
      searchChat(search.trim()).then(setHits).catch(() => setHits([]));
    }, 300);
    return () => clearTimeout(id);
  }, [search]);

  const active = useMemo(() => convs.find((c) => c.id === activeId) ?? null, [convs, activeId]);
  const members = useMemo(() => memberMap(team), [team]);
  const q = search.trim().toLowerCase();
  const searching = q.length >= 2;
  const convMatches = searching ? convs.filter((c) => conversationTitle(c, currentUserId).toLowerCase().includes(q)) : convs;
  const activeMentionable = useMemo(
    () => (active ? active.members.map((mm) => ({ id: mm.userId, name: members.get(mm.userId)?.name ?? mm.userName })) : []),
    [active, members]
  );
  const shownMessages = useMemo(
    () => (convSearch.trim() ? messages.filter((m) => (m.body ?? '').toLowerCase().includes(convSearch.toLowerCase())) : messages),
    [messages, convSearch]
  );
  const openConversation = (id: string) => {
    setActiveId(id);
    // Ungelesen-Zähler nach dem Öffnen aktualisieren.
    setTimeout(loadConvs, 800);
  };

  return (
    <div
      className={`flex overflow-hidden bg-[#070d0c] ${
        fullHeight ? 'h-full' : 'h-[70vh] min-h-[480px] rounded-2xl border border-white/10'
      }`}
    >
      {/* Liste */}
      <div className={`w-full md:w-72 border-r border-white/5 flex flex-col ${activeId ? 'hidden md:flex' : 'flex'}`}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
          <span className="font-display font-bold text-white uppercase tracking-tight">Chats</span>
          <button
            onClick={() => setShowNew(true)}
            title="Neue Unterhaltung"
            className="p-2 rounded-lg bg-brand-accent-light/20 border border-brand-accent-light/40 text-brand-accent-light hover:bg-brand-accent-light/30 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
        <div className="px-3 py-2 border-b border-white/5">
          <div className="flex items-center gap-2 bg-[#060E0F] border border-white/10 rounded-lg px-2.5 py-1.5">
            <Search className="w-3.5 h-3.5 text-hl-dim shrink-0" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Alle Chats & Nachrichten durchsuchen…"
              className="bg-transparent text-sm text-white placeholder:text-hl-faint focus:outline-none w-full"
            />
            {search && (
              <button onClick={() => setSearch('')} className="text-hl-mute hover:text-white cursor-pointer shrink-0">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {loadingConvs ? (
            <div className="flex justify-center py-8 text-hl-mute">
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
          ) : convs.length === 0 ? (
            <p className="text-center text-sm text-hl-mute font-sans py-8 px-4">
              Noch keine Chats. Starte oben rechts eine Unterhaltung.
            </p>
          ) : (
            convMatches.map((c) => {
              const name = conversationTitle(c, currentUserId);
              const otherId = c.kind === 'dm' ? c.members.find((m) => m.userId !== currentUserId)?.userId : undefined;
              const otherMem = otherId ? members.get(otherId) : undefined;
              return (
                <button
                  key={c.id}
                  onClick={() => openConversation(c.id)}
                  className={`w-full text-left px-3 py-2.5 border-b border-white/5 hover:bg-white/[.03] cursor-pointer transition-colors ${
                    c.id === activeId ? 'bg-white/[.05]' : ''
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    {c.kind === 'group' ? (
                      c.avatarUrl ? (
                        <Avatar name={name} url={c.avatarUrl} size={36} />
                      ) : (
                        <div className="w-9 h-9 rounded-full bg-brand-accent/20 border border-brand-accent-light/30 flex items-center justify-center text-brand-accent-light shrink-0">
                          <Hash className="w-4 h-4" />
                        </div>
                      )
                    ) : (
                      <Avatar name={name} url={otherMem?.avatarUrl} status={otherMem?.status} size={36} showStatus />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-sans font-semibold text-sm text-white truncate">{name}</span>
                        {c.unread > 0 && (
                          <span className="min-w-[18px] h-[18px] px-1 bg-rose-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center shrink-0">
                            {c.unread > 9 ? '9+' : c.unread}
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] text-hl-dim font-sans truncate block">
                        {c.lastMessage
                          ? `${c.lastMessage.authorName}: ${c.lastMessage.attachType ? '📎 ' : ''}${c.lastMessage.body || 'Anhang'}`
                          : 'Noch keine Nachrichten'}
                      </span>
                    </div>
                  </div>
                </button>
              );
            })
          )}

          {searching && hits.length > 0 && (
            <div className="border-t border-white/5">
              <div className="px-3 py-1.5 text-[10px] font-mono uppercase tracking-wider text-hl-dim">Nachrichten</div>
              {hits.map((h) => (
                <button
                  key={h.id}
                  onClick={() => {
                    openConversation(h.conversationId);
                    setSearch('');
                  }}
                  className="w-full text-left px-3 py-2 border-b border-white/5 hover:bg-white/[.03] cursor-pointer"
                >
                  <div className="text-[11px] font-mono text-hl-dim truncate">
                    {h.convKind === 'group' ? `# ${h.convTitle || 'Gruppe'}` : h.authorName} · {fmtTime(h.createdAt)}
                  </div>
                  <div className="text-sm text-hl-soft truncate">
                    <span className="text-white font-semibold">{h.authorName}: </span>
                    {h.body || (h.attachType ? '📎 Anhang' : '')}
                  </div>
                </button>
              ))}
            </div>
          )}
          {searching && hits.length === 0 && convMatches.length === 0 && (
            <p className="text-center text-sm text-hl-mute font-sans py-8 px-4">Keine Treffer.</p>
          )}
        </div>
      </div>

      {/* Nachrichten */}
      <div className={`flex-1 flex-col ${activeId ? 'flex' : 'hidden md:flex'}`}>
        {!active ? (
          <div className="flex-1 flex flex-col items-center justify-center text-hl-mute gap-2">
            <MessageSquare className="w-8 h-8 text-hl-faint" />
            <p className="text-sm font-sans">Wähle links eine Unterhaltung.</p>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2 px-4 py-3 border-b border-white/5">
              <button onClick={() => setActiveId(null)} className="md:hidden p-1 text-hl-mute hover:text-white cursor-pointer">
                <ArrowLeft className="w-5 h-5" />
              </button>
              <button onClick={() => setShowInfo(true)} className="flex items-center gap-2 min-w-0 flex-1 text-left cursor-pointer" title="Infos anzeigen">
                {active.kind === 'group' ? (
                  active.avatarUrl ? (
                    <Avatar name={conversationTitle(active, currentUserId)} url={active.avatarUrl} size={34} />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-brand-accent/20 border border-brand-accent-light/30 flex items-center justify-center text-brand-accent-light shrink-0">
                      <Hash className="w-4 h-4" />
                    </div>
                  )
                ) : (
                  (() => {
                    const other = members.get(active.members.find((m) => m.userId !== currentUserId)?.userId ?? '');
                    return <Avatar name={conversationTitle(active, currentUserId)} url={other?.avatarUrl} status={other?.status} size={34} showStatus />;
                  })()
                )}
                <div className="min-w-0">
                  <div className="font-display font-bold text-white text-sm truncate">{conversationTitle(active, currentUserId)}</div>
                  <div className="text-[10px] font-mono text-hl-dim flex items-center gap-1">
                    <Users className="w-3 h-3" /> {active.members.length} Mitglieder · Infos
                  </div>
                </div>
              </button>
              <button
                onClick={() => setShowConvSearch((v) => !v)}
                title="In diesem Chat suchen"
                className={`p-2 rounded-lg border cursor-pointer shrink-0 ${showConvSearch ? 'bg-brand-accent-light/20 border-brand-accent-light/40 text-brand-accent-light' : 'bg-white/5 border-white/10 text-hl-soft hover:text-white'}`}
              >
                <Search className="w-4 h-4" />
              </button>
            </div>
            {showConvSearch && (
              <div className="px-3 py-2 border-b border-white/5">
                <div className="flex items-center gap-2 bg-[#060E0F] border border-white/10 rounded-lg px-2.5 py-1.5">
                  <Search className="w-3.5 h-3.5 text-hl-dim shrink-0" />
                  <input
                    value={convSearch}
                    onChange={(e) => setConvSearch(e.target.value)}
                    autoFocus
                    placeholder="In diesem Chat suchen…"
                    className="bg-transparent text-sm text-white placeholder:text-hl-faint focus:outline-none w-full"
                  />
                  {convSearch && (
                    <button onClick={() => setConvSearch('')} className="text-hl-mute hover:text-white cursor-pointer shrink-0">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            )}

            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {loadingMsgs ? (
                <div className="flex justify-center py-8 text-hl-mute">
                  <Loader2 className="w-5 h-5 animate-spin" />
                </div>
              ) : shownMessages.length === 0 ? (
                <p className="text-center text-sm text-hl-mute font-sans py-8">
                  {convSearch.trim() ? 'Keine Treffer in diesem Chat.' : 'Noch keine Nachrichten. Schreib die erste!'}
                </p>
              ) : (
                shownMessages.map((m, i) => {
                  const mem = members.get(m.authorId);
                  const prev = i > 0 ? shownMessages[i - 1] : null;
                  const newDay = !prev || dayKey(prev.createdAt) !== dayKey(m.createdAt);
                  // Absender-Name/Bild nur beim ersten Block einer Person zeigen
                  // (bzw. nach einem Tageswechsel wieder).
                  const showAuthor = active.kind === 'group' && (newDay || !prev || prev.authorId !== m.authorId);
                  return (
                    <React.Fragment key={m.id}>
                      {newDay && (
                        <div className="flex justify-center my-3">
                          <span className="text-[10px] font-mono uppercase tracking-wider text-hl-mute bg-[#0b1210] border border-white/10 rounded-full px-3 py-1">
                            {fmtDaySeparator(m.createdAt)}
                          </span>
                        </div>
                      )}
                      <MessageRow
                        m={m}
                        mine={m.authorId === currentUserId}
                        showAuthor={showAuthor}
                        displayName={mem?.name}
                        avatarUrl={mem?.avatarUrl}
                        onOpenThread={setThread}
                        onOpenAttachment={openAttachment}
                      />
                    </React.Fragment>
                  );
                })
              )}
              <div ref={bottomRef} />
            </div>

            <Composer
              conversationId={active.id}
              mentionable={activeMentionable}
              placeholder="Nachricht schreiben… (@Name erwähnt, Enter sendet)"
              onSent={(m) => {
                setMessages((prev) => [...prev, m]);
                loadConvs();
              }}
            />
          </>
        )}
      </div>

      <AnimatePresence>
        {showNew && (
          <NewConversationModal
            team={team}
            currentUserId={currentUserId}
            onClose={() => setShowNew(false)}
            onCreated={(id) => {
              setShowNew(false);
              loadConvs();
              openConversation(id);
            }}
          />
        )}
        {thread && active && (
          <ThreadModal
            conversationId={active.id}
            parent={thread}
            currentUserId={currentUserId}
            mentionable={activeMentionable}
            onClose={() => setThread(null)}
            onReplyAdded={() => activeId && loadMessages(activeId, true)}
          />
        )}
        {showInfo && active && (
          <ConversationInfo
            conversation={active}
            members={members}
            team={team}
            currentUserId={currentUserId}
            isSuperadmin={isSuperadmin}
            onClose={() => setShowInfo(false)}
            onChanged={loadConvs}
          />
        )}
        {attachView?.type === 'ticket' && (
          <TicketDetail
            ticketId={attachView.id}
            team={team}
            canManage={canManageTickets}
            onClose={() => setAttachView(null)}
            onChanged={() => activeId && loadMessages(activeId, true)}
          />
        )}
        {attachView?.type === 'task' && (
          <TaskDetail
            task={attachView.task}
            team={team}
            currentUserId={currentUserId}
            isSuperadmin={isSuperadmin}
            onClose={() => setAttachView(null)}
            onChanged={() => {}}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
