import { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { CalendarDays, ListChecks, Lightbulb, Clock, ChevronRight, CheckSquare, Square, Sparkles, Plus } from 'lucide-react';
import type { Task, Idea, TeamMember } from '../types';
import { fetchAllTasks, fetchIdeas, fetchTeam, memberMap, updateTask } from '../lib/collab';
import { getHeroes } from '../lib/heroes';
import Avatar from './Avatar';

// „Start" – die Übersicht der Team-App: Begrüßung, Wochenstreifen und ALLES was
// ansteht (Termine + eigene Aufgaben + Ideen) an EINEM Ort, damit man nicht
// ständig zwischen den Tabs wechseln muss. Bewusst mit ruhigen, smoothen
// Einblend-Animationen.

const WD = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function mondayOf(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
}
function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
const TODAY = ymd(new Date());
const isEvent = (t: Task) => t.type !== 'aufgabe';
const isTodo = (t: Task) => t.type !== 'termin';
function taskEnd(t: Task): string {
  return t.endDate && t.dueDate && t.endDate > t.dueDate ? t.endDate : (t.dueDate ?? '');
}

// Sanfte, gestaffelte Einblendung.
const container = { hidden: {}, show: { transition: { staggerChildren: 0.06, delayChildren: 0.04 } } };
const item = { hidden: { opacity: 0, y: 14 }, show: { opacity: 1, y: 0, transition: { type: 'spring' as const, stiffness: 320, damping: 30 } } };

export default function HomeOverview({
  currentUserId,
  userName,
  onOpenTask,
  onOpenDay,
  onGoTab,
  onNewTask,
}: {
  currentUserId: string;
  userName: string;
  onOpenTask: (taskId: string) => void;
  onOpenDay: (dateStr: string) => void;
  onGoTab: (tab: 'chats' | 'aufgaben' | 'kalender' | 'ideen' | 'tickets') => void;
  onNewTask: () => void;
}) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [heroes] = useState(() => getHeroes(currentUserId));
  const members = useMemo(() => memberMap(team), [team]);

  const load = () => {
    fetchAllTasks().then(setTasks).catch(() => {});
    fetchIdeas().then(setIdeas).catch(() => {});
  };
  useEffect(() => {
    load();
    fetchTeam().then(setTeam).catch(() => {});
  }, []);

  const involvesMe = (t: Task) => t.createdBy === currentUserId || t.assignees.some((a) => a.userId === currentUserId);

  // Wochenstreifen (Mo–So dieser Woche) mit Zählern je Tag.
  const week = useMemo(() => {
    const mon = mondayOf(new Date());
    return Array.from({ length: 7 }, (_, i) => {
      const d = addDays(mon, i);
      const key = ymd(d);
      const termine = tasks.filter((t) => isEvent(t) && t.dueDate && t.dueDate <= key && key <= taskEnd(t)).length;
      const aufgaben = tasks.filter((t) => isTodo(t) && involvesMe(t) && t.status !== 'erledigt' && t.dueDate === key).length;
      return { key, d, termine, aufgaben, isToday: key === TODAY };
    });
  }, [tasks, currentUserId]); // eslint-disable-line react-hooks/exhaustive-deps

  // „Als Nächstes": kommende Termine + meine offenen Aufgaben mit Frist, gemischt.
  const upcoming = useMemo(() => {
    const items: { t: Task; kind: 'termin' | 'aufgabe'; date: string }[] = [];
    for (const t of tasks) {
      if (isEvent(t) && t.dueDate && taskEnd(t) >= TODAY) items.push({ t, kind: 'termin', date: t.dueDate });
      else if (isTodo(t) && involvesMe(t) && t.status !== 'erledigt' && t.dueDate && t.dueDate >= TODAY)
        items.push({ t, kind: 'aufgabe', date: t.dueDate });
    }
    return items
      .sort((a, b) => a.date.localeCompare(b.date) || (a.t.startTime ?? '').localeCompare(b.t.startTime ?? ''))
      .slice(0, 8);
  }, [tasks, currentUserId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Überfällige eigene Aufgaben.
  const overdue = useMemo(
    () => tasks.filter((t) => isTodo(t) && involvesMe(t) && t.status !== 'erledigt' && t.dueDate && t.dueDate < TODAY),
    [tasks, currentUserId] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const ideenUnread = useMemo(() => ideas.filter((i) => (i.unread ?? 0) > 0), [ideas]);
  const now = new Date();
  const greeting = now.getHours() < 11 ? 'Guten Morgen' : now.getHours() < 18 ? 'Hallo' : 'Guten Abend';

  const dayLabel = (dateStr: string) => {
    if (dateStr === TODAY) return 'Heute';
    if (dateStr === ymd(addDays(new Date(), 1))) return 'Morgen';
    const d = new Date(`${dateStr}T00:00:00`);
    return `${WD[(d.getDay() + 6) % 7]}, ${d.getDate()}.${String(d.getMonth() + 1).padStart(2, '0')}.`;
  };

  const quickDone = async (t: Task) => {
    setTasks((prev) => prev.map((x) => (x.id === t.id ? { ...x, status: 'erledigt' } : x)));
    try { await updateTask(t.id, { status: 'erledigt' }); } catch { load(); }
  };

  return (
    <div className="h-full overflow-y-auto px-3 py-4">
      <motion.div variants={container} initial="hidden" animate="show" className="max-w-2xl mx-auto space-y-3.5">
        {/* Begrüßung */}
        <motion.div variants={item} className="relative overflow-hidden rounded-3xl p-5 text-white" style={{ background: 'linear-gradient(135deg, #0C7A70 0%, #12A594 45%, #6D5DE6 120%)' }}>
          <div className="absolute -right-8 -top-10 w-40 h-40 rounded-full" style={{ background: 'radial-gradient(circle, rgba(255,255,255,.25), transparent 70%)' }} />
          <div className="relative flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[13px] font-sans font-semibold opacity-90">{greeting},</div>
              <div className="font-display font-black text-2xl leading-tight truncate">{userName || 'Team'} 👋</div>
              <div className="text-[12px] font-sans opacity-85 mt-1">
                {now.getDate()}. {MONTHS[now.getMonth()]} · {upcoming.filter((u) => u.date === TODAY).length} heute
              </div>
            </div>
            <div className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-2xl font-display font-black text-lg" style={{ background: 'rgba(255,255,255,.18)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,.3)' }}>
              <span style={{ fontSize: 18 }}>⚡</span>
              <span className="tabular-nums">{heroes}</span>
            </div>
          </div>
        </motion.div>

        {/* Wochenstreifen */}
        <motion.div variants={item} className="hl-card p-3 rounded-3xl">
          <div className="flex items-center justify-between px-1 mb-2">
            <span className="text-xs font-mono uppercase tracking-wider text-hl-dim">Diese Woche</span>
            <button onClick={() => onGoTab('kalender')} className="text-[11px] font-bold uppercase tracking-wider text-brand-accent-light hover:opacity-80 cursor-pointer flex items-center gap-0.5">
              Kalender <ChevronRight className="w-3 h-3" />
            </button>
          </div>
          <div className="grid grid-cols-7 gap-1">
            {week.map((w) => (
              <button
                key={w.key}
                onClick={() => onOpenDay(w.key)}
                className={`flex flex-col items-center gap-1 py-2 rounded-2xl cursor-pointer transition-transform active:scale-90 ${w.isToday ? 'text-white' : 'text-hl-soft hover:bg-white/5'}`}
                style={w.isToday ? { background: 'linear-gradient(135deg,#0C7A70,#12A594)' } : undefined}
              >
                <span className="text-[10px] font-mono uppercase">{WD[(w.d.getDay() + 6) % 7]}</span>
                <span className={`text-[15px] font-display font-black leading-none ${w.isToday ? 'text-white' : 'text-white'}`}>{w.d.getDate()}</span>
                <span className="flex items-center gap-0.5 h-1.5">
                  {w.termine > 0 && <span className="w-1.5 h-1.5 rounded-full" style={{ background: '#22DFC9' }} />}
                  {w.aufgaben > 0 && <span className="w-1.5 h-1.5 rounded-full" style={{ background: '#E9C46A' }} />}
                </span>
              </button>
            ))}
          </div>
        </motion.div>

        {/* Überfällig */}
        {overdue.length > 0 && (
          <motion.div variants={item} className="hl-card p-3.5 rounded-3xl border" style={{ borderColor: 'rgba(255,133,120,.35)' }}>
            <div className="text-[11px] font-mono uppercase tracking-wider mb-2 flex items-center gap-1.5" style={{ color: '#FF8578' }}>
              <Clock className="w-3.5 h-3.5" /> Überfällig · {overdue.length}
            </div>
            <div className="space-y-1.5">
              {overdue.slice(0, 4).map((t) => (
                <div key={t.id} onClick={() => onOpenTask(t.id)} className="flex items-center gap-2.5 rounded-xl hl-surf-soft px-2.5 py-2 cursor-pointer active:scale-[.99] transition-transform">
                  <button onClick={(e) => { e.stopPropagation(); quickDone(t); }} className="shrink-0 cursor-pointer"><Square className="w-5 h-5 text-hl-mute" /></button>
                  <span className="flex-1 min-w-0 text-sm text-white truncate">{t.title}</span>
                  <span className="text-[10px] font-mono shrink-0" style={{ color: '#FF8578' }}>{dayLabel(t.dueDate!)}</span>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {/* Als Nächstes */}
        <motion.div variants={item}>
          <div className="flex items-center justify-between px-1 mb-2">
            <span className="text-xs font-mono uppercase tracking-wider text-hl-dim flex items-center gap-1.5"><Sparkles className="w-3.5 h-3.5 text-brand-accent-light" /> Was ansteht</span>
            <button onClick={onNewTask} className="text-[11px] font-bold uppercase tracking-wider text-brand-accent-light hover:opacity-80 cursor-pointer flex items-center gap-0.5"><Plus className="w-3.5 h-3.5" /> Neu</button>
          </div>
          {upcoming.length === 0 ? (
            <div className="hl-card rounded-3xl p-6 text-center">
              <CheckSquare className="w-8 h-8 mx-auto text-hl-faint mb-2" />
              <p className="text-sm text-hl-mute">Nichts Anstehendes – alles im Griff! 🎉</p>
            </div>
          ) : (
            <div className="space-y-2">
              {upcoming.map((u) => {
                const t = u.t;
                const termin = u.kind === 'termin';
                return (
                  <motion.button
                    key={t.id + u.kind}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => onOpenTask(t.id)}
                    className="w-full text-left hl-card rounded-2xl p-3 flex items-center gap-3 cursor-pointer"
                  >
                    <span className="w-1.5 self-stretch rounded-full shrink-0" style={{ background: termin ? '#22DFC9' : '#E9C46A' }} />
                    {!termin && (
                      <button onClick={(e) => { e.stopPropagation(); quickDone(t); }} className="shrink-0 cursor-pointer" title="Erledigt">
                        <Square className="w-5 h-5 text-hl-mute" />
                      </button>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-sans text-white leading-snug truncate">{t.title}</div>
                      <div className="text-[10px] font-mono text-hl-dim mt-0.5 flex items-center gap-1.5">
                        <span className={u.date === TODAY ? 'text-brand-accent-light' : ''}>{dayLabel(u.date)}</span>
                        {t.startTime && <><span>·</span><span>{t.startTime}{t.endTime ? `–${t.endTime}` : ''}</span></>}
                        <span>·</span>
                        <span>{termin ? 'Termin' : 'Aufgabe'}</span>
                      </div>
                    </div>
                    {t.assignees.length > 0 && (
                      <div className="flex -space-x-1.5 shrink-0">
                        {t.assignees.slice(0, 3).map((a) => (
                          <span key={a.userId} className="hl-avatar-ring inline-flex rounded-full"><Avatar name={a.userName} url={members.get(a.userId)?.avatarUrl} size={22} /></span>
                        ))}
                      </div>
                    )}
                  </motion.button>
                );
              })}
            </div>
          )}
        </motion.div>

        {/* Ideen mit neuen Beiträgen */}
        {ideenUnread.length > 0 && (
          <motion.div variants={item}>
            <div className="flex items-center justify-between px-1 mb-2">
              <span className="text-xs font-mono uppercase tracking-wider text-hl-dim flex items-center gap-1.5"><Lightbulb className="w-3.5 h-3.5 text-brand-accent-light" /> Neues in Ideen</span>
              <button onClick={() => onGoTab('ideen')} className="text-[11px] font-bold uppercase tracking-wider text-brand-accent-light hover:opacity-80 cursor-pointer flex items-center gap-0.5">Alle <ChevronRight className="w-3 h-3" /></button>
            </div>
            <div className="space-y-2">
              {ideenUnread.slice(0, 3).map((i) => (
                <motion.button key={i.id} whileTap={{ scale: 0.98 }} onClick={() => onGoTab('ideen')} className="w-full text-left hl-card rounded-2xl p-3 flex items-center gap-3 cursor-pointer">
                  <span className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'rgba(34,223,201,.15)' }}><Lightbulb className="w-5 h-5 text-brand-accent-light" /></span>
                  <span className="flex-1 min-w-0 text-sm text-white truncate">{i.title}</span>
                  <span className="min-w-[20px] h-5 px-1.5 inline-flex items-center justify-center rounded-full bg-[#E6238E] text-white text-[11px] font-bold tabular-nums shrink-0">{i.unread! > 99 ? '99+' : i.unread}</span>
                </motion.button>
              ))}
            </div>
          </motion.div>
        )}

        {/* Schnellzugriff */}
        <motion.div variants={item} className="grid grid-cols-4 gap-2 pt-1">
          {([
            { t: 'chats', label: 'Chats', icon: () => <span className="text-lg">💬</span> },
            { t: 'aufgaben', label: 'Aufgaben', icon: ListChecks },
            { t: 'kalender', label: 'Kalender', icon: CalendarDays },
            { t: 'ideen', label: 'Ideen', icon: Lightbulb },
          ] as const).map((q) => {
            const Icon = q.icon;
            return (
              <button key={q.t} onClick={() => onGoTab(q.t)} className="hl-card rounded-2xl py-3 flex flex-col items-center gap-1.5 cursor-pointer active:scale-95 transition-transform">
                <Icon className="w-5 h-5 text-brand-accent-light" />
                <span className="text-[10px] font-sans font-bold uppercase tracking-wide text-hl-soft">{q.label}</span>
              </button>
            );
          })}
        </motion.div>
      </motion.div>
    </div>
  );
}
