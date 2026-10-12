import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowUpRight, Instagram } from 'lucide-react';
import { BrandCorner, PartnerBar, useInstagramHandle } from './ObsOverlay';
import { fetchStudio, prettyLink, STUDIO_PARTNERS, type Cue, type CueBody } from '../lib/studio';

// ===========================================================================
// OBS-Overlay für den STUDIO-Stream – /overlay/studio
//
// Transparente Browser-Quelle, zwei Formate:
//   Querformat  1920×1080  → /overlay/studio
//   Hochformat  1080×1920  → /overlay/studio?format=hoch
// Dauerhaft: Hero-League-Logo (+ Instagram) und die Partner-Leiste
// (DVAG fest, Volksbank/Unisport wechseln – wie beim Liga-Stream).
// Dazu spielt es alles ab, was im Admin unter „Live-Regie" ausgelöst wird
// (Konfetti, Emoji-Regen, Schlagzeile, Bauchbinde, Link, Partner, Countdown).
// Die Seite fragt jede Sekunde nach – jeder neue Cue läuft genau einmal.
//
// URL-Parameter:
//   format=hoch|quer   (Standard: automatisch nach Seitenverhältnis)
//   brand=0            Logo + Instagram ausblenden
//   partner=0          Partner-Leiste ausblenden
//   top=150            (Hochformat) Abstand der Kopfzeile von oben in px
//   demo=1             spielt alle Effekte nacheinander ab (zum Einrichten in OBS)
// Die Bühne skaliert sich selbst auf die Größe der Browser-Quelle.
// ===========================================================================

const GOLD = '#FFC53D';
const TEAL = '#22DFC9';
const EASE = [0.22, 1, 0.36, 1] as const;

function params() {
  const q = new URLSearchParams(window.location.search);
  const f = (q.get('format') || '').toLowerCase();
  const portrait = ['hoch', 'portrait', '9x16', 'vertical'].includes(f)
    ? true
    : ['quer', 'landscape', '16x9'].includes(f)
      ? false
      : window.innerHeight > window.innerWidth;
  return {
    portrait,
    brand: q.get('brand') !== '0',
    partner: q.get('partner') !== '0',
    top: Math.max(0, Math.min(800, Number(q.get('top') ?? 150) || 0)),
    demo: q.get('demo') === '1',
  };
}

