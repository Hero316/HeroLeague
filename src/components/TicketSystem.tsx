import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Plus,
  X,
  Send,
  Trash2,
  Clipboard,
  Loader2,
  MessageSquare,
  ArrowLeft,
  Ticket as TicketIcon,
  Image as ImageIcon,
  Mic,
  File as FileIcon,
  Copy,
  Pencil,
  Smile,
  Check,
} from 'lucide-react';
import type { Ticket, TicketComment, TicketPriority, TicketStatus, TeamMember, LinkItem } from '../types';
import { uploadImage, uploadFile } from '../lib/api';
import { getUrlParam, setUrlParam } from '../lib/urlState';
import { useBackClose, goBackLayer } from '../lib/backStack';
import { zoomOriginFromEvent, zoomModalProps, ZERO_ORIGIN, type ZoomOrigin } from '../lib/zoom';
import {
  fetchTickets,
  fetchTicket,
  createTicket,
  updateTicket,
  updateTicketLinks,
  deleteTicket,
  addTicketComment,
  editTicketComment,
  deleteTicketComment,
  reactTicketComment,
  fetchTeam,
  memberMap,
} from '../lib/collab';
import Avatar from './Avatar';
import MentionTextarea from './MentionTextarea';
import LinkChips from './LinkChips';
import { VoiceMessage } from './AudioPlayer';
import { useBackdropDismiss, ModalPortal, SegmentedControl, EmptyState } from './ui';
import { BUBBLE_MINE, pickNameColor, EmojiPicker, useLongPress, QUICK_REACTIONS, ActionBtn } from './ChatSystem';

const inputClass =
  'w-full hl-surf-0 border border-white/10 rounded-xl px-3.5 py-2.5 text-[15px] text-white focus:outline-none focus:border-brand-accent-light transition-colors';

const PRIORITY_LABEL: Record<TicketPriority, string> = {
  niedrig: 'Niedrig',
  mittel: 'Mittel',
  hoch: 'Hoch',
  dringend: 'Dringend',
};
const PRIORITY_STYLE: Record<TicketPriority, string> = {
  niedrig: 'bg-slate-100 text-slate-600 border-slate-200',
  mittel: 'bg-sky-100 text-sky-700 border-sky-200',
  hoch: 'bg-amber-100 text-amber-800 border-amber-200',
  dringend: 'bg-rose-100 text-rose-700 border-rose-200',
};
// Akzentfarbe (Balken) je Priorität – wie im Aufgaben-Redesign.
const PRIORITY_BAR: Record<TicketPriority, string> = { niedrig: '#7E877F', mittel: '#38BDF8', hoch: '#E9C46A', dringend: '#FF5442' };
const STATUS_LABEL: Record<TicketStatus, string> = {
  offen: 'Offen',
  in_bearbeitung: 'In Bearbeitung',
  erledigt: 'Erledigt',
  abgelehnt: 'Abgelehnt',
};
const STATUS_STYLE: Record<TicketStatus, string> = {
  offen: 'bg-sky-100 text-sky-700 border-sky-200',
  in_bearbeitung: 'bg-amber-100 text-amber-800 border-amber-200',
  erledigt: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  abgelehnt: 'bg-slate-100 text-slate-500 border-slate-200',
};

const PRIORITIES: TicketPriority[] = ['niedrig', 'mittel', 'hoch', 'dringend'];
const STATUSES: TicketStatus[] = ['offen', 'in_bearbeitung', 'erledigt', 'abgelehnt'];

