import { useCallback, useEffect, useRef, useState } from 'react';
import { usePolling } from '../lib/usePolling';
import { motion } from 'motion/react';
import { Headphones, Mic, MicOff, PhoneOff, StickyNote, X, Radio, MonitorUp, Maximize2, Loader2, Video, VideoOff, SwitchCamera, Music, Music2, AudioLines, FileText } from 'lucide-react';
import type { HuddleState, HuddleParticipant, TeamMember, ChatMessage } from '../types';
import { HuddleSession, huddleStart, huddleJoin, huddleLeave, huddlePoll, huddleSaveNotes, huddleRecord, canShareScreen, primeAudio, huddleAudioContext, IS_IOS } from '../lib/huddle';
import { MeetingRecorder, canTranscribe } from '../lib/meetingRecorder';
import { ProtocolModal } from './HuddleProtocol';
import { startHoldMusic } from '../lib/holdMusic';
import Avatar from './Avatar';
import { ModalPortal } from './ui';
import { goBackLayer, useBackClose } from '../lib/backStack';
import { NotesSheet, NotesView } from './HuddleNotes';

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
  camOn: boolean; // ist MEINE Kamera an?
  cams: Record<string, MediaStream>; // Kamerabilder: 'me' bzw. Peer-ID → Stream
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
    // Zustand (u. a. „Mitschreiben läuft") übernehmen, sobald er sich ändert.
    session.onState = (h) => setActive((cur) => {
      if (!cur || cur.session !== session) return cur;
      const s0 = cur.state;
      if (s0.recordingAt === h.recordingAt && s0.transcriptCount === h.transcriptCount && s0.summaryAt === h.summaryAt) return cur;
      return { ...cur, state: { ...s0, recordingAt: h.recordingAt, transcriptCount: h.transcriptCount, summary: h.summary, summaryAt: h.summaryAt } };
    });
    session.onScreen = (from, stream) => setActive((cur) => {
      if (!cur || cur.session !== session) return cur;
      if (!stream) return cur.screen && cur.screen.from === from ? { ...cur, screen: null } : cur;
      return { ...cur, screen: { from, stream } };
    });
    session.onCamera = (from, stream) => setActive((cur) => {
      if (!cur || cur.session !== session) return cur;
      const cams = { ...cur.cams };
      if (stream) cams[from] = stream;
      else if (cams[from]) delete cams[from];
      else return cur;
      return { ...cur, cams };
    });
    setActive({ session, state, participants, muted: false, sharing: false, screen: null, camOn: false, cams: {} });
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
    primeAudio(); // iOS: Ton in der Tipp-Geste freischalten – VOR dem Netz-Await
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
    primeAudio(); // iOS: Ton in der Tipp-Geste freischalten – VOR dem Netz-Await
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

  const toggleCamera = useCallback(async () => {
    const s = ref.current;
    if (!s) return;
    if (s.camOn) {
      s.stopCamera();
      setActive((cur) => (cur ? { ...cur, camOn: false } : cur));
      return;
    }
    try {
      await s.startCamera();
      setActive((cur) => (cur ? { ...cur, camOn: true } : cur));
    } catch (err) {
      alert(err instanceof Error && err.name === 'NotAllowedError' ? 'Kein Kamera-Zugriff – bitte in den Einstellungen erlauben.' : 'Kamera nicht verfügbar.');
    }
  }, []);

  const switchCamera = useCallback(() => {
    ref.current?.switchCamera().catch(() => alert('Kamera-Wechsel nicht möglich.'));
  }, []);

  // --- Mitschreiben: jedes Gerät schreibt die EIGENE Stimme mit ----------------
  const recRef = useRef<MeetingRecorder | null>(null);
  const [interim, setInterim] = useState('');
  const [recError, setRecError] = useState('');
  const recordingOn = !!active?.state.recordingAt;
  const shouldRecord = recordingOn && !!active && !active.muted && !recError;
  const activeId = active?.state.id ?? null;
  useEffect(() => {
    if (!shouldRecord || !activeId) return;
    const r = new MeetingRecorder(activeId);
    r.onInterim = setInterim;
    r.onError = (m) => setRecError(m);
    recRef.current = r;
    r.start();
    return () => {
      r.stop();
      if (recRef.current === r) recRef.current = null;
    };
  }, [shouldRecord, activeId]);
  useEffect(() => {
    if (!recordingOn) setRecError('');
  }, [recordingOn]);

  const toggleRecording = useCallback(async () => {
    const cur = ref.current;
    if (!cur) return;
    const on = !recordingOn;
    if (on && !window.confirm('Mitschreiben starten?\n\nAlle im Huddle sehen, dass mitgeschrieben wird. Jedes Gerät schreibt die eigene Stimme mit – danach kann eine KI alles zusammenfassen.')) return;
    if (on && !canTranscribe()) alert('Dein Browser kann selbst nicht mitschreiben (am besten Chrome oder Safari) – die anderen schreiben trotzdem mit.');
    try {
      const r = await huddleRecord(cur.huddleId, on);
      setActive((a) => (a && a.session === cur ? { ...a, state: { ...a.state, recordingAt: r.recordingAt } } : a));
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Hat nicht geklappt.');
    }
  }, [recordingOn]);

  // Beim Verlassen der Seite höflich abmelden.
  useEffect(() => {
    return () => { if (ref.current) { ref.current.stop(); huddleLeave(ref.current.huddleId).catch(() => {}); } };
  }, []);

  return { active, speaking, busy, startInConversation, joinHuddle, leave, toggleMute, toggleScreen, toggleCamera, switchCamera, toggleRecording, interim, recError };
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
// Warte-Musik: läuft, solange man allein im Huddle ist – beim Anrufen/Starten
// bis jemand rangeht und wenn alle anderen schon aufgelegt haben.
// ===========================================================================
function useHoldMusic(play: boolean, delayMs: number) {
  useEffect(() => {
    if (!play) return;
    let stop: (() => void) | null = null;
    const t = setTimeout(() => {
      stop = startHoldMusic(huddleAudioContext);
    }, delayMs);
    return () => {
      clearTimeout(t);
      stop?.();
    };
  }, [play, delayMs]);
}

