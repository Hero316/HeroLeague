import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronLeft, ChevronRight, Plus, X, Send, Trash2, Loader2, MessageSquare, Users, CalendarDays, ListChecks, Clock, Move, Check, Calendar, CheckSquare, Square } from 'lucide-react';
import type { Task, TaskComment, TaskStatus, TicketPriority, TeamMember, Match, EventArchive, TaskKind, LinkItem } from '../types';
import { fetchTasksRange, fetchAllTasks, fetchTask, createTask, updateTask, deleteTask, addTaskComment, fetchTeam, memberMap } from '../lib/collab';
import { apiFetch } from '../lib/api';
import { getUrlParam, setUrlParam } from '../lib/urlState';
import { useBackClose } from '../lib/backStack';
import Avatar from './Avatar';
import MentionTextarea from './MentionTextarea';
import LinkChips from './LinkChips';
import { useBackdropDismiss, ModalPortal, SegmentedControl, EmptyState } from './ui';

const inputClass =
  'w-full hl-surf-0 border border-white/10 rounded-xl px-3.5 py-2.5 text-[15px] text-white focus:outline-none focus:border-brand-accent-light transition-colors';

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
  leer: 'bg-slate-200 text-slate-700',
  offen: 'bg-sky-100 text-sky-700',
  in_bearbeitung: 'bg-amber-100 text-amber-800',
  erledigt: 'bg-emerald-100 text-emerald-700',
  abgebrochen: 'bg-rose-100 text-rose-700',
};
const STATUSES: TaskStatus[] = ['leer', 'offen', 'in_bearbeitung', 'erledigt', 'abgebrochen'];

const PRIORITY_LABEL: Record<TicketPriority, string> = { niedrig: 'Niedrig', mittel: 'Mittel', hoch: 'Hoch', dringend: 'Dringend' };
const PRIORITY_CELL: Record<TicketPriority, string> = {
  niedrig: 'bg-slate-200 text-slate-600',
  mittel: 'bg-sky-100 text-sky-700',
  hoch: 'bg-amber-100 text-amber-800',
  dringend: 'bg-rose-100 text-rose-700',
};
const PRIORITIES: TicketPriority[] = ['niedrig', 'mittel', 'hoch', 'dringend'];

const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
const WEEKDAYS_FULL = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];
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

// --- Zeitraum-/Uhrzeit-Helfer (Google-Kalender-Logik) -----------------------
// Enddatum einer Aufgabe (fällt auf den Starttag zurück).
function taskEnd(t: Task): string {
  return t.endDate && t.dueDate && t.endDate > t.dueDate ? t.endDate : (t.dueDate ?? '');
}
function isMultiDay(t: Task): boolean {
  return !!(t.dueDate && t.endDate && t.endDate > t.dueDate);
}
// Termin (termin|beides) landet im Kalender; Aufgabe (aufgabe|beides) in der Liste.
function isEvent(t: Task): boolean {
  return t.type !== 'aufgabe';
}
function isTodo(t: Task): boolean {
  return t.type !== 'termin';
}
const KIND_LABEL: Record<TaskKind, string> = { termin: 'Termin', aufgabe: 'Aufgabe', beides: 'Beides' };
// Deckt die Aufgabe (Start..Ende) diesen Tag ab? (Stringvergleich YYYY-MM-DD)
function coversDay(t: Task, key: string): boolean {
  if (!t.dueDate) return false;
  return t.dueDate <= key && key <= taskEnd(t);
}
function timeLabel(t: Task): string {
  if (!t.startTime) return '';
  return t.endTime ? `${t.startTime}–${t.endTime}` : t.startTime;
}
function minutesOf(hm: string): number {
  const [h, m] = hm.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}
