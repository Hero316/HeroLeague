import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Plus, X, Send, Trash2, Loader2, Lightbulb, Check, ListChecks, CalendarDays, Users, Image as ImageIcon, Mic, File as FileIcon, Copy, Pencil, Smile } from 'lucide-react';
import type { Idea, IdeaComment, IdeaStatus, LinkItem, TeamMember } from '../types';
import { fetchIdeas, fetchIdea, createIdea, updateIdea, deleteIdea, convertIdea, addIdeaComment, editIdeaComment, deleteIdeaComment, reactIdeaComment, fetchTeam } from '../lib/collab';
import { useBackClose } from '../lib/backStack';
import { zoomOriginFromEvent, zoomModalProps, ZERO_ORIGIN, type ZoomOrigin } from '../lib/zoom';
import { uploadFile } from '../lib/api';
import Avatar from './Avatar';
import MentionTextarea from './MentionTextarea';
import LinkChips from './LinkChips';
import { VoiceMessage } from './AudioPlayer';
import { useBackdropDismiss, ModalPortal, EmptyState } from './ui';
import { BUBBLE_MINE, pickNameColor, EmojiPicker, useLongPress, QUICK_REACTIONS, ActionBtn } from './ChatSystem';

// Ideen-Bereich (Brainstorm): Jede Idee ist ein kleiner eigener Verlauf, in dem
// die eingeladenen Leute Vorschläge sammeln. Am Ende ein Fazit schreiben, Status
// setzen und die Idee bei Bedarf in eine Aufgabe/einen Termin umwandeln.

const inputClass =
  'w-full hl-surf-0 border border-white/10 rounded-xl px-3.5 py-2.5 text-[15px] text-white focus:outline-none focus:border-brand-accent-light transition-colors';