function Badge({ className, children }: { className: string; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-mono font-semibold uppercase tracking-wider border ${className}`}>
      {children}
    </span>
  );
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

// Bilder aus der Zwischenablage (Screenshot einfügen) hochladen. Gibt die
// hochgeladenen Blob-URLs zurück. Wird von Formular und Kommentar genutzt.
function useImageUploads() {
  const [images, setImages] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);

  const uploadFiles = useCallback(async (files: File[]) => {
    const imgs = files.filter((f) => f.type.startsWith('image/'));
    if (imgs.length === 0) return;
    setUploading(true);
    try {
      for (const f of imgs) {
        try {
          const url = await uploadImage(f, { maxDimension: 1600 });
          setImages((prev) => [...prev, url]);
        } catch (err) {
          alert(err instanceof Error ? err.message : 'Bild konnte nicht hochgeladen werden.');
        }
      }
    } finally {
      setUploading(false);
    }
  }, []);

  const onPaste = useCallback(
    (e: React.ClipboardEvent) => {
      const files = Array.from(e.clipboardData?.items ?? [])
        .filter((it) => it.kind === 'file')
        .map((it) => it.getAsFile())
        .filter((f): f is File => !!f);
      if (files.length) {
        e.preventDefault();
        void uploadFiles(files);
      }
    },
    [uploadFiles]
  );

  const removeAt = (i: number) => setImages((prev) => prev.filter((_, idx) => idx !== i));
  const reset = () => setImages([]);
  return { images, uploading, onPaste, uploadFiles, removeAt, reset, setImages };
}

function ImageStrip({ images, onRemove }: { images: string[]; onRemove?: (i: number) => void }) {
  if (images.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2 mt-2">
      {images.map((url, i) => (
        <div key={url + i} className="relative group">
          <a href={url} target="_blank" rel="noreferrer">
            <img src={url} alt="Anhang" className="h-20 w-20 object-cover rounded-lg border border-white/10" />
          </a>
          {onRemove && (
            <button
              type="button"
              onClick={() => onRemove(i)}
              className="absolute -top-1.5 -right-1.5 bg-rose-600 text-white rounded-full p-0.5 opacity-90 hover:opacity-100"
              title="Entfernen"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

// Sprachaufnahme per Umschalten (klick = an, klick = aus) – wie im Chat/bei Ideen.
function useTicketRecorder(onDone: (file: File) => void) {
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

// Medien-Anhang eines Ticket-Beitrags anzeigen (Bild/Video/Datei/Audio). Dazu der
// Alt-Bestand `images` (früher hochgeladene Screenshots) über <ImageStrip>.
function TicketAttachment({ c }: { c: TicketComment }) {
  if (c.attachType === 'audio' && c.attachUrl) {
    return (
      <div className="mt-1.5">
        <VoiceMessage url={c.attachUrl} />
      </div>
    );
  }
  if (c.attachType === 'file' && c.attachUrl) {
    const mime = c.attachMime ?? '';
    if (mime.startsWith('image/')) {
      return (
        <a href={c.attachUrl} target="_blank" rel="noreferrer" className="block mt-1.5">
          <img src={c.attachUrl} alt={c.attachTitle ?? 'Bild'} className="max-h-60 max-w-full rounded-xl border border-white/10" />
        </a>
      );
    }
    if (mime.startsWith('video/')) {
      return <video controls src={c.attachUrl} className="mt-1.5 max-h-60 max-w-full rounded-xl border border-white/10" />;
    }
    return (
      <a
        href={c.attachUrl}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-2 mt-1.5 px-2.5 py-1.5 rounded-lg bg-white/5 border border-white/10 text-hl-soft text-[12px] font-sans hover:text-white max-w-full"
      >
        <FileIcon className="w-4 h-4 shrink-0 text-brand-accent-light" />
        <span className="truncate">{c.attachTitle || 'Datei'}</span>
      </a>
    );
  }
  return null;
}

// Ein einzelner Ticket-Beitrag – volle Chat-Funktionen (wie bei Ideen/Aufgaben):
// lange drücken (bzw. Rechtsklick) öffnet Reagieren/Kopieren/Bearbeiten/Löschen;
// Emoji-Reaktionen unter der Blase; „bearbeitet"/gelöscht wie im Chat.
function TicketCommentRow({
  c,
  mine,
  currentUserId,
  avatarUrl,
  colorSeed,
  onChanged,
}: {
  c: TicketComment;
  mine: boolean;
  currentUserId: string;
  avatarUrl?: string;
  colorSeed: string;
  onChanged: (c: TicketComment) => void;
}) {
  const deleted = !!c.deletedAt;
  const [menu, setMenu] = useState(false);
  const [pick, setPick] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(c.body);
  const [busy, setBusy] = useState(false);
  const longPress = useLongPress(() => {
    if (!deleted) setMenu(true);
  });
  const menuBackdrop = useBackdropDismiss(() => setMenu(false));
  useBackClose(menu, () => setMenu(false));
  useBackClose(editing, () => setEditing(false));

  const myEmoji = (c.reactions ?? []).find((r) => r.userId === currentUserId)?.emoji;
  const react = async (emoji: string) => {
    setMenu(false);
    setPick(false);
    try {
      const res = await reactTicketComment(c.id, emoji);
      onChanged({ ...c, reactions: res.reactions });
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Reaktion fehlgeschlagen.');
    }
  };
  const doDelete = async () => {
    setMenu(false);
    if (!window.confirm('Diesen Beitrag für alle löschen?')) return;
    try {
      await deleteTicketComment(c.id);
      onChanged({ ...c, deletedAt: new Date().toISOString(), body: '', images: [], attachType: null, attachUrl: null, attachMime: null, attachTitle: null, reactions: [] });
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Löschen fehlgeschlagen.');
    }
  };
  const saveEdit = async () => {
    const t = editText.trim();
    if (!t) return;
    setBusy(true);
    try {
      const updated = await editTicketComment(c.id, t);
      onChanged(updated);
      setEditing(false);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Bearbeiten fehlgeschlagen.');
    } finally {
      setBusy(false);
    }
  };

  // Reaktionen bündeln: Emoji → Anzahl (+ ob ich selbst reagiert habe).
  const grouped: { emoji: string; count: number; mine: boolean }[] = [];
  for (const r of c.reactions ?? []) {
    const g = grouped.find((x) => x.emoji === r.emoji);
    if (g) {
      g.count++;
      if (r.userId === currentUserId) g.mine = true;
    } else grouped.push({ emoji: r.emoji, count: 1, mine: r.userId === currentUserId });
  }
  const canEdit = mine && !deleted && !!c.body;
  const hasLegacyImages = !deleted && Array.isArray(c.images) && c.images.length > 0;

  return (
    <div className={`flex gap-2 ${mine ? 'justify-end' : 'justify-start'}`}>
      {!mine && (
        <div className="shrink-0 self-end">
          <Avatar name={c.authorName} url={avatarUrl} size={28} />
        </div>
      )}
      <div className={`max-w-[82%] min-w-0 flex flex-col ${mine ? 'items-end' : 'items-start'}`}>
        <div
          {...(deleted ? {} : longPress)}
          className={`hl-bubble px-3 py-2 rounded-2xl ${mine ? 'text-white rounded-br-md' : 'hl-bubble-other text-hl-text rounded-bl-md'} ${deleted ? 'opacity-70' : 'select-none'}`}
          style={mine ? { background: BUBBLE_MINE, color: '#fff' } : undefined}
        >
          {!mine && !deleted && (
            <div className="text-[12px] font-sans font-bold mb-0.5" style={{ color: pickNameColor(c.authorName, colorSeed) }}>
              {c.authorName}
            </div>
          )}
          {deleted ? (
            <p className="text-[15px] font-sans italic text-hl-faint flex items-center gap-1.5">
              <Trash2 className="w-3.5 h-3.5" /> Beitrag gelöscht
            </p>
          ) : (
            <>
              {c.body && <p className="text-[15px] font-sans whitespace-pre-wrap break-words [overflow-wrap:anywhere] leading-snug">{c.body}</p>}
              <TicketAttachment c={c} />
              {hasLegacyImages && (
                <div className="flex flex-wrap gap-2 mt-1.5">
                  {c.images.map((url, i) => (
                    <a key={url + i} href={url} target="_blank" rel="noreferrer">
                      <img src={url} alt="Anhang" className="max-h-48 max-w-full rounded-xl border border-white/10" />
                    </a>
                  ))}
                </div>
              )}
            </>
          )}
          <div className={`text-[10px] font-mono leading-none text-right mt-1 flex items-center justify-end gap-1.5 ${mine ? 'text-white/60' : 'text-hl-faint'}`}>
            {c.editedAt && !deleted && <span className="italic">bearbeitet</span>}
            {fmtDate(c.createdAt)}
          </div>
        </div>

        {grouped.length > 0 && (
          <div className={`flex flex-wrap gap-1 mt-1 ${mine ? 'justify-end' : 'justify-start'}`}>
            {grouped.map((g) => (
              <button
                key={g.emoji}
                onClick={() => react(g.emoji)}
                className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded-full border cursor-pointer ${g.mine ? 'bg-brand-accent-light/20 border-brand-accent-light/50' : 'bg-white/5 border-white/10'}`}
              >
                <span className="text-sm leading-none">{g.emoji}</span>
                {g.count > 1 && <span className="text-[11px] font-mono text-hl-soft">{g.count}</span>}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Aktions-Menü (lange drücken / Rechtsklick) */}
      {menu && (
        <ModalPortal>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[80] bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4" {...menuBackdrop}>
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 20, opacity: 0 }}
              className="w-full sm:max-w-sm hl-surf border-t sm:border border-white/10 rounded-t-2xl sm:rounded-2xl p-3"
              style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 0.75rem)' }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between gap-1 hl-surf rounded-full px-2 py-1.5 mb-3">
                {QUICK_REACTIONS.map((e) => (
                  <button key={e} onClick={() => react(e)} className={`text-2xl leading-none p-1 rounded-full cursor-pointer ${myEmoji === e ? 'bg-brand-accent-light/25' : 'hover:bg-white/10'}`}>
                    {e}
                  </button>
                ))}
                <button onClick={() => { setMenu(false); setPick(true); }} className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center text-hl-soft hover:text-white cursor-pointer shrink-0">
                  <Plus className="w-5 h-5" />
                </button>
              </div>
              {!!c.body && <ActionBtn icon={Copy} label="Kopieren" onClick={() => { setMenu(false); navigator.clipboard?.writeText(c.body).catch(() => {}); }} />}
              {canEdit && <ActionBtn icon={Pencil} label="Bearbeiten" onClick={() => { setMenu(false); setEditText(c.body); setEditing(true); }} />}
              {mine && !deleted && <ActionBtn icon={Trash2} label="Für alle löschen" tone="rose" onClick={doDelete} />}
            </motion.div>
          </motion.div>
        </ModalPortal>
      )}

      {pick && <EmojiPicker onPick={react} onClose={() => setPick(false)} />}

      {editing && (
        <ModalPortal>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[82] bg-black/70 flex items-center justify-center p-4" onClick={() => setEditing(false)}>
            <div className="hl-card hl-modal-card w-full max-w-md p-4" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-display font-bold text-white uppercase tracking-tight">Beitrag bearbeiten</h4>
                <button onClick={() => setEditing(false)} className="p-1 text-hl-mute hover:text-white cursor-pointer"><X className="w-5 h-5" /></button>
              </div>
              <textarea
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                rows={3}
                autoFocus
                className="w-full hl-surf-0 border border-white/10 rounded-xl px-3 py-2 text-[15px] text-white focus:outline-none focus:border-brand-accent-light resize-y"
              />
              <div className="flex justify-end gap-2 mt-3">
                <button onClick={() => setEditing(false)} className="px-3 py-2 rounded-lg text-sm text-hl-mute hover:text-white cursor-pointer">Abbrechen</button>
                <button onClick={saveEdit} disabled={busy || !editText.trim()} className="px-4 py-2 rounded-lg text-sm font-semibold bg-brand-accent-light hover:bg-brand-accent text-white cursor-pointer disabled:opacity-50 flex items-center gap-1.5">
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Speichern
                </button>
              </div>
            </div>
          </motion.div>
        </ModalPortal>
      )}
    </div>
  );
}

