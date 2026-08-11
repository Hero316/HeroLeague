import React, { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronLeft, ChevronRight, Plus, X, Send, Trash2, Loader2, MessageSquare, Users, CalendarDays } from 'lucide-react';
import type { Task, TaskComment, TaskStatus, TicketPriority, TeamMember } from '../types';
import {
  fetchTasksForWeek,
  fetchTask,
  createTask,
  updateTask,
  deleteTask,
  addTaskComment,
  fetchTeam,
  isoWeekOf,
  daysOfIsoWeek,
  shiftIsoWeek,
  parseIsoWeek,
} from '../lib/collab';

const inputClass =
  'w-full bg-[#060E0F] border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-accent-light';

const STATUS_LABEL: Record<TaskStatus, string> = {
  leer: 'Nichts',
  offen: 'Offen',
  in_bearbeitung: 'In Arbeit',
  erledigt: 'Erledigt',
  abgebrochen: 'Abgebrochen',
};
// Farbwelt je Status (Punkt + linker Balken der Karte).
const STATUS_BAR: Record<TaskStatus, string> = {
  leer: 'border-l-slate-500/60',
  offen: 'border-l-sky-400/70',
  in_bearbeitung: 'border-l-amber-400/70',
  erledigt: 'border-l-emerald-400/70',
  abgebrochen: 'border-l-rose-500/70',
};
const STATUSES: TaskStatus[] = ['leer', 'offen', 'in_bearbeitung', 'erledigt', 'abgebrochen'];
// Volle Status-Farbfläche (Monday-Stil) für die anklickbare Status-Zelle.
const STATUS_CELL: Record<TaskStatus, string> = {
  leer: 'bg-slate-600/80 text-white',
  offen: 'bg-sky-500/85 text-white',
  in_bearbeitung: 'bg-amber-500/90 text-white',
  erledigt: 'bg-emerald-500/85 text-white',
  abgebrochen: 'bg-rose-600/85 text-white',
};

const PRIORITY_LABEL: Record<TicketPriority, string> = {
  niedrig: 'Niedrig',
  mittel: 'Mittel',
  hoch: 'Hoch',
  dringend: 'Dringend',
};
const PRIORITY_CELL: Record<TicketPriority, string> = {
  niedrig: 'bg-slate-500/80 text-white',
  mittel: 'bg-sky-600/80 text-white',
  hoch: 'bg-amber-500/90 text-white',
  dringend: 'bg-rose-600/85 text-white',
};
const PRIORITIES: TicketPriority[] = ['niedrig', 'mittel', 'hoch', 'dringend'];

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

function AssigneeChips({ assignees }: { assignees: { userId: string; userName: string }[] }) {
  if (assignees.length === 0) return null;
  return (
    <div className="flex -space-x-1.5 mt-1.5">
      {assignees.slice(0, 4).map((a) => (
        <span
          key={a.userId}
          title={a.userName}
          className="w-6 h-6 rounded-full bg-brand-accent/25 border border-brand-accent-light/40 text-[9px] font-bold text-brand-accent-light flex items-center justify-center"
        >
          {initials(a.userName)}
        </span>
      ))}
      {assignees.length > 4 && (
        <span className="w-6 h-6 rounded-full bg-white/10 border border-white/20 text-[9px] font-bold text-hl-soft flex items-center justify-center">
          +{assignees.length - 4}
        </span>
      )}
    </div>
  );
}