const STATUS: { id: IdeaStatus; label: string; dot: string; cell: string }[] = [
  { id: 'offen', label: 'Offen', dot: 'bg-sky-400', cell: 'bg-sky-500/15 text-sky-300 border-sky-500/40' },
  { id: 'in_bearbeitung', label: 'In Arbeit', dot: 'bg-amber-400', cell: 'bg-amber-500/15 text-amber-300 border-amber-500/40' },
  { id: 'erledigt', label: 'Erledigt', dot: 'bg-emerald-400', cell: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40' },
  { id: 'verworfen', label: 'Verworfen', dot: 'bg-rose-500', cell: 'bg-rose-500/15 text-rose-300 border-rose-500/40' },
];
const statusMeta = (s: IdeaStatus) => STATUS.find((x) => x.id === s) ?? STATUS[0];
// Akzentfarbe (Balken/Icon) je Status.
const STATUS_BAR: Record<IdeaStatus, string> = { offen: '#38BDF8', in_bearbeitung: '#F59E0B', erledigt: '#22DFC9', verworfen: '#FB7185' };

function fmtTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

// Sprachaufnahme per Umschalten (klick = an, klick = aus) – wie im Chat.
function useIdeaRecorder(onDone: (file: File) => void) {
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

// Ein Brainstorm-Beitrag – volle Chat-Funktionen: lange drücken (bzw. Rechtsklick)
// öffnet das Menü zum Reagieren/Kopieren/Bearbeiten/Für-alle-löschen; Emoji-
// Reaktionen unter der Blase; „bearbeitet"/gelöscht wie im Chat.
function IdeaCommentRow({
  c,
  mine,
  currentUserId,
  avatarUrl,
  colorSeed,
  onChanged,
}: {
  c: IdeaComment;
  mine: boolean;
  currentUserId: string;
  avatarUrl?: string;
  colorSeed: string;
  onChanged: (c: IdeaComment) => void;
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
      const res = await reactIdeaComment(c.id, emoji);
      onChanged({ ...c, reactions: res.reactions });
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Reaktion fehlgeschlagen.');
    }
  };
  const doDelete = async () => {
    setMenu(false);
    if (!window.confirm('Diesen Beitrag für alle löschen?')) return;
    try {
      await deleteIdeaComment(c.id);
      onChanged({ ...c, deletedAt: new Date().toISOString(), body: '', attachType: null, attachUrl: null, attachMime: null, attachTitle: null, reactions: [] });
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Löschen fehlgeschlagen.');
    }
  };
  const saveEdit = async () => {
    const t = editText.trim();
    if (!t) return;
    setBusy(true);
    try {
      const updated = await editIdeaComment(c.id, t);
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
              <IdeaAttachment c={c} />
            </>
          )}
          <div className={`text-[10px] font-mono leading-none text-right mt-1 flex items-center justify-end gap-1.5 ${mine ? 'text-white/60' : 'text-hl-faint'}`}>
            {c.editedAt && !deleted && <span className="italic">bearbeitet</span>}
            {fmtTime(c.createdAt)}
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

// Medien-Anhang eines Brainstorm-Beitrags anzeigen (Bild/Video/Datei/Audio).
function IdeaAttachment({ c }: { c: IdeaComment }) {
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

export default function IdeasBoard({
  currentUserId,
  isSuperadmin,
  initialOpenIdeaId,
}: {
  currentUserId: string;
  isSuperadmin: boolean;
  initialOpenIdeaId?: string | null;
}) {
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [openId, setOpenId] = useState<string | null>(initialOpenIdeaId ?? null);
  const [zoom, setZoom] = useState<ZoomOrigin>(ZERO_ORIGIN);

  const load = useCallback(async () => {
    try {
      setIdeas(await fetchIdeas());
    } catch {
      /* still */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    fetchTeam().then(setTeam).catch(() => {});
    const iv = setInterval(load, 8000);
    return () => clearInterval(iv);
  }, [load]);

  const didOpen = useRef(false);
  useEffect(() => {
    if (initialOpenIdeaId && !didOpen.current) {
      didOpen.current = true;
      setOpenId(initialOpenIdeaId);
    }
  }, [initialOpenIdeaId]);

  useBackClose(showNew, () => setShowNew(false));
  useBackClose(openId !== null, () => setOpenId(null));

  return (
    <div className="h-full overflow-y-auto p-3">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-3">
          <h2 className="flex items-center gap-2 font-display font-black text-lg text-white uppercase tracking-tight">
            <Lightbulb className="w-5 h-5 text-brand-accent-light" /> Ideen
          </h2>
          <button
            onClick={() => setShowNew(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-brand-accent-light hover:bg-brand-accent text-white text-xs font-bold uppercase tracking-wider cursor-pointer active:scale-[.97] transition-transform"
          >
            <Plus className="w-4 h-4" /> Neue Idee
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-10 text-hl-mute">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        ) : ideas.length === 0 ? (
          <EmptyState
            icon={Lightbulb}
            title="Noch keine Ideen"
            hint="Leg eine Idee an – z.B. eine Videoidee – und brainstormt gemeinsam."
          />
        ) : (
          <div className="space-y-2.5 hl-cascade-soft">
            {ideas.map((idea) => {
              const sm = statusMeta(idea.status);
              return (
                <motion.button
                  key={idea.id}
                  whileTap={{ scale: 0.99 }}
                  onClick={(e) => { setZoom(zoomOriginFromEvent(e)); setOpenId(idea.id); }}
                  className="w-full text-left hl-card hl-tint rounded-[22px] p-3.5 cursor-pointer flex gap-3 items-start"
                  style={{ ['--tint' as string]: STATUS_BAR[idea.status] }}
                >
                  <span className="hl-tint-chip w-12 h-12 rounded-2xl shrink-0 flex items-center justify-center self-start">
                    <Lightbulb className="w-6 h-6" strokeWidth={2.4} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-display font-black text-white text-[16px] leading-tight break-words">{idea.title}</h3>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {(idea.unread ?? 0) > 0 && (
                          <span
                            title={`${idea.unread} neue Beiträge`}
                            className="min-w-[20px] h-5 px-1.5 inline-flex items-center justify-center rounded-full bg-[#E6238E] text-white text-[11px] font-bold tabular-nums shadow-[0_2px_8px_rgba(230,35,142,.45)]"
                          >
                            {idea.unread! > 99 ? '99+' : idea.unread}
                          </span>
                        )}
                        <span className="hl-tint-pill px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider">
                          {sm.label}
                        </span>
                      </div>
                    </div>
                    {idea.summary && <p className="text-sm text-hl-mute mt-1 line-clamp-2 break-words">{idea.summary}</p>}
                    <div className="flex items-center gap-3 mt-2 text-[11px] text-hl-faint font-sans">
                      <span className="flex items-center gap-1"><Send className="w-3 h-3" /> {idea.commentCount ?? 0}</span>
                      <span className="flex items-center gap-1"><Users className="w-3 h-3" /> {idea.members?.length ?? 0}</span>
                      {idea.linkedTaskId && <span className="text-emerald-400/80 flex items-center gap-1"><Check className="w-3 h-3" /> umgewandelt</span>}
                    </div>
                  </div>
                </motion.button>
              );
            })}
          </div>
        )}
      </div>

      <AnimatePresence>
        {showNew && (
          <NewIdeaModal
            team={team}
            currentUserId={currentUserId}
            onClose={() => setShowNew(false)}
            onCreated={(id) => {
              setShowNew(false);
              load();
              setOpenId(id);
            }}
          />
        )}
        {openId && (
          <IdeaDetail
            key={openId}
            ideaId={openId}
            origin={zoom}
            team={team}
            currentUserId={currentUserId}
            isSuperadmin={isSuperadmin}
            onClose={() => { setOpenId(null); load(); }}
            onChanged={load}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// --- Neue Idee anlegen -------------------------------------------------------
function NewIdeaModal({
  team,
  currentUserId,
  onClose,
  onCreated,
}: {
  team: TeamMember[];
  currentUserId: string;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [title, setTitle] = useState('');
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const backdrop = useBackdropDismiss(onClose);
  const others = team.filter((m) => m.id !== currentUserId);

  const toggle = (id: string) => setMemberIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const create = async () => {
    if (!title.trim()) return alert('Bitte einen Titel für die Idee angeben.');
    setBusy(true);
    try {
      const idea = await createIdea({ title: title.trim(), memberIds });
      onCreated(idea.id);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Idee konnte nicht angelegt werden.');
      setBusy(false);
    }
  };

  return (
    <ModalPortal>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[60] bg-black/80 flex items-start sm:items-center justify-center p-0 pt-[env(safe-area-inset-top)] sm:p-6 overflow-y-auto" {...backdrop}>
        <motion.div initial={{ scale: 0.8, y: 24, opacity: 0 }} animate={{ scale: 1, y: 0, opacity: 1 }} exit={{ scale: 0.85, y: 12, opacity: 0 }} transition={{ type: 'spring', stiffness: 420, damping: 20, mass: 0.8 }} className="hl-card hl-modal-card w-full max-w-lg my-0 sm:my-8 p-5 sm:p-6 rounded-3xl" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between mb-5">
            <h3 className="font-display font-black text-xl text-white uppercase tracking-tight flex items-center gap-2">
              <Lightbulb className="w-5 h-5 text-brand-accent-light" /> Neue Idee
            </h3>
            <button onClick={onClose} className="p-2 -mr-1 rounded-full text-hl-mute hover:text-white hover:bg-white/5 transition-colors cursor-pointer">
              <X className="w-5 h-5" />
            </button>
          </div>

          <label className="block text-[10px] font-mono text-hl-dim uppercase mb-1.5">Titel der Idee</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="z.B. Videoidee: Saison-Rückblick" className={inputClass} autoFocus />

          <label className="block text-[10px] font-mono text-hl-dim uppercase mt-5 mb-2">Wer soll mitmachen?</label>
          {others.length === 0 ? (
            <p className="text-sm text-hl-faint">Keine weiteren Team-Mitglieder vorhanden.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {others.map((m) => {
                const on = memberIds.includes(m.id);
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => toggle(m.id)}
                    className={`flex items-center gap-1.5 pl-1 pr-3 py-1 rounded-full border transition-colors cursor-pointer ${
                      on ? 'bg-brand-accent-light/20 border-brand-accent-light/50 text-white' : 'bg-white/5 border-white/10 text-hl-mute hover:text-white'
                    }`}
                  >
                    <Avatar name={m.name} url={m.avatarUrl} size={22} />
                    <span className="text-xs font-sans font-semibold">{m.name}</span>
                    {on && <Check className="w-3.5 h-3.5 text-brand-accent-light" />}
                  </button>
                );
              })}
            </div>
          )}

          <div className="flex gap-2.5 mt-6">
            <button onClick={onClose} className="flex-1 py-3 rounded-2xl text-xs font-bold uppercase tracking-wider bg-white/5 border border-white/10 text-hl-mute hover:text-white cursor-pointer transition-colors">
              Abbrechen
            </button>
            <button onClick={create} disabled={busy} className="flex-[1.5] py-3 rounded-2xl text-xs font-bold uppercase tracking-wider bg-brand-accent-light hover:bg-brand-accent text-white cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Idee anlegen
            </button>
          </div>
        </motion.div>
      </motion.div>
    </ModalPortal>
  );
}

// --- Idee öffnen: Brainstorm, Status, Fazit, Umwandeln ----------------------
function IdeaDetail({
  ideaId,
  origin,
  team,
  currentUserId,
  isSuperadmin,
  onClose,
  onChanged,
}: {
  ideaId: string;
  origin?: ZoomOrigin;
  team: TeamMember[];
  currentUserId: string;
  isSuperadmin: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [idea, setIdea] = useState<Idea | null>(null);
  const [comments, setComments] = useState<IdeaComment[]>([]);
  const [commentBody, setCommentBody] = useState('');
  const [summary, setSummary] = useState('');
  const [busy, setBusy] = useState(false);
  const [savedFazit, setSavedFazit] = useState(false);
  const [copied, setCopied] = useState(false);
  // Chat-artiger Anhang (Bild/Video/Datei/Audio) für den nächsten Beitrag.
  const [attach, setAttach] = useState<{ type: 'file' | 'audio'; url: string; mime: string; title: string } | null>(null);
  const [attachMenu, setAttachMenu] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false); // Emoji-Auswahl fürs Eingabefeld
  const [uploading, setUploading] = useState(false);
  const [uploadPct, setUploadPct] = useState<number | null>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const docRef = useRef<HTMLInputElement>(null);
  const verlaufRef = useRef<HTMLDivElement>(null);
  const recorder = useIdeaRecorder(async (file) => {
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

  // Ganzen Brainstorm als Text kopieren – zum Einfügen in eine KI („fasse das
  // zusammen"). Bewusst ohne eigenen KI-Dienst: kostenlos, kein Schlüssel nötig.
  const copyBrainstorm = async () => {
    if (!idea) return;
    const lines = comments.map((c) => `- ${c.authorName}: ${c.body}`).join('\n');
    const text =
      `Idee: ${idea.title}\n\nBrainstorm-Verlauf:\n${lines || '(noch keine Beiträge)'}\n\n` +
      `Bitte fasse die wichtigsten Punkte als kurzes, klares Fazit in Stichpunkten zusammen.`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      alert('Kopieren nicht möglich – bitte den Verlauf von Hand markieren und kopieren.');
    }
  };

  const load = useCallback(async () => {
    try {
      const full = await fetchIdea(ideaId);
      setIdea(full);
      setComments(full.comments ?? []);
      setSummary(full.summary ?? '');
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Idee konnte nicht geladen werden.');
      onClose();
    }
  }, [ideaId, onClose]);

  useEffect(() => {
    load();
  }, [load]);

  // Brainstorm-Verlauf immer unten (neueste zuerst sichtbar) – kein Endlos-Scrollen.
  useEffect(() => {
    const el = verlaufRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [comments.length]);

  // Beim Schließen einen noch offenen Beitrag/Anhang NICHT verlieren – vorher senden.
  const closeSafely = async () => {
    const pending = commentBody.trim();
    if (pending || attach) {
      try {
        await addIdeaComment(ideaId, pending, attach ? { attachType: attach.type, attachUrl: attach.url, attachMime: attach.mime, attachTitle: attach.title } : null);
      } catch {
        /* Netzfehler – Text bleibt zumindest nicht doppelt */
      }
      onChanged();
    }
    onClose();
  };
  const backdrop = useBackdropDismiss(closeSafely);

  const isOwner = !!idea && (idea.createdBy === currentUserId || isSuperadmin);
  const canConvert = !!idea && idea.status === 'erledigt' && !idea.linkedTaskId;

  const setStatus = async (status: IdeaStatus) => {
    if (!idea || idea.status === status) return;
    setIdea({ ...idea, status });
    try {
      await updateIdea(ideaId, { status });
      onChanged();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Status konnte nicht gespeichert werden.');
      load();
    }
  };

  const saveLinks = async (next: LinkItem[]) => {
    setIdea((cur) => (cur ? { ...cur, links: next } : cur));
    try {
      await updateIdea(ideaId, { links: next });
      onChanged();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Link konnte nicht gespeichert werden.');
      load();
    }
  };

  const saveFazit = async () => {
    setBusy(true);
    try {
      await updateIdea(ideaId, { summary });
      setSavedFazit(true);
      setTimeout(() => setSavedFazit(false), 2500);
      onChanged();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Fazit konnte nicht gespeichert werden.');
    } finally {
      setBusy(false);
    }
  };

  const submitComment = async () => {
    if (!commentBody.trim() && !attach) return;
    setBusy(true);
    try {
      const c = await addIdeaComment(
        ideaId,
        commentBody.trim(),
        attach ? { attachType: attach.type, attachUrl: attach.url, attachMime: attach.mime, attachTitle: attach.title } : null,
      );
      setComments((prev) => [...prev, c]);
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
  const patchComment = (updated: IdeaComment) => {
    setComments((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
    onChanged();
  };

  const doConvert = async (type: 'termin' | 'aufgabe' | 'beides') => {
    if (!confirm('Aus dieser Idee eine ' + (type === 'termin' ? 'Termin' : type === 'aufgabe' ? 'Aufgabe' : 'Aufgabe + Termin') + ' erstellen?')) return;
    setBusy(true);
    try {
      const updated = await convertIdea(ideaId, type);
      setIdea(updated);
      onChanged();
      alert('Erstellt! Du findest den Eintrag unter Aufgaben bzw. Kalender.');
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Umwandeln fehlgeschlagen.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!confirm('Idee wirklich löschen? Alle Beiträge gehen verloren.')) return;
    setBusy(true);
    try {
      await deleteIdea(ideaId);
      onChanged();
      onClose();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Löschen fehlgeschlagen.');
      setBusy(false);
    }
  };

  return (
    <ModalPortal>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[60] bg-black/80 flex items-start sm:items-center justify-center p-0 pt-[env(safe-area-inset-top)] sm:p-6 overflow-y-auto" {...backdrop}>
        <motion.div {...zoomModalProps(origin ?? ZERO_ORIGIN)} className="hl-card hl-modal-card w-full max-w-xl my-0 sm:my-8 p-5 sm:p-6 rounded-3xl" onClick={(e) => e.stopPropagation()}>
          {!idea ? (
            <div className="flex justify-center py-10 text-hl-mute">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          ) : (
            <>
              <div className="flex items-start justify-between gap-3 mb-4">
                <h3 className="font-display font-black text-xl text-white leading-tight break-words flex items-center gap-2">
                  <Lightbulb className="w-5 h-5 text-brand-accent-light shrink-0" /> {idea.title}
                </h3>
                <button onClick={closeSafely} className="p-2 -mr-1 rounded-full text-hl-mute hover:text-white hover:bg-white/5 transition-colors cursor-pointer shrink-0">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Status */}
              <div className="flex flex-wrap gap-2 mb-4">
                {STATUS.map((s) => {
                  const on = idea.status === s.id;
                  return (
                    <button
                      key={s.id}
                      onClick={() => setStatus(s.id)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-sans font-bold border transition-colors cursor-pointer flex items-center gap-1.5 ${
                        on ? s.cell : 'bg-white/5 border-white/10 text-hl-mute hover:text-white'
                      }`}
                    >
                      <span className={`w-2 h-2 rounded-full ${s.dot}`} /> {s.label}
                    </button>
                  );
                })}
              </div>

              {/* Teilnehmer */}
              <div className="flex items-center gap-1.5 mb-4 flex-wrap">
                <Users className="w-4 h-4 text-hl-dim" />
                {idea.members.map((m) => {
                  const tm = team.find((t) => t.id === m.userId);
                  return <Avatar key={m.userId} name={m.userName} url={tm?.avatarUrl} size={24} />;
                })}
              </div>

              {/* Links */}
              <div className="mb-4">
                <h4 className="text-xs font-mono uppercase tracking-wider text-hl-dim mb-2">Links</h4>
                <LinkChips links={idea.links ?? []} onChange={saveLinks} />
              </div>

              {/* Brainstorm-Verlauf */}
              <h4 className="text-xs font-mono uppercase tracking-wider text-hl-dim mb-2 flex items-center gap-1.5">
                <Send className="w-4 h-4" /> Brainstorm ({comments.length})
              </h4>
              <div ref={verlaufRef} className="space-y-2.5 max-h-72 overflow-y-auto">
                {comments.length === 0 ? (
                  <p className="text-sm text-hl-faint py-2">Noch keine Beiträge – schreib den ersten Vorschlag oder häng etwas an.</p>
                ) : (
                  comments.map((c) => (
                    <IdeaCommentRow
                      key={c.id}
                      c={c}
                      mine={c.authorId === currentUserId}
                      currentUserId={currentUserId}
                      avatarUrl={team.find((t) => t.id === c.authorId)?.avatarUrl}
                      colorSeed={ideaId}
                      onChanged={patchComment}
                    />
                  ))
                )}
              </div>

              {/* Pending-Anhang (noch nicht gesendet) */}
              {attach && (
                <div className="flex items-center gap-2 mt-2">
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

              {/* Verstecktе Datei-Eingaben */}
              <input ref={galleryRef} type="file" accept="image/*,video/*" className="hidden" onChange={(e) => { void onFileChosen(e.target.files?.[0]); e.target.value = ''; }} />
              <input ref={docRef} type="file" className="hidden" onChange={(e) => { void onFileChosen(e.target.files?.[0]); e.target.value = ''; }} />

              <div className="relative flex gap-2 mt-2 items-end">
                {/* „+"-Menü für Anhänge (Bild/Video · Datei · Audio) */}
                <AnimatePresence>
                  {attachMenu && (
                    <>
                      <div className="fixed inset-0 z-[65]" onClick={() => setAttachMenu(false)} />
                      <motion.div
                        initial={{ opacity: 0, y: 10, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 10, scale: 0.98 }}
                        transition={{ duration: 0.15 }}
                        className="absolute bottom-full left-0 mb-2 z-[66] rounded-2xl hl-surf border border-white/10 shadow-2xl shadow-black/60 p-3 flex gap-4"
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
                    mentionable={team.map((m) => ({ id: m.id, name: m.name }))}
                    placeholder="Dein Vorschlag…"
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
              {emojiOpen && <EmojiPicker onPick={(e) => setCommentBody((b) => b + e)} onClose={() => setEmojiOpen(false)} />}

              {/* Fazit / Zusammenfassung */}
              <div className="mt-5">
                <div className="flex items-center justify-between mb-2 gap-2">
                  <h4 className="text-xs font-mono uppercase tracking-wider text-hl-dim">Fazit / Zusammenfassung</h4>
                  {comments.length > 0 && (
                    <button
                      onClick={copyBrainstorm}
                      title="Ganzen Brainstorm kopieren – zum Zusammenfassen per KI einfügen"
                      className="text-[11px] font-sans font-semibold text-brand-accent-light hover:text-white cursor-pointer shrink-0"
                    >
                      {copied ? '✓ kopiert' : 'Brainstorm kopieren'}
                    </button>
                  )}
                </div>
                <textarea
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                  placeholder="Das Wichtigste aus dem Brainstorm in Stichpunkten…"
                  rows={3}
                  className={inputClass}
                />
                <div className="flex items-center gap-3 mt-2">
                  <button onClick={saveFazit} disabled={busy} className="px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider bg-white/5 border border-white/10 text-hl-soft hover:text-white cursor-pointer disabled:opacity-50">
                    Fazit speichern
                  </button>
                  {savedFazit && (
                    <span className="text-xs text-emerald-400 font-sans flex items-center gap-1">
                      <Check className="w-4 h-4" /> Gespeichert
                    </span>
                  )}
                </div>
              </div>

              {/* Umwandeln (wenn erledigt und noch nicht verknüpft) */}
              {idea.linkedTaskId ? (
                <div className="mt-5 flex items-center gap-2 text-sm text-emerald-400 bg-emerald-500/10 border border-emerald-500/25 rounded-xl px-3 py-2.5">
                  <Check className="w-4 h-4 shrink-0" /> Aus dieser Idee wurde bereits eine Aufgabe/ein Termin erstellt.
                </div>
              ) : canConvert ? (
                <div className="mt-5 border-t border-white/5 pt-4">
                  <p className="text-xs text-hl-mute mb-2">Idee erledigt? Mach was draus:</p>
                  <div className="flex flex-wrap gap-2">
                    <button onClick={() => doConvert('aufgabe')} disabled={busy} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold uppercase tracking-wider bg-brand-accent-light/15 border border-brand-accent-light/40 text-brand-accent-light hover:bg-brand-accent-light/25 cursor-pointer disabled:opacity-50">
                      <ListChecks className="w-4 h-4" /> → Aufgabe
                    </button>
                    <button onClick={() => doConvert('termin')} disabled={busy} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold uppercase tracking-wider bg-brand-accent-light/15 border border-brand-accent-light/40 text-brand-accent-light hover:bg-brand-accent-light/25 cursor-pointer disabled:opacity-50">
                      <CalendarDays className="w-4 h-4" /> → Termin
                    </button>
                    <button onClick={() => doConvert('beides')} disabled={busy} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold uppercase tracking-wider bg-brand-accent-light/15 border border-brand-accent-light/40 text-brand-accent-light hover:bg-brand-accent-light/25 cursor-pointer disabled:opacity-50">
                      → Beides
                    </button>
                  </div>
                </div>
              ) : null}

              {/* Löschen (nur Ersteller/Super-Admin) */}
              {isOwner && (
                <div className="mt-5 pt-4 border-t border-white/5">
                  <button onClick={remove} disabled={busy} className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider bg-rose-500/10 border border-rose-500/30 text-rose-300 hover:bg-rose-500/20 cursor-pointer disabled:opacity-50">
                    <Trash2 className="w-3.5 h-3.5" /> Idee löschen
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