// --- Detailansicht eines Tickets -------------------------------------------
export function TicketDetail({
  ticketId,
  origin,
  team,
  canManage,
  currentUserId,
  onClose,
  onChanged,
}: {
  ticketId: string;
  origin?: ZoomOrigin;
  team: TeamMember[];
  canManage: boolean;
  currentUserId: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [loading, setLoading] = useState(true);
  const [commentBody, setCommentBody] = useState('');
  const [busy, setBusy] = useState(false);
  // Chat-artiger Anhang (Bild/Video/Datei/Audio) für den nächsten Beitrag.
  const [attach, setAttach] = useState<{ type: 'file' | 'audio'; url: string; mime: string; title: string } | null>(null);
  const [attachMenu, setAttachMenu] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false); // Emoji-Auswahl fürs Eingabefeld
  const [uploading, setUploading] = useState(false);
  const [uploadPct, setUploadPct] = useState<number | null>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const docRef = useRef<HTMLInputElement>(null);
  const verlaufRef = useRef<HTMLDivElement>(null);
  const recorder = useTicketRecorder(async (file) => {
    setUploading(true);
    try {
      const { url, mime } = await uploadFile(file);
      setAttach({ type: 'audio', url, mime, title: 'Sprachnachricht' });
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Sprachnachricht konnte nicht hochgeladen werden.');
    } finally {
      setUploading(false);
    }
  });
  const onFileChosen = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    setUploadPct(null);
    try {
      const { url, name, mime } = await uploadFile(file, (p) => setUploadPct(p));
      setAttach({ type: 'file', url, mime, title: name });
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Datei konnte nicht hochgeladen werden.');
    } finally {
      setUploading(false);
      setUploadPct(null);
    }
  };
  // Screenshot/Bild aus der Zwischenablage einfügen → als Anhang übernehmen.
  const onPasteAttach = (e: React.ClipboardEvent) => {
    const file = Array.from(e.clipboardData?.items ?? [])
      .filter((it) => it.kind === 'file')
      .map((it) => it.getAsFile())
      .find((f): f is File => !!f && f.type.startsWith('image/'));
    if (file) {
      e.preventDefault();
      void onFileChosen(file);
    }
  };
  // Verlauf immer unten (neueste Kommentare) statt ewig scrollen.
  useEffect(() => {
    const el = verlaufRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [ticket?.comments?.length]);

  const load = useCallback(async () => {
    try {
      setTicket(await fetchTicket(ticketId));
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Ticket konnte nicht geladen werden.');
    } finally {
      setLoading(false);
    }
  }, [ticketId]);

  useEffect(() => {
    load();
  }, [load]);

  const patch = async (p: Parameters<typeof updateTicket>[1]) => {
    setBusy(true);
    try {
      const updated = await updateTicket(ticketId, p);
      setTicket((t) => (t ? { ...t, ...updated } : updated));
      onChanged();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Speichern fehlgeschlagen.');
    } finally {
      setBusy(false);
    }
  };

  const submitComment = async () => {
    if (!commentBody.trim() && !attach) return;
    setBusy(true);
    try {
      const c = await addTicketComment(
        ticketId,
        commentBody.trim(),
        attach ? { attachType: attach.type, attachUrl: attach.url, attachMime: attach.mime, attachTitle: attach.title } : null,
      );
      setTicket((t) => (t ? { ...t, comments: [...(t.comments ?? []), c] } : t));
      setCommentBody('');
      setAttach(null);
      onChanged();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Beitrag konnte nicht gespeichert werden.');
    } finally {
      setBusy(false);
    }
  };

  // Einen einzelnen Beitrag im Verlauf ersetzen (nach Reaktion/Bearbeiten/Löschen).
  const patchComment = (updated: TicketComment) => {
    setTicket((t) => (t ? { ...t, comments: (t.comments ?? []).map((c) => (c.id === updated.id ? updated : c)) } : t));
    onChanged();
  };

  const saveLinks = async (next: LinkItem[]) => {
    setTicket((t) => (t ? { ...t, links: next } : t));
    try {
      const updated = await updateTicketLinks(ticketId, next);
      setTicket((t) => (t ? { ...t, ...updated } : updated));
      onChanged();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Link konnte nicht gespeichert werden.');
      load();
    }
  };

  const remove = async () => {
    if (!confirm('Ticket wirklich löschen? Alle Kommentare gehen verloren.')) return;
    setBusy(true);
    try {
      await deleteTicket(ticketId);
      onChanged();
      onClose();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Löschen fehlgeschlagen.');
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
      className="fixed inset-0 z-[70] bg-black/80 flex items-start sm:items-center justify-center p-0 pt-[env(safe-area-inset-top)] sm:p-6 overflow-y-auto"
      {...backdrop}
    >
      <motion.div
        {...zoomModalProps(origin ?? ZERO_ORIGIN)}
        className="hl-card hl-modal-card w-full max-w-2xl my-0 sm:my-8 p-5 sm:p-6 rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        {loading || !ticket ? (
          <div className="flex items-center justify-center text-hl-mute" style={{ minHeight: '55vh' }}>
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        ) : (
          <>
            <div className="flex items-start justify-between gap-3 mb-4">
              <div className="min-w-0">
                <button onClick={onClose} className="text-xs text-hl-mute hover:text-white flex items-center gap-1 mb-2 cursor-pointer">
                  <ArrowLeft className="w-3.5 h-3.5" /> Zurück
                </button>
                <h3 className="font-display font-black text-xl text-white leading-tight break-words">{ticket.title}</h3>
                <p className="text-[11px] text-hl-dim font-mono mt-1">
                  von {ticket.createdByName} · {fmtDate(ticket.createdAt)}
                </p>
              </div>
              <button onClick={onClose} className="p-2 -mr-1 rounded-full text-hl-mute hover:text-white hover:bg-white/5 transition-colors shrink-0 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2 mb-4">
              <Badge className={PRIORITY_STYLE[ticket.priority]}>{PRIORITY_LABEL[ticket.priority]}</Badge>
              <Badge className={STATUS_STYLE[ticket.status]}>{STATUS_LABEL[ticket.status]}</Badge>
              {ticket.category && <Badge className="bg-white/5 text-hl-soft border-white/10">{ticket.category}</Badge>}
              {ticket.assignedToName && (
                <span className="text-[11px] text-hl-soft font-sans">→ {ticket.assignedToName}</span>
              )}
            </div>

            {ticket.description && (
              <p className="text-sm text-hl-soft font-sans whitespace-pre-wrap break-words mb-3">{ticket.description}</p>
            )}
            <ImageStrip images={ticket.images} />

            {/* Verwaltung (nur Super-Admin) */}
            {canManage && (
              <div className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-3 hl-surf-soft border border-white/5 rounded-2xl p-4">
                <div>
                  <label className="block text-[11px] font-mono text-hl-dim uppercase tracking-wider mb-1.5">Status</label>
                  <select
                    className={inputClass}
                    value={ticket.status}
                    disabled={busy}
                    onChange={(e) => patch({ status: e.target.value as TicketStatus })}
                  >
                    {STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {STATUS_LABEL[s]}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-mono text-hl-dim uppercase tracking-wider mb-1.5">Priorität</label>
                  <select
                    className={inputClass}
                    value={ticket.priority}
                    disabled={busy}
                    onChange={(e) => patch({ priority: e.target.value as TicketPriority })}
                  >
                    {PRIORITIES.map((p) => (
                      <option key={p} value={p}>
                        {PRIORITY_LABEL[p]}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-mono text-hl-dim uppercase tracking-wider mb-1.5">Zuständig</label>
                  <select
                    className={inputClass}
                    value={ticket.assignedTo ?? ''}
                    disabled={busy}
                    onChange={(e) => patch({ assignedTo: e.target.value || null })}
                  >
                    <option value="">— niemand —</option>
                    {team.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {/* Links */}
            <div className="mt-6">
              <h4 className="text-xs font-mono uppercase tracking-wider text-hl-dim mb-2">Links</h4>
              <LinkChips links={ticket.links ?? []} onChange={saveLinks} />
            </div>

            {/* Verlauf – vollwertiger Chat (wie bei Aufgaben/Ideen) */}
            <div className="mt-6">
              <h4 className="text-xs font-mono uppercase tracking-wider text-hl-dim mb-3 flex items-center gap-1.5">
                <MessageSquare className="w-4 h-4" /> Verlauf ({ticket.comments?.length ?? 0})
              </h4>
              <div ref={verlaufRef} className="space-y-2.5 max-h-80 overflow-y-auto">
                {(ticket.comments ?? []).length === 0 ? (
                  <p className="text-sm text-hl-faint py-2">Noch keine Nachricht – schreib die erste oder häng etwas an.</p>
                ) : (
                  (ticket.comments ?? []).map((c: TicketComment) => (
                    <TicketCommentRow
                      key={c.id}
                      c={c}
                      mine={c.authorId === currentUserId}
                      currentUserId={currentUserId}
                      avatarUrl={team.find((t) => t.id === c.authorId)?.avatarUrl}
                      colorSeed={ticketId}
                      onChanged={patchComment}
                    />
                  ))
                )}
              </div>

              {/* Pending-Anhang (noch nicht gesendet) */}
              {attach && (
                <div className="flex items-center gap-2 mt-3">
                  {attach.type === 'audio' ? (
                    <audio controls src={attach.url} className="h-9 w-56 max-w-full" />
                  ) : attach.mime.startsWith('image/') ? (
                    <img src={attach.url} alt={attach.title} className="h-16 w-16 object-cover rounded-lg border border-white/10" />
                  ) : attach.mime.startsWith('video/') ? (
                    <video src={attach.url} className="h-16 w-16 object-cover rounded-lg border border-white/10" />
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-white/5 border border-white/10 text-hl-soft text-[12px] max-w-[12rem]">
                      <FileIcon className="w-4 h-4 shrink-0 text-brand-accent-light" />
                      <span className="truncate">{attach.title}</span>
                    </span>
                  )}
                  <button onClick={() => setAttach(null)} className="text-hl-mute hover:text-white cursor-pointer" title="Anhang entfernen">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}
              {uploading && (
                <div className="flex items-center gap-1.5 mt-2 text-[11px] text-hl-faint font-mono">
                  <Loader2 className="w-3 h-3 animate-spin" /> lädt hoch…{uploadPct != null ? ` ${uploadPct}%` : ''}
                </div>
              )}
              {recorder.recording && (
                <div className="flex items-center gap-1.5 mt-2 text-[11px] text-rose-300 font-mono">
                  <span className="w-2 h-2 rounded-full bg-rose-400 animate-pulse" /> Aufnahme läuft – nochmal aufs Mikro tippen zum Stoppen.
                </div>
              )}

              {/* Versteckte Datei-Eingaben */}
              <input ref={galleryRef} type="file" accept="image/*,video/*" className="hidden" onChange={(e) => { void onFileChosen(e.target.files?.[0]); e.target.value = ''; }} />
              <input ref={docRef} type="file" className="hidden" onChange={(e) => { void onFileChosen(e.target.files?.[0]); e.target.value = ''; }} />

              {/* Chat-Eingabezeile: Anhängen · Text · Emoji · Senden */}
              <div className="relative flex gap-2 mt-3 items-end">
                <AnimatePresence>
                  {attachMenu && (
                    <>
                      <div className="fixed inset-0 z-[75]" onClick={() => setAttachMenu(false)} />
                      <motion.div
                        initial={{ opacity: 0, y: 10, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 10, scale: 0.98 }}
                        transition={{ duration: 0.15 }}
                        className="absolute bottom-full left-0 mb-2 z-[76] rounded-2xl hl-surf border border-white/10 shadow-2xl shadow-black/60 p-3 flex gap-4"
                      >
                        <button onClick={() => { setAttachMenu(false); galleryRef.current?.click(); }} className="flex flex-col items-center gap-1.5 cursor-pointer group">
                          <span className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: '#8B7CFF22', border: '1px solid #8B7CFF55' }}>
                            <ImageIcon className="w-5 h-5" style={{ color: '#8B7CFF' }} />
                          </span>
                          <span className="text-[11px] font-sans font-medium text-hl-soft">Bild/Video</span>
                        </button>
                        <button onClick={() => { setAttachMenu(false); docRef.current?.click(); }} className="flex flex-col items-center gap-1.5 cursor-pointer group">
                          <span className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: '#818CF822', border: '1px solid #818CF855' }}>
                            <FileIcon className="w-5 h-5" style={{ color: '#818CF8' }} />
                          </span>
                          <span className="text-[11px] font-sans font-medium text-hl-soft">Datei</span>
                        </button>
                        <button onClick={() => { setAttachMenu(false); recorder.toggle(); }} className="flex flex-col items-center gap-1.5 cursor-pointer group">
                          <span className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: '#F59E0B22', border: '1px solid #F59E0B55' }}>
                            <Mic className="w-5 h-5" style={{ color: '#F59E0B' }} />
                          </span>
                          <span className="text-[11px] font-sans font-medium text-hl-soft">Audio</span>
                        </button>
                      </motion.div>
                    </>
                  )}
                </AnimatePresence>

                <button
                  onClick={() => (recorder.recording ? recorder.toggle() : setAttachMenu((v) => !v))}
                  title="Anhängen"
                  className={`p-2.5 rounded-full border cursor-pointer shrink-0 transition-colors ${
                    recorder.recording
                      ? 'bg-rose-500 border-rose-500 text-white animate-pulse'
                      : attachMenu
                        ? 'bg-brand-accent-light border-brand-accent-light text-white rotate-45'
                        : 'bg-white/5 border-white/10 text-hl-soft hover:text-white'
                  } transition-transform`}
                >
                  <Plus className="w-5 h-5" />
                </button>
                <div className="flex-1 min-w-0">
                  <MentionTextarea
                    value={commentBody}
                    onChange={setCommentBody}
                    onEnter={submitComment}
                    onPaste={onPasteAttach}
                    mentionable={team.map((m) => ({ id: m.id, name: m.name }))}
                    placeholder="Nachricht…"
                    rows={1}
                    className={inputClass}
                  />
                </div>
                <button
                  onClick={() => setEmojiOpen(true)}
                  title="Emoji"
                  className="p-2.5 rounded-full border border-white/10 bg-white/5 text-hl-soft hover:text-white cursor-pointer shrink-0"
                >
                  <Smile className="w-5 h-5" />
                </button>
                <button onClick={submitComment} disabled={busy || uploading || (!commentBody.trim() && !attach)} className="p-2.5 rounded-full bg-brand-accent-light hover:bg-brand-accent text-white cursor-pointer disabled:opacity-50 shrink-0">
                  {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                </button>
              </div>
              <div className="mt-1.5 text-[10px] text-hl-faint font-mono flex items-center gap-1">
                <Clipboard className="w-3 h-3" /> Screenshot einfügbar
              </div>
              {emojiOpen && <EmojiPicker onPick={(e) => setCommentBody((b) => b + e)} onClose={() => setEmojiOpen(false)} />}
            </div>

            {/* Ticket löschen (nur Super-Admin) */}
            {canManage && (
              <div className="mt-5 pt-4 border-t border-white/5">
                <button
                  onClick={remove}
                  disabled={busy}
                  className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider bg-rose-500/10 border border-rose-500/30 text-rose-300 hover:bg-rose-500/20 transition-all active:scale-[.98] cursor-pointer disabled:opacity-50"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Ticket löschen
                </button>
              </div>
            )}
          </>
        )}
      </motion.div>
    </motion.div>
    </ModalPortal>
  );
}

// --- Neues-Ticket-Formular --------------------------------------------------
function NewTicketForm({ team, canManage, onCreated, onCancel }: { team: TeamMember[]; canManage: boolean; onCreated: () => void; onCancel: () => void }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<TicketPriority>('mittel');
  const [category, setCategory] = useState('');
  const [assignedTo, setAssignedTo] = useState('');
  const [busy, setBusy] = useState(false);
  const up = useImageUploads();
  const fileRef = useRef<HTMLInputElement>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      alert('Bitte einen Titel angeben.');
      return;
    }
    setBusy(true);
    try {
      await createTicket({ title: title.trim(), description, priority, category: category.trim(), images: up.images, assignedTo: assignedTo || null });
      onCreated();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Ticket konnte nicht erstellt werden.');
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="hl-surf-soft border border-white/10 rounded-3xl p-5 sm:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="font-display font-black text-lg text-white uppercase tracking-tight">Neues Ticket</h4>
        <button type="button" onClick={onCancel} className="p-2 -mr-1 rounded-full text-hl-mute hover:text-white hover:bg-white/5 transition-colors cursor-pointer">
          <X className="w-5 h-5" />
        </button>
      </div>
      <div>
        <label className="block text-[11px] font-mono text-hl-dim uppercase tracking-wider mb-1.5">Titel</label>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Worum geht's?" className={inputClass} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-[11px] font-mono text-hl-dim uppercase tracking-wider mb-1.5">Priorität</label>
          <select value={priority} onChange={(e) => setPriority(e.target.value as TicketPriority)} className={inputClass}>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {PRIORITY_LABEL[p]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[11px] font-mono text-hl-dim uppercase tracking-wider mb-1.5">Bereich (optional)</label>
          <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="z.B. Startseite, Tabelle…" className={inputClass} />
        </div>
      </div>
      {canManage && (
        <div>
          <label className="block text-[11px] font-mono text-hl-dim uppercase tracking-wider mb-1.5">Zuständig (optional)</label>
          <select value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)} className={inputClass}>
            <option value="">— niemand —</option>
            {team.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
          <p className="text-[10px] text-hl-faint mt-1">Die zuständige Person bekommt eine Benachrichtigung.</p>
        </div>
      )}
      <div>
        <label className="block text-[11px] font-mono text-hl-dim uppercase tracking-wider mb-1.5">Beschreibung / Umsetzungsidee</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onPaste={up.onPaste}
          rows={4}
          placeholder="Beschreibe die Idee…"
          className={`${inputClass} resize-y`}
        />
        <ImageStrip images={up.images} onRemove={up.removeAt} />
        <div className="flex items-center gap-3 mt-2">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="text-[11px] text-hl-mute hover:text-white font-mono flex items-center gap-1 cursor-pointer"
          >
            <Clipboard className="w-3.5 h-3.5" /> Bild wählen
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              void up.uploadFiles(Array.from(e.target.files ?? []));
              e.target.value = '';
            }}
          />
          {up.uploading && (
            <span className="text-[10px] text-hl-faint font-mono flex items-center gap-1">
              <Loader2 className="w-3 h-3 animate-spin" /> lädt…
            </span>
          )}
        </div>
      </div>
      <div className="flex gap-2.5 pt-1">
        <button type="button" onClick={onCancel} className="flex-1 py-3 rounded-2xl text-xs font-bold uppercase tracking-wider bg-white/5 border border-white/10 text-hl-mute hover:text-white transition-colors active:scale-[.98] cursor-pointer">
          Abbrechen
        </button>
        <button
          type="submit"
          disabled={busy || up.uploading}
          className="flex-[1.5] py-3 rounded-2xl text-xs font-bold uppercase tracking-wider bg-brand-accent-light hover:bg-brand-accent text-white transition-all active:scale-[.98] cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Absenden
        </button>
      </div>
    </form>
  );
}

