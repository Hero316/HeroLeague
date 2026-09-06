import React from 'react';
import { motion, useReducedMotion } from 'motion/react';

// ---------------------------------------------------------------------------
// Radar-/Netz-Diagramm (reines Inline-SVG, keine Bibliothek). Zeigt die vier
// Kartenwerte eines Spielers als Fläche – und kann ZWEI Spieler überlagern
// (Head-to-Head). GPU-schonend animiert: die Flächen „wachsen" aus der Mitte.
// ---------------------------------------------------------------------------

export interface RadarSeries {
  color: string;
  values: number[]; // gleiche Länge/Reihenfolge wie `axes`
  name?: string;
}

interface Props {
  axes: { key: string; label?: string }[];
  series: RadarSeries[];
  max?: number;
  size?: number;
  className?: string;
}

export default function StatRadar({ axes, series, max = 99, size = 260, className = '' }: Props) {
  const reduce = useReducedMotion();
  const n = axes.length;
  const cx = size / 2;
  const cy = size / 2;
  const R = size / 2 - 34; // Platz für die Achsen-Beschriftung am Rand

  // Winkel je Achse: erste Achse zeigt nach oben, dann im Uhrzeigersinn.
  const angleAt = (i: number) => -Math.PI / 2 + (i * 2 * Math.PI) / n;
  const pointAt = (i: number, radius: number) => ({
    x: cx + radius * Math.cos(angleAt(i)),
    y: cy + radius * Math.sin(angleAt(i)),
  });

  const rings = [0.25, 0.5, 0.75, 1];
  const ringPoly = (f: number) =>
    axes.map((_, i) => { const p = pointAt(i, R * f); return `${p.x},${p.y}`; }).join(' ');

  const seriesPoly = (vals: number[]) =>
    axes
      .map((_, i) => {
        const v = Math.max(0, Math.min(max, vals[i] ?? 0));
        const p = pointAt(i, (R * v) / max);
        return `${p.x},${p.y}`;
      })
      .join(' ');

  return (
    <svg viewBox={`0 0 ${size} ${size}`} width="100%" className={className} style={{ maxWidth: size }} role="img" aria-label="Werte-Radar">
      {/* Netz */}
      {rings.map((f) => (
        <polygon key={f} points={ringPoly(f)} fill="none" stroke="rgba(255,255,255,0.10)" strokeWidth={1} />
      ))}
      {/* Speichen */}
      {axes.map((_, i) => {
        const p = pointAt(i, R);
        return <line key={i} x1={cx} y1={cy} x2={p.x} y2={p.y} stroke="rgba(255,255,255,0.10)" strokeWidth={1} />;
      })}

      {/* Flächen der Spieler */}
      {series.map((s, si) => (
        <motion.g
          key={si}
          initial={reduce ? false : { opacity: 0, scale: 0.4 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1], delay: 0.1 + si * 0.12 }}
          style={{ transformOrigin: `${cx}px ${cy}px` }}
        >
          <polygon
            points={seriesPoly(s.values)}
            fill={s.color}
            fillOpacity={series.length > 1 ? 0.22 : 0.3}
            stroke={s.color}
            strokeWidth={2}
            strokeLinejoin="round"
          />
          {axes.map((_, i) => {
            const v = Math.max(0, Math.min(max, s.values[i] ?? 0));
            const p = pointAt(i, (R * v) / max);
            return <circle key={i} cx={p.x} cy={p.y} r={3} fill={s.color} />;
          })}
        </motion.g>
      ))}

      {/* Achsen-Beschriftung (Kürzel außen) */}
      {axes.map((a, i) => {
        const p = pointAt(i, R + 18);
        return (
          <text
            key={a.key}
            x={p.x}
            y={p.y}
            textAnchor="middle"
            dominantBaseline="middle"
            className="font-display font-black"
            style={{ fontSize: 12, letterSpacing: '0.06em', fill: 'rgba(255,255,255,0.75)' }}
          >
            {a.key}
          </text>
        );
      })}
    </svg>
  );
}
