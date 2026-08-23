// Huddle-Client: WLAN-Anruf (Audio + Bildschirm teilen) im Slack-Style.
// Peer-to-Peer über WebRTC mit gratis STUN (keine Anmeldung, keine Kosten).
// Signalisierung per Polling über /api/chat?resource=huddle (kein WebSocket).
import { apiFetch } from './api';
import type { HuddleState, HuddleParticipant } from '../types';

// Nur gratis, öffentliche STUN-Server (keine Registrierung, keine Kosten).
const ICE: RTCConfiguration = {
  iceServers: [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }],
};

interface PollResult {
  huddle: HuddleState | null;
  participants: HuddleParticipant[];
  signals: { senderId: string; kind: string; payload: unknown }[];
}

export const huddlePoll = (params: { conversationId?: string; huddleId?: string }) => {
  const q = params.huddleId
    ? `huddleId=${encodeURIComponent(params.huddleId)}`
    : `conversationId=${encodeURIComponent(params.conversationId ?? '')}`;
  return apiFetch<PollResult>(`/api/chat?resource=huddle&${q}`);
};
export const huddleStart = (conversationId: string) =>
  apiFetch<{ huddle: HuddleState; participants: HuddleParticipant[] }>('/api/chat?resource=huddle', {
    method: 'POST',
    body: JSON.stringify({ op: 'start', conversationId }),
  });
export const huddleJoin = (huddleId: string) =>
  apiFetch<{ huddle: HuddleState; participants: HuddleParticipant[] }>('/api/chat?resource=huddle', {
    method: 'POST',
    body: JSON.stringify({ op: 'join', huddleId }),
  });
export const huddleLeave = (huddleId: string) =>
  apiFetch('/api/chat?resource=huddle', { method: 'POST', body: JSON.stringify({ op: 'leave', huddleId }) });
export const huddleSignal = (huddleId: string, targetId: string, kind: string, payload: unknown) =>
  apiFetch('/api/chat?resource=huddle', { method: 'POST', body: JSON.stringify({ op: 'signal', huddleId, targetId, kind, payload }) });
export const huddleSaveNotes = (huddleId: string, notes: string) =>
  apiFetch('/api/chat?resource=huddle', { method: 'POST', body: JSON.stringify({ op: 'notes', huddleId, notes }) });

// Kann dieses Gerät den Bildschirm teilen? (Auf iPhones/Safari-Mobile nicht.)
export function canShareScreen(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.mediaDevices && typeof navigator.mediaDevices.getDisplayMedia === 'function';
}

interface Peer {
  pc: RTCPeerConnection;
  makingOffer: boolean;
  ignoreOffer: boolean;
  polite: boolean;
  screenTrackId: string | null;
}

// Ein aktiver Huddle als Client-Session (Audio-Mesh + optional Bildschirm).
// „Perfect Negotiation" – beide Seiten dürfen anbieten, Kollisionen werden sauber
// aufgelöst; deshalb funktioniert auch das spätere Hinzufügen des Bildschirms.
export class HuddleSession {
  huddleId: string;
  myId: string;
  private local: MediaStream | null = null;
  private screen: MediaStream | null = null;
  private peers = new Map<string, Peer>();
  private audios = new Map<string, HTMLAudioElement>();
  private pendingIce = new Map<string, RTCIceCandidateInit[]>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;
  // Sprech-Erkennung (leuchtender Rahmen wie bei Slack).
  private audioCtx: AudioContext | null = null;
  private analysers = new Map<string, AnalyserNode>();
  private levelTimer: ReturnType<typeof setInterval> | null = null;
  muted = false;
  sharing = false;
  participants: HuddleParticipant[] = [];
  onParticipants: (p: HuddleParticipant[]) => void = () => {};
  onEnded: () => void = () => {};
  // from = 'me' (eigener Bildschirm) oder Peer-ID; stream = null ⇒ Freigabe beendet.
  onScreen: (from: string, stream: MediaStream | null) => void = () => {};
  // Menge der IDs (myId + Peer-IDs), die GERADE reden.
  onSpeaking: (ids: Set<string>) => void = () => {};

