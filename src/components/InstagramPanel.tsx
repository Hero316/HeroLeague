import { useState } from 'react';
import { motion } from 'motion/react';
import { ArrowLeft, Instagram, Play, Heart, MessageCircle, Eye, Users, TrendingUp, Film } from 'lucide-react';
import { ModalPortal } from './ui';
import { useBackClose } from '../lib/backStack';
import type { IgReelsResult } from '../lib/collab';

// Große Zahlen kompakt.
function compact(n: number | null | undefined): string {
  if (n == null) return '–';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace('.', ',') + ' Mio.';
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace('.', ',') + 'k';
  return String(n);
}

const IG_GRAD = 'linear-gradient(135deg, #F2A93B 0%, #E83E8C 50%, #8B7CFF 100%)';

// Verlaufs-Diagramm (Fläche + Linie) aus den Tageswerten.
function AreaChart({ data }: { data: { day: string; value: number }[] }) {
  if (data.length < 2) return null;
  const W = 320, H = 110, P = 6;
  const max = Math.max(1, ...data.map((d) => d.value));
  const pts = data.map((d, i) => {
    const x = P + (i / (data.length - 1)) * (W - 2 * P);
    const y = H - P - (d.value / max) * (H - 2 * P);
    return [x, y] as const;
  });
  const line = pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const area = `${P},${H - P} ${line} ${W - P},${H - P}`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full h-28">
      <defs>
        <linearGradient id="igArea" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#E83E8C" stopOpacity="0.45" />
          <stop offset="100%" stopColor="#E83E8C" stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={area} fill="url(#igArea)" />
      <polyline points={line} fill="none" stroke="#E83E8C" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function StatTile({ icon: Icon, label, value, sub }: { icon: typeof Eye; label: string; value: string; sub?: string }) {
  return (
    <div className="hl-card rounded-2xl p-3.5">
      <div className="flex items-center gap-1.5 text-hl-dim mb-1.5">
        <Icon className="w-3.5 h-3.5" />
        <span className="text-[10px] font-sans font-bold uppercase tracking-wide">{label}</span>
      </div>
      <div className="font-display font-black text-2xl tabular-nums text-hl-text leading-none">{value}</div>
      {sub && <div className="text-[11px] text-hl-mute mt-1 font-sans">{sub}</div>}
    </div>
  );
}

export default function InstagramPanel({ data, onClose }: { data: IgReelsResult; onClose: () => void }) {
  const [tab, setTab] = useState<'overview' | 'content'>('overview');
  useBackClose(true, onClose);

  const daily = data.daily ?? [];
  const items = data.items ?? [];

  return (
    <ModalPortal>
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 16 }}
        transition={{ type: 'spring', stiffness: 320, damping: 32 }}
        className="fixed inset-0 z-[80] flex flex-col hl-app-bg text-hl-text"
      >
        {/* Kopf */}
        <header
          className="flex items-center gap-2 px-2 py-2 border-b border-white/10 hl-app-bar backdrop-blur-xl shrink-0"
          style={{ paddingTop: 'calc(env(safe-area-inset-top) + 0.5rem)' }}
        >
          <button onClick={onClose} className="flex items-center gap-1 px-2.5 py-2 rounded-lg text-hl-soft hover:text-white active:bg-white/10 cursor-pointer shrink-0">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <span className="w-9 h-9 rounded-2xl flex items-center justify-center text-white shrink-0" style={{ background: IG_GRAD }}>
            <Instagram className="w-5 h-5" />
          </span>
          <div className="min-w-0">
            <div className="font-display font-black text-white uppercase tracking-tight text-sm leading-none">Instagram</div>
            {data.username && <div className="text-[11px] text-hl-mute font-sans truncate">@{data.username}</div>}
          </div>
        </header>

        {/* Tabs */}
        <div className="flex gap-1 px-3 pt-3 shrink-0">
          {([
            { id: 'overview', label: 'Übersicht' },
            { id: 'content', label: 'Inhalte' },
          ] as const).map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className="relative flex-1 py-2.5 rounded-xl text-[13px] font-sans font-bold cursor-pointer"
              style={{ color: tab === t.id ? '#fff' : 'var(--color-hl-mute)' }}
            >
              {tab === t.id && (
                <motion.span layoutId="ig-tab" className="absolute inset-0 rounded-xl" style={{ background: IG_GRAD, boxShadow: '0 8px 20px -10px rgba(232,62,140,.6)' }} transition={{ type: 'spring', stiffness: 480, damping: 38 }} />
              )}
              <span className="relative z-10">{t.label}</span>
            </button>
          ))}
        </div>

        {/* Inhalt */}
        <div className="flex-1 min-h-0 overflow-y-auto px-3 py-3">
          {tab === 'overview' ? (
            <div className="space-y-3">
              {/* Kernzahlen */}
              <div className="grid grid-cols-2 gap-2.5">
                <StatTile icon={Eye} label="Aufrufe · 30 T." value={compact(data.totalViews30)} />
                <StatTile icon={TrendingUp} label="Reichweite · 30 T." value={compact(data.reach30)} />
                <StatTile icon={Users} label="Follower" value={compact(data.followers)} sub={data.newFollowers30 != null ? `+${compact(data.newFollowers30)} in 30 T.` : undefined} />
                <StatTile icon={Film} label="Beiträge · 30 T." value={compact(data.count30)} />
              </div>

              {/* Verlauf */}
              {daily.length > 1 && (
                <div className="hl-card rounded-2xl p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] font-mono uppercase tracking-wider text-hl-dim">{data.dailyLabel || 'Aufrufe'} · letzte 30 Tage</span>
                  </div>
                  <AreaChart data={daily} />
                </div>
              )}

              {/* Aufrufe nach Content-Art */}
              {(data.viewsReels30 || data.viewsPosts30) ? (
                <div className="hl-card rounded-2xl p-4">
                  <div className="text-[11px] font-mono uppercase tracking-wider text-hl-dim mb-3">Aufrufe nach Art · 30 T.</div>
                  {([
                    { label: 'Reels', value: data.viewsReels30 || 0, color: '#E83E8C' },
                    { label: 'Beiträge', value: data.viewsPosts30 || 0, color: '#8B7CFF' },
                  ] as const).map((row) => {
                    const total = Math.max(1, (data.viewsReels30 || 0) + (data.viewsPosts30 || 0));
                    return (
                      <div key={row.label} className="mb-3 last:mb-0">
                        <div className="flex items-center justify-between text-[13px] font-sans mb-1">
                          <span className="font-semibold text-hl-text">{row.label}</span>
                          <span className="tabular-nums font-bold text-hl-text">{compact(row.value)}</span>
                        </div>
                        <div className="h-2.5 rounded-full overflow-hidden bg-white/10">
                          <div className="h-full rounded-full" style={{ width: `${(row.value / total) * 100}%`, background: row.color }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : null}

              {/* Interaktionen */}
              <div className="grid grid-cols-2 gap-2.5">
                <StatTile icon={Heart} label="Likes · 30 T." value={compact(data.totalLikes30)} />
                <StatTile icon={MessageCircle} label="Kommentare · 30 T." value={compact(data.totalComments30)} />
              </div>
            </div>
          ) : (
            /* Inhalte: alle Beiträge mit Zahlen */
            <div className="space-y-2">
              {items.map((m) => (
                <a
                  key={m.id}
                  href={m.permalink || '#'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 hl-card rounded-2xl p-2.5 active:scale-[.99] transition-transform"
                >
                  <span className="relative shrink-0 rounded-xl overflow-hidden bg-black/20" style={{ width: 52, height: 68 }}>
                    {m.thumbnail ? <img src={m.thumbnail} alt="" loading="lazy" className="absolute inset-0 w-full h-full object-cover" /> : <span className="absolute inset-0 flex items-center justify-center text-hl-faint"><Instagram className="w-5 h-5" /></span>}
                    {m.type === 'reel' && <span className="absolute top-1 right-1 text-white"><Play className="w-3 h-3 fill-current" /></span>}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-sans text-hl-text leading-snug line-clamp-2 break-words">{m.caption || (m.type === 'reel' ? 'Reel' : 'Beitrag')}</div>
                    <div className="flex items-center gap-3 mt-1.5 text-[11px] text-hl-mute font-sans tabular-nums">
                      {m.likes != null && <span className="flex items-center gap-1"><Heart className="w-3 h-3" /> {compact(m.likes)}</span>}
                      {m.comments != null && <span className="flex items-center gap-1"><MessageCircle className="w-3 h-3" /> {compact(m.comments)}</span>}
                    </div>
                  </div>
                  {m.views != null && (
                    <div className="text-right shrink-0">
                      <div className="font-display font-black text-lg tabular-nums text-hl-text leading-none">{compact(m.views)}</div>
                      <div className="text-[9px] font-sans font-bold uppercase tracking-wide text-hl-dim">Aufrufe</div>
                    </div>
                  )}
                </a>
              ))}
            </div>
          )}
        </div>
      </motion.div>
    </ModalPortal>
  );
}
