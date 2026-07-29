import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, useReducedMotion, useScroll, useTransform } from 'motion/react';
import type { HighlightImage } from '../types';
import HighlightThumb from './HighlightThumb';

// Spaltenanzahl responsiv (2 / 3 / 4) – Basis für das fließende Masonry.
function useColumnCount() {
  const [n, setN] = useState(3);
  useEffect(() => {
    const calc = () => setN(window.innerWidth >= 1024 ? 4 : window.innerWidth >= 640 ? 3 : 2);
    calc();
    window.addEventListener('resize', calc);
    return () => window.removeEventListener('resize', calc);
  }, []);
  return n;
}

// Die „Erlebnis“-Galerie: Bilder fließen in Spalten mit unterschiedlichem
// Parallax-Tempo, tauchen mit Feder-Animation gestaffelt auf und heben sich beim
// Hover an. Klick öffnet weiterhin die Lightbox. Bewegungsreduzierung wird
// respektiert (dann statisch).
export default function HighlightsGalleryFlow({
  images,
  onOpen,
}: {
  images: HighlightImage[];
  onOpen: (index: number) => void;
}) {
  const reduce = useReducedMotion();
  const cols = useColumnCount();
  const wrapRef = useRef<HTMLDivElement>(null);

  const { scrollYProgress } = useScroll({ target: wrapRef, offset: ['start end', 'end start'] });
  // Vier feste Parallax-Bahnen (max. 4 Spalten), je Spalte ein anderes Tempo.
  const y0 = useTransform(scrollYProgress, [0, 1], [0, -24]);
  const y1 = useTransform(scrollYProgress, [0, 1], [0, -56]);
  const y2 = useTransform(scrollYProgress, [0, 1], [0, -14]);
  const y3 = useTransform(scrollYProgress, [0, 1], [0, -40]);
  const colY = [y0, y1, y2, y3];

  // Bilder gleichmäßig auf die Spalten verteilen (Original-Index für die Lightbox merken).
  const columns = useMemo(() => {
    const buckets: { img: HighlightImage; index: number }[][] = Array.from({ length: cols }, () => []);
    images.forEach((img, i) => buckets[i % cols].push({ img, index: i }));
    return buckets;
  }, [images, cols]);

  return (
    <div ref={wrapRef} className="flex items-start gap-3 sm:gap-4">
      {columns.map((col, c) => (
        <motion.div
          key={c}
          style={reduce ? undefined : { y: colY[c % 4] }}
          className="flex flex-1 flex-col gap-3 sm:gap-4"
        >
          {col.map(({ img, index }) => (
            <motion.div
              key={img.id}
              initial={reduce ? false : { opacity: 0, y: 46, scale: 0.93 }}
              whileInView={reduce ? undefined : { opacity: 1, y: 0, scale: 1 }}
              viewport={{ once: true, margin: '-8% 0px' }}
              transition={{ type: 'spring', stiffness: 130, damping: 20, mass: 0.7 }}
              whileHover={reduce ? undefined : { y: -6 }}
              className="rounded-2xl transition-shadow duration-300 will-change-transform hover:shadow-2xl hover:shadow-brand-accent-light/10"
            >
              <HighlightThumb
                image={img}
                onOpen={() => onOpen(index)}
                editMode={false}
                onDelete={() => {}}
                onSetCaption={() => {}}
              />
            </motion.div>
          ))}
        </motion.div>
      ))}
    </div>
  );
}