  constructor(huddleId: string, myId: string) {
    this.huddleId = huddleId;
    this.myId = myId;
  }

  async start(): Promise<void> {
    this.local = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    this.setupLevels();
    this.loop();
  }

  // Lautstärke je Teilnehmer messen → wer redet, leuchtet.
  private setupLevels() {
    try {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      this.audioCtx = new AC();
      if (this.local) this.addAnalyser(this.myId, this.local);
      this.levelTimer = setInterval(() => {
        const speaking = new Set<string>();
        for (const [key, an] of this.analysers) {
          if (key === this.myId && this.muted) continue;
          const data = new Uint8Array(an.fftSize);
          an.getByteTimeDomainData(data);
          let sum = 0;
          for (let j = 0; j < data.length; j++) { const v = (data[j] - 128) / 128; sum += v * v; }
          if (Math.sqrt(sum / data.length) > 0.06) speaking.add(key);
        }
        this.onSpeaking(speaking);
      }, 200);
    } catch { /* Sprech-Erkennung optional */ }
  }

  private addAnalyser(key: string, stream: MediaStream) {
    try {
      if (!this.audioCtx || stream.getAudioTracks().length === 0) return;
      const src = this.audioCtx.createMediaStreamSource(stream);
      const an = this.audioCtx.createAnalyser();
      an.fftSize = 512;
      src.connect(an); // NICHT an destination – nur messen, kein Echo
      this.analysers.set(key, an);
    } catch { /* egal */ }
  }

  private loop = async () => {
    if (this.stopped) return;
    try {
      const r = await huddlePoll({ huddleId: this.huddleId });
      if (this.stopped) return;
      if (!r.huddle || r.huddle.endedAt) { this.stop(); this.onEnded(); return; }
      this.participants = r.participants;
      this.onParticipants(r.participants);
      const others = new Set(r.participants.map((p) => p.userId).filter((id) => id !== this.myId));
      for (const id of others) if (!this.peers.has(id)) this.makePeer(id);
      for (const id of [...this.peers.keys()]) if (!others.has(id)) this.closePeer(id);
      for (const s of r.signals) await this.onSignal(s.senderId, s.kind, s.payload);
    } catch {
      /* Netz-Hänger – nächster Tick */
    }
    if (!this.stopped) this.timer = setTimeout(this.loop, 1500);
  };

  private makePeer(peerId: string): Peer {
    const pc = new RTCPeerConnection(ICE);
    const peer: Peer = { pc, makingOffer: false, ignoreOffer: false, polite: this.myId > peerId, screenTrackId: null };
    this.peers.set(peerId, peer);
    if (this.local) for (const t of this.local.getTracks()) pc.addTrack(t, this.local);
    if (this.screen) for (const t of this.screen.getVideoTracks()) pc.addTrack(t, this.screen);

    pc.onicecandidate = (e) => {
      if (e.candidate) huddleSignal(this.huddleId, peerId, 'ice', e.candidate.toJSON()).catch(() => {});
    };
    pc.onnegotiationneeded = async () => {
      try {
        peer.makingOffer = true;
        await pc.setLocalDescription();
        await huddleSignal(this.huddleId, peerId, 'desc', pc.localDescription);
      } catch { /* ignorieren */ } finally {
        peer.makingOffer = false;
      }
    };
    pc.ontrack = (e) => {
      const stream = e.streams[0];
      if (e.track.kind === 'audio') {
        let a = this.audios.get(peerId);
        if (!a) {
          a = document.createElement('audio');
          a.autoplay = true;
          (a as HTMLAudioElement & { playsInline?: boolean }).playsInline = true;
          a.style.display = 'none';
          document.body.appendChild(a);
          this.audios.set(peerId, a);
        }
        a.srcObject = stream;
        a.play().catch(() => {});
        this.addAnalyser(peerId, stream);
      } else if (e.track.kind === 'video') {
        this.onScreen(peerId, stream);
        const clear = () => this.onScreen(peerId, null);
        e.track.addEventListener('ended', clear);
        e.track.addEventListener('mute', clear);
      }
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed') this.closePeer(peerId);
    };
    return peer;
  }