// Bühne in fester Größe, passend in die Browser-Quelle eingepasst.
function useFit(W: number, H: number) {
  const calc = () => {
    const s = Math.min(window.innerWidth / W, window.innerHeight / H) || 1;
    return { s, x: (window.innerWidth - W * s) / 2, y: (window.innerHeight - H * s) / 2 };
  };
  const [fit, setFit] = useState(calc);
  useLayoutEffect(() => {
    const on = () => setFit(calc());
    on();
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [W, H]);
  return fit;
}

// ---------------------------------------------------------------------------
// Effekte
// ---------------------------------------------------------------------------

// Konfetti auf Canvas: zwei Kanonen aus den unteren Ecken + Regen von oben.
function Confetti({ w, h }: { w: number; h: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx) return;
    const colors = [GOLD, TEAL, '#FFFFFF', '#E83E8C', '#43E5A0', '#FF7A1A', '#9B7BFF'];
    const k = h / 1080;
    const g = 0.36 * k;
    type P = { x: number; y: number; vx: number; vy: number; r: number; vr: number; w: number; h: number; c: string; round: boolean; t: number; vt: number };
    const ps: P[] = [];
    const make = (x: number, y: number, vx: number, vy: number): P => ({
      x,
      y,
      vx,
      vy,
      r: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.3,
      w: 11 + Math.random() * 10,
      h: 6 + Math.random() * 6,
      c: colors[(Math.random() * colors.length) | 0],
      round: Math.random() < 0.18,
      t: Math.random() * Math.PI * 2,
      vt: 0.08 + Math.random() * 0.12,
    });
    const cannon = (x: number, angle: number) => {
      for (let i = 0; i < 190; i++) {
        const a = angle + (Math.random() - 0.5) * 0.75;
        const v = (20 + Math.random() * 15) * k;
        ps.push(make(x, h + 10, Math.cos(a) * v, Math.sin(a) * v));
      }
    };
    cannon(0, -Math.PI / 2.9);
    cannon(w, -Math.PI + Math.PI / 2.9);
    const rain = setTimeout(() => {
      for (let i = 0; i < 170; i++) ps.push(make(Math.random() * w, -20 - Math.random() * h * 0.6, (Math.random() - 0.5) * 3, 2 + Math.random() * 4));
    }, 450);

    let raf = 0;
    let last = performance.now();
    const start = last;
    const term = 7 * k;
    const tick = (now: number) => {
      const f = Math.min(3, (now - last) / 16.67);
      last = now;
      ctx.clearRect(0, 0, w, h);
      let alive = 0;
      for (const p of ps) {
        p.vx *= Math.pow(0.985, f);
        p.vy = p.vy < term ? p.vy + g * f : p.vy * Math.pow(0.97, f);
        p.t += p.vt * f;
        p.r += p.vr * f;
        p.x += (p.vx + Math.sin(p.t) * 1.2) * f;
        p.y += p.vy * f;
        if (p.y > h + 40) continue;
        alive++;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.r);
        ctx.scale(1, Math.cos(p.t)); // Flattern
        ctx.fillStyle = p.c;
        if (p.round) {
          ctx.beginPath();
          ctx.arc(0, 0, p.h * 0.7, 0, Math.PI * 2);
          ctx.fill();
        } else ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      }
      if ((alive > 0 || now - start < 1000) && now - start < 11_000) raf = requestAnimationFrame(tick);
      else ctx.clearRect(0, 0, w, h);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(rain);
    };
  }, [w, h]);
  return <canvas ref={ref} width={w} height={h} className="absolute inset-0" />;
}

function graphemes(s: string): string[] {
  try {
    const Seg = (Intl as unknown as { Segmenter?: new (l?: string, o?: { granularity: string }) => { segment: (x: string) => Iterable<{ segment: string }> } }).Segmenter;
    if (Seg) return Array.from(new Seg(undefined, { granularity: 'grapheme' }).segment(s), (x) => x.segment).filter((x) => x.trim());
  } catch {
    /* ältere Browser */
  }
  return Array.from(s).filter((x) => x.trim());
}

// Emojis steigen wie Live-Reaktionen von unten auf.
function EmojiRain({ emoji, ms, w, h }: { emoji: string; ms: number; w: number; h: number }) {
  const items = useMemo(() => {
    const set = graphemes(emoji || '🔥');
    const span = Math.max(1, ms / 1000 - 2.5);
    const n = Math.round(Math.max(24, Math.min(110, span * 7)));
    return Array.from({ length: n }, (_, i) => ({
      i,
      e: set[(Math.random() * set.length) | 0] || '🔥',
      x: 40 + Math.random() * (w - 160),
      delay: Math.random() * span,
      dur: 2.6 + Math.random() * 2,
      size: 64 + Math.random() * 80,
      sway: (Math.random() - 0.5) * 220,
      rot: (Math.random() - 0.5) * 50,
    }));
  }, [emoji, ms, w]);
  return (
    <div className="absolute inset-0 overflow-hidden">
      {items.map((it) => (
        <motion.span
          key={it.i}
          className="absolute left-0 top-0 leading-none drop-shadow-[0_8px_18px_rgba(0,0,0,.45)]"
          style={{ fontSize: it.size }}
          initial={{ x: it.x, y: h + 60, opacity: 0, scale: 0.5, rotate: 0 }}
          animate={{
            x: [it.x, it.x + it.sway, it.x - it.sway * 0.4],
            y: [h + 60, h * 0.45, -it.size - 80],
            opacity: [0, 1, 1, 0],
            scale: [0.5, 1.1, 1, 0.9],
            rotate: [0, it.rot, -it.rot * 0.6],
          }}
          transition={{ duration: it.dur, delay: it.delay, ease: 'easeOut', times: [0, 0.45, 1], opacity: { duration: it.dur, delay: it.delay, times: [0, 0.12, 0.75, 1] } }}
        >
          {it.e}
        </motion.span>
      ))}
    </div>
  );
}

