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
  Mic,
  File as FileIcon,
  Ticket as TicketIcon,
  CalendarDays,
  Loader2,
  ArrowLeft,
  Search,
  Camera,
  Trash2,
  UserPlus,
  Check,
  Image as ImageIcon,
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
  sendPresence,
  fetchPresence,
  type ChatSearchHit,
} from '../lib/chat';
import { fetchTeam, fetchTickets, fetchAllTasks, fetchTask, memberMap } from '../lib/collab';
import { setChatUnread } from '../lib/badge';
import { setUrlParam } from '../lib/urlState';
import { useBackdropDismiss, ModalPortal } from './ui';
import { uploadFile, uploadImage } from '../lib/api';
import Avatar from './Avatar';
import { TicketDetail } from './TicketSystem';
import { TaskDetail } from './TaskBoard';
import { VoiceMessage } from './AudioPlayer';

const inputClass =
  'w-full bg-[#060E0F] border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-accent-light';

// Bubble-Farben (fest, on-brand): eigene Nachricht dunkel-türkis, fremde dunkel.
const BUBBLE_MINE = '#0b5d51';
const BUBBLE_OTHER = '#141e1c';

// Zufällige-aber-konstante Namensfarben (wie WhatsApp). Pro Gruppe anders, weil
// der Konversations-Schlüssel in den Hash einfließt. Gut lesbar auf dunkel.
const NAME_COLORS = [
  '#22DFC9', '#F79AC4', '#E9C46A', '#5CE9AC', '#8AB4FF', '#FF8578', '#C9A0FF',
  '#5FD0E0', '#F6A65A', '#9AE86A', '#FF9FD1', '#B8C36A', '#7FE0C0', '#E0A0F0',
];
function hashStr(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h;
}
function pickNameColor(name: string, seed: string): string {
  return NAME_COLORS[hashStr(`${name}::${seed}`) % NAME_COLORS.length];
}
function firstName(name: string): string {
  return name.split(/\s+/).filter(Boolean)[0] || name;
}

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
// Gehören zwei aufeinanderfolgende Nachrichten zum selben „Block“ (gleicher
// Absender, gleicher Tag, < 5 min Abstand)? Dann rücken sie enger zusammen.
function sameBlock(prev: ChatMessage | null, m: ChatMessage): boolean {
  if (!prev || prev.authorId !== m.authorId) return false;
  if (dayKey(prev.createdAt) !== dayKey(m.createdAt)) return false;
  return new Date(m.createdAt).getTime() - new Date(prev.createdAt).getTime() < 5 * 60000;
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
function MessageAttachment({ m, mine = false, onOpen }: { m: ChatMessage; mine?: boolean; onOpen?: (type: 'ticket' | 'task', id: string) => void }) {
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
    return <VoiceMessage url={m.attachUrl} mine={mine} />;
  }
  if (m.attachType === 'file' && m.attachUrl) {
    const mime = m.attachMime ?? '';
    if (mime.startsWith('image/')) {
      return (
        <a href={m.attachUrl} target="_blank" rel="noreferrer" className="block mt-1.5">
          <img src={m.attachUrl} alt={m.attachTitle ?? 'Bild'} className="max-h-64 max-w-full rounded-xl border border-white/10" />
        </a>
      );
    }
    if (mime.startsWith('video/')) {
      return <video controls src={m.attachUrl} className="mt-1.5 max-h-64 max-w-full rounded-xl border border-white/10" />;
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
  initialTab = 'ticket',
  onPick,
  onClose,
}: {
  initialTab?: 'ticket' | 'task';
  onPick: (a: { type: 'ticket' | 'task'; id: string; title: string }) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<'ticket' | 'task'>(initialTab);
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
    <ModalPortal>
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
    </ModalPortal>
  );
}

// --- Composer (wiederverwendet für Haupt-Chat und Threads) ------------------
function PendingAttach({ attach, onRemove }: { attach: Attachment; onRemove: () => void }) {
  const isVideo = attach.kind === 'media' && attach.type === 'file' && attach.mime.startsWith('video/');
  return (
    <div className="flex items-center gap-2 mb-2">
      {attach.kind === 'ref' ? (
        <AttachChip type={attach.type} title={attach.title} />
      ) : attach.type === 'audio' ? (
        <audio controls src={attach.url} className="h-9 w-56 max-w-full" />
      ) : attach.mime.startsWith('image/') ? (
        <img src={attach.url} alt={attach.title} className="h-16 w-16 object-cover rounded-lg border border-white/10" />
      ) : isVideo ? (
        <video src={attach.url} className="h-16 w-16 object-cover rounded-lg border border-white/10" />
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

// Eine Kachel im Aufklapp-Menü (wie WhatsApp „+“): farbiges Rund + Beschriftung.
function SheetTile({ label, color, icon: Icon, onClick }: { label: string; color: string; icon: typeof ImageIcon; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex flex-col items-center gap-1.5 cursor-pointer group">
      <span
        className="w-14 h-14 rounded-full flex items-center justify-center transition-transform group-hover:scale-105 group-active:scale-95"
        style={{ background: `${color}22`, border: `1px solid ${color}55` }}
      >
        <Icon className="w-6 h-6" style={{ color }} />
      </span>
      <span className="text-[11px] font-sans text-hl-soft">{label}</span>
    </button>
  );
}

function Composer({
  conversationId,
  parentId,
  onSent,
  placeholder,
  mentionable,
  onTyping,
  onStopTyping,
}: {
  conversationId: string;
  parentId?: string | null;
  onSent: (m: ChatMessage) => void;
  placeholder: string;
  mentionable?: { id: string; name: string }[];
  onTyping?: () => void;
  onStopTyping?: () => void;
}) {
  const [body, setBody] = useState('');
  const [attach, setAttach] = useState<Attachment | null>(null);
  const [picker, setPicker] = useState<null | 'ticket' | 'task'>(null);
  const [sheet, setSheet] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const docRef = useRef<HTMLInputElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  // @-Erwähnung: Token am Textende nach '@' erkennen und passende Mitglieder anbieten.
  const onBodyChange = (val: string) => {
    setBody(val);
    const mm = /@([^\s@]*)$/.exec(val);
    setMentionQuery(mm ? mm[1].toLowerCase() : null);
    // Tipp-Signal an die Präsenz (bewusst KEINE Lesebestätigung).
    if (val.trim()) onTyping?.();
    else onStopTyping?.();
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
      onStopTyping?.();
      onSent(m);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Nachricht konnte nicht gesendet werden.');
    } finally {
      setBusy(false);
    }
  };

  const hasContent = !!body.trim() || !!attach;

  const tiles: { key: string; label: string; color: string; icon: typeof ImageIcon; onClick: () => void }[] = [
    { key: 'gallery', label: 'Galerie', color: '#8B7CFF', icon: ImageIcon, onClick: () => { setSheet(false); galleryRef.current?.click(); } },
    { key: 'camera', label: 'Kamera', color: '#F472B6', icon: Camera, onClick: () => { setSheet(false); cameraRef.current?.click(); } },
    { key: 'document', label: 'Dokument', color: '#818CF8', icon: FileIcon, onClick: () => { setSheet(false); docRef.current?.click(); } },
    { key: 'audio', label: 'Audio', color: '#F59E0B', icon: Mic, onClick: () => { setSheet(false); recorder.toggle(); } },
    { key: 'ticket', label: 'Ticket', color: '#22DFC9', icon: TicketIcon, onClick: () => { setSheet(false); setPicker('ticket'); } },
    { key: 'task', label: 'Aufgabe', color: '#E9C46A', icon: CalendarDays, onClick: () => { setSheet(false); setPicker('task'); } },
  ];

  return (
    <div className="border-t border-white/5 px-2.5 py-2.5" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 0.65rem)' }}>
      {attach && <PendingAttach attach={attach} onRemove={() => setAttach(null)} />}
      {uploading && (
        <div className="flex items-center gap-1.5 mb-2 text-[11px] text-hl-faint font-mono">
          <Loader2 className="w-3 h-3 animate-spin" /> lädt hoch…
        </div>
      )}
      {recorder.recording && (
        <div className="flex items-center gap-1.5 mb-2 text-[11px] text-rose-300 font-mono">
          <span className="w-2 h-2 rounded-full bg-rose-400 animate-pulse" /> Aufnahme läuft – nochmal auf das Mikro tippen zum Stoppen.
        </div>
      )}
      <div className="relative flex items-end gap-2">
        {mentionMatches.length > 0 && (
          <div className="absolute bottom-full left-0 mb-2 w-56 bg-[#0f1614] border border-white/15 rounded-xl shadow-2xl shadow-black/50 overflow-hidden z-30">
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

        {/* Aufklapp-Menü (wie WhatsApp „+“) */}
        <AnimatePresence>
          {sheet && (
            <>
              <div className="fixed inset-0 z-[59]" onClick={() => setSheet(false)} />
              <motion.div
                initial={{ opacity: 0, y: 14, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 14, scale: 0.98 }}
                transition={{ duration: 0.16 }}
                className="absolute bottom-full left-0 right-0 mb-2 z-[60] rounded-2xl bg-[#12211f] border border-white/10 shadow-2xl shadow-black/60 p-4"
              >
                <div className="grid grid-cols-3 gap-y-4 gap-x-2">
                  {tiles.map((t) => (
                    <SheetTile key={t.key} label={t.label} color={t.color} icon={t.icon} onClick={t.onClick} />
                  ))}
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>

        <button
          onClick={() => setSheet((v) => !v)}
          title="Anhängen"
          className={`p-3 rounded-full border cursor-pointer shrink-0 transition-colors ${
            sheet ? 'bg-brand-accent-light text-white border-brand-accent-light rotate-45' : 'bg-white/5 border-white/10 text-hl-soft hover:text-white'
          } transition-transform`}
        >
          <Plus className="w-5 h-5" />
        </button>

        {/* versteckte Datei-Eingaben */}
        <input ref={galleryRef} type="file" accept="image/*" className="hidden" onChange={(e) => { void onFileChosen(e.target.files?.[0]); e.target.value = ''; }} />
        <input ref={cameraRef} type="file" accept="image/*,video/*" capture="environment" className="hidden" onChange={(e) => { void onFileChosen(e.target.files?.[0]); e.target.value = ''; }} />
        <input ref={docRef} type="file" className="hidden" onChange={(e) => { void onFileChosen(e.target.files?.[0]); e.target.value = ''; }} />

        <div className="flex-1 flex items-end bg-[#0e1a18] border border-white/10 rounded-3xl px-4 focus-within:border-brand-accent-light/60 transition-colors">
          <textarea
            ref={taRef}
            value={body}
            onChange={(e) => onBodyChange(e.target.value)}
            onBlur={() => onStopTyping?.()}
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
            className="w-full bg-transparent text-[15px] text-white placeholder:text-hl-faint focus:outline-none resize-none max-h-36 py-3 leading-snug"
          />
        </div>

        {hasContent ? (
          <button
            onClick={submit}
            disabled={busy || uploading}
            title="Senden"
            className="p-3 rounded-full bg-brand-accent-light hover:bg-brand-accent text-white cursor-pointer disabled:opacity-50 shrink-0"
          >
            {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
          </button>
        ) : (
          <button
            onClick={recorder.toggle}
            title={recorder.recording ? 'Aufnahme stoppen & anhängen' : 'Sprachnachricht aufnehmen'}
            className={`p-3 rounded-full border cursor-pointer shrink-0 transition-colors ${
              recorder.recording
                ? 'bg-rose-500 border-rose-500 text-white animate-pulse'
                : 'bg-brand-accent-light border-brand-accent-light text-white hover:bg-brand-accent'
            }`}
          >
            <Mic className="w-5 h-5" />
          </button>
        )}
      </div>
      <AnimatePresence>
        {picker && (
          <AttachPicker
            initialTab={picker}
            onPick={(a) => {
              setAttach({ kind: 'ref', type: a.type, id: a.id, title: a.title });
              setPicker(null);
            }}
            onClose={() => setPicker(null)}
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
  firstOfRun = true,
  showAuthor,
  colorSeed,
  displayName,
  avatarUrl,
  highlight = false,
  onOpenThread,
  onOpenAttachment,
}: {
  m: ChatMessage;
  mine: boolean;
  firstOfRun?: boolean;
  showAuthor: boolean;
  colorSeed: string;
  displayName?: string;
  avatarUrl?: string;
  highlight?: boolean;
  onOpenThread?: (m: ChatMessage) => void;
  onOpenAttachment?: (type: 'ticket' | 'task', id: string) => void;
}) {
  const name = displayName || m.authorName;
  const tailClass = firstOfRun ? (mine ? 'hl-bubble-out rounded-tr-md' : 'hl-bubble-in rounded-tl-md') : '';
  return (
    <div data-mid={m.id} className={`flex gap-2 ${mine ? 'justify-end' : 'justify-start'} ${firstOfRun ? 'mt-2.5' : 'mt-0.5'}`}>
      {!mine && <div className="w-7 shrink-0 self-end">{firstOfRun && <Avatar name={name} url={avatarUrl} size={28} />}</div>}
      <div className={`max-w-[82%] ${mine ? 'items-end' : 'items-start'} flex flex-col`}>
        <div
          className={`hl-bubble px-3 py-2 rounded-2xl shadow-sm shadow-black/20 ${mine ? 'text-white rounded-br-md' : 'text-hl-text rounded-bl-md'} ${tailClass} ${highlight ? 'ring-2 ring-brand-accent-light ring-offset-1 ring-offset-[#0a1210]' : ''}`}
          style={{ background: mine ? BUBBLE_MINE : BUBBLE_OTHER }}
        >
          {/* Gruppen: Name des Absenders in seiner (konstanten) Farbe */}
          {showAuthor && !mine && (
            <div className="text-[12px] font-sans font-bold mb-0.5" style={{ color: pickNameColor(name, colorSeed) }}>
              {name}
            </div>
          )}
          {m.body && <p className="text-[15px] font-sans whitespace-pre-wrap break-words leading-snug">{m.body}</p>}
          <MessageAttachment m={m} mine={mine} onOpen={onOpenAttachment} />
          {/* Uhrzeit klein in der Bubble, rechts unten (KEINE Lesebestätigung) */}
          <div className={`text-[10px] font-mono leading-none text-right mt-1 ${mine ? 'text-white/60' : 'text-hl-faint'}`}>
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

// „Tippt gerade“-Blase (wie WhatsApp: Profilbild + wippende Punkte).
function TypingRow({
  typers,
  members,
}: {
  typers: { userId: string; userName: string }[];
  members: Map<string, TeamMember>;
}) {
  const first = typers[0];
  if (!first) return null;
  const mem = members.get(first.userId);
  return (
    <div className="flex gap-2 justify-start items-end mt-2.5">
      <div className="w-7 shrink-0 self-end">
        <Avatar name={mem?.name ?? first.userName} url={mem?.avatarUrl} size={28} />
      </div>
      <div className="hl-bubble hl-bubble-in rounded-2xl rounded-bl-md rounded-tl-md px-4 py-3" style={{ background: BUBBLE_OTHER }}>
        <span className="flex items-center gap-1.5 text-brand-accent-light">
          <span className="hl-typing-dot" style={{ animationDelay: '0s' }} />
          <span className="hl-typing-dot" style={{ animationDelay: '0.18s' }} />
          <span className="hl-typing-dot" style={{ animationDelay: '0.36s' }} />
        </span>
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
  highlightId,
  onClose,
  onReplyAdded,
}: {
  conversationId: string;
  parent: ChatMessage;
  currentUserId: string;
  mentionable?: { id: string; name: string }[];
  highlightId?: string | null;
  onClose: () => void;
  onReplyAdded: () => void;
}) {
  const [replies, setReplies] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const bodyRef = useRef<HTMLDivElement>(null);

  const load = useCallback(() => {
    fetchMessages(conversationId, parent.id)
      .then(setReplies)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [conversationId, parent.id]);

  useEffect(() => {
    load();
  }, [load]);

  // Nach dem Laden zur gesuchten Antwort scrollen (falls aus der Suche geöffnet).
  useEffect(() => {
    if (loading || !highlightId || !bodyRef.current) return;
    const c = bodyRef.current;
    const el = c.querySelector(`[data-mid="${highlightId}"]`) as HTMLElement | null;
    if (el) c.scrollTop += el.getBoundingClientRect().top - c.getBoundingClientRect().top - 80;
  }, [loading, highlightId, replies]);
  const backdrop = useBackdropDismiss(onClose);

  return (
    <ModalPortal>
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
        <div ref={bodyRef} className="flex-1 overflow-y-auto p-3 hl-chat-bg">
          <div className="pb-3 mb-1 border-b border-white/5">
            <MessageRow m={parent} mine={parent.authorId === currentUserId} showAuthor colorSeed={conversationId} highlight={highlightId === parent.id} />
          </div>
          {loading ? (
            <div className="flex justify-center py-6 text-hl-mute">
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
          ) : (
            replies.map((r, i) => {
              const prev = i > 0 ? replies[i - 1] : null;
              const block = sameBlock(prev, r);
              return (
                <MessageRow
                  key={r.id}
                  m={r}
                  mine={r.authorId === currentUserId}
                  firstOfRun={!block}
                  showAuthor={!block}
                  colorSeed={conversationId}
                  highlight={highlightId === r.id}
                />
              );
            })
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
    </ModalPortal>
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
    <ModalPortal>
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
    </ModalPortal>
  );
}

// --- Info-Fenster: Gruppe (Superadmin: Name/Bild/Mitglieder) bzw. DM-Profil --
function ConversationInfo({
  conversation,
  members,
  team,
  currentUserId,
  isSuperadmin,
  online,
  onClose,
  onChanged,
}: {
  conversation: Conversation;
  members: Map<string, TeamMember>;
  team: TeamMember[];
  currentUserId: string;
  isSuperadmin: boolean;
  online: Set<string>;
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
    <ModalPortal>
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
                const isOnline = online.has(mm.userId);
                return (
                  <div key={mm.userId} className="flex items-center gap-2.5">
                    <Avatar name={mem?.name ?? mm.userName} url={mem?.avatarUrl} status={isOnline ? 'online' : undefined} size={30} showStatus={isOnline} ring="#0b1210" />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-sans text-white truncate">{mem?.name ?? mm.userName}</div>
                    </div>
                    {isOnline && <span className="text-[10px] font-mono text-hl-green shrink-0">online</span>}
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
            <Avatar name={other?.name ?? conversationTitle(conversation, currentUserId)} url={other?.avatarUrl} status={otherId && online.has(otherId) ? 'online' : undefined} size={84} showStatus={!!(otherId && online.has(otherId))} ring="#0b1210" />
            <div className="font-display font-black text-white text-lg">{other?.name ?? conversationTitle(conversation, currentUserId)}</div>
            {otherId && online.has(otherId) ? (
              <div className="text-sm text-hl-green">online</div>
            ) : (
              other?.status && <div className="text-sm text-hl-soft">{statusLine(other.status)}</div>
            )}
          </div>
        )}
      </motion.div>
    </motion.div>
    </ModalPortal>
  );
}

// --- Ergebnisliste der In-Chat-Suche (inkl. Thread-Treffer) -----------------
function ConvSearchResults({
  hits,
  members,
  onPick,
}: {
  hits: ChatSearchHit[];
  members: Map<string, TeamMember>;
  onPick: (h: ChatSearchHit) => void;
}) {
  if (hits.length === 0) {
    return <p className="text-center text-sm text-hl-mute font-sans py-8">Keine Treffer in diesem Chat.</p>;
  }
  return (
    <div className="space-y-1.5">
      {hits.map((h) => {
        const mem = members.get(h.authorId);
        return (
          <button
            key={h.id}
            onClick={() => onPick(h)}
            className="w-full text-left px-2.5 py-2 rounded-xl bg-[#0f1614] hover:bg-[#131b19] border border-white/5 hover:border-white/15 cursor-pointer flex items-start gap-2.5 transition-colors"
          >
            <Avatar name={mem?.name ?? h.authorName} url={mem?.avatarUrl} size={30} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-[13px] font-sans font-semibold text-white truncate">{mem?.name ?? h.authorName}</span>
                {h.parentId && (
                  <span className="inline-flex items-center gap-0.5 text-[9px] font-mono uppercase tracking-wider text-brand-accent-light bg-brand-accent/15 border border-brand-accent-light/30 rounded px-1 py-0.5 shrink-0">
                    <MessageSquare className="w-2.5 h-2.5" /> Thread
                  </span>
                )}
                <span className="text-[10px] font-mono text-hl-faint ml-auto shrink-0">{fmtTime(h.createdAt)}</span>
              </div>
              <div className="text-[13px] text-hl-soft truncate">{h.body || (h.attachType ? '📎 Anhang' : '')}</div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

// --- Hauptkomponente --------------------------------------------------------
export default function ChatSystem({
  currentUserId,
  canManageTickets = false,
  isSuperadmin = false,
  fullHeight = false,
  initialConversationId = null,
  initialThreadId = null,
}: {
  currentUserId: string;
  canManageTickets?: boolean;
  isSuperadmin?: boolean;
  fullHeight?: boolean;
  initialConversationId?: string | null;
  initialThreadId?: string | null;
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
  // In-Chat-Suche (inkl. Threads): Ergebnisse + Hervorhebung des Fundorts.
  const [convHits, setConvHits] = useState<ChatSearchHit[]>([]);
  const [highlightId, setHighlightId] = useState<string | null>(null); // im Haupt-Verlauf
  const [threadHighlightId, setThreadHighlightId] = useState<string | null>(null); // im Thread
  // Aus einem (globalen) Suchtreffer heraus einen Thread öffnen, sobald die
  // Unterhaltung geladen ist.
  const [pendingThread, setPendingThread] = useState<{ convId: string; parentId: string; hitId: string } | null>(null);
  // Präsenz: wer ist online + wer tippt in der geöffneten Unterhaltung.
  const [online, setOnline] = useState<Set<string>>(new Set());
  const [typers, setTypers] = useState<{ userId: string; userName: string }[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);
  // Scroll-Container der Nachrichten. WICHTIG: Wir scrollen NUR diesen Container
  // (scrollTop), niemals via scrollIntoView – sonst würde im Backoffice die ganze
  // /admin-Seite mitgescrollt (der Chat sitzt dort in einer Sektion).
  const listRef = useRef<HTMLDivElement>(null);
  // Ist der Nutzer aktuell (nahe) am unteren Ende? Nur dann automatisch scrollen.
  const atBottomRef = useRef(true);
  const onMsgScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    atBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  };

  // --- Präsenz: Heartbeat senden + Tipp-Status ------------------------------
  const isTypingRef = useRef(false);
  const lastTypingPing = useRef(0);
  const onTyping = useCallback(() => {
    isTypingRef.current = true;
    const now = Date.now();
    if (now - lastTypingPing.current > 2500 && activeId) {
      lastTypingPing.current = now;
      sendPresence(activeId).catch(() => {});
    }
  }, [activeId]);
  const onStopTyping = useCallback(() => {
    if (isTypingRef.current) {
      isTypingRef.current = false;
      lastTypingPing.current = 0;
      sendPresence(null).catch(() => {});
    }
  }, []);

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

  // Offene Unterhaltung in der URL halten (?c=…), damit ein Reload dort bleibt.
  useEffect(() => {
    setUrlParam('c', activeId);
  }, [activeId]);
  // Offenen Thread in der URL halten (?thread=…).
  useEffect(() => {
    setUrlParam('thread', thread?.id ?? null);
  }, [thread]);
  // Nach dem Laden den beim Aktualisieren offenen Thread wiederherstellen.
  const didOpenInitialThread = useRef(false);
  useEffect(() => {
    if (didOpenInitialThread.current || !initialThreadId) return;
    const parent = messages.find((m) => m.id === initialThreadId);
    if (parent) {
      didOpenInitialThread.current = true;
      setThread(parent);
    }
  }, [initialThreadId, messages]);

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
    atBottomRef.current = true; // beim Öffnen unten starten
    setTypers([]); // Tipp-Anzeige der vorigen Unterhaltung sofort leeren
    loadMessages(activeId);
    const iv = setInterval(() => loadMessages(activeId, true), 5000);
    return () => clearInterval(iv);
  }, [activeId, loadMessages]);

  // Online-Heartbeat: alle ~18 s (und beim Sichtbarwerden) senden. Trägt den
  // Tipp-Status mit, damit ein Heartbeat das Tippen nicht fälschlich löscht.
  useEffect(() => {
    const beat = () => sendPresence(isTypingRef.current ? activeId : null).catch(() => {});
    beat();
    const iv = setInterval(beat, 18000);
    const onVis = () => document.visibilityState === 'visible' && beat();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      clearInterval(iv);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [activeId]);

  // Präsenz lesen: online-Menge global, Tipp-Anzeige für die aktive Unterhaltung.
  useEffect(() => {
    let stop = false;
    const load = () => {
      fetchPresence(activeId ?? undefined)
        .then((p) => {
          if (stop) return;
          setOnline(new Set(p?.online ?? []));
          setTypers((p?.typing ?? []).filter((t) => t.userId !== currentUserId));
        })
        .catch(() => {});
    };
    load();
    const iv = setInterval(load, 4000);
    return () => {
      stop = true;
      clearInterval(iv);
    };
  }, [activeId, currentUserId]);

  // Nach unten scrollen NUR, wenn man ohnehin unten ist – und nur INNERHALB des
  // Chat-Containers (nicht die ganze Seite).
  useEffect(() => {
    if (atBottomRef.current && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages, typers.length]);

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

  // In-Chat-Suche (entprellt, serverseitig, inkl. Thread-Antworten).
  useEffect(() => {
    if (!activeId || convSearch.trim().length < 2) {
      setConvHits([]);
      return;
    }
    const id = setTimeout(() => {
      searchChat(convSearch.trim(), activeId).then(setConvHits).catch(() => setConvHits([]));
    }, 250);
    return () => clearTimeout(id);
  }, [convSearch, activeId]);

  // Zum hervorgehobenen Treffer im Haupt-Verlauf scrollen (kurz aufleuchten).
  useEffect(() => {
    if (!highlightId || !listRef.current) return;
    const c = listRef.current;
    const el = c.querySelector(`[data-mid="${highlightId}"]`) as HTMLElement | null;
    if (el) c.scrollTop += el.getBoundingClientRect().top - c.getBoundingClientRect().top - 90;
    const t = setTimeout(() => setHighlightId(null), 2600);
    return () => clearTimeout(t);
  }, [highlightId]);

  // Aus (globalem) Suchtreffer heraus den Thread öffnen, sobald die passende
  // Unterhaltung mit ihren Nachrichten geladen ist.
  useEffect(() => {
    if (!pendingThread || pendingThread.convId !== activeId) return;
    const parent = messages.find((m) => m.id === pendingThread.parentId);
    if (parent) {
      setThreadHighlightId(pendingThread.hitId);
      setThread(parent);
      setPendingThread(null);
    }
  }, [pendingThread, activeId, messages]);

  const active = useMemo(() => convs.find((c) => c.id === activeId) ?? null, [convs, activeId]);
  const members = useMemo(() => memberMap(team), [team]);
  const q = search.trim().toLowerCase();
  const searching = q.length >= 2;
  const convMatches = searching ? convs.filter((c) => conversationTitle(c, currentUserId).toLowerCase().includes(q)) : convs;
  const activeMentionable = useMemo(
    () => (active ? active.members.map((mm) => ({ id: mm.userId, name: members.get(mm.userId)?.name ?? mm.userName })) : []),
    [active, members]
  );
  const convSearching = convSearch.trim().length >= 2;
  const openConversation = (id: string) => {
    setActiveId(id);
    // Ungelesen-Zähler nach dem Öffnen aktualisieren.
    setTimeout(loadConvs, 800);
  };

  // Klick auf einen In-Chat-Suchtreffer: Thread öffnen bzw. im Verlauf hinspringen.
  const openConvHit = (h: ChatSearchHit) => {
    if (h.parentId) {
      const parent = messages.find((m) => m.id === h.parentId);
      if (parent) {
        setThreadHighlightId(h.id);
        setThread(parent);
      }
    } else {
      setShowConvSearch(false);
      setConvSearch('');
      atBottomRef.current = false;
      setHighlightId(h.id);
    }
  };

  // Klick auf einen globalen Suchtreffer: Unterhaltung öffnen; ist es ein
  // Thread-Treffer, danach den Thread aufschlagen (sobald geladen).
  const openGlobalHit = (h: ChatSearchHit) => {
    openConversation(h.conversationId);
    setSearch('');
    if (h.parentId) setPendingThread({ convId: h.conversationId, parentId: h.parentId, hitId: h.id });
    else if (h.conversationId === activeId) setHighlightId(h.id);
  };

  // Kopfzeilen-Unterzeile mit echter Präsenz („online“, „X online“, „… tippt“).
  const activeOtherId = active && active.kind === 'dm' ? active.members.find((m) => m.userId !== currentUserId)?.userId : undefined;
  const typingLabel = (() => {
    if (typers.length === 0) return null;
    if (!active || active.kind === 'dm') return 'tippt…';
    if (typers.length === 1) return `${firstName(typers[0].userName)} tippt…`;
    if (typers.length === 2) return `${firstName(typers[0].userName)} und ${firstName(typers[1].userName)} tippen…`;
    return 'mehrere tippen…';
  })();
  const groupOnlineCount = active && active.kind === 'group'
    ? active.members.filter((m) => m.userId !== currentUserId && online.has(m.userId)).length
    : 0;

  return (
    <div
      className={`flex overflow-hidden bg-[#070d0c] ${
        fullHeight ? 'h-full' : 'h-[70vh] min-h-[480px] rounded-2xl border border-white/10'
      }`}
    >
      {/* Liste */}
      <div className={`w-full md:w-80 border-r border-white/5 flex flex-col ${activeId ? 'hidden md:flex' : 'flex'}`}>
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
              const dmOnline = !!(otherId && online.has(otherId));
              return (
                <button
                  key={c.id}
                  onClick={() => openConversation(c.id)}
                  className={`w-full text-left px-3 py-2.5 border-b border-white/5 hover:bg-white/[.03] cursor-pointer transition-colors ${
                    c.id === activeId ? 'bg-white/[.05]' : ''
                  }`}
                >
                  <div className="flex items-center gap-3">
                    {c.kind === 'group' ? (
                      c.avatarUrl ? (
                        <Avatar name={name} url={c.avatarUrl} size={44} />
                      ) : (
                        <div className="w-11 h-11 rounded-full bg-brand-accent/20 border border-brand-accent-light/30 flex items-center justify-center text-brand-accent-light shrink-0">
                          <Hash className="w-5 h-5" />
                        </div>
                      )
                    ) : (
                      <Avatar name={name} url={otherMem?.avatarUrl} status={dmOnline ? 'online' : undefined} size={44} showStatus={dmOnline} />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-sans font-semibold text-[15px] text-white truncate">{name}</span>
                        {c.lastMessage && (
                          <span className="text-[10px] font-mono text-hl-faint shrink-0">{fmtClock(c.lastMessage.createdAt)}</span>
                        )}
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[12px] text-hl-dim font-sans truncate block">
                          {c.lastMessage
                            ? `${c.kind === 'group' ? `${firstName(c.lastMessage.authorName)}: ` : ''}${c.lastMessage.attachType ? '📎 ' : ''}${c.lastMessage.body || 'Anhang'}`
                            : 'Noch keine Nachrichten'}
                        </span>
                        {c.unread > 0 && (
                          <span className="min-w-[18px] h-[18px] px-1 bg-brand-accent-light text-[#04120f] text-[10px] font-bold rounded-full flex items-center justify-center shrink-0">
                            {c.unread > 9 ? '9+' : c.unread}
                          </span>
                        )}
                      </div>
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
                  onClick={() => openGlobalHit(h)}
                  className="w-full text-left px-3 py-2 border-b border-white/5 hover:bg-white/[.03] cursor-pointer"
                >
                  <div className="text-[11px] font-mono text-hl-dim truncate flex items-center gap-1.5">
                    <span className="truncate">{h.convKind === 'group' ? `# ${h.convTitle || 'Gruppe'}` : h.authorName} · {fmtTime(h.createdAt)}</span>
                    {h.parentId && (
                      <span className="inline-flex items-center gap-0.5 text-brand-accent-light shrink-0">
                        <MessageSquare className="w-2.5 h-2.5" /> Thread
                      </span>
                    )}
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
          <div className="flex-1 flex flex-col items-center justify-center text-hl-mute gap-2 hl-chat-bg">
            <MessageSquare className="w-8 h-8 text-hl-faint" />
            <p className="text-sm font-sans">Wähle links eine Unterhaltung.</p>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2 px-4 py-2.5 border-b border-white/5 bg-[#0b1512]">
              <button onClick={() => setActiveId(null)} className="md:hidden p-1 -ml-1 text-hl-mute hover:text-white cursor-pointer">
                <ArrowLeft className="w-5 h-5" />
              </button>
              <button onClick={() => setShowInfo(true)} className="flex items-center gap-2.5 min-w-0 flex-1 text-left cursor-pointer" title="Infos anzeigen">
                {active.kind === 'group' ? (
                  active.avatarUrl ? (
                    <Avatar name={conversationTitle(active, currentUserId)} url={active.avatarUrl} size={40} />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-brand-accent/20 border border-brand-accent-light/30 flex items-center justify-center text-brand-accent-light shrink-0">
                      <Hash className="w-5 h-5" />
                    </div>
                  )
                ) : (
                  (() => {
                    const other = members.get(activeOtherId ?? '');
                    const dmOnline = !!(activeOtherId && online.has(activeOtherId));
                    return <Avatar name={conversationTitle(active, currentUserId)} url={other?.avatarUrl} status={dmOnline ? 'online' : undefined} size={40} showStatus={dmOnline} />;
                  })()
                )}
                <div className="min-w-0">
                  <div className="font-display font-bold text-white text-[15px] truncate">{conversationTitle(active, currentUserId)}</div>
                  <div className="text-[11px] font-sans truncate">
                    {typingLabel ? (
                      <span className="text-brand-accent-light">{typingLabel}</span>
                    ) : active.kind === 'dm' ? (
                      activeOtherId && online.has(activeOtherId) ? (
                        <span className="text-hl-green">online</span>
                      ) : (
                        <span className="text-hl-dim">offline · Infos</span>
                      )
                    ) : groupOnlineCount > 0 ? (
                      <span className="text-hl-green">{groupOnlineCount} online · {active.members.length} Mitglieder</span>
                    ) : (
                      <span className="text-hl-dim flex items-center gap-1"><Users className="w-3 h-3" /> {active.members.length} Mitglieder</span>
                    )}
                  </div>
                </div>
              </button>
              <button
                onClick={() => setShowConvSearch((v) => { if (v) setConvSearch(''); return !v; })}
                title="In diesem Chat suchen (auch Threads)"
                className={`p-2 rounded-lg border cursor-pointer shrink-0 ${showConvSearch ? 'bg-brand-accent-light/20 border-brand-accent-light/40 text-brand-accent-light' : 'bg-white/5 border-white/10 text-hl-soft hover:text-white'}`}
              >
                <Search className="w-4 h-4" />
              </button>
            </div>
            {showConvSearch && (
              <div className="px-3 py-2 border-b border-white/5 bg-[#0b1512]">
                <div className="flex items-center gap-2 bg-[#060E0F] border border-white/10 rounded-lg px-2.5 py-1.5">
                  <Search className="w-3.5 h-3.5 text-hl-dim shrink-0" />
                  <input
                    value={convSearch}
                    onChange={(e) => setConvSearch(e.target.value)}
                    autoFocus
                    placeholder="In diesem Chat & Threads suchen…"
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

            <div ref={listRef} className="flex-1 overflow-y-auto px-3 py-3 hl-chat-bg" onScroll={onMsgScroll}>
              {convSearching ? (
                <ConvSearchResults hits={convHits} members={members} onPick={openConvHit} />
              ) : loadingMsgs ? (
                <div className="flex justify-center py-8 text-hl-mute">
                  <Loader2 className="w-5 h-5 animate-spin" />
                </div>
              ) : messages.length === 0 ? (
                <p className="text-center text-sm text-hl-mute font-sans py-8">Noch keine Nachrichten. Schreib die erste!</p>
              ) : (
                messages.map((m, i) => {
                  const mem = members.get(m.authorId);
                  const prev = i > 0 ? messages[i - 1] : null;
                  const newDay = !prev || dayKey(prev.createdAt) !== dayKey(m.createdAt);
                  const block = !newDay && sameBlock(prev, m);
                  const firstOfRun = !block;
                  // Absender-Name/Bild nur beim ersten Block einer Person zeigen.
                  const showAuthor = active.kind === 'group' && firstOfRun;
                  return (
                    <React.Fragment key={m.id}>
                      {newDay && (
                        <div className="flex justify-center my-3">
                          <span className="text-[10px] font-mono uppercase tracking-wider text-hl-mute bg-[#0b1210]/90 border border-white/10 rounded-full px-3 py-1">
                            {fmtDaySeparator(m.createdAt)}
                          </span>
                        </div>
                      )}
                      <MessageRow
                        m={m}
                        mine={m.authorId === currentUserId}
                        firstOfRun={firstOfRun}
                        showAuthor={showAuthor}
                        colorSeed={active.id}
                        displayName={mem?.name}
                        avatarUrl={mem?.avatarUrl}
                        highlight={highlightId === m.id}
                        onOpenThread={setThread}
                        onOpenAttachment={openAttachment}
                      />
                    </React.Fragment>
                  );
                })
              )}
              {!convSearching && typers.length > 0 && <TypingRow typers={typers} members={members} />}
              <div ref={bottomRef} />
            </div>

            <Composer
              conversationId={active.id}
              mentionable={activeMentionable}
              placeholder="Nachricht schreiben…"
              onTyping={onTyping}
              onStopTyping={onStopTyping}
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
            highlightId={threadHighlightId}
            onClose={() => {
              setThread(null);
              setThreadHighlightId(null);
            }}
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
            online={online}
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
