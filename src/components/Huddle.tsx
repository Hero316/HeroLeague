import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { Headphones, Mic, MicOff, PhoneOff, StickyNote, X, Radio } from 'lucide-react';
import type { HuddleState, HuddleParticipant, TeamMember, ChatMessage } from '../types';
import { HuddleSession, huddleStart, huddleJoin, huddleLeave, huddlePoll, huddleSaveNotes } from '../lib/huddle';
import Avatar from './Avatar';
import { ModalPortal } from './ui';
import { useBackClose } from '../lib/backStack';

// ===========================================================================
// Huddle-Steuerung (eine aktive Sitzung pro Gerät)
// ===========================================================================
export interface ActiveHuddle {
  session: HuddleSession;
  state: HuddleState;
  participants: HuddleParticipant[];
  muted: boolean;
}

export function useHuddleController(currentUserId: string) {
  const [active, setActive] = useState<ActiveHuddle | null>(null);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HuddleSession | null>(null);

  const attach = useCallback((state: HuddleState, participants: HuddleParticipant[]) => {
    const session = new HuddleSession(state.id, currentUserId);
    ref.current = session;
    session.onParticipants = (p) => setActive((cur) => (cur && cur.session === session ? { ...cur, participants: p } : cur));
    session.onEnded = () => { ref.current = null; setActive(null); };
    setActive({ session, state, participants, muted: false });
    session.start().catch((err) => {
      alert(err instanceof Error && err.name === 'NotAllowedError' ? 'Kein Mikrofon-Zugriff – bitte in den Einstellungen erlauben.' : 'Mikrofon nicht verfügbar.');
      session.stop();
      huddleLeave(state.id).catch(() => {});
      ref.current = null;
      setActive(null);
    });
  }, [currentUserId]);

  // Neuen Huddle starten bzw. laufenden derselben Unterhaltung beitreten.
  const startInConversation = useCallback(async (conversationId: string) => {
    if (ref.current || busy) return;
    setBusy(true);
    try {
      const r = await huddleStart(conversationId);
      attach(r.huddle, r.participants);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Huddle konnte nicht gestartet werden.');
    } finally {
      setBusy(false);
    }
  }, [attach, busy]);

  const joinHuddle = useCallback(async (huddleId: string) => {
    if (ref.current || busy) return;
    setBusy(true);
    try {
      const r = await huddleJoin(huddleId);
      attach(r.huddle, r.participants);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Beitritt fehlgeschlagen.');
    } finally {
      setBusy(false);
    }
  }, [attach, busy]);

  const leave = useCallback(() => {
    const s = ref.current;
    if (!s) return;
    s.stop();
    huddleLeave(s.huddleId).catch(() => {});
    ref.current = null;
    setActive(null);
  }, []);

  const toggleMute = useCallback(() => {
    setActive((cur) => (cur ? { ...cur, muted: cur.session.toggleMute() } : cur));
  }, []);

  // Beim Verlassen der Seite höflich abmelden.
  useEffect(() => {
    return () => { if (ref.current) { ref.current.stop(); huddleLeave(ref.current.huddleId).catch(() => {}); } };
  }, []);

  return { active, busy, startInConversation, joinHuddle, leave, toggleMute };
}

export type HuddleController = ReturnType<typeof useHuddleController>;

// ===========================================================================
// „Du bist allein"-Musik: sanfte, leise WebAudio-Melodie (kein Datei-Download).
// ===========================================================================
function useAloneMusic(play: boolean) {
  const ctxRef = useRef<AudioContext | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (!play) return;
    // Erst nach ein paar Sekunden Alleinsein starten (nicht sofort).
    const startDelay = setTimeout(() => {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      const ctx = new AC();
      ctxRef.current = ctx;
      const notes = [523.25, 659.25, 783.99, 659.25]; // C5 E5 G5 E5 – sanft
      let i = 0;
      const ping = () => {
        const t = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = notes[i % notes.length];
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(0.05, t + 0.15); // sehr leise
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
        osc.connect(gain).connect(ctx.destination);
        osc.start(t);
        osc.stop(t + 1.7);
        i++;
      };
      ping();
      timerRef.current = setInterval(ping, 1900);
    }, 6000);
    return () => {
      clearTimeout(startDelay);
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
      if (ctxRef.current) { ctxRef.current.close().catch(() => {}); ctxRef.current = null; }
    };
  }, [play]);
}

