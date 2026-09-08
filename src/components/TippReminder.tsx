import { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { Target, ChevronRight, X } from 'lucide-react';
import type { Match } from '../types';
import { getIdentity, openTippMatchday, tippReminderKey, isTippReminderSeen, markTippReminderSeen } from '../lib/tips';

// Dezente Startseiten-Erinnerung – NUR für angemeldete Tipper und nur, solange
// der aktuelle Spieltag offen ist. Verschwindet nach dem ersten Besuch/Antippen
// (pro Spieltag ein Merker im Browser). Keine Push-Benachrichtigung.
export default function TippReminder({ matches, onOpen }: { matches: Match[]; onOpen: () => void }) {
  const identity = getIdentity();
  const open = useMemo(() => openTippMatchday(matches), [matches]);
  const key = open ? tippReminderKey(open.seasonId, open.matchday) : '';
  const [dismissed, setDismissed] = useState(() => (key ? isTippReminderSeen(key) : true));

  if (!identity || !open || dismissed) return null;

  const seen = () => { markTippReminderSeen(key); setDismissed(true); };
  const go = () => { seen(); onOpen(); };

  return (
    <div className="max-w-[1320px] xl:max-w-[1600px] 2xl:max-w-[1780px] mx-auto px-4 sm:px-10 pt-4">
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        className="relative overflow-hidden rounded-2xl border border-tipp/40"
        style={{ background: 'linear-gradient(120deg, rgba(255,122,26,.20), rgba(255,176,32,.08))', boxShadow: '0 0 24px -6px rgba(255,122,26,.5)' }}
      >
        <span className="tipp-shine" aria-hidden="true" />
        <div className="relative flex items-center gap-3 p-3.5 sm:p-4">
          <button onClick={go} className="flex items-center gap-3 flex-1 min-w-0 text-left cursor-pointer">
            <span className="w-10 h-10 rounded-xl grid place-items-center shrink-0 text-white shadow" style={{ background: 'linear-gradient(135deg, #F1541F, #FFB020)' }}>
              <Target className="w-5 h-5" />
            </span>
            <span className="min-w-0">
              <span className="block font-display font-black uppercase tracking-tight text-white text-base leading-none">
                Spieltag {open.matchday} ist offen!
              </span>
              <span className="block text-[12px] font-sans font-semibold text-hl-soft mt-0.5">Hast du schon deinen Tipp abgegeben? 🎯</span>
            </span>
            <ChevronRight className="w-5 h-5 text-tipp shrink-0 ml-auto" />
          </button>
          <button
            onClick={seen}
            aria-label="Ausblenden"
            className="shrink-0 w-8 h-8 rounded-lg grid place-items-center text-hl-mute hover:text-white hover:bg-white/10 cursor-pointer active:scale-90 transition-all"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </motion.div>
    </div>
  );
}
