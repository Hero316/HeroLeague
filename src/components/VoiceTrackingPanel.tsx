import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Mic, Pause, Play, Square, X, Loader2, Check, Keyboard, Settings2, Trash2, AlertTriangle, Sparkles } from 'lucide-react';
import type { ActionKey } from '../types';
import { ACTION_META } from '../lib/scoring';
import { uploadFile } from '../lib/api';
import { useBackClose } from '../lib/backStack';
import {
  blobToWav16kMono,
  parseVoice,
  fetchTrackingRules,
  saveTrackingRules,
  type VoiceEvent,
  type VoiceRosterPlayer,
} from '../lib/voice';

// ===========================================================================
// Voice-Tracking-Panel: Spiel einreden → Gemini wertet aus → Ereignisse prüfen
// und mit einem Klick ins Raster übernehmen. Alternativ Transkript einfügen.
// ===========================================================================

export interface VoicePlayer {
  side: 'home' | 'away';
  teamId: string;
  teamName: string;
  name: string;
  role: 'field' | 'keeper';
  number?: number;
}

interface ApplyItem {
  teamId: string;
  player: string;
  action: ActionKey;
  delta: number;
}

interface Props {
  matchId: string;
  homeName: string;
  awayName: string;
  players: VoicePlayer[];
  onApply: (items: ApplyItem[]) => void;
  onClose: () => void;
}

const ACTION_BY_KEY: Record<string, { label: string; icon: string }> = Object.fromEntries(
  ACTION_META.map((a) => [a.key, { label: a.label, icon: a.icon }])
);

const normName = (s: string) => (s || '').toLowerCase().replace(/\./g, '').replace(/\s+/g, ' ').trim();

// Eine geprüfte Zeile in der Review-Liste (Ereignis + aktuelle Zuordnung).
interface ReviewRow {
  id: number;
  ev: VoiceEvent;
  sel: string; // "teamId::playerName" oder '' (nicht zugeordnet)
  include: boolean;
  delta: number;
}

function fmtTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export default function VoiceTrackingPanel({ matchId, homeName, awayName, players, onApply, onClose }: Props) {
  useBackClose(true, onClose);

  // Erkanntes Ergebnis pro Spiel zwischenspeichern, damit versehentliches
  // Schließen (oder ein Neuladen) die Liste NICHT vernichtet.
  const storeKey = `hl-voice-review-${matchId}`;
  const restoredRef = useRef(false);

  const [tab, setTab] = useState<'record' | 'text'>('record');
  const [phase, setPhase] = useState<'input' | 'processing' | 'review'>('input');
  const [error, setError] = useState<string>('');
  const [progress, setProgress] = useState<string>('');

  // --- Regeln (saisonweit) --------------------------------------------------
  const [rules, setRules] = useState('');
  const [rulesOpen, setRulesOpen] = useState(false);
  const [rulesSaved, setRulesSaved] = useState(false);
  const rulesLoaded = useRef(false);
  useEffect(() => {
    fetchTrackingRules()
      .then((r) => {
        setRules(r.text || '');
        rulesLoaded.current = true;
      })
      .catch(() => {});
  }, []);
  const doSaveRules = useCallback(async () => {
    try {
      await saveTrackingRules(rules);
      setRulesSaved(true);
      setTimeout(() => setRulesSaved(false), 1500);
    } catch {
      /* still */
    }
  }, [rules]);

  // --- Aufnahme -------------------------------------------------------------
  const [recState, setRecState] = useState<'idle' | 'recording' | 'paused'>('idle');
  const [elapsed, setElapsed] = useState(0);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopTick = () => {
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
  };
  const startTick = () => {
    stopTick();
    tickRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
  };

  const cleanupStream = useCallback(() => {
    stopTick();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => () => cleanupStream(), [cleanupStream]);

  const pickMime = (): string => {
    const cands = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4', ''];
    for (const c of cands) {
      if (!c || (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(c))) return c;
    }
    return '';
  };

  const [textValue, setTextValue] = useState('');

  const startRecording = useCallback(async () => {
    setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      streamRef.current = stream;
      const mime = pickMime();
      const rec = mime ? new MediaRecorder(stream, { mimeType: mime, audioBitsPerSecond: 32000 }) : new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };
      recRef.current = rec;
      rec.start(1000); // alle 1s ein Chunk – robust gegen Abbrüche
      setElapsed(0);
      setRecState('recording');
      startTick();
    } catch {
      setError('Kein Mikrofon-Zugriff. Bitte im Browser erlauben.');
    }
  }, []);

  const pauseRecording = useCallback(() => {
    const rec = recRef.current;
    if (rec && rec.state === 'recording') {
      rec.pause();
      stopTick();
      setRecState('paused');
    }
  }, []);

  const resumeRecording = useCallback(() => {
    const rec = recRef.current;
    if (rec && rec.state === 'paused') {
      rec.resume();
      startTick();
      setRecState('recording');
    }
  }, []);

  // Kontext für Gemini aus dem Kader bauen.
  const voicePlayers = useMemo<VoiceRosterPlayer[]>(
    () =>
      players.map((p) => ({
        team: p.side,
        teamName: p.teamName,
        name: p.name,
        role: p.role,
        ...(typeof p.number === 'number' ? { number: p.number } : {}),
      })),
    [players]
  );

  const runEvaluate = useCallback(
    async (opts: { audioUrl?: string; mimeType?: string; transcript?: string }) => {
      setPhase('processing');
      setError('');
      try {
        const result = await parseVoice({
          ...opts,
          context: { homeTeam: homeName, awayTeam: awayName, players: voicePlayers, rules },
        });
        const rows: ReviewRow[] = result.events.map((ev, i) => {
          const sel = resolveSelection(ev, players);
          return { id: i, ev, sel, include: sel !== '', delta: ev.delta || 1 };
        });
        setReview(rows);
        setTranscript(result.transcript || '');
        setPhase('review');
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Auswertung fehlgeschlagen.');
        setPhase('input');
      }
    },
    [homeName, awayName, voicePlayers, rules, players]
  );

  const stopAndEvaluate = useCallback(async () => {
    const rec = recRef.current;
    if (!rec) return;
    const done = new Promise<Blob>((resolve) => {
      rec.onstop = () => resolve(new Blob(chunksRef.current, { type: rec.mimeType || 'audio/webm' }));
    });
    try {
      rec.stop();
    } catch {
      /* egal */
    }
    setRecState('idle');
    cleanupStream();
    setPhase('processing');
    setProgress('Audio wird aufbereitet …');
    try {
      const raw = await done;
      if (raw.size === 0) {
        setError('Keine Aufnahme erkannt.');
        setPhase('input');
        return;
      }
      setProgress('Audio wird umgewandelt …');
      const wav = await blobToWav16kMono(raw);
      const file = new File([wav], 'tracking.wav', { type: 'audio/wav' });
      setProgress('Audio wird hochgeladen …');
      const up = await uploadFile(file);
      setProgress('Gemini wertet aus … (kann bei langen Aufnahmen etwas dauern)');
      await runEvaluate({ audioUrl: up.url, mimeType: 'audio/wav' });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Verarbeitung fehlgeschlagen.');
      setPhase('input');
    } finally {
      setProgress('');
    }
  }, [cleanupStream, runEvaluate]);

  const evaluateText = useCallback(() => {
    const t = textValue.trim();
    if (t.length < 4) {
      setError('Bitte zuerst ein Transkript einfügen.');
      return;
    }
    runEvaluate({ transcript: t });
  }, [textValue, runEvaluate]);

  // --- Review ---------------------------------------------------------------
  const [review, setReview] = useState<ReviewRow[]>([]);
  const [transcript, setTranscript] = useState('');
  const [showTranscript, setShowTranscript] = useState(false);

  // Beim Öffnen: zuletzt erkanntes (noch nicht übernommenes) Ergebnis wiederherstellen.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(storeKey);
      if (raw) {
        const saved = JSON.parse(raw) as { review?: ReviewRow[]; transcript?: string };
        if (saved?.review?.length) {
          setReview(saved.review);
          setTranscript(saved.transcript || '');
          setPhase('review');
        }
      }
    } catch {
      /* egal */
    }
    restoredRef.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeKey]);

  // Solange ein Ergebnis in der Kontroll-Liste steht, laufend sichern (überlebt
  // versehentliches Schließen). Nur schreiben, nie beim ersten Lauf löschen.
  useEffect(() => {
    if (!restoredRef.current) return;
    try {
      if (phase === 'review' && review.length) {
        sessionStorage.setItem(storeKey, JSON.stringify({ review, transcript }));
      }
    } catch {
      /* egal */
    }
  }, [review, transcript, phase, storeKey]);

  const clearSaved = useCallback(() => {
    try {
      sessionStorage.removeItem(storeKey);
    } catch {
      /* egal */
    }
  }, [storeKey]);

  const selectOptions = useMemo(() => {
    const home = players.filter((p) => p.side === 'home');
    const away = players.filter((p) => p.side === 'away');
    return { home, away };
  }, [players]);

  const includedCount = review.filter((r) => r.include && r.sel).length;

  const applyAll = useCallback(() => {
    const items: ApplyItem[] = [];
    for (const r of review) {
      if (!r.include || !r.sel) continue;
      const [teamId, ...rest] = r.sel.split('::');
      const player = rest.join('::');
      items.push({ teamId, player, action: r.ev.action, delta: r.delta });
    }
    clearSaved();
    onApply(items);
    onClose();
  }, [review, onApply, onClose, clearSaved]);

  const patchRow = (id: number, patch: Partial<ReviewRow>) =>
    setReview((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      {/* Kein Schließen bei Klick daneben – sonst geht die erkannte Liste versehentlich verloren. */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div className="relative w-full sm:max-w-3xl max-h-[92vh] sm:max-h-[88vh] flex flex-col bg-hl-card border border-white/12 rounded-t-3xl sm:rounded-3xl overflow-hidden shadow-2xl">
        {/* Kopf */}
        <div className="flex items-center gap-3 px-4 sm:px-5 py-3.5 border-b border-white/10 shrink-0">
          <div className="w-8 h-8 rounded-xl grid place-items-center shrink-0" style={{ background: 'rgba(230,35,142,.16)', border: '1px solid rgba(230,35,142,.35)' }}>
            <Mic className="w-4 h-4" style={{ color: '#E6238E' }} />
          </div>
          <div className="min-w-0">
            <div className="font-display font-black uppercase tracking-tight text-[15px] leading-none">Audio-Tracking</div>
            <div className="text-[10px] uppercase tracking-[2px] text-hl-dim mt-0.5 truncate">
              {homeName} <span className="text-hl-faint">vs</span> {awayName}
            </div>
          </div>
          <button
            onClick={onClose}
            className="ml-auto w-8 h-8 grid place-items-center rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 transition-colors cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 sm:px-5 py-4">
          {error && (
            <div className="mb-4 flex items-start gap-2 rounded-xl border border-hl-red/40 bg-hl-red/10 px-3 py-2.5 text-[13px] text-hl-red">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              <span className="min-w-0">{error}</span>
            </div>
          )}

          {phase === 'input' && (
            <>
              {/* Umschalter Aufnehmen / Text */}
              <div className="flex gap-1 p-1 rounded-xl bg-white/5 border border-white/10 mb-4">
                <TabBtn active={tab === 'record'} onClick={() => setTab('record')} icon={<Mic className="w-3.5 h-3.5" />} label="Einreden" />
                <TabBtn active={tab === 'text'} onClick={() => setTab('text')} icon={<Keyboard className="w-3.5 h-3.5" />} label="Text einfügen" />
              </div>

              {tab === 'record' ? (
                <div className="text-center py-4">
                  <div className="font-display font-black tabular-nums text-5xl mb-1" style={{ color: recState === 'recording' ? '#E6238E' : undefined }}>
                    {fmtTime(elapsed)}
                  </div>
                  <div className="text-[11px] uppercase tracking-wider text-hl-dim mb-6 h-4">
                    {recState === 'recording' ? (
                      <span className="inline-flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-hl-red animate-pulse" /> Aufnahme läuft
                      </span>
                    ) : recState === 'paused' ? (
                      'Pausiert'
                    ) : (
                      'Bereit'
                    )}
                  </div>

                  <div className="flex items-center justify-center gap-3 flex-wrap">
                    {recState === 'idle' ? (
                      <button
                        onClick={startRecording}
                        className="px-6 py-3 rounded-2xl font-bold text-white flex items-center gap-2 cursor-pointer active:scale-95 transition"
                        style={{ background: 'linear-gradient(135deg,#E6238E,#b81570)' }}
                      >
                        <Mic className="w-5 h-5" /> Aufnahme starten
                      </button>
                    ) : (
                      <>
                        {recState === 'recording' ? (
                          <button
                            onClick={pauseRecording}
                            className="px-5 py-3 rounded-2xl font-bold flex items-center gap-2 border border-white/15 bg-white/5 hover:bg-white/10 cursor-pointer active:scale-95 transition"
                          >
                            <Pause className="w-5 h-5" /> Pause
                          </button>
                        ) : (
                          <button
                            onClick={resumeRecording}
                            className="px-5 py-3 rounded-2xl font-bold flex items-center gap-2 border border-white/15 bg-white/5 hover:bg-white/10 cursor-pointer active:scale-95 transition"
                          >
                            <Play className="w-5 h-5" /> Weiter
                          </button>
                        )}
                        <button
                          onClick={stopAndEvaluate}
                          className="px-6 py-3 rounded-2xl font-bold text-white flex items-center gap-2 cursor-pointer active:scale-95 transition"
                          style={{ background: 'linear-gradient(135deg,#22c55e,#16a34a)' }}
                        >
                          <Square className="w-5 h-5" /> Beenden & Auswerten
                        </button>
                      </>
                    )}
                  </div>
                  <p className="text-[11px] text-hl-dim mt-6 max-w-md mx-auto leading-relaxed">
                    Erzähle das Spiel ganz normal: „Nummer 5, Süß, passt zu Mike … verliert den Ball …". Namen und Umgangssprache versteht die KI.
                    Du kannst jederzeit pausieren und weitermachen.
                  </p>
                </div>
              ) : (
                <div>
                  <textarea
                    value={textValue}
                    onChange={(e) => setTextValue(e.target.value)}
                    rows={8}
                    placeholder="Transkript oder Notizen hier einfügen …"
                    className="w-full hl-input rounded-xl px-3 py-2.5 text-sm resize-y"
                  />
                  <button
                    onClick={evaluateText}
                    className="mt-3 w-full py-3 rounded-xl font-bold text-white flex items-center justify-center gap-2 cursor-pointer active:scale-95 transition"
                    style={{ background: 'linear-gradient(135deg,#E6238E,#b81570)' }}
                  >
                    <Sparkles className="w-4 h-4" /> Auswerten
                  </button>
                </div>
              )}

              {/* Regeln */}
              <div className="mt-6 border-t border-white/10 pt-4">
                <button
                  onClick={() => setRulesOpen((o) => !o)}
                  className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-hl-mute hover:text-hl-text cursor-pointer"
                >
                  <Settings2 className="w-3.5 h-3.5" /> Regeln für die KI {rulesOpen ? '▲' : '▼'}
                </button>
                {rulesOpen && (
                  <div className="mt-3">
                    <p className="text-[11px] text-hl-dim mb-2 leading-relaxed">
                      Dauerhafte Hinweise, die bei jeder Auswertung gelten (z.B. „Sei bei Dribblings nicht so streng" oder „Standardsituationen zählen
                      nicht als Schlüsselpass"). Wird gespeichert und für die ganze Saison verwendet.
                    </p>
                    <textarea
                      value={rules}
                      onChange={(e) => setRules(e.target.value)}
                      rows={4}
                      placeholder="z.B. Zähle einen Steilpass immer als Schlüsselpass …"
                      className="w-full hl-input rounded-xl px-3 py-2.5 text-sm resize-y"
                    />
                    <button
                      onClick={doSaveRules}
                      className="mt-2 px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider border border-white/10 bg-white/5 hover:bg-white/10 cursor-pointer flex items-center gap-1.5"
                    >
                      {rulesSaved ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-hl-green" /> gespeichert
                        </>
                      ) : (
                        'Regeln speichern'
                      )}
                    </button>
                  </div>
                )}
              </div>
            </>
          )}

          {phase === 'processing' && (
            <div className="py-16 text-center">
              <Loader2 className="w-9 h-9 mx-auto animate-spin text-hl-mute" />
              <div className="mt-4 text-sm text-hl-mute">{progress || 'Gemini wertet aus …'}</div>
            </div>
          )}

          {phase === 'review' && (
            <div>
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <h3 className="font-display font-black uppercase tracking-tight text-lg">
                  {review.length} Ereignis{review.length === 1 ? '' : 'se'} erkannt
                </h3>
                {transcript && (
                  <button
                    onClick={() => setShowTranscript((s) => !s)}
                    className="text-[11px] font-bold uppercase tracking-wider text-hl-mute hover:text-hl-text cursor-pointer"
                  >
                    {showTranscript ? 'Transkript ausblenden' : 'Transkript anzeigen'}
                  </button>
                )}
              </div>

              {showTranscript && transcript && (
                <div className="mb-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-[12px] text-hl-mute leading-relaxed max-h-40 overflow-y-auto whitespace-pre-wrap">
                  {transcript}
                </div>
              )}

              {review.length === 0 ? (
                <div className="hl-card p-6 text-center text-hl-mute text-sm">
                  Keine Ereignisse erkannt. Versuche es noch einmal oder prüfe das Transkript.
                </div>
              ) : (
                <div className="space-y-2">
                  {review.map((r) => {
                    const meta = ACTION_BY_KEY[r.ev.action];
                    const unmatched = !r.sel;
                    return (
                      <div
                        key={r.id}
                        className={`rounded-xl border px-3 py-2.5 ${
                          r.include && r.sel ? 'border-white/12 bg-white/[.04]' : 'border-white/8 bg-white/[.015] opacity-70'
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <input
                            type="checkbox"
                            checked={r.include}
                            onChange={(e) => patchRow(r.id, { include: e.target.checked })}
                            className="w-4 h-4 shrink-0 accent-hl-green cursor-pointer"
                          />
                          <span className="text-lg shrink-0 w-6 text-center">{meta?.icon ?? '•'}</span>
                          <div className="min-w-0 flex-1">
                            <div className="font-bold text-sm truncate">{meta?.label ?? r.ev.action}</div>
                            {r.ev.quote && <div className="text-[11px] text-hl-dim truncate italic">„{r.ev.quote}"</div>}
                          </div>
                          {/* Delta */}
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              onClick={() => patchRow(r.id, { delta: Math.max(1, r.delta - 1) })}
                              className="w-6 h-6 grid place-items-center rounded border border-white/10 bg-white/5 hover:bg-white/10 cursor-pointer text-sm"
                            >
                              −
                            </button>
                            <span className="w-6 text-center font-black tabular-nums text-sm">{r.delta}</span>
                            <button
                              onClick={() => patchRow(r.id, { delta: Math.min(20, r.delta + 1) })}
                              className="w-6 h-6 grid place-items-center rounded border border-white/10 bg-white/5 hover:bg-white/10 cursor-pointer text-sm"
                            >
                              +
                            </button>
                          </div>
                        </div>
                        {/* Zuordnung */}
                        <div className="mt-2 flex items-center gap-2 pl-[26px]">
                          <select
                            value={r.sel}
                            onChange={(e) => patchRow(r.id, { sel: e.target.value, include: e.target.value !== '' })}
                            className={`hl-input rounded-lg px-2 py-1.5 text-[12px] font-semibold flex-1 min-w-0 ${
                              unmatched ? 'border-hl-gold/50' : ''
                            }`}
                          >
                            <option value="">— Spieler wählen —</option>
                            <optgroup label={homeName}>
                              {selectOptions.home.map((p) => (
                                <option key={`${p.teamId}::${p.name}`} value={`${p.teamId}::${p.name}`}>
                                  {typeof p.number === 'number' ? `#${p.number} ` : ''}
                                  {p.name}
                                  {p.role === 'keeper' ? ' (TW)' : ''}
                                </option>
                              ))}
                            </optgroup>
                            <optgroup label={awayName}>
                              {selectOptions.away.map((p) => (
                                <option key={`${p.teamId}::${p.name}`} value={`${p.teamId}::${p.name}`}>
                                  {typeof p.number === 'number' ? `#${p.number} ` : ''}
                                  {p.name}
                                  {p.role === 'keeper' ? ' (TW)' : ''}
                                </option>
                              ))}
                            </optgroup>
                          </select>
                          {unmatched && <span className="text-[10px] text-hl-gold shrink-0">nicht erkannt</span>}
                          <button
                            onClick={() => setReview((prev) => prev.filter((x) => x.id !== r.id))}
                            title="Ereignis entfernen"
                            className="w-7 h-7 grid place-items-center rounded-lg border border-white/10 bg-white/5 hover:bg-hl-red/15 hover:border-hl-red/40 hover:text-hl-red cursor-pointer shrink-0"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Fuß (nur Review) */}
        {phase === 'review' && (
          <div className="border-t border-white/10 px-4 sm:px-5 py-3 flex items-center gap-3 shrink-0">
            <button
              onClick={() => {
                clearSaved();
                setPhase('input');
                setReview([]);
                setTranscript('');
              }}
              className="px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider border border-white/10 bg-white/5 hover:bg-white/10 cursor-pointer"
            >
              Nochmal
            </button>
            <button
              onClick={applyAll}
              disabled={includedCount === 0}
              className="flex-1 py-2.5 rounded-xl font-bold text-white flex items-center justify-center gap-2 cursor-pointer active:scale-95 transition disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ background: 'linear-gradient(135deg,#22c55e,#16a34a)' }}
            >
              <Check className="w-4 h-4" /> {includedCount} übernehmen
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function TabBtn({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 py-2 rounded-lg text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
        active ? 'bg-white/10 text-hl-text' : 'text-hl-mute hover:text-hl-text'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

// Ein KI-Ereignis auf einen Kaderspieler abbilden → "teamId::name" oder ''.
function resolveSelection(ev: VoiceEvent, players: VoicePlayer[]): string {
  const t = normName(ev.team);
  let side: 'home' | 'away' | null = null;
  if (t === 'home' || t === 'heim') side = 'home';
  else if (t === 'away' || t === 'auswärts' || t === 'auswaerts' || t === 'gast') side = 'away';
  else {
    const home = players.find((p) => p.side === 'home');
    const away = players.find((p) => p.side === 'away');
    if (home && normName(home.teamName) === t) side = 'home';
    else if (away && normName(away.teamName) === t) side = 'away';
  }
  const pool = side ? players.filter((p) => p.side === side) : players;
  const target = normName(ev.player);
  // Reine Nummer? (z.B. "5" oder "nummer 5") → über Trikotnummer zuordnen.
  const numMatch = target.match(/^(?:nummer\s*|nr\.?\s*|#)?(\d{1,2})$/);
  const byNumber = (arr: VoicePlayer[]) => (numMatch ? arr.find((p) => p.number === Number(numMatch[1])) : undefined);
  // exakter Name, sonst Nummer, sonst Teilstring (Vor-/Nachname), sonst über beide Teams.
  let hit =
    pool.find((p) => normName(p.name) === target) ||
    byNumber(pool) ||
    pool.find((p) => normName(p.name).includes(target) || target.includes(normName(p.name)));
  if (!hit && side) {
    hit =
      players.find((p) => normName(p.name) === target) ||
      byNumber(players) ||
      players.find((p) => normName(p.name).includes(target) || target.includes(normName(p.name)));
  }
  return hit ? `${hit.teamId}::${hit.name}` : '';
}