function toHM(min: number): string {
  const m = Math.max(0, Math.min(24 * 60 - 1, Math.round(min)));
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}
function dateFromKey(key: string): Date {
  return new Date(`${key}T00:00:00`);
}
function fmtDayHeading(key: string): string {
  const d = dateFromKey(key);
  return `${['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'][d.getDay()]}, ${d.getDate()}. ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

// --- Leuchtende Kalender-Marker: Liga-Spieltage & Testspieltage -------------
type HlTone = 'liga' | 'opening' | 'final' | 'test';
type Highlight = { date: string; label: string; tone: HlTone };

function hlColor(tone: HlTone): string {
  switch (tone) {
    case 'opening':
    case 'final':
      return '#E9C46A'; // Gold
    case 'test':
      return '#F45FB0'; // Magenta/Lila (Testspiel-Welt)
    default:
      return '#22DFC9'; // Türkis (normale Liga-Spieltage)
  }
}

// Aus Liga-Spielen + Testspiel-Events die Tag→Marker-Zuordnung bauen.
function buildHighlights(matches: Match[], ev: EventArchive | null): Record<string, Highlight> {
  const map: Record<string, Highlight> = {};
  // Liga: pro Saison das früheste Datum je Spieltag; erster/letzter = Gold.
  const perSeason: Record<string, Record<number, string>> = {};
  for (const m of matches) {
    if (!m.date || m.matchday == null) continue;
    const md = (perSeason[m.seasonId] ??= {});
    if (!md[m.matchday] || m.date < md[m.matchday]) md[m.matchday] = m.date;
  }
  for (const sId of Object.keys(perSeason)) {
    const md = perSeason[sId];
    const nums = Object.keys(md).map(Number);
    const min = Math.min(...nums);
    const max = Math.max(...nums);
    for (const n of nums) {
      const tone: HlTone = n === max ? 'final' : n === min ? 'opening' : 'liga';
      const label = tone === 'final' ? 'Final Night' : tone === 'opening' ? 'Opening Night' : `Spieltag ${n}`;
      map[md[n]] = { date: md[n], label, tone };
    }
  }
  // Testspieltage (Event) mit echtem Datum – überschreiben ggf. einen Liga-Tag.
  for (const e of ev?.events ?? []) {
    if (e.date && /^\d{4}-\d{2}-\d{2}$/.test(e.date)) {
      map[e.date] = { date: e.date, label: e.title || 'Testspieltag', tone: 'test' };
    }
  }
  return map;
}

// Leuchtender Marker-Pill (für Monat/Woche).
function HighlightPill({ h, className = '' }: { h: Highlight; className?: string }) {
  const c = hlColor(h.tone);
  return (
    <div
      className={`hl-cal-glow rounded px-1 text-[10px] leading-[15px] font-sans font-bold truncate ${className}`}
      style={{ background: `${c}22`, border: `1px solid ${c}66`, color: c, boxShadow: `0 0 10px ${c}55, inset 0 0 8px ${c}22` }}
      title={h.label}
    >
      {h.label}
    </div>
  );
}

// Monats-Raster: max. sichtbare Balken-Reihen je Tag; Rest -> „+N".
const MAX_LANES = 3;
const LANE_H = 16; // Höhe einer Balken-Reihe (px)
const DAY_NUM_H = 24; // Platz für die Tageszahl oben (px)
// Tagesansicht: Höhe einer Stunde im Zeitraster (px).
const HOUR_H = 48;

// Balken-Layout für eine Woche: jedem (Teil-)Balken eine Reihe (lane) zuweisen,
// sodass sich überlappende Aufgaben stapeln. Überzählige je Spalte -> Overflow.
function weekBars(week: Date[], tasks: Task[]) {
  const weekStart = ymd(week[0]);
  const weekEnd = ymd(week[6]);
  const segs = tasks
    .filter((t) => t.dueDate && taskEnd(t) >= weekStart && t.dueDate <= weekEnd)
    .map((t) => {
      const s = t.dueDate! < weekStart ? weekStart : t.dueDate!;
      const e = taskEnd(t) > weekEnd ? weekEnd : taskEnd(t);
      return { t, colStart: week.findIndex((d) => ymd(d) === s), colEnd: week.findIndex((d) => ymd(d) === e) };
    })
    .filter((x) => x.colStart >= 0 && x.colEnd >= 0)
    // Längere/mehrtägige Balken zuerst, dann nach Start & Uhrzeit.
    .sort(
      (a, b) =>
        b.colEnd - b.colStart - (a.colEnd - a.colStart) ||
        (a.t.dueDate ?? '').localeCompare(b.t.dueDate ?? '') ||
        (a.t.startTime ?? '').localeCompare(b.t.startTime ?? '')
    );
  const laneOcc: [number, number][][] = [];
  const bars: { t: Task; colStart: number; colEnd: number; lane: number }[] = [];
  const overflowByCol = [0, 0, 0, 0, 0, 0, 0];
  for (const seg of segs) {
    let lane = 0;
    for (;;) {
      const occ = laneOcc[lane] ?? (laneOcc[lane] = []);
      const clash = occ.some(([cs, ce]) => !(seg.colEnd < cs || seg.colStart > ce));
      if (!clash) {
        occ.push([seg.colStart, seg.colEnd]);
        break;
      }
      lane++;
    }
    if (lane < MAX_LANES) bars.push({ t: seg.t, colStart: seg.colStart, colEnd: seg.colEnd, lane });
    else for (let c = seg.colStart; c <= seg.colEnd; c++) overflowByCol[c]++;
  }
  return { bars, overflowByCol };
}

// Zeit-Aufgaben eines Tages in Spalten legen (überlappende nebeneinander).
function layoutTimed(items: Task[]): { t: Task; col: number; cols: number; top: number; height: number }[] {
  const startMin = (t: Task) => minutesOf(t.startTime!);
  const endMin = (t: Task) => (t.endTime ? Math.max(minutesOf(t.endTime), startMin(t) + 30) : startMin(t) + 60);
  const sorted = [...items].sort((a, b) => startMin(a) - startMin(b) || endMin(a) - endMin(b));
  const out: { t: Task; col: number; cols: number; top: number; height: number }[] = [];
  let cluster: Task[] = [];
  let clusterEnd = -1;
  const flush = () => {
    const colEnds: number[] = [];
    const cols: number[] = [];
    cluster.forEach((it) => {
      let c = 0;
      while (c < colEnds.length && colEnds[c] > startMin(it)) c++;
      colEnds[c] = endMin(it);
      cols.push(c);
    });
    const total = colEnds.length || 1;
    cluster.forEach((it, i) => {
      const top = (startMin(it) / 60) * HOUR_H;
      const height = Math.max(22, ((endMin(it) - startMin(it)) / 60) * HOUR_H - 2);
      out.push({ t: it, col: cols[i], cols: total, top, height });
    });
    cluster = [];
  };
  for (const it of sorted) {
    if (cluster.length && startMin(it) >= clusterEnd) flush();
    cluster.push(it);
    clusterEnd = Math.max(clusterEnd, endMin(it));
  }
  if (cluster.length) flush();
  return out;
}

function AssigneeChips({
  assignees,
  urlFor,
  px = 24,
}: {
  assignees: { userId: string; userName: string }[];
  urlFor?: (id: string) => string | undefined;
  px?: number;
}) {
  if (assignees.length === 0) return null;
  return (
    <div className="flex -space-x-1.5">
      {assignees.slice(0, 4).map((a) => (
        <span key={a.userId} title={a.userName} className="inline-flex hl-avatar-ring">
          <Avatar name={a.userName} url={urlFor?.(a.userId)} size={px} />
        </span>
      ))}
      {assignees.length > 4 && (
        <span
          className="hl-avatar-ring bg-white/10 border border-white/20 font-bold text-hl-soft flex items-center justify-center"
          style={{ width: px, height: px, fontSize: Math.round(px * 0.4) }}
        >
          +{assignees.length - 4}
        </span>
      )}
    </div>
  );
}

// Termin-Eingaben (Google-Stil): Ganztägig-Schalter, Tag von/bis, Uhrzeit von/bis.
// Bei „Aufgabe" heißt der Starttag „Frist" und das Bis-Datum entfällt.
function ScheduleFields({
  kind,
  dueDate,
  endDate,
  allDay,
  startTime,
  endTime,
  onDue,
  onEnd,
  onAllDay,
  onStart,
  onEndTime,
}: {
  kind: TaskKind;
  dueDate: string;
  endDate: string;
  allDay: boolean;
  startTime: string;
  endTime: string;
  onDue: (v: string) => void;
  onEnd: (v: string) => void;
  onAllDay: (v: boolean) => void;
  onStart: (v: string) => void;
  onEndTime: (v: string) => void;
}) {
  const pureTask = kind === 'aufgabe';
  return (
    <div className="mt-3 rounded-xl border border-white/10 hl-surf-soft p-3 space-y-3">
      <label className="flex items-center gap-2 cursor-pointer select-none">
        <button
          type="button"
          onClick={() => onAllDay(!allDay)}
          className={`relative w-10 h-[22px] rounded-full transition-colors shrink-0 ${allDay ? 'bg-brand-accent-light' : 'bg-white/15'}`}
        >
          <span className={`absolute top-[3px] w-4 h-4 rounded-full bg-white shadow transition-all ${allDay ? 'left-[21px]' : 'left-[3px]'}`} />
        </button>
        <span className="text-sm font-sans text-hl-soft">{pureTask ? 'Ohne Uhrzeit' : 'Ganztägig'}</span>
      </label>
      <div className={`grid ${pureTask ? 'grid-cols-1' : 'grid-cols-2'} gap-3`}>
        <div>
          <label className="block text-[10px] font-mono text-hl-dim uppercase mb-1">{pureTask ? 'Frist (Datum)' : 'Tag von'}</label>
          <input type="date" value={dueDate} onChange={(e) => onDue(e.target.value)} className={inputClass} />
        </div>
        {!pureTask && (
          <div>
            <label className="block text-[10px] font-mono text-hl-dim uppercase mb-1">Tag bis</label>
            <input type="date" value={endDate} min={dueDate || undefined} onChange={(e) => onEnd(e.target.value)} className={inputClass} />
          </div>
        )}
      </div>
      {!allDay && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[10px] font-mono text-hl-dim uppercase mb-1">Uhrzeit von</label>
            <input type="time" value={startTime} onChange={(e) => onStart(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className="block text-[10px] font-mono text-hl-dim uppercase mb-1">Uhrzeit bis</label>
            <input type="time" value={endTime} onChange={(e) => onEndTime(e.target.value)} className={inputClass} />
          </div>
        </div>
      )}
    </div>
  );
}

// ===========================================================================
// Detail / Bearbeiten
// ===========================================================================
export function TaskDetail({
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
  const [type, setType] = useState<TaskKind>(task.type ?? 'termin');
  const [status, setStatus] = useState<TaskStatus>(task.status);
  const [priority, setPriority] = useState<TicketPriority>(task.priority);
  const [dueDate, setDueDate] = useState<string>(task.dueDate ?? '');
  const [endDate, setEndDate] = useState<string>(task.endDate ?? '');
  const [allDay, setAllDay] = useState<boolean>(!task.startTime);
  const [startTime, setStartTime] = useState<string>(task.startTime ?? '');
  const [endTime, setEndTime] = useState<string>(task.endTime ?? '');
  const [assignees, setAssignees] = useState<string[]>(task.assignees.map((a) => a.userId));
  const [comments, setComments] = useState<TaskComment[]>(task.comments ?? []);
  const [commentBody, setCommentBody] = useState('');
  const [links, setLinks] = useState<LinkItem[]>(task.links ?? []);
  const [busy, setBusy] = useState(false);
  const canDelete = isSuperadmin || task.createdBy === currentUserId;
  const backdrop = useBackdropDismiss(onClose);

  // Link-Tasten sofort speichern (unabhängig vom „Speichern"-Knopf).
  const saveLinks = async (next: LinkItem[]) => {
    setLinks(next);
    try {
      await updateTask(task.id, { links: next });
      onChanged();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Link konnte nicht gespeichert werden.');
    }
  };

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
      // Steht im Kommentarfeld noch Text, diesen NICHT verwerfen, sondern
      // mitspeichern – sonst geht der Kommentar beim „Speichern" verloren.
      const pending = commentBody.trim();
      if (pending) {
        await addTaskComment(task.id, pending);
        setCommentBody('');
      }
      await updateTask(task.id, {
        title: title.trim(),
        notes,
        type,
        status,
        priority,
        dueDate: dueDate || null,
        endDate: type !== 'aufgabe' && endDate && dueDate && endDate > dueDate ? endDate : null,
        startTime: allDay ? null : startTime || null,
        endTime: allDay ? null : endTime || null,
        assignees,
      });
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
    <ModalPortal>
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[70] bg-black/80 flex items-start sm:items-center justify-center p-0 pt-[env(safe-area-inset-top)] sm:p-6 overflow-y-auto" {...backdrop}>
      <motion.div initial={{ scale: 0.97, y: 10 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.97, y: 10 }} className="hl-card hl-modal-card w-full max-w-xl my-0 sm:my-8 p-5 sm:p-6 rounded-3xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-display font-black text-xl text-white uppercase tracking-tight">
            {type === 'aufgabe' ? 'Aufgabe' : type === 'beides' ? 'Eintrag' : 'Termin'}
          </h3>
          <button onClick={onClose} className="p-2 -mr-1 rounded-full text-hl-mute hover:text-white hover:bg-white/5 transition-colors cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          <SegmentedControl
            groupId="taskdetailtype"
            fill
            value={type}
            onChange={(v) => setType(v)}
            options={[
              { value: 'termin' as const, label: 'Termin', icon: Calendar },
              { value: 'aufgabe' as const, label: 'Aufgabe', icon: CheckSquare },
              { value: 'beides' as const, label: 'Beides', icon: Check },
            ]}
          />

          <div>
            <label className="block text-[11px] font-mono text-hl-dim uppercase tracking-wider mb-1.5">Titel</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} />
          </div>

          <div>
            <label className="block text-[11px] font-mono text-hl-dim uppercase tracking-wider mb-1.5">Notizen</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={`${inputClass} resize-y`} />
          </div>

          <ScheduleFields
            kind={type}
            dueDate={dueDate}
            endDate={endDate}
            allDay={allDay}
            startTime={startTime}
            endTime={endTime}
            onDue={setDueDate}
            onEnd={setEndDate}
            onAllDay={setAllDay}
            onStart={setStartTime}
            onEndTime={setEndTime}
          />

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-mono text-hl-dim uppercase tracking-wider mb-1.5">Status</label>
              <select value={status} onChange={(e) => setStatus(e.target.value as TaskStatus)} className={inputClass}>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>{STATUS_LABEL[s]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-mono text-hl-dim uppercase tracking-wider mb-1.5">Priorität</label>
              <select value={priority} onChange={(e) => setPriority(e.target.value as TicketPriority)} className={inputClass}>
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="text-[11px] font-mono text-hl-dim uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5" /> Personen
            </label>
            <div className="flex flex-wrap gap-2">
              {team.map((m) => {
                const on = assignees.includes(m.id);
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => toggleAssignee(m.id)}
                    className={`flex items-center gap-1.5 pl-1 pr-3 py-1 rounded-full border text-[13px] font-sans font-semibold transition-all active:scale-95 cursor-pointer ${
                      on ? 'bg-brand-accent-light/20 border-brand-accent-light/50 text-brand-accent-light' : 'bg-white/5 border-white/10 text-hl-mute hover:text-white'
                    }`}
                  >
                    <Avatar name={m.name} url={m.avatarUrl} size={22} />
                    {m.name}
                  </button>
                );
              })}
              {team.length === 0 && <span className="text-xs text-hl-faint">Keine Team-Mitglieder.</span>}
            </div>
          </div>
        </div>

        <div className="mt-5">
          <h4 className="text-xs font-mono uppercase tracking-wider text-hl-dim mb-2">Links</h4>
          <LinkChips links={links} onChange={saveLinks} />
        </div>

        <div className="mt-5">
          <h4 className="text-xs font-mono uppercase tracking-wider text-hl-dim mb-2 flex items-center gap-1.5">
            <MessageSquare className="w-4 h-4" /> Verlauf ({comments.length})
          </h4>
          <div className="space-y-2 max-h-44 overflow-y-auto">
            {comments.map((c) => (
              <div key={c.id} className="hl-surf-soft border border-white/5 rounded-lg p-2.5">
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-xs font-sans font-semibold text-white">{c.authorName}</span>
                  <span className="text-[10px] font-mono text-hl-faint">{fmtTime(c.createdAt)}</span>
                </div>
                <p className="text-sm text-hl-soft font-sans whitespace-pre-wrap break-words">{c.body}</p>
              </div>
            ))}
          </div>
          <div className="flex gap-2 mt-2 items-start">
            <div className="flex-1">
              <MentionTextarea
                value={commentBody}
                onChange={setCommentBody}
                onEnter={submitComment}
                mentionable={team.map((m) => ({ id: m.id, name: m.name }))}
                placeholder="Kommentar…"
                rows={1}
                className={inputClass}
              />
            </div>
            <button onClick={submitComment} disabled={busy} className="px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-hl-soft hover:text-white cursor-pointer disabled:opacity-50">
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex justify-between gap-2.5 mt-5 pt-4 border-t border-white/5">
          {canDelete ? (
            <button onClick={remove} disabled={busy} className="px-4 py-3 rounded-2xl text-xs font-bold uppercase tracking-wider bg-rose-500/10 border border-rose-500/30 text-rose-300 hover:bg-rose-500/20 transition-all active:scale-[.98] cursor-pointer disabled:opacity-50 flex items-center gap-1.5">
              <Trash2 className="w-3.5 h-3.5" /> Löschen
            </button>
          ) : (
            <span />
          )}
          <button onClick={save} disabled={busy} className="flex-[1.5] max-w-[60%] py-3 rounded-2xl text-xs font-bold uppercase tracking-wider bg-brand-accent-light hover:bg-brand-accent text-white transition-all active:scale-[.98] cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Speichern
          </button>
        </div>
      </motion.div>
    </motion.div>
    </ModalPortal>
  );
}

// ===========================================================================
// Neue Aufgabe (mit vorgewähltem Datum)
// ===========================================================================
function NewTaskModal({
  prefill,
  team,
  onClose,
  onCreated,
}: {
  prefill: { date: string; startTime?: string; type?: TaskKind };
  team: TeamMember[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [title, setTitle] = useState('');
  const [type, setType] = useState<TaskKind>(prefill.type ?? 'termin');
  const [dueDate, setDueDate] = useState(prefill.date);
  const [endDate, setEndDate] = useState('');
  const [allDay, setAllDay] = useState(!prefill.startTime);
  const [startTime, setStartTime] = useState(prefill.startTime ?? '');
  const [endTime, setEndTime] = useState('');
  const [status, setStatus] = useState<TaskStatus>('offen');
  const [priority, setPriority] = useState<TicketPriority>('mittel');
  const [assignees, setAssignees] = useState<string[]>([]);
  const [links, setLinks] = useState<LinkItem[]>([]);
  const [busy, setBusy] = useState(false);
  const toggle = (id: string) => setAssignees((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const backdrop = useBackdropDismiss(onClose);

  const create = async () => {
    if (!title.trim()) return alert('Bitte einen Titel angeben.');
    setBusy(true);
    try {
      await createTask({
        title: title.trim(),
        type,
        dueDate: dueDate || null,
        endDate: type !== 'aufgabe' && endDate && dueDate && endDate > dueDate ? endDate : null,
        startTime: allDay ? null : startTime || null,
        endTime: allDay ? null : endTime || null,
        status,
        priority,
        assignees,
        links,
      });
      onCreated();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Aufgabe konnte nicht erstellt werden.');
      setBusy(false);
    }
  };

  return (
    <ModalPortal>
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[60] bg-black/80 flex items-center justify-center p-4 overflow-y-auto" {...backdrop}>
      <motion.div initial={{ scale: 0.97, y: 8 }} animate={{ scale: 1, y: 0 }} className="hl-card hl-modal-card w-full max-w-md p-5 sm:p-6 rounded-3xl my-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-display font-black text-xl text-white uppercase tracking-tight">
            {type === 'aufgabe' ? 'Neue Aufgabe' : type === 'beides' ? 'Neuer Eintrag' : 'Neuer Termin'}
          </h3>
          <button onClick={onClose} className="p-2 -mr-1 rounded-full text-hl-mute hover:text-white hover:bg-white/5 cursor-pointer transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          <SegmentedControl
            groupId="newtasktype"
            fill
            value={type}
            onChange={(v) => setType(v)}
            options={[
              { value: 'termin' as const, label: 'Termin', icon: Calendar },
              { value: 'aufgabe' as const, label: 'Aufgabe', icon: CheckSquare },
              { value: 'beides' as const, label: 'Beides', icon: Check },
            ]}
          />

          <div>
            <label className="block text-[11px] font-mono text-hl-dim uppercase tracking-wider mb-1.5">Titel</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus placeholder={type === 'aufgabe' ? 'z.B. Video schneiden' : 'z.B. DVAG Treff'} className={inputClass} />
          </div>

          <ScheduleFields
            kind={type}
            dueDate={dueDate}
            endDate={endDate}
            allDay={allDay}
            startTime={startTime}
            endTime={endTime}
            onDue={setDueDate}
            onEnd={setEndDate}
            onAllDay={setAllDay}
            onStart={setStartTime}
            onEndTime={setEndTime}
          />

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-mono text-hl-dim uppercase tracking-wider mb-1.5">Status</label>
              <select value={status} onChange={(e) => setStatus(e.target.value as TaskStatus)} className={inputClass}>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>{STATUS_LABEL[s]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-mono text-hl-dim uppercase tracking-wider mb-1.5">Priorität</label>
              <select value={priority} onChange={(e) => setPriority(e.target.value as TicketPriority)} className={inputClass}>
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="text-[11px] font-mono text-hl-dim uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5" /> Personen
            </label>
            <div className="flex flex-wrap gap-2">
              {team.map((m) => {
                const on = assignees.includes(m.id);
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => toggle(m.id)}
                    className={`flex items-center gap-1.5 pl-1 pr-3 py-1 rounded-full border text-[13px] font-sans font-semibold transition-all active:scale-95 cursor-pointer ${
                      on ? 'bg-brand-accent-light/20 border-brand-accent-light/50 text-brand-accent-light' : 'bg-white/5 border-white/10 text-hl-mute hover:text-white'
                    }`}
                  >
                    <Avatar name={m.name} url={m.avatarUrl} size={22} />
                    {m.name}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-mono text-hl-dim uppercase tracking-wider mb-2">Links (z.B. Google-Drive-Ordner)</label>
            <LinkChips links={links} onChange={setLinks} />
          </div>
        </div>

        <div className="flex gap-2.5 mt-6">
          <button onClick={onClose} className="flex-1 py-3 rounded-2xl text-xs font-bold uppercase tracking-wider bg-white/5 border border-white/10 text-hl-mute hover:text-white cursor-pointer transition-colors active:scale-[.98]">
            Abbrechen
          </button>
          <button onClick={create} disabled={busy} className="flex-[1.5] py-3 rounded-2xl text-xs font-bold uppercase tracking-wider bg-brand-accent-light hover:bg-brand-accent text-white cursor-pointer disabled:opacity-50 transition-all active:scale-[.98] flex items-center justify-center gap-2">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Anlegen
          </button>
        </div>
      </motion.div>
    </motion.div>
    </ModalPortal>
  );
}

// ===========================================================================
// Tagesansicht (Google-Stil): Ganztägig oben + Stunden-Zeitraster
// ===========================================================================
function DayView({
  dayKey,
  tasks,
  highlight,
  fullHeight = false,
  onOpenTask,
  onAddAt,
  onMoveTask,
}: {
  dayKey: string;
  tasks: Task[];
  highlight?: Highlight;
  fullHeight?: boolean;
  onOpenTask: (t: Task) => void;
  onAddAt: (startTime: string) => void;
  onMoveTask: (t: Task, startTime: string, endTime: string | null) => void;
}) {
  const covering = tasks.filter((t) => coversDay(t, dayKey));
  const allDay = covering.filter((t) => !t.startTime || isMultiDay(t));
  const timed = covering.filter((t) => t.startTime && !isMultiDay(t));
  const laid = useMemo(() => layoutTimed(timed), [timed]);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Verschieben/Größe ändern nur nach Aktivieren (Bearbeiten-Taste), damit man
  // beim Scrollen nichts aus Versehen verschiebt. 15-Minuten-Raster.
  const SNAP = 15;
  const [editId, setEditId] = useState<string | null>(null);
  const [drag, setDrag] = useState<{ id: string; mode: 'move' | 'top' | 'bottom'; startY: number; startMin: number; endMin: number; deltaMin: number } | null>(null);

  const effEnd = (t: Task) => (t.endTime ? Math.max(minutesOf(t.endTime), minutesOf(t.startTime!) + SNAP) : minutesOf(t.startTime!) + 60);

  const onHandleDown = (e: React.PointerEvent, t: Task, mode: 'move' | 'top' | 'bottom') => {
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    setDrag({ id: t.id, mode, startY: e.clientY, startMin: minutesOf(t.startTime!), endMin: effEnd(t), deltaMin: 0 });
  };
  const onHandleMove = (e: React.PointerEvent) => {
    if (!drag) return;
    setDrag((d) => (d ? { ...d, deltaMin: ((e.clientY - d.startY) / HOUR_H) * 60 } : d));
  };
  const onHandleUp = (e: React.PointerEvent, t: Task) => {
    (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
    const d = drag;
    setDrag(null);
    if (!d) return;
    const snap = (m: number) => Math.round(m / SNAP) * SNAP;
    const dur = d.endMin - d.startMin;
    if (d.mode === 'move') {
      const start = Math.max(0, Math.min(24 * 60 - dur, snap(d.startMin + d.deltaMin)));
      if (start !== d.startMin) onMoveTask(t, toHM(start), t.endTime ? toHM(start + dur) : null);
    } else if (d.mode === 'bottom') {
      const end = Math.max(d.startMin + SNAP, Math.min(24 * 60, snap(d.endMin + d.deltaMin)));
      if (end !== d.endMin) onMoveTask(t, t.startTime!, toHM(end));
    } else {
      const start = Math.max(0, Math.min(d.endMin - SNAP, snap(d.startMin + d.deltaMin)));
      if (start !== d.startMin) onMoveTask(t, toHM(start), toHM(d.endMin));
    }
  };

  // Beim Öffnen etwa zum Morgen (7 Uhr) scrollen; Bearbeiten-Modus zurücksetzen.
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 7 * HOUR_H;
    setEditId(null);
  }, [dayKey]);

  const onBgClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const hour = Math.max(0, Math.min(23, Math.floor((e.clientY - rect.top) / HOUR_H)));
    onAddAt(`${String(hour).padStart(2, '0')}:00`);
  };

  return (
    <div className={`rounded-2xl border border-white/5 overflow-hidden hl-surf shadow-sm ${fullHeight ? 'h-full flex flex-col' : ''}`}>
      {/* Leuchtender Spieltag-/Testspieltag-Marker */}
      {highlight && (
        <div className="p-2 border-b border-white/5 shrink-0">
          <div
            className="hl-cal-glow rounded-lg px-3 py-2 text-center font-display font-black uppercase tracking-tight"
            style={{
              background: `${hlColor(highlight.tone)}1f`,
              border: `1px solid ${hlColor(highlight.tone)}66`,
              color: hlColor(highlight.tone),
              boxShadow: `0 0 16px ${hlColor(highlight.tone)}55, inset 0 0 12px ${hlColor(highlight.tone)}22`,
            }}
          >
            {highlight.label}
          </div>
        </div>
      )}
      {/* Ganztägig / mehrtägig */}
      <div className="border-b border-white/5 p-2 shrink-0">
        <div className="text-[10px] font-mono uppercase tracking-wider text-hl-dim mb-1 px-1">Ganztägig</div>
        {allDay.length === 0 ? (
          <div className="text-[11px] text-hl-faint px-1 py-0.5">—</div>
        ) : (
          <div className="space-y-1">
            {allDay.map((t) => (
              <button key={t.id} onClick={() => onOpenTask(t)} className={`w-full text-left truncate rounded px-2 py-1 text-[12px] ${STATUS_CELL[t.status]}`}>
                {isMultiDay(t) && <span className="opacity-80 mr-1">{t.dueDate?.slice(8)}.–{taskEnd(t).slice(8)}.</span>}
                {t.title}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Stunden-Zeitraster */}
      <div ref={scrollRef} className={fullHeight ? 'flex-1 min-h-0 overflow-y-auto' : 'overflow-y-auto'} style={fullHeight ? undefined : { maxHeight: '60vh' }}>
        <div className="relative" style={{ height: 24 * HOUR_H }} onClick={onBgClick}>
          {Array.from({ length: 24 }, (_, h) => (
            <div key={h} className="absolute left-0 right-0 border-t border-white/5" style={{ top: h * HOUR_H, height: HOUR_H }}>
              <span className="absolute -top-2 left-1 text-[10px] font-mono text-hl-dim hl-surf pr-1">{String(h).padStart(2, '0')}:00</span>
            </div>
          ))}
          {/* Aufgaben mit Uhrzeit. Standard: tippen öffnet Detail, Scrollen geht.
              Erst nach Tippen auf die Bearbeiten-Taste (Move-Symbol) lässt sich
              die Aufgabe verschieben und oben/unten länger/kürzer ziehen. */}
          <div className="absolute left-12 right-1 top-0 bottom-0">
            {laid.map(({ t, col, cols, top, height }) => {
              const editing = editId === t.id;
              const active = drag?.id === t.id;
              const px = (min: number) => (min / 60) * HOUR_H;
              const dMin = active && drag ? drag.deltaMin : 0;
              let dispTop = top;
              let dispHeight = height;
              if (active && drag) {
                if (drag.mode === 'move') dispTop = top + px(dMin);
                else if (drag.mode === 'bottom') dispHeight = Math.max(16, height + px(dMin));
                else {
                  dispTop = top + px(dMin);
                  dispHeight = Math.max(16, height - px(dMin));
                }
              }
              const snap = (m: number) => Math.round(m / SNAP) * SNAP;
              const label =
                active && drag
                  ? drag.mode === 'bottom'
                    ? `${t.startTime}–${toHM(Math.max(drag.startMin + SNAP, snap(drag.endMin + dMin)))}`
                    : drag.mode === 'top'
                      ? `${toHM(Math.min(drag.endMin - SNAP, snap(drag.startMin + dMin)))}–${toHM(drag.endMin)}`
                      : (() => {
                          const s = snap(drag.startMin + dMin);
                          return `${toHM(s)}${t.endTime ? '–' + toHM(s + (drag.endMin - drag.startMin)) : ''}`;
                        })()
                  : timeLabel(t);
              return (
                <div
                  key={t.id}
                  onClick={(e) => e.stopPropagation()}
                  style={{ top: dispTop, height: dispHeight, left: `${(col / cols) * 100}%`, width: `calc(${(1 / cols) * 100}% - 4px)` }}
                  className={`absolute rounded-md overflow-hidden shadow-sm shadow-black/30 select-none ${active || editing ? 'ring-2 ring-white/70 z-10' : ''} ${STATUS_CELL[t.status]}`}
                >
                  {editing ? (
                    <>
                      <div
                        onPointerDown={(e) => onHandleDown(e, t, 'top')}
                        onPointerMove={onHandleMove}
                        onPointerUp={(e) => onHandleUp(e, t)}
                        style={{ touchAction: 'none' }}
                        className="absolute top-0 inset-x-0 h-2.5 bg-white/25 cursor-ns-resize"
                        title="Startzeit ziehen"
                      />
                      <div
                        onPointerDown={(e) => onHandleDown(e, t, 'move')}
                        onPointerMove={onHandleMove}
                        onPointerUp={(e) => onHandleUp(e, t)}
                        style={{ touchAction: 'none' }}
                        className="h-full px-1.5 py-2 cursor-move"
                      >
                        <div className="text-[11px] font-semibold leading-tight truncate pr-5">{t.title}</div>
                        <div className="text-[9px] opacity-90 leading-tight truncate">{label}</div>
                      </div>
                      <div
                        onPointerDown={(e) => onHandleDown(e, t, 'bottom')}
                        onPointerMove={onHandleMove}
                        onPointerUp={(e) => onHandleUp(e, t)}
                        style={{ touchAction: 'none' }}
                        className="absolute bottom-0 inset-x-0 h-2.5 bg-white/25 cursor-ns-resize"
                        title="Endzeit ziehen"
                      />
                      <button
                        onClick={(e) => { e.stopPropagation(); setEditId(null); }}
                        title="Fertig"
                        className="absolute top-0.5 right-0.5 w-5 h-5 rounded-md bg-white text-emerald-700 flex items-center justify-center shadow cursor-pointer"
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                    </>
                  ) : (
                    <button onClick={() => onOpenTask(t)} className="w-full h-full text-left px-1.5 py-0.5">
                      <div className="text-[11px] font-semibold leading-tight truncate pr-5">{t.title}</div>
                      <div className="text-[9px] opacity-80 leading-tight truncate">{label}</div>
                      <span
                        role="button"
                        tabIndex={0}
                        onClick={(e) => { e.stopPropagation(); setEditId(t.id); }}
                        onPointerDown={(e) => e.stopPropagation()}
                        title="Verschieben / Länge ändern"
                        className="absolute top-0.5 right-0.5 w-5 h-5 rounded-md bg-black/30 hover:bg-black/50 text-white flex items-center justify-center cursor-pointer"
                      >
                        <Move className="w-3 h-3" />
                      </span>
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ===========================================================================
// Board
// ===========================================================================
export default function TaskBoard({ currentUserId, isSuperadmin, persist = false, mode = 'all' }: { currentUserId: string; isSuperadmin: boolean; persist?: boolean; mode?: 'calendar' | 'tasks' | 'all' }) {
  // mode='calendar' → nur Kalender (Monat/Woche/Tag/Termine); mode='tasks' → nur
  // die Aufgabenliste; mode='all' → alles (Backoffice, unverändert).
  const calendarViews = mode === 'calendar' ? (['month', 'week', 'day', 'termine'] as const) : (['month', 'week', 'day', 'termine', 'aufgaben'] as const);
  // Ansicht + Datum aus der URL wiederherstellen (nur in der Team-App), damit
  // man nach dem Aktualisieren dort bleibt (Tag/Woche/Monat + Datum).
  const [view, setView] = useState<'month' | 'week' | 'day' | 'termine' | 'aufgaben'>(() => {
    if (mode === 'tasks') return 'aufgaben';
    const v = persist ? getUrlParam('av') : null;
    return v && (calendarViews as readonly string[]).includes(v) ? (v as 'week' | 'day' | 'termine' | 'aufgaben') : 'month';
  });
  const [anchor, setAnchor] = useState<Date>(() => {
    const d = persist ? getUrlParam('ad') : null;
    return d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? dateFromKey(d) : new Date();
  });
  // Aufgaben-Tab: Liste (alles) oder Wochenansicht (wie Kalender, aber Aufgaben).
  const [taskView, setTaskView] = useState<'list' | 'week'>('list');
  useEffect(() => {
    // In der reinen Aufgabenliste keine Ansicht persistieren (teilt sich ?av mit
    // dem Kalender-Tab).
    if (persist && mode !== 'tasks') setUrlParam('av', view === 'month' ? null : view);
  }, [view, persist, mode]);
  useEffect(() => {
    if (persist) setUrlParam('ad', ymd(anchor) === TODAY ? null : ymd(anchor));
  }, [anchor, persist]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [openTask, setOpenTask] = useState<Task | null>(null);
  const [newTask, setNewTask] = useState<{ date: string; startTime?: string; type?: TaskKind } | null>(null);
  // Handy-Zurück-Geste schließt das offene Detail-/Neu-Fenster, statt die App
  // zu verlassen.
  useBackClose(openTask !== null, () => setOpenTask(null));
  useBackClose(newTask !== null, () => setNewTask(null));
  // Leuchtende Marker: Liga-Spieltage & Testspieltage (einmal laden).
  const [hl, setHl] = useState<Record<string, Highlight>>({});
  useEffect(() => {
    Promise.all([
      apiFetch<Match[]>('/api/matches').catch(() => [] as Match[]),
      apiFetch<EventArchive>('/api/twitch?resource=event').catch(() => null),
    ]).then(([ms, ev]) => setHl(buildHighlights(ms ?? [], ev)));
  }, []);

  // Einen Tag öffnen (aus der Monatsansicht heraus).
  const openDay = (key: string) => {
    setAnchor(dateFromKey(key));
    setView('day');
  };

  // Sichtbarer Datumsbereich je Ansicht.
  const range = useMemo(() => {
    if (view === 'month') {
      const weeks = monthWeeks(anchor);
      return { from: ymd(weeks[0][0]), to: ymd(weeks[weeks.length - 1][6]), weeks };
    }
    if (view === 'day') {
      const key = ymd(anchor);
      return { from: key, to: key, weeks: [[anchor]] };
    }
    const mon = mondayOf(anchor);
    const days = Array.from({ length: 7 }, (_, i) => addDays(mon, i));
    return { from: ymd(days[0]), to: ymd(days[6]), weeks: [days] };
  }, [view, anchor]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Die Listen (Termine/Aufgaben) brauchen ALLE Einträge, der Kalender nur den Bereich.
      const [t, m] = await Promise.all([
        view === 'termine' || view === 'aufgaben' ? fetchAllTasks() : fetchTasksRange(range.from, range.to),
        fetchTeam().catch(() => []),
      ]);
      setTasks(t);
      setTeam(m);
    } catch (err) {
      console.error('Aufgaben konnten nicht geladen werden', err);
    } finally {
      setLoading(false);
    }
  }, [view, range.from, range.to]);

  useEffect(() => {
    load();
  }, [load]);

  const members = useMemo(() => memberMap(team), [team]);
  // Für den Kalender nur Termine (termin|beides).
  const eventTasks = useMemo(() => tasks.filter(isEvent), [tasks]);
  const tasksByDay = useMemo(() => {
    const map: Record<string, Task[]> = {};
    for (const t of eventTasks) {
      if (!t.dueDate) continue;
      (map[t.dueDate] ??= []).push(t);
    }
    return map;
  }, [eventTasks]);

  const involvesMe = (t: Task) => t.assignees.some((a) => a.userId === currentUserId) || t.createdBy === currentUserId;

  // „Meine Termine": kommende zuerst, nach Datum + Uhrzeit.
  const myEvents = useMemo(
    () =>
      tasks
        .filter((t) => isEvent(t) && involvesMe(t))
        .slice()
        .sort((a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999') || (a.startTime ?? '').localeCompare(b.startTime ?? '')),
    [tasks, currentUserId] // eslint-disable-line react-hooks/exhaustive-deps
  );

  // „Meine Aufgaben": To-dos mit Frist, gruppiert (überfällig/heute/…); erledigte unten.
  const myTodos = useMemo(
    () =>
      tasks
        .filter((t) => isTodo(t) && involvesMe(t))
        .slice()
        .sort((a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999') || (a.startTime ?? '').localeCompare(b.startTime ?? '')),
    [tasks, currentUserId] // eslint-disable-line react-hooks/exhaustive-deps
  );
  // Meine To-dos nach Frist-Tag (für die Aufgaben-Wochenansicht).
  const myTodosByDay = useMemo(() => {
    const map: Record<string, Task[]> = {};
    for (const t of myTodos) {
      if (!t.dueDate) continue;
      (map[t.dueDate] ??= []).push(t);
    }
    return map;
  }, [myTodos]);

  const quickSetStatus = async (t: Task, next: TaskStatus) => {
    setTasks((prev) => prev.map((x) => (x.id === t.id ? { ...x, status: next } : x)));
    try {
      await updateTask(t.id, { status: next });
    } catch (err) {
      // Nicht still zurückrollen – sonst denkt man, es sei gespeichert.
      alert(err instanceof Error ? err.message : 'Konnte nicht gespeichert werden.');
      load();
    }
  };

  // Schritt 2: Aufgabe im Tages-Zeitraster verschieben (neue Uhrzeit).
  const moveTask = async (t: Task, startTime: string, endTime: string | null) => {
    setTasks((prev) => prev.map((x) => (x.id === t.id ? { ...x, startTime, endTime } : x)));
    try {
      await updateTask(t.id, { startTime, endTime });
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Konnte nicht gespeichert werden.');
      load();
    }
  };

  const label =
    view === 'month'
      ? `${MONTHS[anchor.getMonth()]} ${anchor.getFullYear()}`
      : view === 'day'
        ? fmtDayHeading(ymd(anchor))
        : `${ymd(range.weeks[0][0]).slice(8)}.–${ymd(range.weeks[0][6]).slice(8)}.${String(anchor.getMonth() + 1).padStart(2, '0')}`;

  const shift = (dir: number) =>
    setAnchor((a) => (view === 'month' ? addMonths(a, dir) : view === 'day' ? addDays(a, dir) : addDays(a, dir * 7)));

  // Diese Ansichten füllen die volle Höhe und scrollen INTERN – so gibt es keinen
  // großen äußeren Scrollbalken (der beim Umschalten unschön aufpoppt). Kalender:
  // Monat, Woche und Tag. Aufgaben: Woche. Alles andere (Agenda-Listen) fließt.
  const fullHeightView =
    (mode === 'tasks' && taskView === 'week') ||
    (mode !== 'tasks' && (view === 'month' || view === 'week' || view === 'day'));

  return (
    <div
      className={
        persist
          ? fullHeightView
            ? 'flex flex-col h-full md:block md:h-auto'
            : 'flex flex-col min-h-full md:block md:min-h-0'
          : ''
      }
    >
      {/* Kopfzeile: Ansicht + Navigation. Im Handy-App-Modus (persist) sitzt sie
          unten – mit dem Daumen erreichbar; ab md wieder oben. */}
      <div
        className={`flex flex-col gap-2 ${
          persist
            ? 'order-2 sticky bottom-0 z-20 -mx-3 border-t border-white/10 hl-surf-0 px-3 pt-3 mt-3 md:static md:bottom-auto md:z-auto md:mx-0 md:mt-0 md:mb-4 md:border-0 md:bg-transparent md:px-0 md:pt-0'
            : 'mb-4'
        }`}
      >
        {/* Zeile 1: Ansicht-Umschalter über die VOLLE Breite – so sind auf dem
            iPhone alle Punkte (auch „Tag"/„Termine") sichtbar & erreichbar. */}
        {mode === 'tasks' ? (
          <SegmentedControl
            groupId="taskview"
            fill
            value={taskView}
            onChange={(v) => setTaskView(v)}
            options={[
              { value: 'list' as const, label: 'Liste', icon: ListChecks },
              { value: 'week' as const, label: 'Woche', icon: CalendarDays },
            ]}
          />
        ) : (
          <SegmentedControl
            groupId="calview"
            fill
            value={view}
            onChange={(v) => setView(v)}
            options={calendarViews.map((v) => ({
              value: v as 'month' | 'week' | 'day' | 'termine' | 'aufgaben',
              // Bewusst OHNE Icon: 4 Optionen + Icon würden auf dem iPhone die
              // Beschriftung abschneiden. So bleibt jeder Punkt voll lesbar.
              label: v === 'month' ? 'Monat' : v === 'week' ? 'Woche' : v === 'day' ? 'Tag' : v === 'termine' ? 'Termine' : 'Aufgaben',
            }))}
          />
        )}

        {/* Zeile 2: Datums-Navigation (blendet SMOOTH ein/aus) + „Neu" rechts –
            „Neu" ist immer erreichbar, egal welche Ansicht. */}
        <div className="flex items-center gap-2 mt-2">
          <div className="flex-1 min-w-0 flex items-center justify-center gap-2">
            <AnimatePresence initial={false}>
              {((mode !== 'tasks' && (view === 'month' || view === 'week' || view === 'day')) || (mode === 'tasks' && taskView === 'week')) && (
                <motion.div
                  key="datenav"
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.2, ease: 'easeOut' }}
                  className="flex items-center gap-2 min-w-0"
                >
                  <button onClick={() => shift(-1)} className="p-2 rounded-lg bg-white/5 border border-white/10 text-hl-soft hover:text-white cursor-pointer active:scale-90 transition-transform shrink-0">
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="font-display font-bold text-white text-sm text-center truncate">{label}</span>
                  <button onClick={() => shift(1)} className="p-2 rounded-lg bg-white/5 border border-white/10 text-hl-soft hover:text-white cursor-pointer active:scale-90 transition-transform shrink-0">
                    <ChevronRight className="w-4 h-4" />
                  </button>
                  <button onClick={() => setAnchor(new Date())} className="px-3 py-2 rounded-lg text-xs font-sans font-semibold bg-white/5 border border-white/10 text-hl-mute hover:text-white cursor-pointer active:scale-95 transition-transform shrink-0">
                    Heute
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          <button
            onClick={() => setNewTask({ date: view === 'day' ? ymd(anchor) : TODAY, type: view === 'aufgaben' ? 'aufgabe' : 'termin' })}
            className="px-4 py-2.5 rounded-2xl text-xs font-bold uppercase tracking-wider bg-brand-accent-light hover:bg-brand-accent text-white cursor-pointer flex items-center gap-1.5 shrink-0 active:scale-95 transition-transform"
          >
            <Plus className="w-4 h-4" /> {view === 'aufgaben' ? 'Aufgabe' : 'Neu'}
          </button>
        </div>
      </div>

      <div className={persist ? 'order-1 flex-1 min-h-0 md:contents' : 'contents'}>
      {loading ? (
        <div className="flex items-center justify-center py-16 text-hl-mute">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      ) : mode === 'tasks' && taskView === 'week' ? (
        /* -------- AUFGABEN-WOCHE (meine To-dos in Wochentagsspalten) -------- */
        <div className={`flex gap-3 overflow-x-auto ${persist ? 'h-full pb-1' : 'pb-2'}`}>
          {range.weeks[0].map((d) => {
            const key = ymd(d);
            const isToday = key === TODAY;
            const dayTodos = myTodosByDay[key] ?? [];
            return (
              <div key={key} className={`shrink-0 w-64 hl-surf-soft border border-white/5 rounded-xl p-2.5 flex flex-col ${persist ? 'h-full' : 'min-h-[14rem]'}`}>
                <div className="flex items-baseline justify-between px-1 mb-2">
                  <span className={`font-display font-bold text-sm uppercase tracking-tight ${isToday ? 'text-brand-accent-light' : 'text-white'}`}>
                    {WEEKDAYS_FULL[(d.getDay() + 6) % 7]}
                  </span>
                  <span className="text-[10px] font-mono text-hl-dim">{key.slice(8)}.{key.slice(5, 7)}.</span>
                </div>
                <div className={`space-y-2 min-h-[2rem] ${persist ? 'flex-1 overflow-y-auto' : 'flex-1'}`}>
                  {dayTodos.length === 0 ? (
                    <p className="text-center text-[11px] text-hl-faint py-3">—</p>
                  ) : (
                    dayTodos.map((t) => {
                      const done = t.status === 'erledigt';
                      return (
                        <div key={t.id} onClick={() => setOpenTask(t)} className={`hl-surf border border-white/5 rounded-lg p-2.5 cursor-pointer hover:border-white/15 transition-colors flex items-start gap-2 ${done ? 'opacity-60' : ''}`}>
                          <button onClick={(e) => { e.stopPropagation(); quickSetStatus(t, done ? 'offen' : 'erledigt'); }} className="shrink-0 cursor-pointer mt-0.5" title={done ? 'Als offen markieren' : 'Als erledigt markieren'}>
                            {done ? <CheckSquare className="w-5 h-5 text-brand-accent-light" /> : <Square className="w-5 h-5 text-hl-mute" />}
                          </button>
                          <div className="min-w-0 flex-1">
                            <span className={`block text-sm font-sans leading-snug break-words ${done ? 'line-through text-hl-mute' : 'text-white'}`}>{t.title}</span>
                            <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                              {t.status !== 'offen' && t.status !== 'leer' && (
                                <span className={`text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded ${STATUS_CELL[t.status]}`}>{STATUS_LABEL[t.status]}</span>
                              )}
                              <span className={`text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded ${PRIORITY_CELL[t.priority]}`}>{PRIORITY_LABEL[t.priority]}</span>
                              {t.startTime && <span className="text-[10px] font-mono text-hl-dim">{t.startTime}</span>}
                            </div>
                            <div className="flex items-center justify-between mt-1.5">
                              <AssigneeChips assignees={t.assignees} urlFor={(id) => members.get(id)?.avatarUrl} px={20} />
                              {!!t.commentCount && (
                                <span className="flex items-center gap-1 text-[10px] text-hl-mute font-mono"><MessageSquare className="w-3 h-3" /> {t.commentCount}</span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
                <button onClick={() => setNewTask({ date: key, type: 'aufgabe' })} className="mt-2 w-full py-2.5 rounded-xl border border-dashed border-black/10 text-hl-mute hover:text-brand-accent-light hover:border-brand-accent-light/40 text-[13px] font-medium cursor-pointer flex items-center justify-center gap-1.5 transition-colors active:scale-[.98]">
                  <Plus className="w-3.5 h-3.5" /> Aufgabe
                </button>
              </div>
            );
          })}
        </div>
      ) : view === 'termine' ? (
        /* -------- MEINE TERMINE (Agenda, nach Datum) -------- */
        <div className="space-y-1.5">
          {myEvents.length === 0 ? (
            <EmptyState icon={Calendar} title="Keine Termine" hint="Termine, die dich betreffen, erscheinen hier." />
          ) : (
            myEvents.map((t, i) => {
              const prev = i > 0 ? myEvents[i - 1] : null;
              const showDate = !prev || prev.dueDate !== t.dueDate;
              const past = !!t.dueDate && taskEnd(t) < TODAY;
              return (
                <React.Fragment key={t.id}>
                  {showDate && (
                    <div className="text-[10px] font-mono uppercase tracking-wider text-hl-dim pt-3 pb-1 px-1">
                      {t.dueDate ? fmtDayHeading(t.dueDate) : 'Ohne Datum'}
                    </div>
                  )}
                  <button
                    onClick={() => setOpenTask(t)}
                    className={`w-full text-left hl-surf border border-white/5 rounded-2xl p-3.5 cursor-pointer hover:border-white/15 shadow-sm hover:shadow transition-all flex items-center gap-3 ${past ? 'opacity-60' : ''}`}
                  >
                    <span className="w-1.5 self-stretch rounded-full shrink-0" style={{ background: t.type === 'beides' ? '#E9C46A' : '#22DFC9' }} />
                    <div className="min-w-0 flex-1">
                      <span className="block text-sm font-sans text-white leading-snug break-words">{t.title}</span>
                      <div className="flex items-center gap-2 mt-1 flex-wrap text-[10px] font-mono text-hl-dim">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" /> {t.startTime ? timeLabel(t) : 'ganztägig'}
                          {isMultiDay(t) ? ` · bis ${taskEnd(t).slice(8)}.${taskEnd(t).slice(5, 7)}.` : ''}
                        </span>
                        {t.type === 'beides' && <span className="px-1.5 py-0.5 rounded bg-brand-accent/15 text-brand-accent-light">auch Aufgabe</span>}
                      </div>
                    </div>
                    <AssigneeChips assignees={t.assignees} urlFor={(id) => members.get(id)?.avatarUrl} px={22} />
                  </button>
                </React.Fragment>
              );
            })
          )}
        </div>
      ) : view === 'aufgaben' ? (
        /* -------- MEINE AUFGABEN (nach Frist gruppiert, zum Abhaken) -------- */
        (() => {
          if (myTodos.length === 0)
            return <EmptyState icon={CheckSquare} title="Alles erledigt" hint="Dir sind aktuell keine Aufgaben zugewiesen." />;
          const bucketOf = (t: Task) => {
            if (t.status === 'erledigt') return 'done';
            if (!t.dueDate) return 'none';
            if (t.dueDate < TODAY) return 'overdue';
            if (t.dueDate === TODAY) return 'today';
            return t.dueDate <= ymd(addDays(new Date(), 7)) ? 'week' : 'later';
          };
          const BUCKETS: { key: string; label: string; tone?: string }[] = [
            { key: 'overdue', label: 'Überfällig', tone: '#FF8578' },
            { key: 'today', label: 'Heute', tone: '#22DFC9' },
            { key: 'week', label: 'Diese Woche' },
            { key: 'later', label: 'Später' },
            { key: 'none', label: 'Ohne Frist' },
            { key: 'done', label: 'Erledigt' },
          ];
          const grouped: Record<string, Task[]> = {};
          for (const t of myTodos) (grouped[bucketOf(t)] ??= []).push(t);
          return (
            <div className="space-y-4">
              {BUCKETS.filter((b) => grouped[b.key]?.length).map((b) => (
                <div key={b.key}>
                  <div className="text-[11px] font-mono uppercase tracking-wider mb-1.5 px-1" style={{ color: b.tone ?? '#7e877f' }}>
                    {b.label} · {grouped[b.key].length}
                  </div>
                  <div className="space-y-2">
                    {grouped[b.key].map((t) => {
                      const done = t.status === 'erledigt';
                      const overdue = !done && !!t.dueDate && t.dueDate < TODAY;
                      return (
                        <div
                          key={t.id}
                          onClick={() => setOpenTask(t)}
                          className={`hl-surf border border-white/5 rounded-2xl p-3.5 cursor-pointer hover:border-white/15 shadow-sm hover:shadow transition-all flex items-center gap-3 ${done ? 'opacity-60' : ''}`}
                        >
                          <button
                            onClick={(e) => { e.stopPropagation(); quickSetStatus(t, done ? 'offen' : 'erledigt'); }}
                            className="shrink-0 cursor-pointer"
                            title={done ? 'Als offen markieren' : 'Als erledigt markieren'}
                          >
                            {done ? <CheckSquare className="w-5 h-5 text-brand-accent-light" /> : <Square className="w-5 h-5 text-hl-mute" />}
                          </button>
                          <div className="min-w-0 flex-1">
                            <span className={`block text-sm font-sans leading-snug break-words ${done ? 'line-through text-hl-mute' : 'text-white'}`}>{t.title}</span>
                            <div className="flex items-center gap-2 mt-1 flex-wrap text-[10px] font-mono">
                              {t.dueDate ? (
                                <span className={`flex items-center gap-1 ${overdue ? 'text-hl-red-soft' : 'text-hl-dim'}`}>
                                  <CalendarDays className="w-3 h-3" /> Frist {t.dueDate.slice(8)}.{t.dueDate.slice(5, 7)}.{t.startTime ? ` ${t.startTime}` : ''}
                                </span>
                              ) : (
                                <span className="text-hl-faint">ohne Frist</span>
                              )}
                              {t.status !== 'offen' && t.status !== 'leer' && (
                                <span className={`px-1.5 py-0.5 rounded font-semibold ${STATUS_CELL[t.status]}`}>{STATUS_LABEL[t.status]}</span>
                              )}
                              <span className={`px-1.5 py-0.5 rounded ${PRIORITY_CELL[t.priority]}`}>{PRIORITY_LABEL[t.priority]}</span>
                              {t.type === 'beides' && <span className="px-1.5 py-0.5 rounded bg-brand-accent/15 text-brand-accent-light">auch Termin</span>}
                              {!!t.commentCount && (
                                <span className="flex items-center gap-1 text-hl-dim">
                                  <MessageSquare className="w-3 h-3" /> {t.commentCount}
                                </span>
                              )}
                            </div>
                          </div>
                          <AssigneeChips assignees={t.assignees} urlFor={(id) => members.get(id)?.avatarUrl} px={22} />
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          );
        })()
      ) : view === 'month' ? (
        /* -------- MONATSANSICHT (Google-Stil, bildschirmfüllend, Mehrtages-Balken) -------- */
        <div className={`rounded-2xl border border-white/5 overflow-hidden hl-surf shadow-sm ${persist ? 'h-full flex flex-col' : ''}`}>
          <div className="grid grid-cols-7 border-b border-white/5 shrink-0">
            {WEEKDAYS.map((w) => (
              <div key={w} className="text-center text-[10px] font-mono uppercase tracking-wider text-hl-dim py-1.5">{w}</div>
            ))}
          </div>
          {/* Wochen: füllen im Handy-Modus die Höhe und scrollen INTERN (kein
              großer äußerer Scrollbalken). Am Desktop fließt es wie gehabt. */}
          <div className={persist ? 'flex-1 min-h-0 overflow-y-auto' : ''}>
          {range.weeks.map((week, wi) => {
            const { bars, overflowByCol } = weekBars(week, eventTasks);
            const laneAreaH = MAX_LANES * (LANE_H + 2);
            const HL_H = 17;
            const weekHasHL = week.some((d) => hl[ymd(d)]);
            const barsTop = DAY_NUM_H + (weekHasHL ? HL_H : 0);
            return (
              <div key={wi} className="relative grid grid-cols-7">
                {week.map((d, ci) => {
                  const key = ymd(d);
                  const inMonth = d.getMonth() === anchor.getMonth();
                  const isToday = key === TODAY;
                  const dayHl = hl[key];
                  return (
                    <div
                      key={key}
                      onClick={() => openDay(key)}
                      className={`border-l border-b border-white/5 first:border-l-0 px-0.5 pt-1 cursor-pointer transition-colors ${
                        inMonth ? 'hover:bg-white/[.03]' : 'hl-surf-soft'
                      }`}
                      style={{ minHeight: barsTop + laneAreaH + 14 }}
                    >
                      <div className="flex justify-center">
                        <span
                          className={`text-[11px] font-mono w-5 h-5 flex items-center justify-center rounded-full ${isToday ? 'bg-brand-accent-light text-brand-dark font-bold' : inMonth ? 'text-hl-soft' : 'text-hl-faint'}`}
                          style={dayHl && !isToday ? { color: hlColor(dayHl.tone) } : undefined}
                        >
                          {d.getDate()}
                        </span>
                      </div>
                      {dayHl && <div style={{ height: HL_H }} className="px-px pt-0.5"><HighlightPill h={dayHl} /></div>}
                      <div style={{ height: laneAreaH }} />
                      {overflowByCol[ci] > 0 && <div className="text-[9px] text-hl-dim text-center leading-none">+{overflowByCol[ci]}</div>}
                    </div>
                  );
                })}
                {/* Balken-Overlay: spannt echte Mehrtages-Aufgaben über die Spalten */}
                <div
                  className="absolute left-0 right-0 grid grid-cols-7 pointer-events-none"
                  style={{ top: barsTop, gridAutoRows: `${LANE_H + 2}px` }}
                >
                  {/* Balken sind rein visuell: Klicks gehen an die Tageszelle
                      darunter und öffnen die Tagesansicht (nie direkt die Aufgabe). */}
                  {bars.map(({ t, colStart, colEnd, lane }) => (
                    <div
                      key={t.id}
                      style={{ gridColumn: `${colStart + 1} / ${colEnd + 2}`, gridRow: lane + 1, height: LANE_H }}
                      className={`mx-0.5 rounded px-1 text-[10px] leading-[16px] text-left truncate ${STATUS_CELL[t.status]}`}
                      title={t.title}
                    >
                      {t.type === 'beides' && <Check className="w-2.5 h-2.5 inline align-[-1px] mr-0.5" />}
                      {!isMultiDay(t) && t.startTime && <span className="opacity-80 mr-0.5">{t.startTime}</span>}
                      {t.title}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
          </div>
        </div>
      ) : view === 'day' ? (
        /* -------- TAGESANSICHT (Zeitraster + Ganztägig, Google-Stil) -------- */
        <DayView
          dayKey={ymd(anchor)}
          tasks={eventTasks}
          highlight={hl[ymd(anchor)]}
          fullHeight={persist}
          onOpenTask={setOpenTask}
          onAddAt={(startTime) => setNewTask({ date: ymd(anchor), startTime })}
          onMoveTask={moveTask}
        />
      ) : (
        /* -------- WOCHENANSICHT (Kalender/Termine) -------- */
        <div className={`flex gap-3 overflow-x-auto ${persist ? 'h-full pb-1' : 'pb-2'}`}>
          {range.weeks[0].map((d) => {
            const key = ymd(d);
            const isToday = key === TODAY;
            const dayTasks = tasksByDay[key] ?? [];
            return (
              <div key={key} className={`shrink-0 w-64 hl-surf-soft border border-white/5 rounded-xl p-2.5 flex flex-col ${persist ? 'h-full' : 'min-h-[14rem]'}`}>
                <div className="flex items-baseline justify-between px-1 mb-2">
                  <span className={`font-display font-bold text-sm uppercase tracking-tight ${isToday ? 'text-brand-accent-light' : 'text-white'}`}>
                    {WEEKDAYS_FULL[(d.getDay() + 6) % 7]}
                  </span>
                  <span className="text-[10px] font-mono text-hl-dim">{key.slice(8)}.{key.slice(5, 7)}.</span>
                </div>
                {hl[key] && <div className="mb-2"><HighlightPill h={hl[key]} className="!text-[11px] !leading-[18px] py-0.5 text-center" /></div>}
                <div className={`space-y-2 min-h-[2rem] ${persist ? 'flex-1 overflow-y-auto' : 'flex-1'}`}>
                  {dayTasks.map((t) => (
                    <div key={t.id} onClick={() => setOpenTask(t)} className="hl-surf border border-white/5 rounded-lg p-2.5 cursor-pointer hover:border-white/15 transition-colors">
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
                        <AssigneeChips assignees={t.assignees} urlFor={(id) => members.get(id)?.avatarUrl} px={22} />
                        {!!t.commentCount && (
                          <span className="flex items-center gap-1 text-[10px] text-hl-mute font-mono">
                            <MessageSquare className="w-3 h-3" /> {t.commentCount}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                <button onClick={() => setNewTask({ date: key, type: 'termin' })} className="mt-2 w-full py-2.5 rounded-xl border border-dashed border-black/10 text-hl-mute hover:text-brand-accent-light hover:border-brand-accent-light/40 text-[13px] font-medium cursor-pointer flex items-center justify-center gap-1.5 transition-colors active:scale-[.98]">
                  <Plus className="w-3.5 h-3.5" /> Termin
                </button>
              </div>
            );
          })}
        </div>
      )}
      </div>

      <AnimatePresence>
        {newTask && (
          <NewTaskModal prefill={newTask} team={team} onClose={() => setNewTask(null)} onCreated={() => { setNewTask(null); load(); }} />
        )}
        {openTask && (
          <TaskDetail task={openTask} team={team} currentUserId={currentUserId} isSuperadmin={isSuperadmin} onClose={() => setOpenTask(null)} onChanged={load} />
        )}
      </AnimatePresence>
    </div>
  );
}
