// Huddle-Client: WLAN-Anruf (Audio) im Slack-Style. Peer-to-Peer über WebRTC
// mit gratis STUN (keine Anmeldung, keine laufenden Kosten). Die Signalisierung
// läuft per Polling über /api/chat?resource=huddle (kein WebSocket nötig).
import { apiFetch } from './api';
import type { HuddleState, HuddleParticipant } from '../types';

// Nur gratis, öffentliche STUN-Server (keine Registrierung, keine Kosten).
// Reine Direktverbindung – im WLAN zuverlässig. (Ein Relais-Server käme nur bei
// mobilen Daten in Frage – bewusst NICHT drin, damit garantiert nichts kostet.)
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

// Ein aktiver Huddle als Client-Session (Mikro + Mesh aus Peer-Verbindungen).
export class HuddleSession {
  huddleId: string;
  myId: string;
  private local: MediaStream | null = null;
  private pcs = new Map<string, RTCPeerConnection>();
  private audios = new Map<string, HTMLAudioElement>();
  private pendingIce = new Map<string, RTCIceCandidateInit[]>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;
  muted = false;
  participants: HuddleParticipant[] = [];
  onParticipants: (p: HuddleParticipant[]) => void = () => {};
  onEnded: () => void = () => {};

  constructor(huddleId: string, myId: string) {
    this.huddleId = huddleId;
    this.myId = myId;
  }

  async start(): Promise<void> {
    this.local = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    this.loop();
  }

  private loop = async () => {
    if (this.stopped) return;
    try {
      const r = await huddlePoll({ huddleId: this.huddleId });
      if (this.stopped) return;
      if (!r.huddle || r.huddle.endedAt) {
        this.stop();
        this.onEnded();
        return;
      }
      this.participants = r.participants;
      this.onParticipants(r.participants);
      // Mesh pflegen: für jeden anderen aktiven Teilnehmer eine Verbindung.
      const others = new Set(r.participants.map((p) => p.userId).filter((id) => id !== this.myId));
      for (const id of others) if (!this.pcs.has(id)) this.connectTo(id);
      // Weggegangene Peers abbauen.
      for (const id of [...this.pcs.keys()]) if (!others.has(id)) this.closePeer(id);
      // Signale abarbeiten.
      for (const s of r.signals) await this.onSignal(s.senderId, s.kind, s.payload);
    } catch {
      /* Netz-Hänger – beim nächsten Tick erneut */
    }
    if (!this.stopped) this.timer = setTimeout(this.loop, 1500);
  };

  private makePeer(peerId: string): RTCPeerConnection {
    const pc = new RTCPeerConnection(ICE);
    this.pcs.set(peerId, pc);
    if (this.local) for (const t of this.local.getTracks()) pc.addTrack(t, this.local);
    pc.onicecandidate = (e) => {
      if (e.candidate) huddleSignal(this.huddleId, peerId, 'ice', e.candidate.toJSON()).catch(() => {});
    };
    pc.ontrack = (e) => {
      let a = this.audios.get(peerId);
      if (!a) {
        a = document.createElement('audio');
        a.autoplay = true;
        (a as HTMLAudioElement & { playsInline?: boolean }).playsInline = true;
        a.style.display = 'none';
        document.body.appendChild(a);
        this.audios.set(peerId, a);
      }
      a.srcObject = e.streams[0];
      a.play().catch(() => {});
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed') {
        // Verbindung neu versuchen (einfacher Reset).
        this.closePeer(peerId);
      }
    };
    return pc;
  }

  // „Kleinere ID ruft an" – so bietet nur EINE Seite an (kein Glare).
  private connectTo(peerId: string) {
    const pc = this.makePeer(peerId);
    if (this.myId < peerId) {
      pc.createOffer()
        .then((o) => pc.setLocalDescription(o).then(() => huddleSignal(this.huddleId, peerId, 'offer', o)))
        .catch(() => {});
    }
  }

  private async onSignal(senderId: string, kind: string, payload: unknown) {
    let pc = this.pcs.get(senderId);
    if (kind === 'offer') {
      if (!pc) pc = this.makePeer(senderId);
      await pc.setRemoteDescription(payload as RTCSessionDescriptionInit);
      await this.flushIce(senderId, pc);
      const ans = await pc.createAnswer();
      await pc.setLocalDescription(ans);
      await huddleSignal(this.huddleId, senderId, 'answer', ans).catch(() => {});
    } else if (kind === 'answer') {
      if (pc) {
        await pc.setRemoteDescription(payload as RTCSessionDescriptionInit);
        await this.flushIce(senderId, pc);
      }
    } else if (kind === 'ice') {
      const cand = payload as RTCIceCandidateInit;
      if (pc && pc.remoteDescription) {
        await pc.addIceCandidate(cand).catch(() => {});
      } else {
        // Kandidat kam vor der Beschreibung – zwischenspeichern.
        const list = this.pendingIce.get(senderId) ?? [];
        list.push(cand);
        this.pendingIce.set(senderId, list);
      }
    }
  }

  private async flushIce(peerId: string, pc: RTCPeerConnection) {
    const list = this.pendingIce.get(peerId);
    if (!list) return;
    this.pendingIce.delete(peerId);
    for (const c of list) await pc.addIceCandidate(c).catch(() => {});
  }

  private closePeer(peerId: string) {
    const pc = this.pcs.get(peerId);
    if (pc) {
      pc.onicecandidate = null;
      pc.ontrack = null;
      pc.onconnectionstatechange = null;
      try { pc.close(); } catch { /* egal */ }
      this.pcs.delete(peerId);
    }
    const a = this.audios.get(peerId);
    if (a) {
      a.srcObject = null;
      a.remove();
      this.audios.delete(peerId);
    }
    this.pendingIce.delete(peerId);
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    if (this.local) for (const t of this.local.getAudioTracks()) t.enabled = !this.muted;
    return this.muted;
  }

  stop() {
    if (this.stopped) return;
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    for (const id of [...this.pcs.keys()]) this.closePeer(id);
    if (this.local) for (const t of this.local.getTracks()) t.stop();
    this.local = null;
  }
}
