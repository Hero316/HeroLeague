import { useEffect, useState } from 'react';
import { Radio, ExternalLink } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { TwitchConfig } from '../types';

// Zeigt ein Live-Banner mit CTA, sobald im Admin "Stream ist live" aktiviert wurde.
// Im inaktiven Zustand rendert die Komponente nichts.
export default function LiveBanner() {
  const [cfg, setCfg] = useState<TwitchConfig | null>(null);

  useEffect(() => {
    let active = true;
    const load = () =>
      apiFetch<TwitchConfig>('/api/twitch')
        .then((d) => {
          if (active) setCfg(d);
        })
        .catch(() => {
          /* still: kein Banner, wenn nicht abrufbar */
        });
    load();
    const timer = setInterval(load, 60000); // periodisch aktualisieren
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  if (!cfg || !cfg.isLive || !cfg.channel) return null;

  const url = `https://twitch.tv/${cfg.channel}`;

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="group block bg-gradient-to-r from-[#772ce8] via-[#8b3ffb] to-[#9147ff] text-white shadow-lg"
    >
      <div className="max-w-7xl mx-auto px-4 py-2.5 flex items-center justify-center sm:justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="flex items-center gap-1.5 bg-white/15 border border-white/25 rounded-full px-2.5 py-0.5 text-[11px] font-mono font-bold uppercase tracking-wider shrink-0">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-white" />
            </span>
            Live
          </span>
          <Radio className="w-4 h-4 shrink-0" />
          <span className="text-sm font-sans font-semibold truncate">
            Wir sind jetzt live auf Twitch – <span className="font-bold">{cfg.channel}</span>
          </span>
        </div>
        <span className="inline-flex items-center gap-1.5 bg-white text-[#772ce8] rounded-full px-4 py-1.5 text-xs font-bold uppercase tracking-wider shrink-0 group-hover:bg-white/90 transition-colors">
          Jetzt zuschauen
          <ExternalLink className="w-3.5 h-3.5" />
        </span>
      </div>
    </a>
  );
}
