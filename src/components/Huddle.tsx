import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { Headphones, Mic, MicOff, PhoneOff, StickyNote, X, Radio, MonitorUp, Maximize2, Loader2 } from 'lucide-react';
import type { HuddleState, HuddleParticipant, TeamMember, ChatMessage } from '../types';
import { HuddleSession, huddleStart, huddleJoin, huddleLeave, huddlePoll, huddleSaveNotes, canShareScreen } from '../lib/huddle';
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
  sharing: boolean; // teile ICH gerade meinen Bildschirm?
  screen: { from: string; stream: MediaStream } | null; // aktuell gezeigter Bildschirm (me/Peer)
}

function sameSet(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const x of a) if (!b.has(x)) return false;
  return true;
}

export function useHuddleController(currentUserId: string) {
  const [active, setActive] = useState<ActiveHuddle | null>(null);
  const [speaking, setSpeaking] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const ref = useRef<HuddleSession | null>(null);

  const attach = useCallback((state: HuddleState, participants: HuddleParticipant[]) => {
    const session = new HuddleSession(state.id, currentUserId);
    ref.current = session;
    session.onParticipants = (p) => setActive((cur) => (cur && cur.session === session ? { ...cur, participants: p } : cur));
    session.onEnded = () => { ref.current = null; setActive(null); setSpeaking(new Set()); };
    session.onSpeaking = (ids) => setSpeaking((prev) => (sameSet(prev, ids) ? prev : ids));
    session.onScreen = (from, stream) => setActive((cur) => {
      if (!cur || cur.session !== session) return cur;
      if (!stream) return cur.screen && cur.screen.from === from ? { ...cur, screen: null } : cur;
      return { ...cur, screen: { from, stream } };
    });
    setActive({ session, state, participants, muted: false, sharing: false, screen: null });
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
    setSpeaking(new Set());
  }, []);

  const toggleMute = useCallback(() => {
    setActive((cur) => (cur ? { ...cur, muted: cur.session.toggleMute() } : cur));
  }, []);

  const toggleScreen = useCallback(async () => {
    const s = ref.current;
    if (!s) return;
    if (s.sharing) {
      s.stopScreen();
      setActive((cur) => (cur ? { ...cur, sharing: false, screen: cur.screen?.from === 'me' ? null : cur.screen } : cur));
      return;
    }
    try {
      await s.startScreen();
      setActive((cur) => (cur ? { ...cur, sharing: true } : cur));
    } catch (err) {
      if (!(err instanceof Error && err.name === 'NotAllowedError')) {
        alert('Bildschirm teilen wird auf diesem Gerät/Browser nicht unterstützt (z.B. iPhone). Am PC klappt es.');
      }
    }
  }, []);

  // Beim Verlassen der Seite höflich abmelden.
  useEffect(() => {
    return () => { if (ref.current) { ref.current.stop(); huddleLeave(ref.current.huddleId).catch(() => {}); } };
  }, []);

  return { active, speaking, busy, startInConversation, joinHuddle, leave, toggleMute, toggleScreen };
}

export type HuddleController = ReturnType<typeof useHuddleController>;

