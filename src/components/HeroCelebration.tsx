import { useCallback, useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { ModalPortal } from './ui';

// Belohnungs-Animation beim Verdienen eines Heroes: ein „+1 Hero"-Abzeichen
// ploppt auf, ringsum fliegen Sternchen/Blitze nach außen, und ein großer Stern
// fliegt am Ende nach unten (symbolisch „in den Punktestand"). Dazu steht der
// GRUND (z. B. „Aufgabe erledigt") plus ein Lob. Liegt über allem, blockt nichts.

const EMOJIS = ['⭐', '✨', '⚡', '🌟', '💫'];
const PARTICLES = Array.from({ length: 22 }, (_, i) => {
  const angle = (i / 22) * Math.PI * 2;
  const dist = 130 + (i % 4) * 34;
  return {
    id: i,
    emoji: EMOJIS[i % EMOJIS.length],
    x: Math.cos(angle) * dist,
    y: Math.sin(angle) * dist,
    delay: (i % 5) * 0.03,
    size: 20 + (i % 3) * 8,
  };
});

const PRAISE = ['Stark gemacht! 💪', 'Sauber! 🔥', 'Weiter so! 🚀', 'Grandios! 🌟', 'Hero-Move! ⚡', 'Nice! 👏'];

export type HeroBurstOpts = { title?: string; reason?: string; count?: number };

function Overlay({ title, reason, count }: { title: string; reason: string; count: number }) {
  const [gone, setGone] = useState(false);
  const [praise] = useState(() => PRAISE[Math.floor(Math.random() * PRAISE.length)]);
  useEffect(() => {
    const t = setTimeout(() => setGone(true), 2100);
    return () => clearTimeout(t);
  }, []);
  if (gone) return null;
  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[95] flex items-center justify-center pointer-events-none overflow-hidden">
        {/* weicher Lichtkreis */}
        <motion.div
          initial={{ scale: 0, opacity: 0.5 }}
          animate={{ scale: 3.4, opacity: 0 }}
          transition={{ duration: 1.2, ease: 'easeOut' }}
          className="absolute w-40 h-40 rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(34,223,201,.5), transparent 70%)' }}
        />
        {/* fliegende Sternchen */}
        {PARTICLES.map((p) => (
          <motion.span
            key={p.id}
            initial={{ x: 0, y: 0, scale: 0, opacity: 0, rotate: 0 }}
            animate={{ x: p.x, y: p.y, scale: [0, 1.15, 1, 0.7], opacity: [0, 1, 1, 0], rotate: 180 }}
            transition={{ duration: 1.25, delay: p.delay, ease: [0.22, 1, 0.36, 1] }}
            className="absolute select-none"
            style={{ fontSize: p.size, filter: 'drop-shadow(0 2px 6px rgba(0,0,0,.35))' }}
          >
            {p.emoji}
          </motion.span>
        ))}
        {/* Abzeichen mit Grund + Lob */}
        <motion.div
          initial={{ scale: 0.3, opacity: 0, y: 10 }}
          animate={{ scale: [0.3, 1.16, 1], opacity: [0, 1, 1, 1, 0], y: [10, 0, 0, 0, -10] }}
          transition={{ duration: 2.05, times: [0, 0.22, 0.4, 0.82, 1], ease: 'easeOut' }}
          className="relative flex flex-col items-center gap-2"
        >
          <div
            className="px-6 py-3.5 rounded-[26px] flex items-center gap-2.5 text-white font-display font-black text-2xl uppercase tracking-tight"
            style={{
              background: 'linear-gradient(135deg, #16BDA9 0%, #22DFC9 45%, #8B7CFF 120%)',
              boxShadow: '0 14px 44px rgba(34,223,201,.5), inset 0 1px 0 rgba(255,255,255,.4)',
            }}
          >
            <span style={{ fontSize: 28 }}>⚡</span> +{count} Hero{count > 1 ? 'es' : ''}
          </div>
          {(reason || title) && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: [0, 1, 1, 0], y: [6, 0, 0, -4] }}
              transition={{ duration: 2.05, times: [0.2, 0.4, 0.82, 1], ease: 'easeOut' }}
              className="flex flex-col items-center gap-1"
            >
              <span
                className="px-3.5 py-1.5 rounded-full text-[13px] font-sans font-bold text-white"
                style={{ background: 'rgba(10,20,18,.72)', boxShadow: '0 6px 18px rgba(0,0,0,.35)' }}
              >
                {reason || title}
              </span>
              <span className="text-[13px] font-sans font-bold text-white drop-shadow-[0_2px_6px_rgba(0,0,0,.4)]">{praise}</span>
            </motion.div>
          )}
        </motion.div>
        {/* großer Stern fliegt am Ende nach unten „in den Punktestand" */}
        <motion.span
          initial={{ x: 0, y: 0, scale: 0, opacity: 0 }}
          animate={{ y: [0, -6, 320], x: [0, 0, 40], scale: [0, 1.3, 0.4], opacity: [0, 1, 0] }}
          transition={{ duration: 1.0, delay: 1.15, ease: [0.5, 0, 0.75, 0] }}
          className="absolute select-none"
          style={{ fontSize: 40, filter: 'drop-shadow(0 4px 12px rgba(34,223,201,.6))' }}
        >
          ⭐
        </motion.span>
      </div>
    </ModalPortal>
  );
}

// Hook: burst({ reason }) spielt die Animation ab. `node` in den Baum hängen.
export function useHeroBurst() {
  const [state, setState] = useState<{ n: number; title: string; reason: string; count: number }>({
    n: 0,
    title: '+1 Hero',
    reason: '',
    count: 1,
  });
  const burst = useCallback(
    (opts?: HeroBurstOpts) =>
      setState((s) => ({
        n: s.n + 1,
        title: opts?.title ?? '+1 Hero',
        reason: opts?.reason ?? '',
        count: opts?.count ?? 1,
      })),
    []
  );
  const node = state.n > 0 ? <Overlay key={state.n} title={state.title} reason={state.reason} count={state.count} /> : null;
  return { burst, node };
}
