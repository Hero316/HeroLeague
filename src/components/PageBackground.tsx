import React from 'react';

// Ambienter Ganzseiten-Hintergrund: großflächige, weiche Farbverläufe mit
// langsamer Drift – gibt der Seite Tiefe statt flachem Grau. Jede Seite bekommt
// eine eigene Kombination aus Position, Akzentfarbe und Bewegung. Der Teal-Kern
// bleibt überall gleich (durchgehender Stil), nur der Zweit-Akzent wechselt
// dezent, damit sich die Seiten voneinander abheben, ohne stilfremd zu wirken.

type Glow = { anim: string; style: React.CSSProperties };

// Kurzschreibweise für einen radialen Verlauf.
const rad = (rgba: string) => `radial-gradient(circle, ${rgba}, transparent 70%)`;

const TEAL = 'rgba(34,223,201,';
const ACCENT = 'rgba(22,189,169,';
const GREEN = 'rgba(67,229,160,';
const GOLD = 'rgba(233,196,106,';
const MAGENTA = 'rgba(232,62,140,';
const VIOLET = 'rgba(139,92,246,';

const PAGE_GLOWS: Record<string, Glow[]> = {
  home: [
    { anim: 'hl-drift-a', style: { top: '-16%', left: '-10%', width: '66vw', height: '66vw', background: rad(`${TEAL}0.20)`) } },
    { anim: 'hl-drift-b', style: { bottom: '-24%', right: '-12%', width: '58vw', height: '58vw', background: rad(`${ACCENT}0.15)`) } },
    { anim: 'hl-drift-c', style: { top: '34%', right: '24%', width: '38vw', height: '38vw', background: rad(`${GREEN}0.08)`) } },
  ],
  spielplan: [
    { anim: 'hl-drift-b', style: { top: '-14%', right: '-8%', width: '60vw', height: '60vw', background: rad(`${TEAL}0.18)`) } },
    { anim: 'hl-drift-a', style: { top: '40%', left: '-14%', width: '54vw', height: '54vw', background: rad(`${ACCENT}0.14)`) } },
    { anim: 'hl-drift-c', style: { bottom: '-22%', right: '18%', width: '40vw', height: '40vw', background: rad(`${GREEN}0.07)`) } },
  ],
  tabelle: [
    { anim: 'hl-drift-a', style: { top: '-12%', left: '18%', width: '58vw', height: '58vw', background: rad(`${TEAL}0.19)`) } },
    { anim: 'hl-drift-c', style: { top: '30%', left: '-16%', width: '50vw', height: '50vw', background: rad(`${GREEN}0.10)`) } },
    { anim: 'hl-drift-b', style: { bottom: '-26%', right: '-10%', width: '56vw', height: '56vw', background: rad(`${ACCENT}0.13)`) } },
  ],
  heroone: [
    { anim: 'hl-drift-a', style: { top: '-16%', left: '-8%', width: '60vw', height: '60vw', background: rad(`${TEAL}0.17)`) } },
    { anim: 'hl-drift-b', style: { top: '10%', right: '-6%', width: '46vw', height: '46vw', background: rad(`${GOLD}0.09)`) } },
    { anim: 'hl-drift-c', style: { bottom: '-24%', left: '20%', width: '46vw', height: '46vw', background: rad(`${ACCENT}0.12)`) } },
  ],
  statistiken: [
    { anim: 'hl-drift-b', style: { top: '-14%', right: '-10%', width: '60vw', height: '60vw', background: rad(`${TEAL}0.18)`) } },
    { anim: 'hl-drift-c', style: { bottom: '-20%', left: '-12%', width: '50vw', height: '50vw', background: rad(`${MAGENTA}0.08)`) } },
    { anim: 'hl-drift-a', style: { top: '36%', right: '22%', width: '38vw', height: '38vw', background: rad(`${ACCENT}0.12)`) } },
  ],
  highlights: [
    { anim: 'hl-drift-a', style: { top: '-15%', left: '16%', width: '58vw', height: '58vw', background: rad(`${TEAL}0.17)`) } },
    { anim: 'hl-drift-b', style: { top: '20%', left: '-14%', width: '48vw', height: '48vw', background: rad(`${VIOLET}0.09)`) } },
    { anim: 'hl-drift-c', style: { bottom: '-24%', right: '-8%', width: '54vw', height: '54vw', background: rad(`${ACCENT}0.13)`) } },
  ],
};
PAGE_GLOWS.default = PAGE_GLOWS.home;

export default function PageBackground({ page }: { page: string }) {
  const glows = PAGE_GLOWS[page] ?? PAGE_GLOWS.default;
  return (
    <div aria-hidden className="fixed inset-0 -z-10 overflow-hidden pointer-events-none" style={{ background: '#0A1415' }}>
      {/* Verläufe wechseln beim Seitenwechsel weich durch (key = neustart der Einblendung) */}
      <div key={page} className="hl-bg-in absolute inset-0">
        {glows.map((g, i) => (
          <div key={i} className={`absolute rounded-full blur-[70px] ${g.anim}`} style={g.style} />
        ))}
      </div>
      {/* dezente Vignette: hält den Kern ruhig/grau, Ränder etwas dunkler */}
      <div
        className="absolute inset-0"
        style={{ background: 'radial-gradient(120% 80% at 50% 0%, transparent 55%, rgba(6,12,11,0.55) 100%)' }}
      />
    </div>
  );
}