// ===========================================================================
// Vor-dem-Beitreten-Fenster (Slack-Style): erst antippen → Fenster → Huddeln
// ===========================================================================
export function HuddlePrejoin({
  title,
  live,
  busy,
  onConfirm,
  onClose,
}: {
  title: string;
  live: boolean;
  busy: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  useBackClose(true, onClose);
  return (
    <ModalPortal>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[80] bg-black/70 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
        <motion.div
          initial={{ y: 30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 30, opacity: 0 }}
          className="w-full sm:max-w-sm hl-card hl-modal-card rounded-t-3xl sm:rounded-3xl p-6 text-center"
          style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 1.5rem)' }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="mx-auto w-16 h-16 rounded-2xl bg-[#0C7A70]/20 border border-[#0C7A70]/40 flex items-center justify-center mb-4">
            <Headphones className="w-8 h-8" style={{ color: '#22DFC9' }} />
          </div>
          <h3 className="font-display font-black text-xl text-white uppercase tracking-tight">{live ? 'Huddle beitreten' : 'Huddle starten'}</h3>
          <p className="text-sm text-hl-mute mt-1.5 mb-1">{title}</p>
          <p className="text-[12px] text-hl-faint mb-5">
            {live ? 'Es läuft schon ein Huddle – tritt bei.' : 'Ein Sprach-Raum, in dem ihr locker reden könnt – wie bei Slack.'}
          </p>
          <button
            onClick={onConfirm}
            disabled={busy}
            className="w-full py-3.5 rounded-2xl text-sm font-bold uppercase tracking-wider bg-[#0C7A70] hover:bg-[#0e8a7e] text-white cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Headphones className="w-5 h-5" />}
            {live ? 'Beitreten' : 'Huddle starten'}
          </button>
          <button onClick={onClose} className="w-full mt-2 py-2.5 rounded-2xl text-xs font-bold uppercase tracking-wider text-hl-mute hover:text-white cursor-pointer">
            Abbrechen
          </button>
        </motion.div>
      </motion.div>
    </ModalPortal>
  );
}

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
        gain.gain.linearRampToValueAtTime(0.022, t + 0.2); // sehr, sehr leise
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 1.8);
        osc.connect(gain).connect(ctx.destination);
        osc.start(t);
        osc.stop(t + 1.9);
        i++;
      };
      ping();
      timerRef.current = setInterval(ping, 2600);
    }, 8000);
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
  speaking,
  team,
  currentUserId,
  onLeave,
  onToggleMute,
  onToggleScreen,
}: {
  active: ActiveHuddle;
  speaking: Set<string>;
  team: TeamMember[];
  currentUserId: string;
  onLeave: () => void;
  onToggleMute: () => void;
  onToggleScreen: () => void;
}) {
  const [stageOpen, setStageOpen] = useState(false);
  useBackClose(stageOpen, () => setStageOpen(false));
  const [notesOpen, setNotesOpen] = useState(false);
  const [notes, setNotes] = useState(active.state.notes ?? '');
  // „Du bist allein"-Musik NUR, wenn vorher jemand da war (klassisches „vergessen
  // rauszugehen") – nicht beim Solo-Starten/Warten. Und nie, wenn man stumm ist.
  const [everOthers, setEverOthers] = useState(false);
  useEffect(() => { if (active.participants.length > 1) setEverOthers(true); }, [active.participants.length]);
  const alone = active.participants.length <= 1;
  useAloneMusic(alone && everOthers && !active.muted);
  useBackClose(notesOpen, () => setNotesOpen(false));
  const screenRef = useRef<HTMLVideoElement>(null);
  const screen = active.screen;
  useEffect(() => {
    if (screenRef.current && screen) {
      screenRef.current.srcObject = screen.stream;
      screenRef.current.play().catch(() => {});
    }
  }, [screen]);
  const canShare = canShareScreen();

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
        {/* Geteilter Bildschirm (eigener oder von jemandem) */}
        {screen && (
          <div className="mb-2 relative rounded-xl overflow-hidden border border-white/20 bg-black">
            <video ref={screenRef} autoPlay playsInline muted={screen.from === 'me'} className="w-full max-h-[38vh] object-contain bg-black" />
            <div className="absolute top-1.5 left-2 text-[11px] font-sans font-semibold text-white/90 bg-black/50 px-2 py-0.5 rounded-full">
              {screen.from === 'me' ? 'Dein Bildschirm' : `Bildschirm von ${nameOf(screen.from, 'Teilnehmer')}`}
            </div>
            <button
              onClick={() => { const v = screenRef.current; if (v?.requestFullscreen) v.requestFullscreen().catch(() => {}); }}
              title="Vollbild"
              className="absolute top-1.5 right-1.5 p-1.5 rounded-full bg-black/50 text-white hover:bg-black/70 cursor-pointer"
            >
              <Maximize2 className="w-4 h-4" />
            </button>
          </div>
        )}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 shrink-0">
            <Radio className="w-4 h-4 text-white animate-pulse" />
            <span className="text-[11px] font-bold uppercase tracking-wider text-white">Huddle</span>
          </div>
          {/* Teilnehmer (tippen = Vollbild); wer redet, leuchtet türkis */}
          <button onClick={() => setStageOpen(true)} title="Vollbild" className="flex -space-x-1.5 flex-1 min-w-0 overflow-hidden items-center cursor-pointer">
            {active.participants.map((p) => {
              const talking = speaking.has(p.userId);
              return (
                <span
                  key={p.userId}
                  className={`inline-flex rounded-full ring-2 ${talking ? 'ring-[#22DFC9]' : 'ring-[#0C7A70]'}`}
                  style={talking ? { boxShadow: '0 0 10px #22DFC9' } : undefined}
                >
                  <Avatar name={nameOf(p.userId, p.userName)} url={team.find((t) => t.id === p.userId)?.avatarUrl} size={30} />
                </span>
              );
            })}
            {alone && <span className="ml-3 self-center text-[12px] text-white/80 font-sans truncate">Wartet auf andere…</span>}
          </button>
          {/* Aktionen */}
          <button onClick={() => setStageOpen(true)} title="Vollbild" className="p-2.5 rounded-full bg-white/15 text-white hover:bg-white/25 cursor-pointer shrink-0">
            <Maximize2 className="w-5 h-5" />
          </button>
          {canShare && (
            <button
              onClick={onToggleScreen}
              title={active.sharing ? 'Bildschirm-Freigabe beenden' : 'Bildschirm teilen'}
              className={`p-2.5 rounded-full cursor-pointer shrink-0 ${active.sharing ? 'bg-white text-[#0C7A70]' : 'bg-white/15 text-white hover:bg-white/25'}`}
            >
              <MonitorUp className="w-5 h-5" />
            </button>
          )}
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

      {stageOpen && (
        <HuddleStage
          active={active}
          speaking={speaking}
          team={team}
          currentUserId={currentUserId}
          onLeave={() => { setStageOpen(false); onLeave(); }}
          onToggleMute={onToggleMute}
          onToggleScreen={onToggleScreen}
          onClose={() => setStageOpen(false)}
        />
      )}
    </>
  );
}

