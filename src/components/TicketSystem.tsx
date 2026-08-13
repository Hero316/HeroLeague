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
} from 'lucide-react';
import type { Ticket, TicketComment, TicketPriority, TicketStatus, TeamMember } from '../types';
import { uploadImage } from '../lib/api';
import { getUrlParam, setUrlParam } from '../lib/urlState';
import { useBackClose, goBackLayer } from '../lib/backStack';
import {
  fetchTickets,
  fetchTicket,
  createTicket,
  updateTicket,
  deleteTicket,
  addTicketComment,
  fetchTeam,
  memberMap,
} from '../lib/collab';
import Avatar from './Avatar';
import MentionTextarea from './MentionTextarea';
import { useBackdropDismiss, ModalPortal, SegmentedControl } from './ui';

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

// --- Detailansicht eines Tickets -------------------------------------------
export function TicketDetail({
  ticketId,
  team,
  canManage,
  onClose,
  onChanged,
}: {
  ticketId: string;
  team: TeamMember[];
  canManage: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [loading, setLoading] = useState(true);
  const [commentBody, setCommentBody] = useState('');
  const [busy, setBusy] = useState(false);
  const up = useImageUploads();

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
    if (!commentBody.trim() && up.images.length === 0) return;
    setBusy(true);
    try {
      const c = await addTicketComment(ticketId, commentBody.trim() || '(Anhang)', up.images);
      setTicket((t) => (t ? { ...t, comments: [...(t.comments ?? []), c] } : t));
      setCommentBody('');
      up.reset();
      onChanged();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Kommentar konnte nicht gespeichert werden.');
    } finally {
      setBusy(false);
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
      className="fixed inset-0 z-[60] bg-black/80 flex items-start sm:items-center justify-center p-0 pt-[env(safe-area-inset-top)] sm:p-6 overflow-y-auto"
      {...backdrop}
    >
      <motion.div
        initial={{ scale: 0.97, y: 10 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.97, y: 10 }}
        className="hl-card hl-modal-card w-full max-w-2xl my-0 sm:my-8 p-5 sm:p-6 rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        {loading || !ticket ? (
          <div className="flex items-center justify-center py-16 text-hl-mute">
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

            {/* Kommentare */}
            <div className="mt-6">
              <h4 className="text-xs font-mono uppercase tracking-wider text-hl-dim mb-3 flex items-center gap-1.5">
                <MessageSquare className="w-4 h-4" /> Verlauf ({ticket.comments?.length ?? 0})
              </h4>
              <div className="space-y-3">
                {(ticket.comments ?? []).map((c: TicketComment) => (
                  <div key={c.id} className="hl-surf-soft border border-white/5 rounded-lg p-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-sans font-semibold text-white">{c.authorName}</span>
                      <span className="text-[10px] font-mono text-hl-faint">{fmtDate(c.createdAt)}</span>
                    </div>
                    <p className="text-sm text-hl-soft font-sans whitespace-pre-wrap break-words">{c.body}</p>
                    <ImageStrip images={c.images} />
                  </div>
                ))}
              </div>

              {/* Neuer Kommentar */}
              <div className="mt-3">
                <MentionTextarea
                  value={commentBody}
                  onChange={setCommentBody}
                  onPaste={up.onPaste}
                  mentionable={team.map((m) => ({ id: m.id, name: m.name }))}
                  placeholder="Kommentar…"
                  rows={2}
                  className={`${inputClass} resize-y`}
                />
                <ImageStrip images={up.images} onRemove={up.removeAt} />
                <div className="flex items-center justify-between mt-2">
                  <span className="text-[10px] text-hl-faint font-mono flex items-center gap-1">
                    {up.uploading ? (
                      <>
                        <Loader2 className="w-3 h-3 animate-spin" /> lädt…
                      </>
                    ) : (
                      <>
                        <Clipboard className="w-3 h-3" /> Screenshot einfügbar
                      </>
                    )}
                  </span>
                  <div className="flex gap-2">
                    {canManage && (
                      <button
                        onClick={remove}
                        disabled={busy}
                        className="px-4 py-2.5 rounded-2xl text-xs font-bold uppercase tracking-wider bg-rose-500/10 border border-rose-500/30 text-rose-300 hover:bg-rose-500/20 transition-all active:scale-[.98] cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                      >
                        <Trash2 className="w-3.5 h-3.5" /> Löschen
                      </button>
                    )}
                    <button
                      onClick={submitComment}
                      disabled={busy || up.uploading}
                      className="px-5 py-2.5 rounded-2xl text-xs font-bold uppercase tracking-wider bg-brand-accent-light hover:bg-brand-accent text-white transition-all active:scale-[.98] cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                    >
                      {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />} Senden
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </motion.div>
    </motion.div>
    </ModalPortal>
  );
}

// --- Neues-Ticket-Formular --------------------------------------------------
function NewTicketForm({ onCreated, onCancel }: { onCreated: () => void; onCancel: () => void }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<TicketPriority>('mittel');
  const [category, setCategory] = useState('');
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
      await createTicket({ title: title.trim(), description, priority, category: category.trim(), images: up.images });
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
export default function TicketSystem({ canManage, persist = false }: { currentUserId: string; canManage: boolean; persist?: boolean }) {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  // Offenes Ticket in der URL halten (nur in der Team-App), damit ein Reload
  // das Ticket wieder öffnet statt zur Liste zurückzuspringen.
  const [openId, setOpenId] = useState<string | null>(() => (persist ? getUrlParam('ticket') : null));
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
          className="px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider bg-brand-accent-light hover:bg-brand-accent text-white transition-colors cursor-pointer flex items-center gap-1.5 shrink-0 active:scale-95"
        >
          <Plus className="w-4 h-4" /> Neu
        </button>
      </div>

      <div className={persist ? 'order-1 flex-1 min-h-0 md:contents' : 'contents'}>
      <AnimatePresence>
        {showNew && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden mb-4">
            <NewTicketForm
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
        <div className="flex flex-col items-center gap-2 text-center py-10 text-hl-mute">
          <TicketIcon className="w-7 h-7 text-hl-faint" />
          <p className="text-sm font-sans">Noch keine Tickets. Leg mit „Neues Ticket" los.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {visible.map((t) => (
            <button
              key={t.id}
              onClick={() => setOpenId(t.id)}
              className="w-full text-left hl-surf-soft border border-white/5 hover:border-white/15 rounded-xl px-4 py-3 transition-colors cursor-pointer"
            >
              <div className="flex items-start justify-between gap-3">
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
            </button>
          ))}
        </div>
      )}
      </div>

      <AnimatePresence>
        {openId && (
          <TicketDetail
            ticketId={openId}
            team={team}
            canManage={canManage}
            onClose={goBackLayer}
            onChanged={load}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