// Dünner Balken, der die verbleibende Zeit anzeigt.
function TimeBar({ ms, color = TEAL }: { ms: number; color?: string }) {
  return (
    <motion.div
      className="absolute left-0 bottom-0 h-[4px] w-full origin-left"
      style={{ background: color }}
      initial={{ scaleX: 1 }}
      animate={{ scaleX: 0 }}
      transition={{ duration: Math.max(0.5, ms / 1000 - 0.4), ease: 'linear' }}
    />
  );
}

// Licht-Sweep einmal quer über eine Karte.
function Shine({ delay = 0.45 }: { delay?: number }) {
  return (
    <motion.div
      className="pointer-events-none absolute inset-y-0 w-[40%]"
      style={{ background: 'linear-gradient(100deg, transparent, rgba(255,255,255,.22), transparent)' }}
      initial={{ left: '-45%' }}
      animate={{ left: '120%' }}
      transition={{ duration: 0.9, delay, ease: 'easeInOut' }}
    />
  );
}

// ---------------------------------------------------------------------------
// Einblendungen
// ---------------------------------------------------------------------------

function Headline({ cue, portrait }: { cue: Cue; portrait: boolean }) {
  // Schriftgröße so, dass das längste Wort in eine Zeile passt und lange Titel nicht ausufern.
  const title = cue.title || 'Hero League';
  const longest = Math.max(...title.split(' ').map((w) => w.length), 1);
  const base = portrait ? 160 : 210;
  const size = Math.round(Math.max(56, Math.min(base, (portrait ? 1750 : 3200) / longest, title.length > 18 ? (base * 18) / title.length + 30 : base)));
  return (
    <motion.div className="absolute inset-0 grid place-items-center" exit={{ opacity: 0, transition: { duration: 0.35 } }}>
      {/* Abdunkeln, damit der Text auf jedem Kamerabild lesbar ist */}
      <motion.div
        className="absolute inset-0"
        style={{ background: 'radial-gradient(ellipse at center, rgba(0,0,0,.62) 0%, rgba(0,0,0,.35) 45%, transparent 75%)' }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4 }}
      />
      {/* kurzer Blitz */}
      <motion.div
        className="absolute inset-0"
        style={{ background: 'radial-gradient(circle at center, rgba(255,255,255,.55), transparent 60%)' }}
        initial={{ opacity: 0.9 }}
        animate={{ opacity: 0 }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
      />
      <div className={`relative flex flex-col items-center text-center ${portrait ? 'px-14' : 'px-24'}`}>
        <div className="flex items-center gap-5 mb-4">
          <motion.span className="h-[3px] w-[120px] origin-right" style={{ background: GOLD }} initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: 0.5, delay: 0.25, ease: EASE }} />
          <motion.span
            className="font-sans font-black uppercase tracking-[6px] text-[26px] text-white/85"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.3 }}
          >
            Hero League
          </motion.span>
          <motion.span className="h-[3px] w-[120px] origin-left" style={{ background: GOLD }} initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: 0.5, delay: 0.25, ease: EASE }} />
        </div>
        <motion.div
          initial={{ scale: 1.7, opacity: 0, filter: 'blur(20px)' }}
          animate={{ scale: 1, opacity: 1, filter: 'blur(0px)' }}
          transition={{ duration: 0.75, ease: [0.16, 1, 0.3, 1] }}
          className="drop-shadow-[0_14px_40px_rgba(0,0,0,.65)]"
        >
          <div
            className="font-display font-black uppercase italic leading-[.88] tracking-tight bg-clip-text text-transparent break-words"
            style={{ fontSize: size, backgroundImage: `linear-gradient(180deg, #FFFFFF 35%, #FFE7A3 62%, ${GOLD} 100%)`, paddingRight: '0.08em' }}
          >
            {title}
          </div>
        </motion.div>
        {cue.text && (
          <motion.div
            className={`mt-6 font-sans font-bold text-white/90 ${portrait ? 'text-[40px]' : 'text-[44px]'} leading-tight drop-shadow-[0_6px_20px_rgba(0,0,0,.8)]`}
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.45, ease: EASE }}
          >
            {cue.text}
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}

