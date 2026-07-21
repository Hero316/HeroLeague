import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, useInView, useReducedMotion, animate, type Variants } from 'motion/react';

// Gemeinsame Animations-Bausteine fuer das oeffentliche Frontend.
// Alles nutzt nur transform/opacity (GPU-freundlich) und respektiert an
// zentraler Stelle die Systemeinstellung "Bewegung reduzieren".

const EASE = [0.22, 0.61, 0.36, 1] as const; // weiches easeOut

// ---------- Reveal: sanftes Einblenden beim Scrollen ----------
interface RevealProps {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  y?: number;
}

export function Reveal({ children, className, delay = 0, y = 18 }: RevealProps) {
  const reduce = useReducedMotion();
  if (reduce) return <div className={className}>{children}</div>;
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-10% 0px -10% 0px' }}
      transition={{ duration: 0.6, ease: EASE, delay }}
    >
      {children}
    </motion.div>
  );
}

// ---------- RevealGroup / RevealItem: gestaffeltes Auftauchen ----------
const itemVariants: Variants = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0, transition: { duration: 0.55, ease: EASE } },
};

interface RevealGroupProps {
  children: React.ReactNode;
  className?: string;
  stagger?: number;
}

export function RevealGroup({ children, className, stagger = 0.08 }: RevealGroupProps) {
  const reduce = useReducedMotion();
  if (reduce) return <div className={className}>{children}</div>;
  return (
    <motion.div
      className={className}
      variants={{ hidden: {}, show: { transition: { staggerChildren: stagger } } }}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: '-8% 0px' }}
    >
      {children}
    </motion.div>
  );
}

export function RevealItem({ children, className }: { children: React.ReactNode; className?: string }) {
  const reduce = useReducedMotion();
  if (reduce) return <div className={className}>{children}</div>;
  return (
    <motion.div className={className} variants={itemVariants}>
      {children}
    </motion.div>
  );
}

// ---------- CountUp: Zahl zaehlt beim Sichtbarwerden von 0 hoch ----------
interface CountUpProps {
  value: number;
  decimals?: number;
  duration?: number;
  className?: string;
  prefix?: string;
  suffix?: string;
  /** true = positive Werte mit fuehrendem "+" zeigen (z. B. Tordifferenz) */
  signed?: boolean;
}

export function CountUp({
  value,
  decimals = 0,
  duration = 1.1,
  className,
  prefix = '',
  suffix = '',
  signed = false,
}: CountUpProps) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: '-5% 0px' });
  const [display, setDisplay] = useState(reduce ? value : 0);

  useEffect(() => {
    if (reduce) {
      setDisplay(value);
      return;
    }
    if (!inView) return;
    const controls = animate(0, value, {
      duration,
      ease: 'easeOut',
      onUpdate: (v) => setDisplay(v),
    });
    return () => controls.stop();
  }, [inView, value, reduce, duration]);

  const rounded = Number(display.toFixed(decimals));
  const sign = signed && rounded > 0 ? '+' : '';
  return (
    <span ref={ref} className={className}>
      {prefix}
      {sign}
      {rounded.toFixed(decimals)}
      {suffix}
    </span>
  );
}

// ---------- useSettle: loest die "Plaetze sortieren sich ein"-Animation aus ----------
// Liefert eine ref (an den Listencontainer haengen) und ein settled-Flag.
// Solange nicht settled: neutrale Startreihenfolge rendern; nach kurzem Delay
// (sobald sichtbar) auf die finale Reihenfolge umschalten -> motion `layout`
// laesst die Zeilen an ihre Endposition rutschen.
export function useSettle(delay = 400) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-5% 0px' });
  const [settled, setSettled] = useState(false);

  useEffect(() => {
    if (reduce) {
      setSettled(true);
      return;
    }
    if (!inView) return;
    const t = setTimeout(() => setSettled(true), delay);
    return () => clearTimeout(t);
  }, [inView, reduce, delay]);

  return { ref, settled: reduce ? true : settled };
}

// Kleiner Helfer: neutrale Startreihenfolge (alphabetisch nach Name) fuer die
// Einsortier-Animation. Gibt bei `settled` die finale Liste zurueck.
export function useSettledList<T>(
  finalItems: T[],
  getName: (item: T) => string,
  delay?: number
): { ref: React.RefObject<HTMLDivElement | null>; items: T[]; settled: boolean } {
  const { ref, settled } = useSettle(delay);
  const initialItems = useMemo(
    () => [...finalItems].sort((a, b) => getName(a).localeCompare(getName(b))),
    // getName ist stabil pro Aufruf; bewusst nur an finalItems gekoppelt
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [finalItems]
  );
  return { ref, items: settled ? finalItems : initialItems, settled };
}