  private async onSignal(senderId: string, kind: string, payload: unknown) {
    const peer = this.peers.get(senderId) ?? this.makePeer(senderId);
    const pc = peer.pc;
    try {
      if (kind === 'desc') {
        const desc = payload as RTCSessionDescriptionInit;
        const offerCollision = desc.type === 'offer' && (peer.makingOffer || pc.signalingState !== 'stable');
        peer.ignoreOffer = !peer.polite && offerCollision;
        if (peer.ignoreOffer) return;
        await pc.setRemoteDescription(desc); // impliziter Rollback bei Bedarf
        await this.flushIce(senderId, pc);
        if (desc.type === 'offer') {
          await pc.setLocalDescription();
          await huddleSignal(this.huddleId, senderId, 'desc', pc.localDescription).catch(() => {});
        }
      } else if (kind === 'ice') {
        const cand = payload as RTCIceCandidateInit;
        if (pc.remoteDescription) {
          await pc.addIceCandidate(cand).catch(() => { if (!peer.ignoreOffer) throw new Error('ice'); });
        } else {
          const list = this.pendingIce.get(senderId) ?? [];
          list.push(cand);
          this.pendingIce.set(senderId, list);
        }
      }
    } catch { /* Signal ignorieren */ }
  }

  private async flushIce(peerId: string, pc: RTCPeerConnection) {
    const list = this.pendingIce.get(peerId);
    if (!list) return;
    this.pendingIce.delete(peerId);
    for (const c of list) await pc.addIceCandidate(c).catch(() => {});
  }

  private closePeer(peerId: string) {
    const peer = this.peers.get(peerId);
    if (peer) {
      peer.pc.onicecandidate = null;
      peer.pc.ontrack = null;
      peer.pc.onnegotiationneeded = null;
      peer.pc.onconnectionstatechange = null;
      try { peer.pc.close(); } catch { /* egal */ }
      this.peers.delete(peerId);
    }
    const a = this.audios.get(peerId);
    if (a) { a.srcObject = null; a.remove(); this.audios.delete(peerId); }
    const an = this.analysers.get(peerId);
    if (an) { try { an.disconnect(); } catch { /* egal */ } this.analysers.delete(peerId); }
    this.pendingIce.delete(peerId);
    this.onScreen(peerId, null);
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    if (this.local) for (const t of this.local.getAudioTracks()) t.enabled = !this.muted;
    return this.muted;
  }

  // Bildschirm teilen starten (fügt allen Peers eine Videospur hinzu → Renegotiation).
  async startScreen(): Promise<MediaStream> {
    const s = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
    this.screen = s;
    this.sharing = true;
    for (const [, peer] of this.peers) {
      for (const t of s.getVideoTracks()) {
        const sender = peer.pc.addTrack(t, s);
        peer.screenTrackId = sender.track ? sender.track.id : null;
      }
    }
    // Wenn der Nutzer im Browser „Freigabe beenden" tippt.
    const vt = s.getVideoTracks()[0];
    if (vt) vt.addEventListener('ended', () => this.stopScreen());
    this.onScreen('me', s);
    return s;
  }

  stopScreen(): void {
    if (!this.screen) return;
    const s = this.screen;
    this.screen = null;
    this.sharing = false;
    for (const [, peer] of this.peers) {
      for (const sender of peer.pc.getSenders()) {
        if (sender.track && sender.track.kind === 'video') {
          try { peer.pc.removeTrack(sender); } catch { /* egal */ }
        }
      }
    }
    for (const t of s.getTracks()) t.stop();
    this.onScreen('me', null);
  }

  stop() {
    if (this.stopped) return;
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    if (this.levelTimer) { clearInterval(this.levelTimer); this.levelTimer = null; }
    if (this.screen) { for (const t of this.screen.getTracks()) t.stop(); this.screen = null; }
    for (const id of [...this.peers.keys()]) this.closePeer(id);
    this.analysers.clear();
    if (this.audioCtx) { this.audioCtx.close().catch(() => {}); this.audioCtx = null; }
    if (this.local) for (const t of this.local.getTracks()) t.stop();
    this.local = null;
  }
}