function LowerThird({ cue, ms, portrait }: { cue: Cue; ms: number; portrait: boolean }) {
  return (
    <motion.div
      className={portrait ? 'absolute left-[60px] right-[60px] top-[1150px] flex justify-center' : 'absolute left-[80px] bottom-[80px] max-w-[1100px]'}
      exit={{ opacity: 0, x: -50, transition: { duration: 0.35, ease: 'easeIn' } }}
    >
      <div className="flex items-stretch max-w-full">
        <motion.div
          className="w-[12px] rounded-l-[6px] origin-bottom shrink-0"
          style={{ background: `linear-gradient(180deg, ${GOLD}, ${TEAL})` }}
          initial={{ scaleY: 0 }}
          animate={{ scaleY: 1 }}
          transition={{ duration: 0.35, ease: EASE }}
        />
        <motion.div
          className="relative overflow-hidden rounded-r-[20px] bg-[rgba(6,14,15,.9)] border border-l-0 border-white/12 shadow-[0_24px_60px_-14px_rgba(0,0,0,.9)] min-w-0"
          initial={{ clipPath: 'inset(0 100% 0 0)' }}
          animate={{ clipPath: 'inset(0 0% 0 0)' }}
          transition={{ duration: 0.6, delay: 0.15, ease: EASE }}
        >
          <div className="px-9 pt-6 pb-7">
            <motion.div
              className={`font-display font-black uppercase leading-[.95] tracking-tight text-white ${portrait ? 'text-[68px]' : 'text-[72px]'} break-words`}
              initial={{ x: -40, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.32, ease: EASE }}
            >
              {cue.title}
            </motion.div>
            {cue.text && (
              <motion.div
                className="mt-2 font-sans font-semibold text-[30px] leading-snug text-white/75 break-words"
                initial={{ x: -30, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ duration: 0.5, delay: 0.45, ease: EASE }}
              >
                {cue.text}
              </motion.div>
            )}
          </div>
          <Shine delay={0.75} />
          <TimeBar ms={ms} color={GOLD} />
        </motion.div>
      </div>
    </motion.div>
  );
}

