import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronLeft, ChevronRight, Plus, X, Send, Trash2, Loader2, MessageSquare, Users, CalendarDays, LayoutGrid } from 'lucide-react';
import type { Task, TaskComment, TaskStatus, TicketPriority, TeamMember } from '../types';
import { fetchTasksRange, fetchTask, createTask, updateTask, deleteTask, addTaskComment, fetchTeam } from '../lib/collab';

const inputClass =
  'w-full bg-[#060E0F] border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-accent-light';

const STATUS_LABEL: Record<TaskStatus, string> = {
  leer: 'Nichts',
  offen: 'Offen',
  in_bearbeitung: 'In Arbeit',
  erledigt: 'Erledigt',
  abgebrochen: 'Abgebrochen',
};
const STATUS_DOT: Record<TaskStatus, string> = {
  leer: 'bg-slate-500',
  offen: 'bg-sky-400',
  in_bearbeitung: 'bg-amber-400',
  erledigt: 'bg-emerald-400',
  abgebrochen: 'bg-rose-500',
};
const STATUS_CELL: Record<TaskStatus, string> = {
  leer: 'bg-slate-600/80 text-white',
  offen: 'bg-sky-500/85 text-white',
  in_bearbeitung: 'bg-amber-500/90 text-white',
  erledigt: 'bg-emerald-500/85 text-white',
  abgebrochen: 'bg-rose-600/85 text-white',
};
const STATUSES: TaskStatus[] = ['leer', 'offen', 'in_bearbeitung', 'erledigt', 'abgebrochen'];

const PRIORITY_LABEL: Record<TicketPriority, string> = { niedrig: 'Niedrig', mittel: 'Mittel', hoch: 'Hoch', dringend: 'Dringend' };
const PRIORITY_CELL: Record<TicketPriority, string> = {
  niedrig: 'bg-slate-500/80 text-white',
  mittel: 'bg-sky-600/80 text-white',
  hoch: 'bg-amber-500/90 text-white',
  dringend: 'bg-rose-600/85 text-white',
};
const PRIORITIES: TicketPriority[] = ['niedrig', 'mittel', 'hoch', 'dringend'];

const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

// --- Datums-Helfer (lokale Tage, keine Zeitzonen-Verschiebung) --------------
function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
function addMonths(d: Date, n: number): Date {
  const x = new Date(d);
  x.setMonth(x.getMonth() + n);
  return x;
}
function mondayOf(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
}
function monthWeeks(anchor: Date): Date[][] {
  const start = mondayOf(new Date(anchor.getFullYear(), anchor.getMonth(), 1));
  const lastOfMonth = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
  const weeks: Date[][] = [];
  let cur = start;
  do {
    const row: Date[] = [];
    for (let i = 0; i < 7; i++) {
      row.push(cur);
      cur = addDays(cur, 1);
    }
    weeks.push(row);
  } while (weeks[weeks.length - 1][6] < lastOfMonth && weeks.length < 6);
  return weeks;
}
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
const TODAY = ymd(new Date());

function AssigneeChips({ assignees, size = 6 }: { assignees: { userId: string; userName: string }[]; size?: number }) {
  if (assignees.length === 0) return null;
  const cls = size === 5 ? 'w-5 h-5 text-[8px]' : 'w-6 h-6 text-[9px]';
  return (
    <div className="flex -space-x-1.5">
      {assignees.slice(0, 4).map((a) => (
        <span
          key={a.userId}
          title={a.userName}
          className={`${cls} rounded-full bg-brand-accent/25 border border-brand-accent-light/40 font-bold text-brand-accent-light flex items-center justify-center`}
        >
          {initials(a.userName)}
        </span>
      ))}
      {assignees.length > 4 && (
        <span className={`${cls} rounded-full bg-white/10 border border-white/20 font-bold text-hl-soft flex items-center justify-center`}>
          +{assignees.length - 4}
        </span>
      )}
    </div>
  );
}

