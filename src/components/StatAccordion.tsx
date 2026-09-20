import React, { useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { ChevronDown } from 'lucide-react';

// ===========================================================================
// Aufklappbare Bestenlisten. Jede Liste ist eine dicke Taste; ein Tipp fährt
// sie aus, ein Tipp auf eine andere fährt die erste wieder ein (Akkordeon –
// es ist nie mehr als eine offen). Gleiche Bewegung wie bei den Auszeichnungen.
// Die geschlossene Taste zeigt bereits den Ersten (Name + Wert), damit die
// Seite auch zugeklappt etwas sagt.
// ===========================================================================

export interface AccordionItem {
  id: string;
  title: string;
  icon?: React.ReactNode;
  accent: string; // Farbe von Icon/Chevron im offenen Zustand
  preview?: React.ReactNode; // z.B. „1. Semih Gökdag · 4.8"
  content: React.ReactNode; // die Liste
}

export default function StatAccordion({ items, defaultOpen = null }: { items: AccordionItem[]; defaultOpen?: string | null }) {
  const [openId, setOpenId] = useState<string | null>(defaultOpen);
  const reduce = useReducedMotion();
  const grow = reduce ? { duration: 0 } : { type: 'spring' as const, duration: 0.5, bounce: 0.18 };
  const toggle = (id: string) => setOpenId((cur) => (cur === id ? null : id));

  return (
    <div className="space-y-2">
      {items.map((it) => {
        const isOpen = it.id === openId;
        return (
          <div
            key={it.id}
            className="rounded-2xl border transition-colors duration-200"
            style={
              isOpen
                ? { borderColor: `${it.accent}66`, background: `${it.accent}0f` }
                : { borderColor: 'rgba(255,255,255,.1)', background: 'rgba(255,255,255,.02)' }
            }
          >
            <button
              type="button"
              onClick={() => toggle(it.id)}
              aria-expanded={isOpen}
              className="w-full flex items-center gap-3 px-4 py-3.5 text-left cursor-pointer min-h-[56px]"
            >
              {it.icon && (
                <span className="shrink-0 transition-colors duration-200" style={{ color: isOpen ? it.accent : 'rgba(255,255,255,.55)' }}>
                  {it.icon}
                </span>
              )}
              <span className="min-w-0 flex-1">
                <span className="block font-display font-black uppercase tracking-tight text-white text-[15px] leading-tight truncate">{it.title}</span>
                {it.preview && !isOpen && <span className="block font-sans text-[12px] text-hl-mute truncate mt-0.5">{it.preview}</span>}
              </span>
              <span
                className="ml-auto w-8 h-8 shrink-0 grid place-items-center rounded-lg border transition-colors duration-200"
                style={
                  isOpen
                    ? { borderColor: `${it.accent}99`, background: `${it.accent}33`, color: it.accent }
                    : { borderColor: 'rgba(255,255,255,.15)', background: 'rgba(255,255,255,.06)', color: 'rgba(255,255,255,.7)' }
                }
              >
                <ChevronDown className={`w-5 h-5 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`} strokeWidth={2.75} />
              </span>
            </button>
            <AnimatePresence initial={false}>
              {isOpen && (
                <motion.div
                  key="liste"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={grow}
                  style={{ willChange: 'height' }}
                  className="overflow-hidden"
                >
                  <div className="px-2 pb-2 border-t border-white/[.08] pt-1">{it.content}</div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
}
