// Warte-/„Du bist allein"-Musik im Huddle (wie bei Slack): ein entspannter
// Lo-Fi-Loop, komplett live per WebAudio erzeugt – keine Datei, kein Download,
// keine Lizenzfragen. Liegt unter /assets/huddle-music.mp3 eine eigene Musik
// (mit Nutzungsrechten!), wird stattdessen diese in Schleife gespielt.
// Die Musik läuft NUR lokal aus dem Lautsprecher – sie wird nie ins Gespräch
// übertragen.

const FILE_URL = '/assets/huddle-music.mp3';
let fileCheck: Promise<boolean> | null = null;
function hasMusicFile(): Promise<boolean> {
  if (!fileCheck) {
    fileCheck = fetch(FILE_URL, { method: 'HEAD' })
      .then((r) => r.ok && (r.headers.get('content-type') ?? '').startsWith('audio/'))
      .catch(() => false);
  }
  return fileCheck;
}

// Frequenz einer MIDI-Note.
const hz = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);

// Fmaj7 – Em7 – Dm7 – Cmaj7 (je ein Takt), dazu eine kleine Melodie.
const CHORDS = [
  [53, 57, 60, 64], // F A C E
  [52, 55, 59, 62], // E G B D
  [50, 53, 57, 60], // D F A C
  [48, 52, 55, 59], // C E G B
];
const BASS = [41, 40, 38, 36];
// [Takt-Position in Schlägen, MIDI-Note, Dauer in Schlägen]
const MELODY: [number, number, number][][] = [
  [[0.5, 76, 0.5], [1.5, 79, 0.5], [2.5, 81, 1.2]],
  [[0.5, 79, 0.5], [1.5, 76, 0.5], [2, 74, 1.5]],
  [[0.5, 77, 0.5], [1, 76, 0.5], [2, 72, 1.5]],
  [[0.5, 74, 0.5], [1.5, 76, 0.5], [2.5, 79, 1.2]],
];
const BPM = 76;

function synthLoop(ctx: AudioContext): () => void {
  const beat = 60 / BPM;
  const bar = beat * 4;
  const master = ctx.createGain();
  master.gain.value = 0;
  const warm = ctx.createBiquadFilter();
  warm.type = 'lowpass';
  warm.frequency.value = 3800;
  master.connect(warm).connect(ctx.destination);
  master.gain.linearRampToValueAtTime(0.11, ctx.currentTime + 2.5); // sanft einblenden

  // Rauschen für die Hi-Hats (einmal erzeugt).
  const noise = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.2), ctx.sampleRate);
  const nd = noise.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;

  const keys = (t: number, notes: number[], vel: number) => {
    notes.forEach((n, i) => {
      const at = t + i * 0.018; // leicht „gestrummt"
      const g = ctx.createGain();
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 1700;
      g.gain.setValueAtTime(0, at);
      g.gain.linearRampToValueAtTime(0.16 * vel, at + 0.02);
      g.gain.exponentialRampToValueAtTime(0.05 * vel, at + 0.9);
      g.gain.exponentialRampToValueAtTime(0.0001, at + bar * 0.95);
      const o1 = ctx.createOscillator();
      o1.type = 'sine';
      o1.frequency.value = hz(n);
      const o2 = ctx.createOscillator();
      o2.type = 'triangle';
      o2.frequency.value = hz(n + 12);
      o2.detune.value = 6;
      const g2 = ctx.createGain();
      g2.gain.value = 0.18;
      o1.connect(g);
      o2.connect(g2).connect(g);
      g.connect(lp).connect(master);
      o1.start(at);
      o2.start(at);
      o1.stop(at + bar);
      o2.stop(at + bar);
    });
  };
  const bass = (t: number, n: number, len: number) => {
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = hz(n);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.32, t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    o.connect(g).connect(master);
    o.start(t);
    o.stop(t + len + 0.05);
  };
  const lead = (t: number, n: number, len: number) => {
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = hz(n);
    const vib = ctx.createOscillator();
    vib.frequency.value = 5;
    const vg = ctx.createGain();
    vg.gain.value = 3;
    vib.connect(vg).connect(o.detune);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.07, t + 0.04);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    o.connect(g).connect(master);
    o.start(t);
    vib.start(t);
    o.stop(t + len + 0.05);
    vib.stop(t + len + 0.05);
  };
  const hat = (t: number, vel: number) => {
    const s = ctx.createBufferSource();
    s.buffer = noise;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 7500;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.05 * vel, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    s.connect(hp).connect(g).connect(master);
    s.start(t);
    s.stop(t + 0.06);
  };
  const kick = (t: number) => {
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(110, t);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.18);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.35, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    o.connect(g).connect(master);
    o.start(t);
    o.stop(t + 0.32);
  };

  let barIdx = 0;
  let nextBar = ctx.currentTime + 0.15;
  const schedule = () => {
    while (nextBar < ctx.currentTime + 1.5) {
      const t = nextBar;
      const i = barIdx % 4;
      keys(t, CHORDS[i], 1);
      keys(t + beat * 2.5, CHORDS[i].slice(1), 0.55);
      bass(t, BASS[i], beat * 2.2);
      bass(t + beat * 2.5, BASS[i], beat * 1.3);
      // Melodie erst ab der zweiten Runde – erst ankommen lassen.
      if (barIdx >= 4) for (const [pos, n, len] of MELODY[i]) lead(t + pos * beat, n, len * beat);
      for (let e = 0; e < 8; e++) hat(t + e * (beat / 2) + (e % 2 ? beat * 0.08 : 0), e % 2 ? 0.6 : 1); // leichter Swing
      kick(t);
      kick(t + beat * 2);
      barIdx += 1;
      nextBar += bar;
    }
  };
  schedule();
  const timer = window.setInterval(schedule, 250);

  return () => {
    window.clearInterval(timer);
    const now = ctx.currentTime;
    master.gain.cancelScheduledValues(now);
    master.gain.setValueAtTime(master.gain.value, now);
    master.gain.linearRampToValueAtTime(0, now + 0.6);
    window.setTimeout(() => {
      try {
        master.disconnect();
        warm.disconnect();
      } catch {
        /* schon getrennt */
      }
    }, 800);
  };
}

// Startet die Musik; gibt eine Stopp-Funktion zurück.
export function startHoldMusic(getCtx: () => AudioContext | null): () => void {
  let stopped = false;
  let stopFn: (() => void) | null = null;
  void (async () => {
    if (await hasMusicFile()) {
      if (stopped) return;
      const a = new Audio(FILE_URL);
      a.loop = true;
      a.volume = 0.35;
      try {
        await a.play();
        if (stopped) {
          a.pause();
          return;
        }
        stopFn = () => {
          a.pause();
          a.src = '';
        };
        return;
      } catch {
        /* z. B. iOS ohne Tipp-Geste → unten die erzeugte Musik */
      }
    }
    if (stopped) return;
    const ctx = getCtx();
    if (!ctx) return;
    if (ctx.state !== 'running') ctx.resume().catch(() => {});
    stopFn = synthLoop(ctx);
  })();
  return () => {
    stopped = true;
    stopFn?.();
    stopFn = null;
  };
}
