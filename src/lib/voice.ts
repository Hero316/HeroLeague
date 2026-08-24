import { apiFetch } from './api';
import type { ActionKey } from '../types';

// ===========================================================================
// Voice-Tracking – Frontend-Anbindung (Statistics Center).
// Nimmt eine Spiel-Erzählung als Audio (oder Text) und lässt sie von Gemini
// (serverseitig) in Tracking-Ereignisse umwandeln. Der Nutzer kontrolliert die
// Liste und übernimmt sie per Klick in das Erfassungs-Raster.
// ===========================================================================

export interface VoiceEvent {
  team: string; // Team-Name aus dem Kader (oder "home"/"away")
  player: string; // Spielername aus dem Kader
  action: ActionKey; // Tracking-Taste
  delta: number; // Anzahl (meist 1)
  quote?: string;
  confidence?: number;
  note?: string;
}

export interface VoiceResult {
  transcript: string;
  events: VoiceEvent[];
}

export interface VoiceRosterPlayer {
  team: 'home' | 'away';
  teamName: string;
  name: string;
  role: 'field' | 'keeper';
}

export interface VoiceContext {
  homeTeam: string;
  awayTeam: string;
  players: VoiceRosterPlayer[];
  rules?: string;
}

// Audio (per Blob-URL) oder Transkript auswerten lassen.
export function parseVoice(payload: {
  audioUrl?: string;
  mimeType?: string;
  transcript?: string;
  context: VoiceContext;
}): Promise<VoiceResult> {
  return apiFetch<VoiceResult>('/api/stats?resource=voice', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

// Saisonweite Tracking-Regeln (frei formulierter Text) laden/speichern.
export function fetchTrackingRules(): Promise<{ text: string }> {
  return apiFetch<{ text: string }>('/api/stats?resource=tracking-rules');
}

export function saveTrackingRules(text: string): Promise<{ ok: boolean; text: string }> {
  return apiFetch('/api/stats?resource=tracking-rules', {
    method: 'POST',
    body: JSON.stringify({ text }),
  });
}

// ---------------------------------------------------------------------------
// Aufnahme → WAV (16 kHz mono). Gemini akzeptiert kein webm/opus (was Chrome
// aufnimmt), daher dekodieren wir die Aufnahme im Browser und schreiben sie als
// schlankes 16-kHz-Mono-WAV neu – ein Format, das Gemini sicher versteht und
// das für Sprache völlig ausreicht.
// ---------------------------------------------------------------------------

type AudioCtor = typeof AudioContext;

function getAudioContextCtor(): AudioCtor | null {
  const w = window as unknown as { AudioContext?: AudioCtor; webkitAudioContext?: AudioCtor };
  return w.AudioContext || w.webkitAudioContext || null;
}

const TARGET_RATE = 16000;

export async function blobToWav16kMono(input: Blob): Promise<Blob> {
  const Ctor = getAudioContextCtor();
  if (!Ctor) throw new Error('Audio wird von diesem Browser nicht unterstützt.');

  const arrayBuf = await input.arrayBuffer();
  const decodeCtx = new Ctor();
  let decoded: AudioBuffer;
  try {
    decoded = await decodeCtx.decodeAudioData(arrayBuf.slice(0));
  } finally {
    decodeCtx.close().catch(() => {});
  }

  // Auf 16 kHz Mono resampeln (OfflineAudioContext) – mixt alle Kanäle zusammen.
  const frames = Math.max(1, Math.ceil((decoded.duration || 0) * TARGET_RATE));
  const OfflineCtor =
    (window as unknown as { OfflineAudioContext?: typeof OfflineAudioContext; webkitOfflineAudioContext?: typeof OfflineAudioContext })
      .OfflineAudioContext ||
    (window as unknown as { webkitOfflineAudioContext?: typeof OfflineAudioContext }).webkitOfflineAudioContext;
  if (!OfflineCtor) throw new Error('Audio-Verarbeitung wird von diesem Browser nicht unterstützt.');

  const offline = new OfflineCtor(1, frames, TARGET_RATE);
  const src = offline.createBufferSource();
  src.buffer = decoded;
  src.connect(offline.destination);
  src.start(0);
  const rendered = await offline.startRendering();
  const samples = rendered.getChannelData(0);
  return encodeWav(samples, TARGET_RATE);
}

function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const bytesPerSample = 2; // 16-bit PCM
  const dataSize = samples.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const writeStr = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };

  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * bytesPerSample, true); // byte rate
  view.setUint16(32, bytesPerSample, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  writeStr(36, 'data');
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += 2;
  }
  return new Blob([buffer], { type: 'audio/wav' });
}