// ===========================================================================
// Unten schwebende Huddle-Leiste (während man drin ist)
// ===========================================================================
export function HuddleBar({
  active,
  team,
  currentUserId,
  onLeave,
  onToggleMute,
}: {
  active: ActiveHuddle;
  team: TeamMember[];
  currentUserId: string;
  onLeave: () => void;
  onToggleMute: () => void;
}) {
  const [notesOpen, setNotesOpen] = useState(false);
  const [notes, setNotes] = useState(active.state.notes ?? '');
  const alone = active.participants.length <= 1;
  useAloneMusic(alone);
  useBackClose(notesOpen, () => setNotesOpen(false));

  // Notizen entprellt speichern.
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onNotes = (v: string) => {
    setNotes(v);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => huddleSaveNotes(active.state.id, v).catch(() => {}), 600);
  };

  const nameOf = (id: string, fallback: string) => team.find((t) => t.id === id)?.name ?? fallback;

  return (
    <>
      <motion.div
        initial={{ y: 60, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 60, opacity: 0 }}
        className="shrink-0 border-t border-brand-accent-light/30 bg-[#0C7A70]/95 backdrop-blur-xl px-3 py-2.5"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 0.5rem)' }}
      >
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 shrink-0">
            <Radio className="w-4 h-4 text-white animate-pulse" />
            <span className="text-[11px] font-bold uppercase tracking-wider text-white">Huddle</span>
          </div>
          {/* Teilnehmer */}
          <div className="flex -space-x-1.5 flex-1 min-w-0 overflow-hidden">
            {active.participants.map((p) => (
              <span key={p.userId} title={nameOf(p.userId, p.userName)} className="inline-flex ring-2 ring-[#0C7A70] rounded-full">
                <Avatar name={nameOf(p.userId, p.userName)} url={team.find((t) => t.id === p.userId)?.avatarUrl} size={30} />
              </span>
            ))}
            {alone && <span className="ml-3 self-center text-[12px] text-white/80 font-sans truncate">Wartet auf andere…</span>}
          </div>
          {/* Aktionen */}
          <button onClick={() => setNotesOpen(true)} title="Notizen" className="p-2.5 rounded-full bg-white/15 text-white hover:bg-white/25 cursor-pointer shrink-0">
            <StickyNote className="w-5 h-5" />
          </button>
          <button
            onClick={onToggleMute}
            title={active.muted ? 'Ton an' : 'Stumm'}
            className={`p-2.5 rounded-full cursor-pointer shrink-0 ${active.muted ? 'bg-white text-[#0C7A70]' : 'bg-white/15 text-white hover:bg-white/25'}`}
          >
            {active.muted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
          </button>
          <button onClick={onLeave} title="Verlassen" className="p-2.5 rounded-full bg-rose-500 text-white hover:bg-rose-600 cursor-pointer shrink-0">
            <PhoneOff className="w-5 h-5" />
          </button>
        </div>
      </motion.div>

      {notesOpen && (
        <ModalPortal>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[75] bg-black/70 flex items-center justify-center p-4" onClick={() => setNotesOpen(false)}>
            <div className="hl-card hl-modal-card w-full max-w-md p-4" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-display font-bold text-white uppercase tracking-tight flex items-center gap-1.5"><StickyNote className="w-4 h-4" /> Huddle-Notizen</h4>
                <button onClick={() => setNotesOpen(false)} className="p-1 text-hl-mute hover:text-white cursor-pointer"><X className="w-5 h-5" /></button>
              </div>
              <p className="text-[11px] text-hl-mute mb-2">Alle im Huddle sehen dieselben Notizen. Später im Chat auf die Huddle-Karte tippen, um sie wieder zu öffnen.</p>
              <textarea
                value={notes}
                onChange={(e) => onNotes(e.target.value)}
                rows={8}
                autoFocus
                placeholder="Was wurde besprochen? To-dos, Ideen…"
                className="w-full hl-surf-0 border border-white/10 rounded-xl px-3 py-2 text-[15px] text-white focus:outline-none focus:border-brand-accent-light resize-y"
              />
            </div>
          </motion.div>
        </ModalPortal>
      )}
    </>
  );
}

