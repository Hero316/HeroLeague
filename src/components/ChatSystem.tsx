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
} from 'lucide-react';
import type { Conversation, ChatMessage, TeamMember, Ticket, Task } from '../types';
import {
  fetchConversations,
  createGroup,
  startDm,
  fetchMessages,
  sendMessage,
  conversationTitle,
} from '../lib/chat';
import { fetchTeam, fetchTickets, fetchAllTasks } from '../lib/collab';
import { uploadFile } from '../lib/api';

const inputClass =
  'w-full bg-[#060E0F] border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-accent-light';

function fmtTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
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
function MessageAttachment({ m }: { m: ChatMessage }) {
  if (m.attachType === 'ticket' || m.attachType === 'task') {
    return (
      <div className="mt-1.5">
        <AttachChip type={m.attachType} title={m.attachTitle} />
      </div>
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

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[70] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.97 }}
        animate={{ scale: 1 }}
        className="hl-card w-full max-w-md p-5 max-h-[80vh] flex flex-col"
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
}: {
  conversationId: string;
  parentId?: string | null;
  onSent: (m: ChatMessage) => void;
  placeholder: string;
}) {
  const [body, setBody] = useState('');
  const [attach, setAttach] = useState<Attachment | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

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
    <div className="border-t border-white/5 p-3">
      {attach && <PendingAttach attach={attach} onRemove={() => setAttach(null)} />}
      {uploading && (
        <div className="flex items-center gap-1.5 mb-2 text-[11px] text-hl-faint font-mono">
          <Loader2 className="w-3 h-3 animate-spin" /> lädt hoch…
        </div>
      )}
      <div className="flex items-end gap-1.5">
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
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
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
  onOpenThread,
}: {
  m: ChatMessage;
  mine: boolean;
  showAuthor: boolean;
  onOpenThread?: (m: ChatMessage) => void;
}) {
  return (
    <div className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[80%] ${mine ? 'items-end' : 'items-start'} flex flex-col`}>
        {showAuthor && !mine && <span className="text-[10px] font-mono text-hl-dim mb-0.5 px-1">{m.authorName}</span>}
        <div
          className={`rounded-2xl px-3 py-2 ${
            mine ? 'bg-brand-accent-light/90 text-white rounded-br-sm' : 'bg-[#0f1614] border border-white/5 text-hl-soft rounded-bl-sm'
          }`}
        >
          {m.body && <p className="text-sm font-sans whitespace-pre-wrap break-words">{m.body}</p>}
          <MessageAttachment m={m} />
        </div>
        <div className={`flex items-center gap-2 mt-0.5 px-1 ${mine ? 'flex-row-reverse' : ''}`}>
          <span className="text-[10px] font-mono text-hl-faint">{fmtTime(m.createdAt)}</span>
          {onOpenThread && (
            <button
              onClick={() => onOpenThread(m)}
              className="text-[10px] font-mono text-hl-mute hover:text-brand-accent-light cursor-pointer flex items-center gap-1"
            >
              <MessageSquare className="w-3 h-3" />
              {m.replyCount ? `${m.replyCount} Antworten` : 'Antworten'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// --- Thread (Slack-Style) ---------------------------------------------------
function ThreadModal({
  conversationId,
  parent,
  currentUserId,
  onClose,
  onReplyAdded,
}: {
  conversationId: string;
  parent: ChatMessage;
  currentUserId: string;
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

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[65] bg-black/70 backdrop-blur-sm flex items-stretch justify-end"
      onClick={onClose}
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

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[65] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div initial={{ scale: 0.97 }} animate={{ scale: 1 }} className="hl-card w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
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

// --- Hauptkomponente --------------------------------------------------------
export default function ChatSystem({ currentUserId }: { currentUserId: string }) {
  const [convs, setConvs] = useState<Conversation[]>([]);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadingConvs, setLoadingConvs] = useState(true);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [thread, setThread] = useState<ChatMessage | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const loadConvs = useCallback(async () => {
    try {
      setConvs(await fetchConversations());
    } catch {
      /* still */
    } finally {
      setLoadingConvs(false);
    }
  }, []);

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

  const active = useMemo(() => convs.find((c) => c.id === activeId) ?? null, [convs, activeId]);
  const openConversation = (id: string) => {
    setActiveId(id);
    // Ungelesen-Zähler nach dem Öffnen aktualisieren.
    setTimeout(loadConvs, 800);
  };

  return (
    <div className="flex h-[70vh] min-h-[480px] rounded-2xl overflow-hidden border border-white/10 bg-[#070d0c]">
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
            convs.map((c) => {
              const name = conversationTitle(c, currentUserId);
              return (
                <button
                  key={c.id}
                  onClick={() => openConversation(c.id)}
                  className={`w-full text-left px-3 py-2.5 border-b border-white/5 hover:bg-white/[.03] cursor-pointer transition-colors ${
                    c.id === activeId ? 'bg-white/[.05]' : ''
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-full bg-brand-accent/20 border border-brand-accent-light/30 flex items-center justify-center text-brand-accent-light shrink-0">
                      {c.kind === 'group' ? <Hash className="w-4 h-4" /> : <span className="text-[11px] font-bold">{initials(name)}</span>}
                    </div>
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
              <div className="w-8 h-8 rounded-full bg-brand-accent/20 border border-brand-accent-light/30 flex items-center justify-center text-brand-accent-light shrink-0">
                {active.kind === 'group' ? <Hash className="w-4 h-4" /> : <UserIcon className="w-4 h-4" />}
              </div>
              <div className="min-w-0">
                <div className="font-display font-bold text-white text-sm truncate">{conversationTitle(active, currentUserId)}</div>
                <div className="text-[10px] font-mono text-hl-dim flex items-center gap-1">
                  <Users className="w-3 h-3" /> {active.members.length} Mitglieder
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {loadingMsgs ? (
                <div className="flex justify-center py-8 text-hl-mute">
                  <Loader2 className="w-5 h-5 animate-spin" />
                </div>
              ) : messages.length === 0 ? (
                <p className="text-center text-sm text-hl-mute font-sans py-8">Noch keine Nachrichten. Schreib die erste!</p>
              ) : (
                messages.map((m, i) => (
                  <MessageRow
                    key={m.id}
                    m={m}
                    mine={m.authorId === currentUserId}
                    showAuthor={active.kind === 'group' && (i === 0 || messages[i - 1].authorId !== m.authorId)}
                    onOpenThread={setThread}
                  />
                ))
              )}
              <div ref={bottomRef} />
            </div>

            <Composer
              conversationId={active.id}
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
            onClose={() => setThread(null)}
            onReplyAdded={() => activeId && loadMessages(activeId, true)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