function LinkCard({ cue, ms, portrait }: { cue: Cue; ms: number; portrait: boolean }) {
  const isInsta = /instagram\.com|^@/i.test(cue.link);
  const shown = isInsta && !/^@/.test(cue.link) ? `@${prettyLink(cue.link).replace(/^instagram\.com\//i, '')}` : prettyLink(cue.link);
  return (
    <motion.div
      className={portrait ? 'absolute left-[50px] right-[50px] top-[1060px] flex justify-center' : 'absolute left-[80px] bottom-[80px] max-w-[1120px]'}
      initial={{ opacity: 0, y: 70, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 40, scale: 0.95, transition: { duration: 0.35, ease: 'easeIn' } }}
      transition={{ type: 'spring', stiffness: 260, damping: 22 }}
    >
      <div
        className="relative overflow-hidden flex items-center gap-7 rounded-[30px] bg-[rgba(6,14,15,.93)] border-2 px-7 py-6 max-w-full"
        style={{ borderColor: isInsta ? 'rgba(221,42,123,.6)' : 'rgba(34,223,201,.55)', boxShadow: `0 30px 80px -20px rgba(0,0,0,.95), 0 0 60px -10px ${isInsta ? 'rgba(221,42,123,.45)' : 'rgba(34,223,201,.4)'}` }}
      >
        <div className="relative shrink-0">
          <motion.span
            className="absolute inset-0 rounded-[26px]"
            style={{ border: `3px solid ${isInsta ? '#DD2A7B' : TEAL}` }}
            animate={{ scale: [1, 1.35], opacity: [0.7, 0] }}
            transition={{ duration: 1.4, repeat: Infinity, ease: 'easeOut' }}
          />
          <span
            className="relative grid place-items-center w-[120px] h-[120px] rounded-[26px]"
            style={{ background: isInsta ? 'linear-gradient(45deg,#F58529,#DD2A7B 55%,#8134AF)' : `linear-gradient(135deg, ${TEAL}, #0E8F80)` }}
          >
            {isInsta ? <Instagram className="w-[64px] h-[64px] text-white" strokeWidth={2.2} /> : <ArrowUpRight className="w-[72px] h-[72px] text-[#04120d]" strokeWidth={2.6} />}
          </span>
        </div>
        <div className="min-w-0">
          {cue.title && (
            <motion.div
              className="font-sans font-black uppercase tracking-[3px] text-[26px] leading-none"
              style={{ color: GOLD }}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.25, duration: 0.4 }}
            >
              {cue.title}
            </motion.div>
          )}
          <motion.div
            className={`mt-2 font-display font-black tracking-tight text-white leading-[1] break-all ${portrait ? 'text-[60px]' : 'text-[72px]'}`}
            initial={{ opacity: 0, x: -24 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.35, duration: 0.45, ease: EASE }}
          >
            {shown}
          </motion.div>
          {cue.text && (
            <motion.div
              className="mt-2 font-sans font-semibold text-[28px] text-white/70 leading-snug"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5, duration: 0.4 }}
            >
              {cue.text}
            </motion.div>
          )}
        </div>
        <Shine delay={0.6} />
        <TimeBar ms={ms} color={isInsta ? '#DD2A7B' : TEAL} />
      </div>
    </motion.div>
  );
}

