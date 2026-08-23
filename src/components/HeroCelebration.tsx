import { useCallback, useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { ModalPortal } from './ui';

// Belohnungs-Animation beim Abschließen einer Aufgabe: ein „+1 Hero"-Abzeichen
// ploppt auf und ringsum fliegen Sternchen/Blitze nach außen (~1,3 s). Bewusst
// etwas länger und verspielt – soll Spaß machen. Liegt über allem, blockt nichts
// (pointer-events: none).

const EMOJIS = ['⭐', '✨', '⚡', '🌟', '💫'];
const PARTICLES = Array.from({ length: 20 }, (_, i) => {
  const angle = (i / 20) * Math.PI * 2;
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

function Overlay() {
  const [gone, setGone] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setGone(true), 1600);
    return () => clearTimeout(t);
  }, []);
  if (gone) return null;
  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[95] flex items-center justify-center pointer-events-none overflow-hidden">
        {/* weicher Lichtkreis */}
        <motion.div
          initial={{ scale: 0, opacity: 0.5 }}
          animate={{ scale: 3.2, opacity: 0 }}
          transition={{ duration: 1.1, ease: 'easeOut' }}
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
        {/* „+1 Hero"-Abzeichen */}
        <motion.div
          initial={{ scale: 0.3, opacity: 0, y: 10 }}
          animate={{ scale: [0.3, 1.18, 1], opacity: [0, 1, 1, 0], y: [10, 0, 0, -18] }}
          transition={{ duration: 1.5, times: [0, 0.35, 0.7, 1], ease: 'easeOut' }}
          className="relative flex flex-col items-center gap-1"
        >
          <div
            className="px-5 py-3 rounded-3xl flex items-center gap-2 text-white font-display font-black text-2xl uppercase tracking-tight"
            style={{
              background: 'linear-gradient(135deg, #16BDA9 0%, #22DFC9 45%, #8B7CFF 120%)',
              boxShadow: '0 12px 40px rgba(34,223,201,.5), inset 0 1px 0 rgba(255,255,255,.4)',
            }}
          >
            <span style={{ fontSize: 26 }}>⚡</span> +1 Hero
          </div>
        </motion.div>
      </div>
    </ModalPortal>
  );
}

// Hook: burst() spielt die Animation ab. `node` in den Baum hängen.
export function useHeroBurst() {
  const [n, setN] = useState(0);
  const burst = useCallback(() => setN((x) => x + 1), []);
  const node = n > 0 ? <Overlay key={n} /> : null;
  return { burst, node };
}
