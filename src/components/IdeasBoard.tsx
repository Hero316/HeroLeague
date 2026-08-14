import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { Plus, X, Send, Trash2, Loader2, Lightbulb, Check, ListChecks, CalendarDays, Users } from 'lucide-react';
import type { Idea, IdeaComment, IdeaStatus, TeamMember } from '../types';
import { fetchIdeas, fetchIdea, createIdea, updateIdea, deleteIdea, convertIdea, addIdeaComment, fetchTeam } from '../lib/collab';
import { useBackClose } from '../lib/backStack';
import Avatar from './Avatar';
import MentionTextarea from './MentionTextarea';
import { useBackdropDismiss, ModalPortal, EmptyState } from './ui';

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

function fmtTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
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
          <div className="space-y-2.5">
            {ideas.map((idea) => {
              const sm = statusMeta(idea.status);
              return (
                <button
                  key={idea.id}
                  onClick={() => setOpenId(idea.id)}
                  className="w-full text-left hl-card p-4 rounded-2xl cursor-pointer active:scale-[.99] transition-transform"
                >
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="font-display font-black text-white text-base leading-tight break-words">{idea.title}</h3>
                    <span className={`shrink-0 px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider border ${sm.cell}`}>
                      {sm.label}
                    </span>
                  </div>
                  {idea.summary && <p className="text-sm text-hl-mute mt-1.5 line-clamp-2 break-words">{idea.summary}</p>}
                  <div className="flex items-center gap-3 mt-2.5 text-[11px] text-hl-faint font-sans">
                    <span className="flex items-center gap-1">
                      <Send className="w-3 h-3" /> {idea.commentCount ?? 0} Beiträge
                    </span>
                    <span className="flex items-center gap-1">
                      <Users className="w-3 h-3" /> {idea.members?.length ?? 0}
                    </span>
                    {idea.linkedTaskId && <span className="text-emerald-400/80 flex items-center gap-1"><Check className="w-3 h-3" /> umgewandelt</span>}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

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
          ideaId={openId}
          team={team}
          currentUserId={currentUserId}
          isSuperadmin={isSuperadmin}
          onClose={() => setOpenId(null)}
          onChanged={load}
        />
      )}
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
        <motion.div initial={{ scale: 0.97, y: 10 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.97, y: 10 }} className="hl-card hl-modal-card w-full max-w-lg my-0 sm:my-8 p-5 sm:p-6 rounded-3xl" onClick={(e) => e.stopPropagation()}>
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
  team,
  currentUserId,
  isSuperadmin,
  onClose,
  onChanged,
}: {
  ideaId: string;
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

  // Beim Schließen einen noch offenen Beitrag NICHT verlieren – vorher senden.
  const closeSafely = async () => {
    const pending = commentBody.trim();
    if (pending) {
      try {
        await addIdeaComment(ideaId, pending);
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
    if (!commentBody.trim()) return;
    setBusy(true);
    try {
      const c = await addIdeaComment(ideaId, commentBody.trim());
      setComments((prev) => [...prev, c]);
      setCommentBody('');
      onChanged();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Beitrag konnte nicht gespeichert werden.');
    } finally {
      setBusy(false);
    }
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
        <motion.div initial={{ scale: 0.97, y: 10 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.97, y: 10 }} className="hl-card hl-modal-card w-full max-w-xl my-0 sm:my-8 p-5 sm:p-6 rounded-3xl" onClick={(e) => e.stopPropagation()}>
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

              {/* Brainstorm-Verlauf */}
              <h4 className="text-xs font-mono uppercase tracking-wider text-hl-dim mb-2 flex items-center gap-1.5">
                <Send className="w-4 h-4" /> Brainstorm ({comments.length})
              </h4>
              <div className="space-y-2 max-h-56 overflow-y-auto">
                {comments.length === 0 ? (
                  <p className="text-sm text-hl-faint py-2">Noch keine Beiträge – schreib den ersten Vorschlag.</p>
                ) : (
                  comments.map((c) => (
                    <div key={c.id} className="hl-surf-soft border border-white/5 rounded-lg p-2.5">
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-xs font-sans font-semibold text-white">{c.authorName}</span>
                        <span className="text-[10px] font-mono text-hl-faint">{fmtTime(c.createdAt)}</span>
                      </div>
                      <p className="text-sm text-hl-soft font-sans whitespace-pre-wrap break-words">{c.body}</p>
                    </div>
                  ))
                )}
              </div>
              <div className="flex gap-2 mt-2 items-start">
                <div className="flex-1">
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
                <button onClick={submitComment} disabled={busy} className="px-3 py-2 rounded-xl bg-brand-accent-light hover:bg-brand-accent text-white cursor-pointer disabled:opacity-50">
                  <Send className="w-4 h-4" />
                </button>
              </div>

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