// --- Hauptkomponente --------------------------------------------------------
export default function TicketSystem({ currentUserId, canManage, persist = false }: { currentUserId: string; canManage: boolean; persist?: boolean }) {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  // Offenes Ticket in der URL halten (nur in der Team-App), damit ein Reload
  // das Ticket wieder öffnet statt zur Liste zurückzuspringen.
  const [openId, setOpenId] = useState<string | null>(() => (persist ? getUrlParam('ticket') : null));
  const [zoom, setZoom] = useState<ZoomOrigin>(ZERO_ORIGIN);
  useEffect(() => {
    if (persist) setUrlParam('ticket', openId);
  }, [openId, persist]);
  // Handy-Zurück-Geste schließt das offene Ticket, statt die App zu verlassen.
  useBackClose(openId !== null, () => setOpenId(null));
  const [filter, setFilter] = useState<'offen' | 'abgeschlossen' | 'alle'>('offen');
  const members = useMemo(() => memberMap(team), [team]);

  const load = useCallback(async () => {
    try {
      const [t, m] = await Promise.all([fetchTickets(), fetchTeam().catch(() => [])]);
      setTickets(t);
      setTeam(m);
    } catch (err) {
      console.error('Tickets konnten nicht geladen werden', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const visible = tickets.filter((t) => {
    if (filter === 'offen') return t.status === 'offen' || t.status === 'in_bearbeitung';
    if (filter === 'abgeschlossen') return t.status === 'erledigt' || t.status === 'abgelehnt';
    return true;
  });

  return (
    <div className={persist ? 'flex flex-col min-h-full md:block md:min-h-0' : ''}>
      {/* Steuerleiste. Im Handy-App-Modus (persist) unten – mit dem Daumen
          erreichbar; ab md wieder oben. */}
      <div
        className={`flex items-center justify-between gap-3 ${
          persist
            ? 'order-2 sticky bottom-0 z-20 -mx-3 border-t border-white/10 hl-surf-0 px-3 pt-3 mt-3 md:static md:bottom-auto md:z-auto md:mx-0 md:mt-0 md:mb-4 md:border-0 md:bg-transparent md:px-0 md:pt-0'
            : 'mb-4'
        }`}
      >
        <SegmentedControl
          groupId="ticketfilter"
          fill
          className="flex-1 min-w-0"
          value={filter}
          onChange={(v) => setFilter(v)}
          options={[
            { value: 'offen' as const, label: 'Offen' },
            { value: 'abgeschlossen' as const, label: 'Erledigt' },
            { value: 'alle' as const, label: 'Alle' },
          ]}
        />
        <button
          onClick={() => setShowNew((v) => !v)}
          className="px-4 py-2.5 rounded-2xl text-xs font-bold uppercase tracking-wider bg-brand-accent-light hover:bg-brand-accent text-white transition-colors cursor-pointer flex items-center gap-1.5 shrink-0 active:scale-95"
        >
          <Plus className="w-4 h-4" /> Neu
        </button>
      </div>

      <div className={persist ? 'order-1 flex-1 min-h-0 md:contents' : 'contents'}>
      <AnimatePresence>
        {showNew && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden mb-4">
            <NewTicketForm
              team={team}
              canManage={canManage}
              onCreated={() => {
                setShowNew(false);
                load();
              }}
              onCancel={() => setShowNew(false)}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {loading ? (
        <div className="flex items-center justify-center py-12 text-hl-mute">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      ) : visible.length === 0 ? (
        <EmptyState icon={TicketIcon} title="Noch keine Tickets" hint="Leg oben ein neues Ticket an." />
      ) : (
        <div className="space-y-2.5 hl-cascade-soft">
          {visible.map((t) => (
            <motion.button
              key={t.id}
              whileTap={{ scale: 0.99 }}
              onClick={(e) => { setZoom(zoomOriginFromEvent(e)); setOpenId(t.id); }}
              className="w-full text-left hl-card hl-tint rounded-[22px] p-3.5 flex gap-3 cursor-pointer items-start"
              style={{ ['--tint' as string]: PRIORITY_BAR[t.priority] }}
            >
              <span className="hl-tint-chip w-11 h-11 rounded-2xl shrink-0 flex items-center justify-center self-start">
                <TicketIcon className="w-5 h-5" strokeWidth={2.4} />
              </span>
              <div className="flex items-start justify-between gap-3 flex-1 min-w-0">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge className={PRIORITY_STYLE[t.priority]}>{PRIORITY_LABEL[t.priority]}</Badge>
                    <Badge className={STATUS_STYLE[t.status]}>{STATUS_LABEL[t.status]}</Badge>
                    {t.category && <span className="text-[10px] font-mono text-hl-dim">{t.category}</span>}
                  </div>
                  <div className="font-sans font-semibold text-sm text-white mt-1.5 truncate">{t.title}</div>
                  <div className="flex items-center gap-1.5 mt-1">
                    <Avatar name={t.createdByName} url={members.get(t.createdBy)?.avatarUrl} size={18} />
                    <span className="text-[11px] font-mono text-hl-dim truncate">
                      {t.createdByName}
                      {t.assignedToName ? ` → ${t.assignedToName}` : ''} · {fmtDate(t.createdAt)}
                    </span>
                  </div>
                </div>
                {!!t.commentCount && (
                  <span className="shrink-0 flex items-center gap-1 text-[11px] text-hl-mute font-mono">
                    <MessageSquare className="w-3.5 h-3.5" /> {t.commentCount}
                  </span>
                )}
              </div>
            </motion.button>
          ))}
        </div>
      )}
      </div>

      <AnimatePresence>
        {openId && (
          <TicketDetail
            ticketId={openId}
            origin={zoom}
            team={team}
            canManage={canManage}
            currentUserId={currentUserId}
            onClose={goBackLayer}
            onChanged={load}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