// ===========================================================================
// Detail / Bearbeiten
// ===========================================================================
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
  const [dueDate, setDueDate] = useState<string>(task.dueDate ?? '');
  const [assignees, setAssignees] = useState<string[]>(task.assignees.map((a) => a.userId));
  const [comments, setComments] = useState<TaskComment[]>(task.comments ?? []);
  const [commentBody, setCommentBody] = useState('');
  const [busy, setBusy] = useState(false);
  const canDelete = isSuperadmin || task.createdBy === currentUserId;

  useEffect(() => {
    let alive = true;
    fetchTask(task.id).then((full) => alive && setComments(full.comments ?? [])).catch(() => {});
    return () => {
      alive = false;
    };
  }, [task.id]);

  const toggleAssignee = (id: string) => setAssignees((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const save = async () => {
    if (!title.trim()) return alert('Titel darf nicht leer sein.');
    setBusy(true);
    try {
      await updateTask(task.id, { title: title.trim(), notes, status, priority, dueDate: dueDate || null, assignees });
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
      alert(err instanceof Error ? err.message : 'Kommentar fehlgeschlagen.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm flex items-start sm:items-center justify-center p-0 sm:p-6 overflow-y-auto" onClick={onClose}>
      <motion.div initial={{ scale: 0.97, y: 10 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.97, y: 10 }} className="hl-card w-full max-w-xl my-0 sm:my-8 p-5 sm:p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display font-black text-lg text-white uppercase tracking-tight">Aufgabe</h3>
          <button onClick={onClose} className="p-1.5 text-hl-mute hover:text-white cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        <label className="block text-[10px] font-mono text-hl-dim uppercase mb-1">Titel</label>
        <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} />

        <label className="block text-[10px] font-mono text-hl-dim uppercase mb-1 mt-3">Notizen</label>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={`${inputClass} resize-y`} />

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-3">
          <div>
            <label className="block text-[10px] font-mono text-hl-dim uppercase mb-1">Datum</label>
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className="block text-[10px] font-mono text-hl-dim uppercase mb-1">Status</label>
            <select value={status} onChange={(e) => setStatus(e.target.value as TaskStatus)} className={inputClass}>
              {STATUSES.map((s) => (
                <option key={s} value={s}>{STATUS_LABEL[s]}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-mono text-hl-dim uppercase mb-1">Priorität</label>
            <select value={priority} onChange={(e) => setPriority(e.target.value as TicketPriority)} className={inputClass}>
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>
              ))}
            </select>
          </div>
        </div>

        <label className="text-[10px] font-mono text-hl-dim uppercase mb-1.5 mt-3 flex items-center gap-1">
          <Users className="w-3.5 h-3.5" /> Personen
        </label>
        <div className="flex flex-wrap gap-1.5">
          {team.map((m) => {
            const on = assignees.includes(m.id);
            return (
              <button key={m.id} type="button" onClick={() => toggleAssignee(m.id)} className={`px-2.5 py-1.5 rounded-lg text-xs font-sans font-semibold border transition-colors cursor-pointer ${on ? 'bg-brand-accent-light/20 border-brand-accent-light/50 text-brand-accent-light' : 'bg-white/5 border-white/10 text-hl-mute hover:text-white'}`}>
                {m.name}
              </button>
            );
          })}
          {team.length === 0 && <span className="text-xs text-hl-faint">Keine Team-Mitglieder.</span>}
        </div>

        <div className="mt-5">
          <h4 className="text-xs font-mono uppercase tracking-wider text-hl-dim mb-2 flex items-center gap-1.5">
            <MessageSquare className="w-4 h-4" /> Verlauf ({comments.length})
          </h4>
          <div className="space-y-2 max-h-44 overflow-y-auto">
            {comments.map((c) => (
              <div key={c.id} className="bg-[#060E0F]/40 border border-white/5 rounded-lg p-2.5">
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-xs font-sans font-semibold text-white">{c.authorName}</span>
                  <span className="text-[10px] font-mono text-hl-faint">{fmtTime(c.createdAt)}</span>
                </div>
                <p className="text-sm text-hl-soft font-sans whitespace-pre-wrap break-words">{c.body}</p>
              </div>
            ))}
          </div>
          <div className="flex gap-2 mt-2">
            <input value={commentBody} onChange={(e) => setCommentBody(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submitComment()} placeholder="Kommentar… (@Name erwähnt)" className={inputClass} />
            <button onClick={submitComment} disabled={busy} className="px-3 rounded-xl bg-white/5 border border-white/10 text-hl-soft hover:text-white cursor-pointer disabled:opacity-50">
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex justify-between gap-2 mt-5 pt-4 border-t border-white/5">
          {canDelete ? (
            <button onClick={remove} disabled={busy} className="px-3 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider bg-rose-500/10 border border-rose-500/30 text-rose-300 hover:bg-rose-500/20 cursor-pointer disabled:opacity-50 flex items-center gap-1.5">
              <Trash2 className="w-3.5 h-3.5" /> Löschen
            </button>
          ) : (
            <span />
          )}
          <button onClick={save} disabled={busy} className="px-5 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider bg-brand-accent-light hover:bg-brand-accent text-white cursor-pointer disabled:opacity-50">
            Speichern
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ===========================================================================
// Neue Aufgabe (mit vorgewähltem Datum)
// ===========================================================================
function NewTaskModal({
  date,
  team,
  onClose,
  onCreated,
}: {
  date: string;
  team: TeamMember[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [title, setTitle] = useState('');
  const [dueDate, setDueDate] = useState(date);
  const [status, setStatus] = useState<TaskStatus>('offen');
  const [priority, setPriority] = useState<TicketPriority>('mittel');
  const [assignees, setAssignees] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const toggle = (id: string) => setAssignees((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const create = async () => {
    if (!title.trim()) return alert('Bitte einen Titel angeben.');
    setBusy(true);
    try {
      await createTask({ title: title.trim(), dueDate: dueDate || null, status, priority, assignees });
      onCreated();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Aufgabe konnte nicht erstellt werden.');
      setBusy(false);
    }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto" onClick={onClose}>
      <motion.div initial={{ scale: 0.97 }} animate={{ scale: 1 }} className="hl-card w-full max-w-md p-5 my-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display font-black text-lg text-white uppercase tracking-tight">Neue Aufgabe</h3>
          <button onClick={onClose} className="p-1.5 text-hl-mute hover:text-white cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>
        <label className="block text-[10px] font-mono text-hl-dim uppercase mb-1">Titel *</label>
        <input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus placeholder="z.B. Video schneiden" className={inputClass} />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
          <div>
            <label className="block text-[10px] font-mono text-hl-dim uppercase mb-1">Datum</label>
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className="block text-[10px] font-mono text-hl-dim uppercase mb-1">Status</label>
            <select value={status} onChange={(e) => setStatus(e.target.value as TaskStatus)} className={inputClass}>
              {STATUSES.map((s) => (
                <option key={s} value={s}>{STATUS_LABEL[s]}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-mono text-hl-dim uppercase mb-1">Priorität</label>
            <select value={priority} onChange={(e) => setPriority(e.target.value as TicketPriority)} className={inputClass}>
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>
              ))}
            </select>
          </div>
        </div>
        <label className="text-[10px] font-mono text-hl-dim uppercase mb-1.5 mt-3 flex items-center gap-1">
          <Users className="w-3.5 h-3.5" /> Personen
        </label>
        <div className="flex flex-wrap gap-1.5">
          {team.map((m) => {
            const on = assignees.includes(m.id);
            return (
              <button key={m.id} type="button" onClick={() => toggle(m.id)} className={`px-2.5 py-1.5 rounded-lg text-xs font-sans font-semibold border transition-colors cursor-pointer ${on ? 'bg-brand-accent-light/20 border-brand-accent-light/50 text-brand-accent-light' : 'bg-white/5 border-white/10 text-hl-mute hover:text-white'}`}>
                {m.name}
              </button>
            );
          })}
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider bg-white/5 border border-white/10 text-hl-mute hover:text-white cursor-pointer">
            Abbrechen
          </button>
          <button onClick={create} disabled={busy} className="px-5 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider bg-brand-accent-light hover:bg-brand-accent text-white cursor-pointer disabled:opacity-50">
            Anlegen
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ===========================================================================
// Board
// ===========================================================================
export default function TaskBoard({ currentUserId, isSuperadmin }: { currentUserId: string; isSuperadmin: boolean }) {
  const [view, setView] = useState<'month' | 'week'>('month');
  const [anchor, setAnchor] = useState<Date>(() => new Date());
  const [tasks, setTasks] = useState<Task[]>([]);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [openTask, setOpenTask] = useState<Task | null>(null);
  const [newDate, setNewDate] = useState<string | null>(null);

  // Sichtbarer Datumsbereich je Ansicht.
  const range = useMemo(() => {
    if (view === 'month') {
      const weeks = monthWeeks(anchor);
      return { from: ymd(weeks[0][0]), to: ymd(weeks[weeks.length - 1][6]), weeks };
    }
    const mon = mondayOf(anchor);
    const days = Array.from({ length: 7 }, (_, i) => addDays(mon, i));
    return { from: ymd(days[0]), to: ymd(days[6]), weeks: [days] };
  }, [view, anchor]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [t, m] = await Promise.all([fetchTasksRange(range.from, range.to), fetchTeam().catch(() => [])]);
      setTasks(t);
      setTeam(m);
    } catch (err) {
      console.error('Aufgaben konnten nicht geladen werden', err);
    } finally {
      setLoading(false);
    }
  }, [range.from, range.to]);

  useEffect(() => {
    load();
  }, [load]);

  const tasksByDay = useMemo(() => {
    const map: Record<string, Task[]> = {};
    for (const t of tasks) {
      if (!t.dueDate) continue;
      (map[t.dueDate] ??= []).push(t);
    }
    return map;
  }, [tasks]);

  const quickSetStatus = async (t: Task, next: TaskStatus) => {
    setTasks((prev) => prev.map((x) => (x.id === t.id ? { ...x, status: next } : x)));
    try {
      await updateTask(t.id, { status: next });
    } catch {
      load();
    }
  };

  const label =
    view === 'month'
      ? `${MONTHS[anchor.getMonth()]} ${anchor.getFullYear()}`
      : `${ymd(range.weeks[0][0]).slice(8)}.–${ymd(range.weeks[0][6]).slice(8)}.${String(anchor.getMonth() + 1).padStart(2, '0')}`;

  const shift = (dir: number) => setAnchor((a) => (view === 'month' ? addMonths(a, dir) : addDays(a, dir * 7)));

  return (
    <div>
      {/* Kopfzeile: Ansicht + Navigation */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-1 bg-[#060E0F]/50 border border-white/10 rounded-xl p-1">
          {(['month', 'week'] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-3 py-1.5 rounded-lg text-xs font-sans font-bold uppercase tracking-wider transition-colors cursor-pointer flex items-center gap-1.5 ${
                view === v ? 'bg-brand-accent-light text-white' : 'text-hl-mute hover:text-white'
              }`}
            >
              {v === 'month' ? <LayoutGrid className="w-3.5 h-3.5" /> : <CalendarDays className="w-3.5 h-3.5" />}
              {v === 'month' ? 'Monat' : 'Woche'}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <button onClick={() => shift(-1)} className="p-2 rounded-lg bg-white/5 border border-white/10 text-hl-soft hover:text-white cursor-pointer">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="font-display font-bold text-white text-sm min-w-[8rem] text-center">{label}</span>
          <button onClick={() => shift(1)} className="p-2 rounded-lg bg-white/5 border border-white/10 text-hl-soft hover:text-white cursor-pointer">
            <ChevronRight className="w-4 h-4" />
          </button>
          <button onClick={() => setAnchor(new Date())} className="px-3 py-2 rounded-lg text-xs font-sans font-semibold bg-white/5 border border-white/10 text-hl-mute hover:text-white cursor-pointer">
            Heute
          </button>
        </div>

        <button onClick={() => setNewDate(TODAY)} className="px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider bg-brand-accent-light hover:bg-brand-accent text-white cursor-pointer flex items-center gap-1.5">
          <Plus className="w-4 h-4" /> Aufgabe
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-hl-mute">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      ) : view === 'month' ? (
        /* -------- MONATSANSICHT (Google-Kalender-Stil) -------- */
        <div className="overflow-x-auto">
          <div className="min-w-[720px]">
            <div className="grid grid-cols-7 mb-1">
              {WEEKDAYS.map((w) => (
                <div key={w} className="text-center text-[11px] font-mono uppercase tracking-wider text-hl-dim py-1">{w}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1.5">
              {range.weeks.flat().map((d) => {
                const key = ymd(d);
                const inMonth = d.getMonth() === anchor.getMonth();
                const isToday = key === TODAY;
                const dayTasks = tasksByDay[key] ?? [];
                return (
                  <div
                    key={key}
                    onClick={() => setNewDate(key)}
                    className={`min-h-[92px] rounded-lg border p-1.5 cursor-pointer transition-colors ${
                      inMonth ? 'bg-[#0a1110] border-white/5 hover:border-white/15' : 'bg-[#070d0c]/40 border-white/5 opacity-50'
                    }`}
                  >
                    <div className="flex justify-end">
                      <span className={`text-[11px] font-mono w-5 h-5 flex items-center justify-center rounded-full ${isToday ? 'bg-brand-accent-light text-brand-dark font-bold' : 'text-hl-dim'}`}>
                        {d.getDate()}
                      </span>
                    </div>
                    <div className="space-y-1 mt-0.5">
                      {dayTasks.slice(0, 3).map((t) => (
                        <button
                          key={t.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            setOpenTask(t);
                          }}
                          className="w-full flex items-center gap-1 text-left px-1.5 py-1 rounded-md bg-[#0f1614] hover:bg-[#131b19] transition-colors"
                        >
                          <span className={`w-2 h-2 rounded-full shrink-0 ${STATUS_DOT[t.status]}`} />
                          <span className="text-[11px] text-hl-soft truncate">{t.title}</span>
                        </button>
                      ))}
                      {dayTasks.length > 3 && <div className="text-[10px] text-hl-dim px-1.5">+{dayTasks.length - 3} mehr</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : (
        /* -------- WOCHENANSICHT -------- */
        <div className="flex gap-3 overflow-x-auto pb-2">
          {range.weeks[0].map((d) => {
            const key = ymd(d);
            const isToday = key === TODAY;
            const dayTasks = tasksByDay[key] ?? [];
            return (
              <div key={key} className="shrink-0 w-60 bg-[#060E0F]/40 border border-white/5 rounded-xl p-2.5 flex flex-col">
                <div className="flex items-baseline justify-between px-1 mb-2">
                  <span className={`font-display font-bold text-sm uppercase tracking-tight ${isToday ? 'text-brand-accent-light' : 'text-white'}`}>
                    {WEEKDAYS[(d.getDay() + 6) % 7]}
                  </span>
                  <span className="text-[10px] font-mono text-hl-dim">{key.slice(8)}.{key.slice(5, 7)}.</span>
                </div>
                <div className="space-y-2 flex-1 min-h-[2rem]">
                  {dayTasks.map((t) => (
                    <div key={t.id} onClick={() => setOpenTask(t)} className="bg-[#0a1110] border border-white/5 rounded-lg p-2.5 cursor-pointer hover:border-white/15 transition-colors">
                      <span className="block text-sm font-sans text-white leading-snug break-words">{t.title}</span>
                      <div className="flex items-center gap-1.5 mt-2 flex-wrap" onClick={(e) => e.stopPropagation()}>
                        <select
                          value={t.status}
                          onChange={(e) => quickSetStatus(t, e.target.value as TaskStatus)}
                          className={`appearance-none text-[11px] font-semibold uppercase tracking-wider px-2 py-1 rounded-md cursor-pointer focus:outline-none ${STATUS_CELL[t.status]}`}
                          title="Status ändern"
                        >
                          {STATUSES.map((s) => (
                            <option key={s} value={s} className="text-black">{STATUS_LABEL[s]}</option>
                          ))}
                        </select>
                        <span className={`text-[10px] font-semibold uppercase tracking-wider px-1.5 py-1 rounded-md ${PRIORITY_CELL[t.priority]}`}>
                          {PRIORITY_LABEL[t.priority]}
                        </span>
                      </div>
                      <div className="flex items-center justify-between mt-1.5">
                        <AssigneeChips assignees={t.assignees} size={5} />
                        {!!t.commentCount && (
                          <span className="flex items-center gap-1 text-[10px] text-hl-mute font-mono">
                            <MessageSquare className="w-3 h-3" /> {t.commentCount}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                <button onClick={() => setNewDate(key)} className="mt-2 w-full py-1.5 rounded-lg border border-dashed border-white/15 text-hl-mute hover:text-white hover:border-white/30 text-xs cursor-pointer flex items-center justify-center gap-1">
                  <Plus className="w-3.5 h-3.5" /> Aufgabe
                </button>
              </div>
            );
          })}
        </div>
      )}

      <AnimatePresence>
        {newDate && (
          <NewTaskModal date={newDate} team={team} onClose={() => setNewDate(null)} onCreated={() => { setNewDate(null); load(); }} />
        )}
        {openTask && (
          <TaskDetail task={openTask} team={team} currentUserId={currentUserId} isSuperadmin={isSuperadmin} onClose={() => setOpenTask(null)} onChanged={load} />
        )}
      </AnimatePresence>
    </div>
  );
}