// ===========================================================================
// Banner oben im offenen Chat: „Huddle läuft – beitreten"
// ===========================================================================
export function HuddleBanner({
  conversationId,
  inThisConversation,
  onJoin,
  onLive,
  reloadKey,
}: {
  conversationId: string;
  inThisConversation: boolean; // bin ich schon in DIESEM Huddle?
  onJoin: (huddleId: string) => void;
  onLive?: (huddleId: string | null) => void; // meldet die laufende Huddle-ID nach oben
  reloadKey?: number;
}) {
  const [live, setLive] = useState<{ id: string; participants: HuddleParticipant[] } | null>(null);
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const r = await huddlePoll({ conversationId });
        if (!alive) return;
        const on = r.huddle && !r.huddle.endedAt ? { id: r.huddle.id, participants: r.participants } : null;
        setLive(on);
        onLive?.(on ? on.id : null);
      } catch { /* still */ }
    };
    tick();
    const iv = setInterval(tick, 4000);
    return () => { alive = false; clearInterval(iv); };
    // onLive ist stabil (setState); bewusst nicht in den Deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, reloadKey]);

  if (!live || inThisConversation) return null;
  return (
    <button
      onClick={() => onJoin(live.id)}
      className="w-full flex items-center gap-2 px-3 py-2 bg-[#0C7A70] hover:bg-[#0e8a7e] text-white text-left cursor-pointer shrink-0"
    >
      <Headphones className="w-4 h-4 shrink-0 animate-pulse" />
      <span className="flex-1 text-[13px] font-sans font-semibold">
        Huddle läuft{live.participants.length ? ` · ${live.participants.length} dabei` : ''}
      </span>
      <span className="text-[11px] font-bold uppercase tracking-wider bg-white/20 px-2.5 py-1 rounded-lg shrink-0">Beitreten</span>
    </button>
  );
}

// ===========================================================================
// Anklickbare Huddle-Karte mittig im Chat
// ===========================================================================
export function HuddleCard({
  message,
  isLiveHuddleId,
  onJoin,
}: {
  message: ChatMessage;
  isLiveHuddleId: string | null; // die ID des gerade laufenden Huddles dieser Unterhaltung (oder null)
  onJoin: (huddleId: string) => void;
}) {
  const huddleId = message.attachId ?? '';
  const live = !!huddleId && huddleId === isLiveHuddleId;
  const [notes, setNotes] = useState<string | null>(null);
  const [showNotes, setShowNotes] = useState(false);
  useBackClose(showNotes, () => setShowNotes(false));

  const openNotes = async () => {
    try {
      const r = await huddlePoll({ huddleId });
      setNotes(r.huddle?.notes ?? '');
      setShowNotes(true);
    } catch {
      setNotes('');
      setShowNotes(true);
    }
  };

  return (
    <div className="flex justify-center my-2">
      <div className="inline-flex items-center gap-2.5 px-3.5 py-2 rounded-full bg-[#0C7A70]/15 border border-[#0C7A70]/40">
        <Headphones className={`w-4 h-4 text-[#0C7A70] ${live ? 'animate-pulse' : ''}`} style={{ color: '#22DFC9' }} />
        <span className="text-[12px] font-sans font-semibold text-hl-soft">{live ? 'Huddle läuft' : 'Huddle beendet'}</span>
        {live ? (
          <button onClick={() => onJoin(huddleId)} className="text-[11px] font-bold uppercase tracking-wider bg-[#0C7A70] text-white px-2.5 py-1 rounded-full cursor-pointer hover:bg-[#0e8a7e]">
            Beitreten
          </button>
        ) : (
          <button onClick={openNotes} className="text-[11px] font-bold uppercase tracking-wider bg-white/10 text-hl-soft px-2.5 py-1 rounded-full cursor-pointer hover:text-white">
            Notizen
          </button>
        )}
      </div>

      {showNotes && (
        <ModalPortal>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[75] bg-black/70 flex items-center justify-center p-4" onClick={() => setShowNotes(false)}>
            <div className="hl-card hl-modal-card w-full max-w-md p-4" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-display font-bold text-white uppercase tracking-tight flex items-center gap-1.5"><StickyNote className="w-4 h-4" /> Huddle-Notizen</h4>
                <button onClick={() => setShowNotes(false)} className="p-1 text-hl-mute hover:text-white cursor-pointer"><X className="w-5 h-5" /></button>
              </div>
              {notes && notes.trim() ? (
                <p className="text-[15px] text-hl-soft font-sans whitespace-pre-wrap break-words">{notes}</p>
              ) : (
                <p className="text-sm text-hl-faint italic">Für diesen Huddle wurden keine Notizen gemacht.</p>
              )}
            </div>
          </motion.div>
        </ModalPortal>
      )}
    </div>
  );
}
