import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Check, ChevronDown, Clock, Plus, Trash2, UserPlus, X } from 'lucide-react';
import type { ChecklistItem, RsvpEntry, RsvpStatus, TeamMember } from '../types';
import Avatar from './Avatar';
import { useBackClose } from '../lib/backStack';
import { useLongPress } from './ChatSystem';

// ===========================================================================
// Bausteine fürs Termin-/Aufgaben-Fenster (Team-App): aufklappbare Blöcke,
// Stichpunkt-Aufgaben mit Zuständigen und Zu-/Absage-Leiste.
// ===========================================================================

// Aufklappbarer Block: Kopfzeile mit Symbol, Titel und kurzer Zusammenfassung.
export function Collapsible({
  icon,
  title,
  summary,
  defaultOpen = false,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  summary?: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-2xl border border-white/10 hl-surf-soft">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center gap-2.5 px-3.5 py-3 text-left cursor-pointer"
      >
        <span className="shrink-0 text-brand-accent-light">{icon}</span>
        <span className="shrink-0 text-[11px] font-mono uppercase tracking-wider text-hl-dim">{title}</span>
        <span className="min-w-0 flex-1 flex items-center justify-end gap-2 text-[13px] text-hl-soft font-sans">{!open && summary}</span>
        <ChevronDown className={`w-4 h-4 shrink-0 text-hl-mute transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            style={{ overflow: 'hidden' }}
          >
            <div className="px-3.5 pb-3.5">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// --- Datum/Uhrzeit-Zusammenfassung (für den zugeklappten Zeit-Block) --------
function fmtDay(key: string): string {
  const [y, m, d] = key.split('-').map(Number);
  const dt = new Date(y, (m || 1) - 1, d || 1);
  return dt.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' });
}
export function scheduleSummary(o: {
  kind: 'termin' | 'aufgabe' | 'beides';
  dueDate: string;
  endDate: string;
  allDay: boolean;
  startTime: string;
  endTime: string;
}): string {
  if (!o.dueDate) return o.kind === 'aufgabe' ? 'Keine Frist' : 'Kein Datum';
  const day = o.kind !== 'aufgabe' && o.endDate && o.endDate > o.dueDate ? `${fmtDay(o.dueDate)} – ${fmtDay(o.endDate)}` : fmtDay(o.dueDate);
  if (o.allDay || !o.startTime) return o.kind === 'aufgabe' ? `Frist ${day}` : `${day} · ganztägig`;
  return `${day} · ${o.startTime}${o.endTime ? `–${o.endTime}` : ''} Uhr`;
}

// --- Zu-/Absagen -------------------------------------------------------------
export const RSVP_META: Record<RsvpStatus, { label: string; short: string; color: string; icon: string }> = {
  yes: { label: 'Zusagen', short: 'zugesagt', color: '#43E5A0', icon: '✓' },
  late: { label: 'Später', short: 'später', color: '#E9C46A', icon: '⏰' },
  no: { label: 'Absagen', short: 'abgesagt', color: '#FF7A6B', icon: '✕' },
};

export function RsvpBar({
  mine,
  defaultLateTime,
  onAnswer,
}: {
  mine?: RsvpEntry;
  defaultLateTime?: string;
  onAnswer: (status: RsvpStatus | null, time?: string | null) => void;
}) {
  const [lateOpen, setLateOpen] = useState(false);
  const [lateTime, setLateTime] = useState(mine?.time || defaultLateTime || '');
  const pick = (st: RsvpStatus) => {
    if (st === 'late') {
      setLateOpen(true);
      return;
    }
    setLateOpen(false);
    onAnswer(mine?.status === st ? null : st);
  };
  return (
    <div className="rounded-2xl border border-white/10 hl-surf-soft px-3.5 py-3">
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="text-[11px] font-mono uppercase tracking-wider text-hl-dim">Deine Antwort</span>
        {mine && (
          <span className="text-[11px] font-sans font-semibold truncate" style={{ color: RSVP_META[mine.status].color }}>
            {RSVP_META[mine.status].icon} {mine.status === 'late' && mine.time ? `kommst ca. ${mine.time} Uhr` : RSVP_META[mine.status].short}
          </span>
        )}
      </div>
      <div className="grid grid-cols-3 gap-2">
        {(['yes', 'late', 'no'] as RsvpStatus[]).map((st) => {
          const m = RSVP_META[st];
          const on = mine?.status === st || (st === 'late' && lateOpen);
          return (
            <button
              key={st}
              type="button"
              onClick={() => pick(st)}
              className="py-2.5 rounded-xl border text-[13px] font-bold font-sans cursor-pointer transition-all active:scale-95"
              style={
                on
                  ? { background: `${m.color}26`, borderColor: `${m.color}80`, color: m.color }
                  : { background: 'rgba(255,255,255,.04)', borderColor: 'rgba(255,255,255,.1)' }
              }
            >
              <span className={on ? '' : 'text-hl-soft'}>
                {m.icon} {m.label}
              </span>
            </button>
          );
        })}
      </div>
      {lateOpen && (
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          <Clock className="w-4 h-4 text-[#E9C46A] shrink-0" />
          <span className="text-[13px] text-hl-soft">Ich komme ca. um</span>
          <input
            type="time"
            value={lateTime}
            onChange={(e) => setLateTime(e.target.value)}
            className="hl-surf-0 border border-white/10 rounded-lg px-2.5 py-1.5 text-sm text-white focus:outline-none focus:border-[#E9C46A]"
          />
          <button
            type="button"
            onClick={() => {
              setLateOpen(false);
              onAnswer('late', lateTime || null);
            }}
            className="px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider bg-[#E9C46A] text-[#1a1406] cursor-pointer"
          >
            OK
          </button>
          {mine?.status === 'late' && (
            <button
              type="button"
              onClick={() => {
                setLateOpen(false);
                onAnswer(null);
              }}
              className="text-[12px] text-hl-mute hover:text-white underline cursor-pointer"
            >
              zurücknehmen
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// Kleines Status-Abzeichen am Profilbild (✓ / ⏰ / ✕).
export function RsvpDot({ entry }: { entry?: RsvpEntry }) {
  if (!entry) return null;
  const m = RSVP_META[entry.status];
  return (
    <span
      className="absolute -right-1 -bottom-1 w-[15px] h-[15px] rounded-full grid place-items-center text-[8px] font-black text-[#0b1210] border border-[#0b1210]"
      style={{ background: m.color }}
      title={entry.status === 'late' && entry.time ? `kommt ca. ${entry.time} Uhr` : m.short}
    >
      {entry.status === 'late' ? '!' : m.icon}
    </span>
  );
}

// --- Stichpunkt-Aufgaben ------------------------------------------------------
const newItem = (): ChecklistItem => ({
  id: `ci-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
  text: '',
  done: false,
  assignees: [],
});

export function Checklist({
  items,
  onChange,
  participants,
  others,
}: {
  items: ChecklistItem[];
  onChange: (next: ChecklistItem[]) => void;
  participants: TeamMember[]; // Personen im Termin (zuerst angeboten)
  others: TeamMember[]; // restliches Team
}) {
  const [focusId, setFocusId] = useState<string | null>(null);
  const [menuId, setMenuId] = useState<string | null>(null);
  const inputs = useRef(new Map<string, HTMLInputElement>());
  useBackClose(menuId !== null, () => setMenuId(null));

  useEffect(() => {
    if (!focusId) return;
    const el = inputs.current.get(focusId);
    if (el) {
      el.focus();
      const n = el.value.length;
      el.setSelectionRange(n, n);
    }
    setFocusId(null);
  }, [focusId, items]);

  const patch = (id: string, p: Partial<ChecklistItem>) => onChange(items.map((i) => (i.id === id ? { ...i, ...p } : i)));
  const addAfter = (idx: number) => {
    const it = newItem();
    const next = [...items];
    next.splice(idx + 1, 0, it);
    onChange(next);
    setFocusId(it.id);
  };
  const remove = (idx: number, focusPrev: boolean) => {
    const prev = items[idx - 1];
    onChange(items.filter((_, i) => i !== idx));
    if (focusPrev && prev) setFocusId(prev.id);
  };
  const byId = new Map([...participants, ...others].map((m) => [m.id, m]));

  return (
    <div>
      {items.length > 0 && (
        <div className="space-y-0.5 mb-1.5">
          {items.map((it, idx) => (
            <ChecklistRow
              key={it.id}
              item={it}
              menuOpen={menuId === it.id}
              byId={byId}
              participants={participants}
              others={others}
              inputRef={(el) => {
                if (el) inputs.current.set(it.id, el);
                else inputs.current.delete(it.id);
              }}
              onText={(text) => patch(it.id, { text })}
              onToggleDone={() => patch(it.id, { done: !it.done })}
              onToggleAssignee={(uid) =>
                patch(it.id, { assignees: it.assignees.includes(uid) ? it.assignees.filter((x) => x !== uid) : [...it.assignees, uid] })
              }
              onEnter={() => addAfter(idx)}
              onBackspaceEmpty={() => remove(idx, true)}
              onDelete={() => {
                setMenuId(null);
                remove(idx, false);
              }}
              onMenu={() => setMenuId((cur) => (cur === it.id ? null : it.id))}
            />
          ))}
        </div>
      )}
      <button
        type="button"
        onClick={() => addAfter(items.length - 1)}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-dashed border-white/20 text-[12px] font-semibold text-hl-soft hover:text-white hover:border-brand-accent-light/50 cursor-pointer transition-colors"
      >
        <Plus className="w-3.5 h-3.5" /> Aufgabe
      </button>
      {items.length > 0 && (
        <p className="mt-1.5 text-[11px] text-hl-faint font-sans">Enter = neuer Punkt · gedrückt halten oder Rechtsklick = Person zuteilen</p>
      )}
    </div>
  );
}

function ChecklistRow({
  item,
  menuOpen,
  byId,
  participants,
  others,
  inputRef,
  onText,
  onToggleDone,
  onToggleAssignee,
  onEnter,
  onBackspaceEmpty,
  onDelete,
  onMenu,
}: {
  item: ChecklistItem;
  menuOpen: boolean;
  byId: Map<string, TeamMember>;
  participants: TeamMember[];
  others: TeamMember[];
  inputRef: (el: HTMLInputElement | null) => void;
  onText: (t: string) => void;
  onToggleDone: () => void;
  onToggleAssignee: (uid: string) => void;
  onEnter: () => void;
  onBackspaceEmpty: () => void;
  onDelete: () => void;
  onMenu: () => void;
}) {
  const press = useLongPress(onMenu, 480);
  const assigned = item.assignees.map((id) => byId.get(id)).filter((m): m is TeamMember => !!m);
  return (
    <div className={`rounded-xl transition-colors ${menuOpen ? 'bg-white/[.05]' : ''}`}>
      <div className="flex items-center gap-2 px-1.5 py-1" onContextMenu={press.onContextMenu} onTouchStart={press.onTouchStart} onTouchEnd={press.onTouchEnd} onTouchMove={press.onTouchMove} onTouchCancel={press.onTouchCancel}>
        <button
          type="button"
          onClick={onToggleDone}
          title={item.done ? 'Wieder offen' : 'Erledigt'}
          className="shrink-0 w-[18px] h-[18px] rounded-md border-2 grid place-items-center cursor-pointer transition-colors"
          style={item.done ? { background: '#22DFC9', borderColor: '#22DFC9' } : { borderColor: 'rgba(148,163,161,.55)' }}
        >
          {item.done && <Check className="w-3 h-3 text-[#0b1210]" strokeWidth={3.5} />}
        </button>
        <input
          ref={inputRef}
          value={item.text}
          onChange={(e) => onText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
              e.preventDefault();
              onEnter();
            } else if (e.key === 'Backspace' && item.text === '') {
              e.preventDefault();
              onBackspaceEmpty();
            }
          }}
          placeholder="Aufgabe…"
          className={`flex-1 min-w-0 bg-transparent py-1 text-[14px] font-sans focus:outline-none placeholder:text-hl-faint ${
            item.done ? 'line-through text-hl-mute' : 'text-white'
          }`}
        />
        {assigned.length > 0 && (
          <button type="button" onClick={onMenu} className="shrink-0 flex -space-x-1.5 cursor-pointer" title={assigned.map((a) => a.name).join(', ')}>
            {assigned.slice(0, 3).map((a) => (
              <span key={a.id} className="inline-flex hl-avatar-ring">
                <Avatar name={a.name} url={a.avatarUrl} size={20} />
              </span>
            ))}
            {assigned.length > 3 && <span className="text-[10px] text-hl-mute pl-2">+{assigned.length - 3}</span>}
          </button>
        )}
        <button
          type="button"
          onClick={onMenu}
          title="Person zuteilen"
          className={`shrink-0 p-1 rounded-md cursor-pointer transition-colors ${menuOpen ? 'text-brand-accent-light' : 'text-hl-faint hover:text-white'}`}
        >
          <UserPlus className="w-4 h-4" />
        </button>
      </div>
      <AnimatePresence initial={false}>
        {menuOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            style={{ overflow: 'hidden' }}
          >
            <div className="px-2.5 pb-2.5 pt-1 space-y-2">
              <div className="text-[10px] font-mono uppercase tracking-wider text-hl-dim">Wer übernimmt das?</div>
              <PersonChips people={participants} selected={item.assignees} onToggle={onToggleAssignee} />
              {others.length > 0 && (
                <>
                  <div className="text-[10px] font-mono uppercase tracking-wider text-hl-faint">Weitere (werden zum Termin hinzugefügt)</div>
                  <PersonChips people={others} selected={item.assignees} onToggle={onToggleAssignee} dim />
                </>
              )}
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={onToggleDone}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[12px] font-semibold border border-white/12 bg-white/5 text-hl-soft hover:text-white cursor-pointer"
                >
                  <Check className="w-3.5 h-3.5" /> {item.done ? 'Wieder offen' : 'Erledigt'}
                </button>
                <button
                  type="button"
                  onClick={onDelete}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[12px] font-semibold border border-rose-500/30 bg-rose-500/10 text-rose-300 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Löschen
                </button>
                <button
                  type="button"
                  onClick={onMenu}
                  className="ml-auto inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[12px] font-semibold text-hl-mute hover:text-white cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" /> Fertig
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function PersonChips({
  people,
  selected,
  onToggle,
  dim = false,
  rsvp,
}: {
  people: TeamMember[];
  selected: string[];
  onToggle: (id: string) => void;
  dim?: boolean;
  rsvp?: Record<string, RsvpEntry>;
}) {
  if (people.length === 0) return <span className="text-xs text-hl-faint">Keine Team-Mitglieder.</span>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {people.map((m) => {
        const on = selected.includes(m.id);
        const r = on ? rsvp?.[m.id] : undefined;
        return (
          <button
            key={m.id}
            type="button"
            onClick={() => onToggle(m.id)}
            className={`flex items-center gap-1.5 pl-1 pr-2.5 py-0.5 rounded-full border text-[12.5px] font-sans font-semibold transition-all active:scale-95 cursor-pointer ${
              on
                ? 'bg-brand-accent-light/20 border-brand-accent-light/50 text-brand-accent-light'
                : dim
                  ? 'bg-transparent border-white/[.07] text-hl-faint hover:text-white'
                  : 'bg-white/5 border-white/10 text-hl-mute hover:text-white'
            }`}
          >
            <span className="relative inline-flex">
              <Avatar name={m.name} url={m.avatarUrl} size={20} />
              <RsvpDot entry={r} />
            </span>
            {m.name}
            {r?.status === 'late' && r.time && <span className="text-[10.5px] text-[#E9C46A] font-mono">{r.time}</span>}
          </button>
        );
      })}
    </div>
  );
}