function PartnerSpotlight({ cue, portrait }: { cue: Cue; portrait: boolean }) {
  const p = STUDIO_PARTNERS[(cue.partner || 'dvag') as keyof typeof STUDIO_PARTNERS] ?? STUDIO_PARTNERS.dvag;
  return (
    <motion.div className="absolute inset-0 grid place-items-center" exit={{ opacity: 0, scale: 0.94, transition: { duration: 0.35 } }}>
      <motion.div
        className="absolute inset-0"
        style={{ background: 'radial-gradient(ellipse at center, rgba(0,0,0,.6) 0%, rgba(0,0,0,.3) 45%, transparent 75%)' }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
      />
      <motion.div
        className="absolute w-[900px] h-[900px] rounded-full"
        style={{ background: 'radial-gradient(circle, rgba(255,197,61,.35), transparent 65%)' }}
        animate={{ scale: [0.9, 1.08, 0.9], opacity: [0.7, 1, 0.7] }}
        transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
      />
      <div className="relative flex flex-col items-center px-12">
        <motion.div
          className="font-sans font-black uppercase tracking-[7px] text-[30px] mb-7 text-center"
          style={{ color: GOLD }}
          initial={{ opacity: 0, y: -16, letterSpacing: '18px' }}
          animate={{ opacity: 1, y: 0, letterSpacing: '7px' }}
          transition={{ duration: 0.6, ease: EASE }}
        >
          {cue.title || p.label}
        </motion.div>
        <motion.div
          className="relative overflow-hidden rounded-[36px] shadow-[0_40px_100px_-20px_rgba(0,0,0,.95)]"
          style={{ perspective: 1000 }}
          initial={{ opacity: 0, scale: 0.7, rotateX: 30 }}
          animate={{ opacity: 1, scale: 1, rotateX: 0 }}
          transition={{ type: 'spring', stiffness: 180, damping: 18, delay: 0.1 }}
        >
          {p.dark ? (
            <div
              className={`flex ${portrait ? 'flex-col text-center' : 'flex-row'} items-center gap-9 px-14 py-11 border-2 border-[rgba(226,196,90,.55)] rounded-[36px]`}
              style={{ background: 'linear-gradient(135deg, #2a2412, #0d0f0a 70%)' }}
            >
              <img src={p.logo} alt={p.name} className="h-[170px] w-auto shrink-0" />
              <div>
                <div className="font-display font-black uppercase text-white text-[76px] leading-[.95] tracking-tight">{p.name}</div>
                {p.sub && <div className="mt-2 font-sans font-bold text-[32px] text-white/70">{p.sub}</div>}
              </div>
            </div>
          ) : (
            <div className="grid place-items-center bg-white px-16 py-12 rounded-[36px] min-w-[620px]">
              <img src={p.logo} alt={p.name} className="h-[170px] max-w-[760px] w-auto object-contain" />
            </div>
          )}
          <Shine delay={0.7} />
        </motion.div>
        {cue.text && (
          <motion.div
            className="mt-8 font-sans font-bold text-[40px] text-white/90 text-center leading-tight drop-shadow-[0_6px_20px_rgba(0,0,0,.8)]"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5, duration: 0.5, ease: EASE }}
          >
            {cue.text}
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}

function Countdown({ cue, startedAt, w, h }: { cue: Cue; startedAt: number; w: number; h: number }) {
  const total = cue.duration;
  const calc = () => Math.max(0, Math.ceil(total - (performance.now() - startedAt) / 1000));
  const [left, setLeft] = useState(calc);
  useEffect(() => {
    const id = setInterval(() => setLeft(calc()), 100);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startedAt, total]);
  const R = 230;
  const C = 2 * Math.PI * R;
  const hot = left <= 3 && left > 0;
  const mm = left >= 60 ? `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}` : String(left);
  return (
    <motion.div className="absolute inset-0 grid place-items-center" exit={{ opacity: 0, transition: { duration: 0.4 } }}>
      <motion.div
        className="absolute inset-0"
        style={{ background: 'radial-gradient(ellipse at center, rgba(0,0,0,.6) 0%, rgba(0,0,0,.3) 45%, transparent 75%)' }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
      />
      {left > 0 ? (
        <div className="relative flex flex-col items-center">
          {cue.title && (
            <motion.div
              className="mb-8 font-display font-black uppercase italic text-white text-[64px] tracking-tight text-center px-10 drop-shadow-[0_8px_24px_rgba(0,0,0,.8)]"
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
            >
              {cue.title}
            </motion.div>
          )}
          <motion.div
            className="relative grid place-items-center w-[520px] h-[520px]"
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: hot ? [1, 1.06, 1] : 1, opacity: 1 }}
            transition={hot ? { duration: 0.5 } : { type: 'spring', stiffness: 200, damping: 18 }}
            key={hot ? `hot-${left}` : 'calm'}
          >
            <svg className="absolute inset-0 -rotate-90" viewBox="0 0 520 520">
              <circle cx="260" cy="260" r={R} fill="rgba(6,14,15,.82)" stroke="rgba(255,255,255,.12)" strokeWidth="18" />
              <circle
                cx="260"
                cy="260"
                r={R}
                fill="none"
                stroke={hot ? '#FF5442' : GOLD}
                strokeWidth="18"
                strokeLinecap="round"
                strokeDasharray={C}
                strokeDashoffset={C * (1 - left / total)}
                style={{ transition: 'stroke-dashoffset .95s linear, stroke .3s' }}
              />
            </svg>
            <AnimatePresence mode="popLayout">
              <motion.span
                key={left}
                className="relative font-display font-black tabular-nums leading-none"
                style={{ fontSize: left >= 60 ? 170 : 250, color: hot ? '#FF8578' : '#fff' }}
                initial={{ scale: 1.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.6, opacity: 0 }}
                transition={{ duration: 0.35, ease: EASE }}
              >
                {mm}
              </motion.span>
            </AnimatePresence>
          </motion.div>
        </div>
      ) : (
        <>
          <Confetti w={w} h={h} />
          <motion.div
            className="relative font-display font-black uppercase italic leading-none bg-clip-text text-transparent drop-shadow-[0_14px_40px_rgba(0,0,0,.65)]"
            style={{ fontSize: 260, backgroundImage: `linear-gradient(180deg, #FFFFFF 35%, #FFE7A3 62%, ${GOLD} 100%)`, paddingRight: '0.08em' }}
            initial={{ scale: 2.2, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 260, damping: 16 }}
          >
            {cue.text || 'Los!'}
          </motion.div>
        </>
      )}
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Dauer-Elemente (Logo, Partner)
// ---------------------------------------------------------------------------

function PortraitBrand({ instagram }: { instagram: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: EASE }}
      className="flex items-center justify-center gap-4"
    >
      <img src="/assets/hero-league-logo.png" alt="Hero League" className="h-[64px] w-auto drop-shadow-[0_6px_18px_rgba(0,0,0,.8)]" />
      {instagram && (
        <span className="inline-flex items-center gap-2 rounded-full bg-[rgba(6,14,15,.82)] border border-white/15 pl-2 pr-4 py-1.5 shadow-[0_10px_30px_-10px_rgba(0,0,0,.9)]">
          <span className="grid place-items-center w-8 h-8 rounded-full" style={{ background: 'linear-gradient(45deg,#F58529,#DD2A7B 55%,#8134AF)' }}>
            <Instagram className="w-[18px] h-[18px] text-white" />
          </span>
          <span className="text-[20px] font-sans font-bold text-white tracking-tight">{instagram}</span>
        </span>
      )}
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Seite
// ---------------------------------------------------------------------------

type Display = { cue: Cue; ms: number; startedAt: number };
type Fx = { id: number; kind: 'confetti' | 'emoji'; emoji: string; ms: number };

const DEMO: (Partial<CueBody> & { kind: CueBody['kind'] })[] = [
  { kind: 'headline', title: 'Willkommen im Studio', text: 'Hero League · Live', duration: 6 },
  { kind: 'confetti', duration: 6 },
  { kind: 'lowerthird', title: 'Florian Hinterheller', text: 'Hauptpartner · Deutsche Vermögensberatung', duration: 6 },
  { kind: 'link', title: 'Jetzt anmelden', link: `${location.host}/season2`, text: 'Season 2 – die Plätze sind begrenzt', duration: 6 },
  { kind: 'emoji', emoji: '🔥⚽🎉', duration: 6 },
  { kind: 'partner', partner: 'dvag', duration: 6 },
  { kind: 'partner', partner: 'volksbank', duration: 5 },
  { kind: 'countdown', title: 'Gleich geht’s los', text: 'Los!', duration: 5 },
];

export default function StudioOverlay() {
  const { portrait, brand, partner, top, demo } = useMemo(params, []);
  const W = portrait ? 1080 : 1920;
  const H = portrait ? 1920 : 1080;
  const fit = useFit(W, H);
  const instagram = useInstagramHandle(brand);

  const [display, setDisplay] = useState<Display | null>(null);
  const [fx, setFx] = useState<Fx[]>([]);
  const lastId = useRef<number | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    document.documentElement.classList.add('hl-obs');
    document.title = `Hero League · Studio-Overlay (${portrait ? 'Hochformat' : 'Querformat'})`;
  }, [portrait]);

  // Einen Cue abspielen. `age` = wie lange er schon läuft (ms, Server-Sicht).
  const play = useRef((cue: Cue, age: number) => {
    const total = cue.duration * 1000 + (cue.kind === 'countdown' ? 2800 : 0);
    const ms = total - age;
    if (cue.kind === 'clear') {
      clearTimeout(hideTimer.current);
      setDisplay(null);
      setFx([]);
      return;
    }
    if (cue.kind === 'confetti') {
      if (age > 3000) return;
      setFx((l) => [...l, { id: cue.id, kind: 'confetti', emoji: '', ms: 11_000 }]);
      setTimeout(() => setFx((l) => l.filter((f) => f.id !== cue.id)), 11_000);
      return;
    }
    if (ms < 600) return; // schon vorbei (z. B. Overlay erst später geöffnet)
    if (cue.kind === 'emoji') {
      setFx((l) => [...l.filter((f) => f.kind !== 'emoji'), { id: cue.id, kind: 'emoji', emoji: cue.emoji, ms }]);
      setTimeout(() => setFx((l) => l.filter((f) => f.id !== cue.id)), ms + 5000);
      return;
    }
    clearTimeout(hideTimer.current);
    setDisplay({ cue, ms, startedAt: performance.now() - age });
    hideTimer.current = setTimeout(() => setDisplay((d) => (d?.cue.id === cue.id ? null : d)), ms);
  });

  // Live: jede Sekunde nachfragen.
  useEffect(() => {
    if (demo) return;
    let alive = true;
    let t: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      let delay = 1000;
      try {
        const s = await fetchStudio();
        if (s.cue && s.cue.id !== lastId.current) {
          lastId.current = s.cue.id;
          play.current(s.cue, s.age ?? 0);
        }
      } catch {
        delay = 3000;
      }
      if (alive) t = setTimeout(tick, document.hidden ? 4000 : delay);
    };
    tick();
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [demo]);

  // Demo: alle Effekte nacheinander.
  useEffect(() => {
    if (!demo) return;
    let i = 0;
    let t: ReturnType<typeof setTimeout>;
    const next = () => {
      const c = DEMO[i % DEMO.length];
      i++;
      const cue: Cue = { title: '', text: '', link: '', emoji: '', partner: '', duration: 6, ...c, id: Date.now(), at: Date.now() } as Cue;
      play.current(cue, 0);
      t = setTimeout(next, cue.duration * 1000 + (cue.kind === 'countdown' ? 3800 : 1200));
    };
    t = setTimeout(next, 800);
    return () => clearTimeout(t);
  }, [demo]);

  useEffect(() => () => clearTimeout(hideTimer.current), []);

  const c = display?.cue;
  const centered = c && ['headline', 'partner', 'countdown'].includes(c.kind);

  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none select-none text-white font-sans">
      <div className="absolute" style={{ left: fit.x, top: fit.y, width: W, height: H, transform: `scale(${fit.s})`, transformOrigin: '0 0' }}>
        {/* Dauerhaft: Logo + Partner */}
        {portrait ? (
          // Am Handy größer, damit Logo und Partner im kleinen Bild lesbar bleiben.
          <div className="absolute inset-x-0 flex flex-col items-center gap-4" style={{ top, transform: 'scale(1.3)', transformOrigin: 'top center' }}>
            {brand && <PortraitBrand instagram={instagram} />}
            <AnimatePresence>{partner && <PartnerBar key="partners" />}</AnimatePresence>
          </div>
        ) : (
          <>
            {brand && (
              <div className="absolute top-10 right-10">
                <BrandCorner instagram={instagram} />
              </div>
            )}
            <div className="absolute bottom-10 right-10">
              <AnimatePresence>{partner && !centered && <PartnerBar key="partners" />}</AnimatePresence>
            </div>
          </>
        )}

        {/* Einblendungen */}
        <AnimatePresence>
          {display && c?.kind === 'headline' && <Headline key={c.id} cue={c} portrait={portrait} />}
          {display && c?.kind === 'lowerthird' && <LowerThird key={c.id} cue={c} ms={display.ms} portrait={portrait} />}
          {display && c?.kind === 'link' && <LinkCard key={c.id} cue={c} ms={display.ms} portrait={portrait} />}
          {display && c?.kind === 'partner' && <PartnerSpotlight key={c.id} cue={c} portrait={portrait} />}
          {display && c?.kind === 'countdown' && <Countdown key={c.id} cue={c} startedAt={display.startedAt} w={W} h={H} />}
        </AnimatePresence>

        {/* Effekte liegen ganz oben */}
        {fx.map((f) =>
          f.kind === 'confetti' ? <Confetti key={f.id} w={W} h={H} /> : <EmojiRain key={f.id} emoji={f.emoji} ms={f.ms} w={W} h={H} />,
        )}
      </div>
    </div>
  );
}