// --- Detail / Bearbeiten ----------------------------------------------------
function TaskDetail({
  task,
  team,
  currentUserId,
  isSuperadmin,
  onClose,
  onChanged,
}: {
  task: Task;
  team: TeamMember[];
  currentUserId: string;
  isSuperadmin: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [title, setTitle] = useState(task.title);
  const [notes, setNotes] = useState(task.notes);
  const [status, setStatus] = useState<TaskStatus>(task.status);
  const [priority, setPriority] = useState<TicketPriority>(task.priority);
  const [assignees, setAssignees] = useState<string[]>(task.assignees.map((a) => a.userId));
  const [comments, setComments] = useState<TaskComment[]>(task.comments ?? []);
  const [commentBody, setCommentBody] = useState('');
  const [busy, setBusy] = useState(false);

  const canDelete = isSuperadmin || task.createdBy === currentUserId;

  // Bestehende Kommentare beim Öffnen nachladen (Liste liefert nur die Anzahl).
  useEffect(() => {
    let alive = true;
    fetchTask(task.id)
      .then((full) => {
        if (alive) setComments(full.comments ?? []);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [task.id]);

  const toggleAssignee = (id: string) =>
    setAssignees((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const save = async () => {
    if (!title.trim()) {
      alert('Titel darf nicht leer sein.');
      return;
    }
    setBusy(true);
    try {
      await updateTask(task.id, { title: title.trim(), notes, status, priority, assignees });
      onChanged();
      onClose();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Speichern fehlgeschlagen.');
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!confirm('Aufgabe wirklich löschen?')) return;
    setBusy(true);
    try {
      await deleteTask(task.id);
      onChanged();
      onClose();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Löschen fehlgeschlagen.');
      setBusy(false);
    }
  };

  const submitComment = async () => {
    if (!commentBody.trim()) return;
    setBusy(true);
    try {
      const c = await addTaskComment(task.id, commentBody.trim());
      setComments((prev) => [...prev, c]);
      setCommentBody('');
      onChanged();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Kommentar konnte nicht gespeichert werden.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm flex items-start sm:items-center justify-center p-0 sm:p-6 overflow-y-auto"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.97, y: 10 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.97, y: 10 }}
        className="hl-card w-full max-w-xl my-0 sm:my-8 p-5 sm:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display font-black text-lg text-white uppercase tracking-tight">Aufgabe</h3>
          <button onClick={onClose} className="p-1.5 text-hl-mute hover:text-white cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        <label className="block text-[10px] font-mono text-hl-dim uppercase mb-1">Titel</label>
        <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} />

        <label className="block text-[10px] font-mono text-hl-dim uppercase mb-1 mt-3">Notizen</label>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className={`${inputClass} resize-y`} />

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-3">
          <div>
            <label className="block text-[10px] font-mono text-hl-dim uppercase mb-1">Status</label>
            <select value={status} onChange={(e) => setStatus(e.target.value as TaskStatus)} className={inputClass}>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-mono text-hl-dim uppercase mb-1">Priorität</label>
            <select value={priority} onChange={(e) => setPriority(e.target.value as TicketPriority)} className={inputClass}>
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {PRIORITY_LABEL[p]}
                </option>
              ))}
            </select>
          </div>
          <div className="text-[10px] font-mono text-hl-dim uppercase pt-1 col-span-2 sm:col-span-1">
            <span className="block mb-1">Erstellt</span>
            <span className="text-hl-soft normal-case font-sans text-xs">
              {task.createdByName} · {fmtDate(task.createdAt)}
            </span>
          </div>
        </div>

        <label className="block text-[10px] font-mono text-hl-dim uppercase mb-1.5 mt-3 flex items-center gap-1">
          <Users className="w-3.5 h-3.5" /> Personen
        </label>
        <div className="flex flex-wrap gap-1.5">
          {team.map((m) => {
            const on = assignees.includes(m.id);
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => toggleAssignee(m.id)}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-sans font-semibold border transition-colors cursor-pointer ${
                  on
                    ? 'bg-brand-accent-light/20 border-brand-accent-light/50 text-brand-accent-light'
                    : 'bg-white/5 border-white/10 text-hl-mute hover:text-white'
                }`}
              >
                {m.name}
              </button>
            );
          })}
          {team.length === 0 && <span className="text-xs text-hl-faint font-sans">Keine Team-Mitglieder gefunden.</span>}
        </div>

        {/* Verlauf */}
        <div className="mt-5">
          <h4 className="text-xs font-mono uppercase tracking-wider text-hl-dim mb-2 flex items-center gap-1.5">
            <MessageSquare className="w-4 h-4" /> Verlauf ({comments.length})
          </h4>
          <div className="space-y-2 max-h-52 overflow-y-auto">
            {comments.map((c) => (
              <div key={c.id} className="bg-[#060E0F]/40 border border-white/5 rounded-lg p-2.5">
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-xs font-sans font-semibold text-white">{c.authorName}</span>
                  <span className="text-[10px] font-mono text-hl-faint">{fmtDate(c.createdAt)}</span>
                </div>
                <p className="text-sm text-hl-soft font-sans whitespace-pre-wrap break-words">{c.body}</p>
              </div>
            ))}
          </div>
          <div className="flex gap-2 mt-2">
            <input
              value={commentBody}
              onChange={(e) => setCommentBody(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submitComment()}
              placeholder="Kommentar… (@Name erwähnt)"
              className={inputClass}
            />
            <button
              onClick={submitComment}
              disabled={busy}
              className="px-3 rounded-xl bg-white/5 border border-white/10 text-hl-soft hover:text-white cursor-pointer disabled:opacity-50"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex justify-between gap-2 mt-5 pt-4 border-t border-white/5">
          {canDelete ? (
            <button
              onClick={remove}
              disabled={busy}
              className="px-3 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider bg-rose-500/10 border border-rose-500/30 text-rose-300 hover:bg-rose-500/20 transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
            >
              <Trash2 className="w-3.5 h-3.5" /> Löschen
            </button>
          ) : (
            <span />
          )}
          <button
            onClick={save}
            disabled={busy}
            className="px-5 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider bg-brand-accent-light hover:bg-brand-accent text-white transition-colors cursor-pointer disabled:opacity-50"
          >
            Speichern
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// --- Board ------------------------------------------------------------------
export default function TaskBoard({
  currentUserId,
  isSuperadmin,
}: {
  currentUserId: string;
  isSuperadmin: boolean;
}) {
  const [week, setWeek] = useState<string>(() => isoWeekOf(new Date()));
  const [tasks, setTasks] = useState<Task[]>([]);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [openTask, setOpenTask] = useState<Task | null>(null);
  const [quickAdd, setQuickAdd] = useState<Record<string, string>>({});
  const [addingFor, setAddingFor] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [t, m] = await Promise.all([fetchTasksForWeek(week), fetchTeam().catch(() => [])]);
      setTasks(t);
      setTeam(m);
    } catch (err) {
      console.error('Aufgaben konnten nicht geladen werden', err);
    } finally {
      setLoading(false);
    }
  }, [week]);

  useEffect(() => {
    load();
  }, [load]);

  const days = daysOfIsoWeek(week);
  const parsed = parseIsoWeek(week);
  const rangeLabel = days.length ? `${days[0].label} – ${days[6].label}` : '';

  // Spalten: „Woche allgemein" (ohne Tag) + 7 Wochentage.
  const columns: { key: string; date: string | null; title: string; sub: string }[] = [
    { key: 'week', date: null, title: 'Woche', sub: 'ohne festen Tag' },
    ...days.map((d) => ({ key: d.date, date: d.date, title: d.weekday, sub: d.label })),
  ];

  const tasksFor = (date: string | null) =>
    tasks.filter((t) => (date === null ? !t.dueDate : t.dueDate === date));

  const submitQuickAdd = async (date: string | null) => {
    const key = date ?? 'week';
    const title = (quickAdd[key] ?? '').trim();
    if (!title) return;
    setAddingFor(key);
    try {
      await createTask({ title, dueDate: date, isoWeek: week, status: 'offen', assignees: [] });
      setQuickAdd((q) => ({ ...q, [key]: '' }));
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Aufgabe konnte nicht erstellt werden.');
    } finally {
      setAddingFor(null);
    }
  };

  // Status direkt auf der Karte setzen (Monday-Stil: farbige Status-Zelle).
  const quickSetStatus = async (t: Task, next: TaskStatus) => {
    setTasks((prev) => prev.map((x) => (x.id === t.id ? { ...x, status: next } : x)));
    try {
      await updateTask(t.id, { status: next });
    } catch {
      load();
    }
  };

  return (
    <div>
      {/* Wochennavigation */}
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <button onClick={() => setWeek((w) => shiftIsoWeek(w, -1))} className="p-2 rounded-lg bg-white/5 border border-white/10 text-hl-soft hover:text-white cursor-pointer">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <div className="text-center min-w-[9rem]">
            <div className="font-display font-bold text-white text-sm uppercase tracking-tight flex items-center justify-center gap-1.5">
              <CalendarDays className="w-4 h-4 text-brand-accent-light" />
              KW {parsed?.week ?? '–'} · {parsed?.year ?? ''}
            </div>
            <div className="text-[11px] font-mono text-hl-dim">{rangeLabel}</div>
          </div>
          <button onClick={() => setWeek((w) => shiftIsoWeek(w, 1))} className="p-2 rounded-lg bg-white/5 border border-white/10 text-hl-soft hover:text-white cursor-pointer">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
        <button
          onClick={() => setWeek(isoWeekOf(new Date()))}
          className="px-3 py-2 rounded-lg text-xs font-sans font-semibold bg-white/5 border border-white/10 text-hl-mute hover:text-white transition-colors cursor-pointer"
        >
          Heute
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12 text-hl-mute">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-3 -mx-1 px-1">
          {columns.map((col) => {
            const list = tasksFor(col.date);
            const key = col.key;
            return (
              <div key={key} className="shrink-0 w-60 bg-[#060E0F]/40 border border-white/5 rounded-xl p-2.5 flex flex-col">
                <div className="flex items-baseline justify-between px-1 mb-2">
                  <span className="font-display font-bold text-white text-sm uppercase tracking-tight">{col.title}</span>
                  <span className="text-[10px] font-mono text-hl-dim">{col.sub}</span>
                </div>

                <div className="space-y-2 flex-1 min-h-[2rem]">
                  {list.map((t) => (
                    <div
                      key={t.id}
                      className={`bg-[#0a1110] border border-white/5 border-l-2 ${STATUS_BAR[t.status]} rounded-lg p-2.5 cursor-pointer hover:border-white/15 transition-colors`}
                      onClick={() => setOpenTask(t)}
                    >
                      <span className="block text-sm font-sans text-white leading-snug break-words">{t.title}</span>

                      {/* Status als farbige Klick-Zelle (Monday) + Prioritäts-Pille */}
                      <div className="flex items-center gap-1.5 mt-2" onClick={(e) => e.stopPropagation()}>
                        <div className={`relative rounded-md ${STATUS_CELL[t.status]}`}>
                          <select
                            value={t.status}
                            onChange={(e) => quickSetStatus(t, e.target.value as TaskStatus)}
                            className="appearance-none bg-transparent text-white text-[11px] font-semibold uppercase tracking-wider px-2 py-1 pr-5 rounded-md cursor-pointer focus:outline-none"
                            title="Status ändern"
                          >
                            {STATUSES.map((s) => (
                              <option key={s} value={s} className="text-black">
                                {STATUS_LABEL[s]}
                              </option>
                            ))}
                          </select>
                          <ChevronRight className="w-3 h-3 rotate-90 absolute right-1 top-1/2 -translate-y-1/2 pointer-events-none opacity-80" />
                        </div>
                        <span className={`text-[10px] font-semibold uppercase tracking-wider px-1.5 py-1 rounded-md ${PRIORITY_CELL[t.priority]}`}>
                          {PRIORITY_LABEL[t.priority]}
                        </span>
                      </div>

                      <div className="flex items-center justify-between mt-1.5">
                        <AssigneeChips assignees={t.assignees} />
                        {!!t.commentCount && (
                          <span className="flex items-center gap-1 text-[10px] text-hl-mute font-mono">
                            <MessageSquare className="w-3 h-3" /> {t.commentCount}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Schnell-Hinzufügen */}
                <div className="mt-2 flex gap-1.5">
                  <input
                    value={quickAdd[key] ?? ''}
                    onChange={(e) => setQuickAdd((q) => ({ ...q, [key]: e.target.value }))}
                    onKeyDown={(e) => e.key === 'Enter' && submitQuickAdd(col.date)}
                    placeholder="+ Aufgabe"
                    className="flex-1 bg-transparent border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder:text-hl-faint focus:outline-none focus:border-brand-accent-light"
                  />
                  <button
                    onClick={() => submitQuickAdd(col.date)}
                    disabled={addingFor === key}
                    className="px-2 rounded-lg bg-brand-accent-light/20 border border-brand-accent-light/40 text-brand-accent-light hover:bg-brand-accent-light/30 cursor-pointer disabled:opacity-50"
                  >
                    {addingFor === key ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <AnimatePresence>
        {openTask && (
          <TaskDetail
            task={openTask}
            team={team}
            currentUserId={currentUserId}
            isSuperadmin={isSuperadmin}
            onClose={() => setOpenTask(null)}
            onChanged={load}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