// ===========================================================================
// Vollbild-Bühne: alle als Kacheln (Slack-Style), Redner leuchtet
// ===========================================================================
function HuddleStage({
  active,
  speaking,
  team,
  currentUserId,
  onLeave,
  onToggleMute,
  onToggleScreen,
  onClose,
}: {
  active: ActiveHuddle;
  speaking: Set<string>;
  team: TeamMember[];
  currentUserId: string;
  onLeave: () => void;
  onToggleMute: () => void;
  onToggleScreen: () => void;
  onClose: () => void;
}) {
  const screenRef = useRef<HTMLVideoElement>(null);
  const screen = active.screen;
  useEffect(() => {
    if (screenRef.current && screen) { screenRef.current.srcObject = screen.stream; screenRef.current.play().catch(() => {}); }
  }, [screen]);
  const canShare = canShareScreen();
  const nameOf = (id: string, fb: string) => team.find((t) => t.id === id)?.name ?? fb;
  const n = active.participants.length;
  const cols = n <= 1 ? 'grid-cols-1' : n <= 4 ? 'grid-cols-2' : 'grid-cols-3';

  return (
    <ModalPortal>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[85] bg-[#04120f] flex flex-col" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        {/* Kopf */}
        <div className="flex items-center justify-between px-4 py-3 shrink-0">
          <div className="flex items-center gap-2 text-white">
            <Radio className="w-4 h-4 animate-pulse" style={{ color: '#22DFC9' }} />
            <span className="font-display font-black uppercase tracking-tight">Huddle</span>
            <span className="text-hl-mute text-sm">· {n}</span>
          </div>
          <button onClick={onClose} title="Verkleinern" className="p-2 rounded-full bg-white/10 text-white hover:bg-white/20 cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Inhalt: geteilter Bildschirm groß + Kacheln */}
        <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-4">
          {screen && (
            <div className="mb-4 rounded-2xl overflow-hidden border border-white/15 bg-black relative">
              <video ref={screenRef} autoPlay playsInline muted={screen.from === 'me'} className="w-full max-h-[45vh] object-contain bg-black" />
              <div className="absolute top-2 left-2 text-[12px] font-sans font-semibold text-white/90 bg-black/50 px-2 py-0.5 rounded-full">
                {screen.from === 'me' ? 'Dein Bildschirm' : `Bildschirm von ${nameOf(screen.from, 'Teilnehmer')}`}
              </div>
            </div>
          )}
          <div className={`grid ${cols} gap-3`}>
            {active.participants.map((p) => {
              const talking = speaking.has(p.userId);
              const nm = nameOf(p.userId, p.userName);
              return (
                <div
                  key={p.userId}
                  className={`aspect-square rounded-3xl flex flex-col items-center justify-center gap-2 bg-white/[.04] border-2 transition-all ${talking ? 'border-[#22DFC9]' : 'border-white/10'}`}
                  style={talking ? { boxShadow: '0 0 26px rgba(34,223,201,.55)' } : undefined}
                >
                  <Avatar name={nm} url={team.find((t) => t.id === p.userId)?.avatarUrl} size={72} />
                  <span className="text-[13px] font-sans font-semibold text-white truncate max-w-[90%]">
                    {p.userId === currentUserId ? 'Du' : nm}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Steuerung unten */}
        <div className="shrink-0 flex items-center justify-center gap-4 px-4 pt-2" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 1rem)' }}>
          <button
            onClick={onToggleMute}
            title={active.muted ? 'Ton an' : 'Stumm'}
            className={`p-4 rounded-full cursor-pointer ${active.muted ? 'bg-white text-[#0C7A70]' : 'bg-white/15 text-white hover:bg-white/25'}`}
          >
            {active.muted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
          </button>
          {canShare && (
            <button
              onClick={onToggleScreen}
              title={active.sharing ? 'Freigabe beenden' : 'Bildschirm teilen'}
              className={`p-4 rounded-full cursor-pointer ${active.sharing ? 'bg-white text-[#0C7A70]' : 'bg-white/15 text-white hover:bg-white/25'}`}
            >
              <MonitorUp className="w-6 h-6" />
            </button>
          )}
          <button onClick={onLeave} title="Verlassen" className="p-4 rounded-full bg-rose-500 text-white hover:bg-rose-600 cursor-pointer">
            <PhoneOff className="w-6 h-6" />
          </button>
        </div>
      </motion.div>
    </ModalPortal>
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
  const hasNotes = message.attachTitle === 'notes';
  const meta = (message.body || '').replace(/^Beendet · /, ''); // Datum, Startzeit, Dauer
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
      {live ? (
        <div className="inline-flex items-center gap-2.5 px-3.5 py-2 rounded-full bg-[#0C7A70]/15 border border-[#0C7A70]/40">
          <Headphones className="w-4 h-4 animate-pulse" style={{ color: '#22DFC9' }} />
          <span className="text-[12px] font-sans font-semibold text-hl-soft">Huddle läuft</span>
          <button onClick={() => onJoin(huddleId)} className="text-[11px] font-bold uppercase tracking-wider bg-[#0C7A70] text-white px-2.5 py-1 rounded-full cursor-pointer hover:bg-[#0e8a7e]">
            Beitreten
          </button>
        </div>
      ) : (
        <div className="inline-flex items-center gap-3 px-3.5 py-2.5 rounded-2xl bg-[#0C7A70]/10 border border-[#0C7A70]/25 max-w-[88%]">
          <Headphones className="w-4 h-4 shrink-0" style={{ color: '#22DFC9' }} />
          <div className="min-w-0">
            <div className="text-[12px] font-sans font-semibold text-hl-soft leading-tight">Huddle beendet</div>
            {meta && <div className="text-[10px] font-mono text-hl-faint truncate mt-0.5">{meta}</div>}
          </div>
          {hasNotes && (
            <button onClick={openNotes} className="text-[11px] font-bold uppercase tracking-wider bg-white/10 text-hl-soft px-2.5 py-1 rounded-full cursor-pointer hover:text-white shrink-0">
              Notizen
            </button>
          )}
        </div>
      )}

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
