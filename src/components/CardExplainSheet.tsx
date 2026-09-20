import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Info } from 'lucide-react';
import type { CardTier, ScoringConfig } from '../types';
import type { CardExplain, ExplainAttr, ExplainPart } from '../lib/rating';
import { useBackClose } from '../lib/backStack';
import { useBackdropDismiss, ModalPortal } from './ui';
import { TIER } from './FifaCard';

// ===========================================================================
// „So entsteht die Karte" – die komplette Herleitung der FIFA-Karte eines
// Spielers, mit SEINEN Zahlen. Wird aus derselben Rechnung gespeist wie die
// Karte selbst (rating.ts → cardExplain), kann also nie etwas anderes zeigen.
// ===========================================================================

interface Props {
  open: boolean;
  onClose: () => void;
  explain: CardExplain;
  name: string;
  cfg: ScoringConfig;
}

const de = (v: number, d = 1) => v.toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d });
const fmt = (p: ExplainPart, v: number) => (p.kind === 'percent' ? `${Math.round(v * 100)} %` : de(v, 1));

export default function CardExplainSheet({ open, onClose, explain, name, cfg }: Props) {
  useBackClose(open, onClose);
  const backdrop = useBackdropDismiss(onClose);
  const tier = TIER[explain.tier];

  // WICHTIG: ModalPortal sperrt beim Einhängen den Seiten-Scroll. Geschlossen
  // darf also NICHTS gerendert werden – sonst friert die Spielerseite ein,
  // sobald eine Karte sichtbar ist (genau der Bug „kann nicht mehr scrollen").
  if (!open) return null;

  return (
    <ModalPortal>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 z-[80] bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center"
            {...backdrop}
          >
            <motion.div
              initial={{ y: 32, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 32, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 380, damping: 34 }}
              className="w-full sm:max-w-2xl max-h-[92dvh] sm:max-h-[88vh] flex flex-col rounded-t-[28px] sm:rounded-[28px] border border-white/10 overflow-hidden"
              style={{ background: 'linear-gradient(180deg, #0f1a18 0%, #070d0c 100%)', boxShadow: '0 30px 80px -20px rgba(0,0,0,.8)' }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Kopf */}
              <div className="shrink-0 px-5 sm:px-7 pt-4 pb-4 border-b border-white/[.07] flex items-start gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 text-[11px] font-sans font-bold uppercase tracking-[2px] text-hl-dim">
                    <Info className="w-3.5 h-3.5" /> So entsteht die Karte
                  </div>
                  <h2 className="mt-1 font-display font-black text-2xl sm:text-3xl uppercase tracking-tight text-white leading-none truncate">{name}</h2>
                  <div className="mt-1.5 font-sans text-[12px] text-hl-mute">
                    {explain.games} {explain.games === 1 ? 'Spiel' : 'Spiele'} getrackt · Höchstwert {explain.cap} ({explain.capNote})
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="font-display font-black text-[44px] leading-none tabular-nums" style={{ color: tier.accent }}>
                    {explain.ges}
                  </div>
                  <div className="font-display font-black text-[11px] uppercase tracking-[2px] leading-none mt-0.5" style={{ color: tier.accent }}>
                    {tier.label}
                  </div>
                </div>
                <button
                  onClick={onClose}
                  className="shrink-0 w-9 h-9 -mr-1 rounded-xl grid place-items-center bg-white/5 border border-white/10 text-hl-mute hover:text-white cursor-pointer active:scale-95 transition-transform"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Inhalt */}
              <div className="flex-1 overflow-y-auto px-5 sm:px-7 py-5 space-y-4" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 1.5rem)' }}>
                {/* Die Formel – einmal groß, danach steht sie bei jedem Wert konkret. */}
                <div className="rounded-2xl border border-brand-accent-light/25 bg-brand-accent-light/[.07] px-4 py-3">
                  <div className="font-display font-black uppercase tracking-tight text-white text-sm">Jeder der vier Werte</div>
                  <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[13px] text-hl-soft">
                    <Chip>{explain.basis}</Chip>
                    <span>+</span>
                    <Chip tone="accent">Verlässlichkeit</Chip>
                    <span>×</span>
                    <Chip tone="accent">Index</Chip>
                    <span>×</span>
                    <Chip>{explain.spanne}</Chip>
                  </div>
                  <div className="mt-2.5 font-sans text-[12px] text-hl-mute leading-snug">
                    <span className="text-hl-soft font-semibold">Index</span> = wie nah du am Elite-Ziel bist (1,00 = Ziel erreicht, mehr geht).{' '}
                    <span className="text-hl-soft font-semibold">Verlässlichkeit</span> = wie viele Aktionen dahinterstehen – bei wenigen zieht es Richtung {explain.basis}.
                    Gesamtwert = Schnitt der vier.
                  </div>
                </div>

                {explain.attrs.map((a) => (
                  <AttrBlock key={a.key} a={a} explain={explain} />
                ))}

                {/* Stufen */}
                <div className="rounded-2xl border border-white/[.08] bg-white/[.02] px-4 py-3">
                  <div className="font-display font-black uppercase tracking-tight text-white text-sm mb-2">Stufen</div>
                  <div className="flex flex-wrap gap-1.5">
                    {(
                      [
                        ['bronze', `bis ${cfg.tiers.silber - 1}`],
                        ['silber', `ab ${cfg.tiers.silber}`],
                        ['gold', `ab ${cfg.tiers.gold}`],
                        ['hero', `ab ${cfg.tiers.hero}`],
                        ['tots', `ab ${cfg.tiers.tots}`],
                      ] as [CardTier, string][]
                    ).map(([t, range]) => (
                      <span
                        key={t}
                        className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-sans font-bold ${explain.tier === t ? 'ring-1' : 'opacity-70'}`}
                        style={{ background: `${TIER[t].accent}1a`, color: TIER[t].accent, ['--tw-ring-color' as string]: TIER[t].accent }}
                      >
                        {TIER[t].label} <span className="font-mono font-normal opacity-80">{range}</span>
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </ModalPortal>
  );
}

function Chip({ children, tone }: { children: React.ReactNode; tone?: 'accent' }) {
  return (
    <span className={`rounded-md px-1.5 py-0.5 ${tone === 'accent' ? 'bg-brand-accent-light/20 text-brand-accent-light' : 'bg-white/10 text-white'}`}>
      {children}
    </span>
  );
}

function AttrBlock({ a, explain }: { a: ExplainAttr; explain: CardExplain }) {
  const capped = a.raw > explain.cap;
  const floored = a.raw < explain.basis;
  return (
    <div className="rounded-2xl border border-white/[.08] bg-white/[.025] overflow-hidden">
      <div className="px-4 py-3 flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="font-display font-black text-white text-lg uppercase tracking-tight">{a.key}</span>
            <span className="font-sans font-semibold text-[13px] text-hl-soft">{a.label}</span>
          </div>
          <p className="font-sans text-[12px] text-hl-mute leading-snug mt-0.5">{a.what}</p>
        </div>
        <div className="font-display font-black text-[34px] leading-none tabular-nums text-white shrink-0">{a.value}</div>
      </div>

      <div className="px-4 pb-3 space-y-2.5">
        {a.parts.map((p) => (
          <PartRow key={p.label} p={p} />
        ))}
      </div>

      {/* Die konkrete Rechnung dieses Werts */}
      <div className="px-4 py-2.5 border-t border-white/[.06] bg-black/20 font-mono text-[11.5px] text-hl-dim leading-relaxed">
        <div>
          Index <span className="text-white">{de(a.index, 2)}</span> · Verlässlichkeit{' '}
          <span className="text-white">{Math.round(a.r * 100)} %</span>{' '}
          <span className="opacity-70">
            ({a.vol} von {a.voll} {a.volLabel})
          </span>
        </div>
        <div>
          {explain.basis} + {de(a.r, 2)} × {de(Math.max(0, a.index), 2)} × {explain.spanne} ={' '}
          <span className="text-white">{de(a.raw, 1)}</span>
          {capped && <span className="text-hl-gold"> → gedeckelt bei {explain.cap}</span>}
          {floored && <span> → mindestens {explain.basis}</span>}
          {!capped && !floored && <span> → {a.value}</span>}
        </div>
      </div>
    </div>
  );
}

function PartRow({ p }: { p: ExplainPart }) {
  // Balken: 100 % = Ziel erreicht. Alles darüber wächst bis zur Anzeigegrenze weiter.
  const fill = Math.max(0, Math.min(1.5, p.ratio)) / 1.5;
  const zielAt = 1 / 1.5;
  const hit = p.ratio >= 1;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 mb-1">
        <span className="font-sans text-[12.5px] text-hl-soft truncate">
          {p.label}
          <span className="ml-1.5 font-mono text-[10px] text-hl-faint">×{de(p.weight, 2)}</span>
        </span>
        <span className="font-mono text-[12px] tabular-nums shrink-0">
          <span className={hit ? 'text-brand-accent-light font-bold' : 'text-white font-bold'}>{fmt(p, p.value)}</span>
          <span className="text-hl-faint"> / Ziel {fmt(p, p.ziel)}</span>
          {p.invert && <span className="text-hl-faint"> (weniger ist besser)</span>}
        </span>
      </div>
      <div className="relative h-1.5 rounded-full bg-white/[.07] overflow-hidden">
        <div
          className="absolute inset-y-0 left-0 rounded-full"
          style={{ width: `${fill * 100}%`, background: hit ? '#22DFC9' : 'rgba(255,255,255,.45)' }}
        />
        <div className="absolute inset-y-0 w-px bg-white/60" style={{ left: `${zielAt * 100}%` }} title="Ziel" />
      </div>
    </div>
  );
}