// Ein Kamerabild (oder geteilter Bildschirm). Immer stumm – der Ton läuft
// getrennt; stummes Video darf überall automatisch abspielen.
// Robust gegen „schwarzes Bild" (v. a. Safari/iPhone):
//  • jedes <video> bekommt einen EIGENEN MediaStream mit den Videospuren –
//    Safari zeigt denselben Stream-Objekt in zwei Elementen (Leiste + Vollbild)
//    sonst gern nur in einem an, das andere bleibt schwarz;
//  • sobald eine Spur Bilder liefert (unmute), neu abspielen;
//  • Wächter: läuft die Spur, aber das Video zeigt nichts, wird es neu
//    angehängt und gestartet.
export function VideoView({ stream, mirror = false, fit = 'cover', className = '' }: { stream: MediaStream; mirror?: boolean; fit?: 'cover' | 'contain'; className?: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    let own = new MediaStream(stream.getVideoTracks());
    const attach = () => {
      own = new MediaStream(stream.getVideoTracks());
      v.srcObject = own;
      v.play().catch(() => {});
    };
    attach();
    const kick = () => v.play().catch(() => {});
    const hooked = new Set<MediaStreamTrack>();
    const hook = () => {
      for (const t of stream.getVideoTracks()) {
        if (hooked.has(t)) continue;
        hooked.add(t);
        t.addEventListener('unmute', kick);
      }
    };
    hook();
    const onTracks = () => { hook(); attach(); };
    stream.addEventListener('addtrack', onTracks);
    stream.addEventListener('removetrack', onTracks);
    v.addEventListener('loadedmetadata', kick);
    const onVis = () => { if (document.visibilityState === 'visible') kick(); };
    document.addEventListener('visibilitychange', onVis);
    let stuck = 0;
    const watch = setInterval(() => {
      const live = stream.getVideoTracks().some((t) => t.readyState === 'live' && !t.muted);
      if (!live) { stuck = 0; return; }
      if (v.paused) kick();
      if (v.videoWidth === 0 || v.readyState < 2) {
        stuck += 1;
        if (stuck >= 2) { stuck = 0; attach(); }
      } else stuck = 0;
    }, 1500);
    return () => {
      clearInterval(watch);
      stream.removeEventListener('addtrack', onTracks);
      stream.removeEventListener('removetrack', onTracks);
      v.removeEventListener('loadedmetadata', kick);
      document.removeEventListener('visibilitychange', onVis);
      for (const t of hooked) t.removeEventListener('unmute', kick);
    };
  }, [stream]);
  return (
    <video
      ref={ref}
      autoPlay
      playsInline
      muted
      className={`${fit === 'cover' ? 'object-cover' : 'object-contain'} bg-black ${className}`}
      style={mirror ? { transform: 'scaleX(-1)' } : undefined}
    />
  );
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
  onToggleCamera,
  onSwitchCamera,
  onToggleRecording,
  interim = '',
  recError = '',
}: {
  active: ActiveHuddle;
  speaking: Set<string>;
  team: TeamMember[];
  currentUserId: string;
  onLeave: () => void;
  onToggleMute: () => void;
  onToggleScreen: () => void;
  onToggleCamera: () => void;
  onSwitchCamera: () => void;
  onToggleRecording?: () => void;
  interim?: string;
  recError?: string;
}) {
  const [stageOpen, setStageOpen] = useState(false);
  const [protocolOpen, setProtocolOpen] = useState(false);
  const recording = !!active.state.recordingAt;
  useBackClose(stageOpen, () => setStageOpen(false));
  const [notesOpen, setNotesOpen] = useState(false);
  const [notes, setNotes] = useState(active.state.notes ?? '');
  // Warte-Musik, solange man allein ist: beim Starten/Anrufen bis jemand
  // rangeht – und wenn alle anderen aufgelegt haben. Per Noten-Knopf abschaltbar.
  const [everOthers, setEverOthers] = useState(false);
  useEffect(() => { if (active.participants.length > 1) setEverOthers(true); }, [active.participants.length]);
  const alone = active.participants.length <= 1;
  const [musicOff, setMusicOff] = useState(false);
  useHoldMusic(alone && !musicOff, everOthers ? 2500 : 1200);
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
  const lastEdit = useRef(0);
  const [saving, setSaving] = useState(false);
  const onNotes = (v: string) => {
    setNotes(v);
    lastEdit.current = Date.now();
    setSaving(true);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      huddleSaveNotes(active.state.id, v).catch(() => {}).finally(() => setSaving(false));
    }, 600);
  };
  // Änderungen der anderen live übernehmen – aber nicht, während man selbst tippt.
  useEffect(() => {
    const s = active.session;
    s.onNotes = (n) => {
      if (Date.now() - lastEdit.current > 2500) setNotes(n);
    };
    return () => { s.onNotes = () => {}; };
  }, [active.session]);

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
            <video ref={screenRef} autoPlay playsInline muted className="w-full max-h-[38vh] object-contain bg-black" />
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
        {/* Kamerabilder (Videoanruf) – antippen = groß */}
        {Object.keys(active.cams).length > 0 && (
          <div className="mb-2 flex gap-2 overflow-x-auto [scrollbar-width:none]">
            {Object.entries(active.cams).map(([from, stream]) => (
              <button
                key={from}
                type="button"
                onClick={() => setStageOpen(true)}
                className={`relative shrink-0 w-28 h-20 sm:w-36 sm:h-24 rounded-xl overflow-hidden border-2 cursor-pointer ${
                  speaking.has(from === 'me' ? currentUserId : from) ? 'border-[#22DFC9]' : 'border-white/20'
                }`}
              >
                <VideoView stream={stream} mirror={from === 'me' && active.session.facingMode === 'user'} className="w-full h-full" />
                <span className="absolute left-1.5 bottom-1 text-[10px] font-sans font-semibold text-white bg-black/55 px-1.5 py-0.5 rounded-full max-w-[90%] truncate">
                  {from === 'me' ? 'Du' : nameOf(from, 'Teilnehmer')}
                </span>
              </button>
            ))}
          </div>
        )}
        {/* Mitschreiben läuft – für ALLE sichtbar */}
        {recording && (
          <div className="mb-2 flex items-center gap-2 rounded-xl bg-black/25 border border-white/15 px-2.5 py-1.5 min-w-0">
            <span className="relative flex w-2.5 h-2.5 shrink-0">
              <span className="absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75 animate-ping" />
              <span className="relative inline-flex rounded-full w-2.5 h-2.5 bg-rose-500" />
            </span>
            <span className="text-[11px] font-bold uppercase tracking-wider text-white shrink-0">Wird mitgeschrieben</span>
            <span className="flex-1 min-w-0 truncate text-[12px] text-white/75 font-sans italic">
              {recError ? recError : active.muted ? 'Du bist stumm – deine Stimme wird nicht mitgeschrieben' : interim || ''}
            </span>
            <button onClick={() => setProtocolOpen(true)} className="shrink-0 inline-flex items-center gap-1 rounded-full bg-white/15 hover:bg-white/25 px-2.5 py-1 text-[11px] font-bold text-white cursor-pointer">
              <FileText className="w-3.5 h-3.5" /> Protokoll
            </button>
          </div>
        )}
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="hidden min-[420px]:flex items-center gap-1.5 shrink-0">
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
            {alone && <span className="ml-3 self-center text-[12px] text-white/80 font-sans truncate">{everOthers ? 'Alle anderen sind raus' : 'Wartet auf andere…'}</span>}
          </button>
          {alone && (
            <button
              onClick={() => setMusicOff((v) => !v)}
              title={musicOff ? 'Warte-Musik an' : 'Warte-Musik aus'}
              className={`p-2.5 rounded-full cursor-pointer shrink-0 ${musicOff ? 'bg-white/15 text-white/60' : 'bg-white/15 text-white hover:bg-white/25'}`}
            >
              {musicOff ? <Music2 className="w-5 h-5 opacity-60" /> : <Music className="w-5 h-5" />}
            </button>
          )}
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
          <button
            onClick={onToggleCamera}
            title={active.camOn ? 'Kamera aus' : 'Kamera an'}
            className={`p-2.5 rounded-full cursor-pointer shrink-0 ${active.camOn ? 'bg-white text-[#0C7A70]' : 'bg-white/15 text-white hover:bg-white/25'}`}
          >
            {active.camOn ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
          </button>
          {onToggleRecording && (
            <button
              onClick={onToggleRecording}
              title={recording ? 'Mitschreiben beenden' : 'Mitschreiben (KI-Protokoll)'}
              className={`p-2.5 rounded-full cursor-pointer shrink-0 ${recording ? 'bg-rose-500 text-white' : 'bg-white/15 text-white hover:bg-white/25'}`}
            >
              <AudioLines className="w-5 h-5" />
            </button>
          )}
          <button onClick={() => setNotesOpen(true)} title="Notizen" className="hidden min-[400px]:inline-flex p-2.5 rounded-full bg-white/15 text-white hover:bg-white/25 cursor-pointer shrink-0">
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

      {notesOpen && <NotesSheet notes={notes} onChange={onNotes} onClose={() => goBackLayer()} saving={saving} />}
      {protocolOpen && <ProtocolModal huddleId={active.state.id} live onClose={() => setProtocolOpen(false)} />}

      {stageOpen && (
        <HuddleStage
          active={active}
          speaking={speaking}
          team={team}
          currentUserId={currentUserId}
          onLeave={() => { setStageOpen(false); onLeave(); }}
          onToggleMute={onToggleMute}
          onToggleScreen={onToggleScreen}
          onToggleCamera={onToggleCamera}
          onSwitchCamera={onSwitchCamera}
          onOpenNotes={() => setNotesOpen(true)}
          onToggleRecording={onToggleRecording}
          onOpenProtocol={() => setProtocolOpen(true)}
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
  onToggleCamera,
  onSwitchCamera,
  onOpenNotes,
  onToggleRecording,
  onOpenProtocol,
  onClose,
}: {
  active: ActiveHuddle;
  speaking: Set<string>;
  team: TeamMember[];
  currentUserId: string;
  onLeave: () => void;
  onToggleMute: () => void;
  onToggleScreen: () => void;
  onToggleCamera: () => void;
  onSwitchCamera: () => void;
  onOpenNotes: () => void;
  onToggleRecording?: () => void;
  onOpenProtocol: () => void;
  onClose: () => void;
}) {
  const recording = !!active.state.recordingAt;
  const screenRef = useRef<HTMLVideoElement>(null);
  const screen = active.screen;
  useEffect(() => {
    if (screenRef.current && screen) { screenRef.current.srcObject = screen.stream; screenRef.current.play().catch(() => {}); }
  }, [screen]);
  const canShare = canShareScreen();
  const nameOf = (id: string, fb: string) => team.find((t) => t.id === id)?.name ?? fb;
  const n = active.participants.length;
  const anyCam = Object.keys(active.cams).length > 0;
  const cols = n <= 1 ? 'grid-cols-1' : n <= 4 ? 'grid-cols-2' : 'grid-cols-3';
  // Kamera-Wechsel (vorne/hinten) nur an Handys/Tablets sinnvoll.
  const canFlip = active.camOn && (IS_IOS || /Android/i.test(navigator.userAgent));

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
              <video ref={screenRef} autoPlay playsInline muted className="w-full max-h-[45vh] object-contain bg-black" />
              <div className="absolute top-2 left-2 text-[12px] font-sans font-semibold text-white/90 bg-black/50 px-2 py-0.5 rounded-full">
                {screen.from === 'me' ? 'Dein Bildschirm' : `Bildschirm von ${nameOf(screen.from, 'Teilnehmer')}`}
              </div>
            </div>
          )}
          <div className={`grid ${cols} gap-3`}>
            {active.participants.map((p) => {
              const talking = speaking.has(p.userId);
              const nm = nameOf(p.userId, p.userName);
              const me = p.userId === currentUserId;
              const cam = active.cams[me ? 'me' : p.userId];
              return (
                <div
                  key={p.userId}
                  className={`relative overflow-hidden ${anyCam ? 'aspect-[3/4] sm:aspect-video' : 'aspect-square'} rounded-3xl flex flex-col items-center justify-center gap-2 bg-white/[.04] border-2 transition-all ${talking ? 'border-[#22DFC9]' : 'border-white/10'}`}
                  style={talking ? { boxShadow: '0 0 26px rgba(34,223,201,.55)' } : undefined}
                >
                  {cam ? (
                    <>
                      <VideoView stream={cam} mirror={me && active.session.facingMode === 'user'} className="absolute inset-0 w-full h-full" />
                      <span className="absolute left-2 bottom-2 text-[12px] font-sans font-semibold text-white bg-black/55 px-2 py-0.5 rounded-full max-w-[90%] truncate">
                        {me ? 'Du' : nm}
                      </span>
                    </>
                  ) : (
                    <>
                      <Avatar name={nm} url={team.find((t) => t.id === p.userId)?.avatarUrl} size={72} />
                      <span className="text-[13px] font-sans font-semibold text-white truncate max-w-[90%]">{me ? 'Du' : nm}</span>
                    </>
                  )}
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
          <button
            onClick={onToggleCamera}
            title={active.camOn ? 'Kamera aus' : 'Kamera an'}
            className={`p-4 rounded-full cursor-pointer ${active.camOn ? 'bg-white text-[#0C7A70]' : 'bg-white/15 text-white hover:bg-white/25'}`}
          >
            {active.camOn ? <Video className="w-6 h-6" /> : <VideoOff className="w-6 h-6" />}
          </button>
          {canFlip && (
            <button onClick={onSwitchCamera} title="Kamera wechseln" className="p-4 rounded-full bg-white/15 text-white hover:bg-white/25 cursor-pointer">
              <SwitchCamera className="w-6 h-6" />
            </button>
          )}
          {canShare && (
            <button
              onClick={onToggleScreen}
              title={active.sharing ? 'Freigabe beenden' : 'Bildschirm teilen'}
              className={`p-4 rounded-full cursor-pointer ${active.sharing ? 'bg-white text-[#0C7A70]' : 'bg-white/15 text-white hover:bg-white/25'}`}
            >
              <MonitorUp className="w-6 h-6" />
            </button>
          )}
          {onToggleRecording && (
            <button
              onClick={onToggleRecording}
              title={recording ? 'Mitschreiben beenden' : 'Mitschreiben (KI-Protokoll)'}
              className={`p-4 rounded-full cursor-pointer ${recording ? 'bg-rose-500 text-white' : 'bg-white/15 text-white hover:bg-white/25'}`}
            >
              <AudioLines className="w-6 h-6" />
            </button>
          )}
          {recording && (
            <button onClick={onOpenProtocol} title="Protokoll" className="p-4 rounded-full bg-white/15 text-white hover:bg-white/25 cursor-pointer">
              <FileText className="w-6 h-6" />
            </button>
          )}
          <button onClick={onOpenNotes} title="Notizen" className="p-4 rounded-full bg-white/15 text-white hover:bg-white/25 cursor-pointer">
            <StickyNote className="w-6 h-6" />
          </button>
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
  // Sofort bei Wechsel der Unterhaltung/reloadKey, danach alle 5 s – nur im
  // sichtbaren Tab (usePolling). Veraltete Antworten werden verworfen.
  const pollSeq = useRef(0);
  const tick = async () => {
    const seq = ++pollSeq.current;
    try {
      const r = await huddlePoll({ conversationId });
      if (seq !== pollSeq.current) return;
      const on = r.huddle && !r.huddle.endedAt ? { id: r.huddle.id, participants: r.participants } : null;
      setLive(on);
      onLive?.(on ? on.id : null);
    } catch { /* still */ }
  };
  useEffect(() => {
    tick();
    // onLive ist stabil (setState); bewusst nicht in den Deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, reloadKey]);
  usePolling(tick, 5_000, { immediate: false });

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
  const [showNotes, setShowNotes] = useState(false);
  const openNotes = () => setShowNotes(true);

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
              Protokoll
            </button>
          )}
        </div>
      )}

      {showNotes && <ProtocolModal huddleId={huddleId} onClose={() => setShowNotes(false)} />}
    </div>
  );
}
