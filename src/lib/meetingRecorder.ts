// ===========================================================================
// Mitschreiben im Huddle: Browser-Spracherkennung für die EIGENE Stimme.
// Kostenlos (im Browser eingebaut), Deutsch. Fertige Sätze werden gesammelt und
// alle paar Sekunden gebündelt an den Server geschickt (wenige Anfragen).
// Chrome beendet die Erkennung nach Pausen von selbst → automatisch neu starten.
// ===========================================================================
import { huddleSendTranscript } from './huddle';

type Rec = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
};

function ctor(): (new () => Rec) | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { SpeechRecognition?: new () => Rec; webkitSpeechRecognition?: new () => Rec };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}
export const canTranscribe = () => ctor() !== null;

export class MeetingRecorder {
  private rec: Rec | null = null;
  private running = false;
  private queue: string[] = [];
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private restartTimer: ReturnType<typeof setTimeout> | null = null;
  private failures = 0;
  // Live-Untertitel der eigenen Stimme (Zwischenergebnis) für die Anzeige.
  onInterim: (text: string) => void = () => {};
  onError: (msg: string) => void = () => {};

  constructor(private huddleId: string) {}

  start() {
    const C = ctor();
    if (!C) {
      this.onError('Dieser Browser kann nicht mitschreiben (am besten Chrome oder Safari nutzen).');
      return;
    }
    if (this.running) return;
    this.running = true;
    this.failures = 0;
    this.spawn(C);
    this.flushTimer = setInterval(() => this.flush(), 4000);
  }

  private spawn(C: new () => Rec) {
    const rec = new C();
    rec.lang = 'de-DE';
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        const t = (r[0]?.transcript || '').trim();
        if (!t) continue;
        if (r.isFinal) {
          this.queue.push(t);
          this.failures = 0;
        } else interim += `${t} `;
      }
      this.onInterim(interim.trim());
    };
    rec.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        this.onError('Mitschreiben wurde vom Browser blockiert (Mikrofon/Spracherkennung erlauben).');
        this.running = false;
      } else if (e.error !== 'no-speech' && e.error !== 'aborted') {
        this.failures++;
      }
    };
    rec.onend = () => {
      this.onInterim('');
      if (!this.running) return;
      if (this.failures > 8) {
        this.onError('Mitschreiben auf diesem Gerät nicht möglich.');
        this.running = false;
        return;
      }
      // Kurz warten und neu starten (Chrome stoppt nach Stille von selbst).
      this.restartTimer = setTimeout(() => {
        if (this.running) this.spawn(C);
      }, 250);
    };
    this.rec = rec;
    try {
      rec.start();
    } catch {
      this.failures++;
    }
  }

  private flush() {
    if (!this.queue.length) return;
    const lines = this.queue.splice(0, this.queue.length);
    huddleSendTranscript(this.huddleId, lines).catch(() => {
      // Netzfehler: Zeilen nicht verlieren – beim nächsten Mal erneut senden.
      this.queue.unshift(...lines);
    });
  }

  stop() {
    this.running = false;
    if (this.restartTimer) clearTimeout(this.restartTimer);
    if (this.flushTimer) clearInterval(this.flushTimer);
    this.flushTimer = null;
    try {
      this.rec?.stop();
    } catch {
      /* egal */
    }
    this.rec = null;
    this.onInterim('');
    this.flush(); // letzte Sätze noch schicken
  }
}
