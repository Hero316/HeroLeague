import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { ArrowLeft, Instagram, Play, Heart, MessageCircle, Eye, Users, TrendingUp, Activity, Loader2, Flame, Bookmark, Send, UserPlus } from 'lucide-react';
import { ModalPortal } from './ui';
import { useBackClose } from '../lib/backStack';
import { fetchInstagramReels, fetchInstagramMedia, type IgReelsResult, type IgReel, type IgMediaDetail, type IgDemo } from '../lib/collab';

function compact(n: number | null | undefined): string {
  if (n == null) return '–';
  const neg = n < 0; const a = Math.abs(n);
  let s: string;
  if (a >= 1_000_000) s = (a / 1_000_000).toFixed(1).replace('.', ',') + ' Mio.';
  else if (a >= 1_000) s = (a / 1_000).toFixed(1).replace('.', ',') + 'k';
  else s = String(a);
  return (neg ? '-' : '') + s;
}
const fmt = (n: number) => n.toLocaleString('de-DE');
function dayLabel(iso: string): string {
  const p = iso.split('-');
  return p.length === 3 ? `${Number(p[2])}.${Number(p[1])}.` : iso;
}
const GENDER: Record<string, string> = { M: 'Männlich', F: 'Weiblich', U: 'Unbekannt' };
const COUNTRY: Record<string, string> = { DE: 'Deutschland', AT: 'Österreich', CH: 'Schweiz', US: 'USA', GB: 'UK', TR: 'Türkei', IT: 'Italien', FR: 'Frankreich', ES: 'Spanien', NL: 'Niederlande', PL: 'Polen' };

const IG_GRAD = 'linear-gradient(135deg, #F2A93B 0%, #E83E8C 50%, #8B7CFF 100%)';
const RANGES = [7, 14, 30, 60, 90];

function AreaChart({ data, label }: { data: { day: string; value: number }[]; label: string }) {
  const [active, setActive] = useState<number | null>(null);
  if (data.length < 2) return null;
  const W = 320, H = 120, PL = 4, PR = 4, PT = 8, PB = 4;
  const max = Math.max(1, ...data.map((d) => d.value));
  const min = Math.min(0, ...data.map((d) => d.value));
  const span = max - min || 1;
  const xOf = (i: number) => PL + (i / (data.length - 1)) * (W - PL - PR);
  const yOf = (v: number) => PT + (1 - (v - min) / span) * (H - PT - PB);
  const pts = data.map((d, i) => [xOf(i), yOf(d.value)] as const);
  const line = pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const area = `${PL},${H - PB} ${line} ${W - PR},${H - PB}`;
  const mid = data[Math.floor(data.length / 2)];
  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const frac = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    setActive(Math.round(frac * (data.length - 1)));
  };
  const ap = active != null ? data[active] : null;
  return (
    <div>
      <div className="flex">
        <div className="flex flex-col justify-between text-[9px] font-mono text-hl-faint tabular-nums pr-1.5 py-1" style={{ height: '7rem' }}>
          <span>{compact(max)}</span>
          <span>{compact(Math.round((max + min) / 2))}</span>
          <span>{compact(min)}</span>
        </div>
        <div className="relative flex-1 touch-none cursor-crosshair" onPointerDown={onMove} onPointerMove={onMove} onPointerLeave={() => setActive(null)}>
          <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full h-28">
            <defs>
              <linearGradient id="igArea" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#E83E8C" stopOpacity="0.45" />
                <stop offset="100%" stopColor="#E83E8C" stopOpacity="0" />
              </linearGradient>
            </defs>
            <line x1={PL} y1={PT} x2={W - PR} y2={PT} stroke="currentColor" strokeOpacity="0.08" className="text-hl-text" />
            <line x1={PL} y1={(H + PT - PB) / 2} x2={W - PR} y2={(H + PT - PB) / 2} stroke="currentColor" strokeOpacity="0.08" className="text-hl-text" />
            <polygon points={area} fill="url(#igArea)" />
            <polyline points={line} fill="none" stroke="#E83E8C" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
            {active != null && <line x1={xOf(active)} y1={PT} x2={xOf(active)} y2={H - PB} stroke="#E83E8C" strokeOpacity="0.5" strokeDasharray="3 3" />}
          </svg>
          {ap && (
            <>
              <div className="absolute w-2.5 h-2.5 rounded-full bg-[#E83E8C] ring-2 ring-white -translate-x-1/2 -translate-y-1/2 pointer-events-none" style={{ left: `${(xOf(active!) / W) * 100}%`, top: `${(yOf(ap.value) / H) * 100}%` }} />
              <div className="absolute -translate-x-1/2 -top-1 pointer-events-none z-10" style={{ left: `${Math.min(85, Math.max(15, (xOf(active!) / W) * 100))}%` }}>
                <div className="px-2.5 py-1 rounded-lg text-center whitespace-nowrap" style={{ background: '#1a1420', boxShadow: '0 6px 18px rgba(0,0,0,.4)' }}>
                  <div className="text-white text-[13px] font-bold tabular-nums leading-tight">{fmt(ap.value)}</div>
                  <div className="text-hl-faint text-[10px] font-mono">{dayLabel(ap.day)}</div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
      <div className="flex justify-between text-[9px] font-mono text-hl-faint pl-7 mt-1">
        <span>{dayLabel(data[0].day)}</span>
        {mid && <span>{dayLabel(mid.day)}</span>}
        <span>{dayLabel(data[data.length - 1].day)}</span>
      </div>
      <div className="text-center text-[9px] font-mono uppercase tracking-wider text-hl-faint mt-1">{label} · antippen für Details</div>
    </div>
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

// Demografie-Balken (Top-Einträge mit anteiligem Balken).
function DemoBars({ title, data, mapKey, limit = 5 }: { title: string; data: IgDemo[]; mapKey?: (k: string) => string; limit?: number }) {
  if (!data || data.length === 0) return null;
  const top = data.slice(0, limit);
  const total = Math.max(1, data.reduce((s, d) => s + d.value, 0));
  return (
    <div className="hl-card rounded-2xl p-4">
      <div className="text-[11px] font-mono uppercase tracking-wider text-hl-dim mb-3">{title}</div>
      {top.map((d) => (
        <div key={d.key} className="mb-2.5 last:mb-0">
          <div className="flex items-center justify-between text-[13px] font-sans mb-1">
            <span className="font-semibold text-hl-text truncate pr-2">{mapKey ? mapKey(d.key) : d.key}</span>
            <span className="tabular-nums font-bold text-hl-mute shrink-0">{Math.round((d.value / total) * 100)}%</span>
          </div>
          <div className="h-2 rounded-full overflow-hidden bg-white/10">
            <div className="h-full rounded-full" style={{ width: `${(d.value / total) * 100}%`, background: IG_GRAD }} />
          </div>
        </div>
      ))}
    </div>
  );
}

// Beitrag im Detail (Zahlen + Kommentare) – wird beim Antippen geladen.
function PostDetail({ media, onClose }: { media: IgReel; onClose: () => void }) {
  const [d, setD] = useState<IgMediaDetail | null>(null);
  useBackClose(true, onClose);
  useEffect(() => {
    fetchInstagramMedia(media.id).then(setD).catch(() => setD({ configured: false, error: 'x' }));
  }, [media.id]);
  return (
    <ModalPortal>
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 16 }} transition={{ type: 'spring', stiffness: 320, damping: 32 }} className="fixed inset-0 z-[85] flex flex-col hl-app-bg text-hl-text">
        <header className="flex items-center gap-2 px-2 py-2 border-b border-white/10 hl-app-bar backdrop-blur-xl shrink-0" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 0.5rem)' }}>
          <button onClick={onClose} className="flex items-center gap-1 px-2.5 py-2 rounded-lg text-hl-soft hover:text-white active:bg-white/10 cursor-pointer"><ArrowLeft className="w-5 h-5" /></button>
          <span className="font-display font-black text-white uppercase tracking-tight text-sm">Beitrag</span>
          {media.permalink && <a href={media.permalink} target="_blank" rel="noopener noreferrer" className="ml-auto mr-2 text-[12px] font-bold text-brand-accent-light">Öffnen</a>}
        </header>
        <div className="flex-1 min-h-0 overflow-y-auto px-3 py-3 space-y-3">
          <div className="flex gap-3">
            <span className="relative shrink-0 rounded-2xl overflow-hidden bg-black/20" style={{ width: 92, height: 122 }}>
              {media.thumbnail ? <img src={media.thumbnail} alt="" className="absolute inset-0 w-full h-full object-cover" /> : <span className="absolute inset-0 flex items-center justify-center text-hl-faint"><Instagram className="w-6 h-6" /></span>}
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[10px] font-mono uppercase tracking-wider text-brand-accent-light mb-1">{media.type === 'reel' ? 'Reel' : 'Beitrag'}{media.timestamp ? ` · ${dayLabel(media.timestamp.slice(0, 10))}` : ''}</div>
              <div className="text-[13px] font-sans text-hl-text leading-snug line-clamp-4 break-words">{d?.caption || media.caption || '—'}</div>
            </div>
          </div>

          {!d ? (
            <div className="flex items-center justify-center py-8 text-hl-mute"><Loader2 className="w-5 h-5 animate-spin" /></div>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-2">
                {([
                  { icon: Play, label: 'Aufrufe', v: d.views },
                  { icon: TrendingUp, label: 'Reichweite', v: d.reach },
                  { icon: Activity, label: 'Interakt.', v: d.interactions },
                  { icon: Heart, label: 'Likes', v: d.likes },
                  { icon: MessageCircle, label: 'Komm.', v: d.comments },
                  { icon: Bookmark, label: 'Saves', v: d.saved },
                  { icon: Send, label: 'Shares', v: d.shares },
                ] as const).filter((s) => s.v != null).map((s) => {
                  const Ic = s.icon;
                  return (
                    <div key={s.label} className="rounded-2xl px-2 py-2.5 text-center hl-surf-0">
                      <Ic className="w-3.5 h-3.5 mx-auto text-hl-dim mb-1" />
                      <div className="font-display font-black text-lg tabular-nums text-hl-text leading-none">{compact(s.v)}</div>
                      <div className="text-[9px] font-sans font-bold uppercase tracking-wide text-hl-dim mt-0.5">{s.label}</div>
                    </div>
                  );
                })}
              </div>

              <div>
                <div className="text-[11px] font-mono uppercase tracking-wider text-hl-dim mb-2 px-1">Kommentare {d.commentList?.length ? `(${d.commentList.length})` : ''}</div>
                {d.commentList && d.commentList.length > 0 ? (
                  <div className="space-y-2">
                    {d.commentList.map((c, i) => (
                      <div key={i} className="hl-card rounded-2xl p-3">
                        <div className="flex items-center justify-between gap-2 mb-0.5">
                          <span className="text-[12px] font-sans font-bold text-hl-text truncate">@{c.username || 'user'}</span>
                          {c.likes != null && c.likes > 0 && <span className="text-[11px] text-hl-mute flex items-center gap-0.5 shrink-0"><Heart className="w-3 h-3" /> {compact(c.likes)}</span>}
                        </div>
                        <div className="text-[13px] font-sans text-hl-soft leading-snug break-words">{c.text}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-[13px] text-hl-mute px-1 py-4 text-center">Keine Kommentare.</div>
                )}
              </div>
            </>
          )}
        </div>
      </motion.div>
    </ModalPortal>
  );
}

export default function InstagramPanel({ data: initial, onClose }: { data: IgReelsResult; onClose: () => void }) {
  const [tab, setTab] = useState<'overview' | 'content' | 'audience'>('overview');
  const [sort, setSort] = useState<'newest' | 'views' | 'likes'>('newest');
  const [data, setData] = useState<IgReelsResult>(initial);
  const [days, setDays] = useState<number>(initial.days ?? 30);
  const [loading, setLoading] = useState(false);
  const [openMedia, setOpenMedia] = useState<IgReel | null>(null);
  useBackClose(true, onClose);

  const changeRange = (dd: number) => {
    if (dd === days) return;
    setDays(dd); setLoading(true);
    fetchInstagramReels(dd).then(setData).catch(() => {}).finally(() => setLoading(false));
  };

  const rl = `${days} T.`;
  const daily = data.daily ?? [];
  const followerDaily = data.followerDaily ?? [];
  const items = data.items ?? [];
  const demo = data.demographics;
  const totalArt = Math.max(1, (data.viewsReels30 || 0) + (data.viewsStories30 || 0) + (data.viewsPosts30 || 0));
  const splitTotal = (data.followerReach30 || 0) + (data.nonFollowerReach30 || 0);

  return (
    <ModalPortal>
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 16 }} transition={{ type: 'spring', stiffness: 320, damping: 32 }} className="fixed inset-0 z-[80] flex flex-col hl-app-bg text-hl-text">
        <header className="flex items-center gap-2 px-2 py-2 border-b border-white/10 hl-app-bar backdrop-blur-xl shrink-0" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 0.5rem)' }}>
          <button onClick={onClose} className="flex items-center gap-1 px-2.5 py-2 rounded-lg text-hl-soft hover:text-white active:bg-white/10 cursor-pointer shrink-0"><ArrowLeft className="w-5 h-5" /></button>
          <span className="w-9 h-9 rounded-2xl flex items-center justify-center text-white shrink-0" style={{ background: IG_GRAD }}><Instagram className="w-5 h-5" /></span>
          <div className="min-w-0">
            <div className="font-display font-black text-white uppercase tracking-tight text-sm leading-none">Instagram</div>
            {data.username && <div className="text-[11px] text-hl-mute font-sans truncate">@{data.username}</div>}
          </div>
          {loading && <Loader2 className="w-4 h-4 animate-spin text-hl-mute ml-auto mr-2" />}
        </header>

        <div className="flex gap-1 px-3 pt-3 shrink-0">
          {([
            { id: 'overview', label: 'Übersicht' },
            { id: 'content', label: 'Inhalte' },
            { id: 'audience', label: 'Zielgruppe' },
          ] as const).map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)} className="relative flex-1 py-2.5 rounded-xl text-[13px] font-sans font-bold cursor-pointer" style={{ color: tab === t.id ? '#fff' : 'var(--color-hl-mute)' }}>
              {tab === t.id && <motion.span layoutId="ig-tab" className="absolute inset-0 rounded-xl" style={{ background: IG_GRAD, boxShadow: '0 8px 20px -10px rgba(232,62,140,.6)' }} transition={{ type: 'spring', stiffness: 480, damping: 38 }} />}
              <span className="relative z-10">{t.label}</span>
            </button>
          ))}
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-3 py-3">
          {/* Zeitraum-Filter (Übersicht & Zielgruppe) */}
          {tab !== 'content' && (
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar mb-3">
              {RANGES.map((dd) => (
                <button key={dd} onClick={() => changeRange(dd)} className="px-3 py-1.5 rounded-full text-[12px] font-sans font-bold shrink-0 cursor-pointer transition-colors" style={days === dd ? { background: IG_GRAD, color: '#fff' } : { color: 'var(--color-hl-mute)' }}>
                  {dd} Tage
                </button>
              ))}
            </div>
          )}

          {tab === 'overview' ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2.5">
                <StatTile icon={Eye} label={`Aufrufe · ${rl}`} value={compact(data.totalViews30)} />
                <StatTile icon={TrendingUp} label={`Reichweite · ${rl}`} value={compact(data.reach30)} />
                <StatTile icon={Activity} label={`Interaktionen · ${rl}`} value={compact(data.interactions30)} />
                <StatTile icon={Users} label="Follower" value={compact(data.followers)} sub={data.newFollowers30 != null ? `+${compact(data.newFollowers30)} in ${rl}` : undefined} />
              </div>

              {splitTotal > 0 && (
                <div className="hl-card rounded-2xl p-4">
                  <div className="text-[11px] font-mono uppercase tracking-wider text-hl-dim mb-2.5">Reichweite · Follower vs. Nicht-Follower</div>
                  <div className="flex h-3 rounded-full overflow-hidden">
                    <div style={{ width: `${((data.followerReach30 || 0) / splitTotal) * 100}%`, background: '#E83E8C' }} />
                    <div style={{ width: `${((data.nonFollowerReach30 || 0) / splitTotal) * 100}%`, background: '#8B7CFF' }} />
                  </div>
                  <div className="flex justify-between text-[11px] font-sans mt-2">
                    <span className="text-hl-soft"><span className="inline-block w-2 h-2 rounded-full mr-1" style={{ background: '#E83E8C' }} />Follower {Math.round(((data.followerReach30 || 0) / splitTotal) * 100)}%</span>
                    <span className="text-hl-soft"><span className="inline-block w-2 h-2 rounded-full mr-1" style={{ background: '#8B7CFF' }} />Nicht-Follower {Math.round(((data.nonFollowerReach30 || 0) / splitTotal) * 100)}%</span>
                  </div>
                </div>
              )}

              {daily.length > 1 && (
                <div className="hl-card rounded-2xl p-4">
                  <div className="text-[11px] font-mono uppercase tracking-wider text-hl-dim mb-2">{data.dailyLabel || 'Aufrufe'} · letzte {rl}</div>
                  <AreaChart data={daily} label={data.dailyLabel || 'Aufrufe'} />
                </div>
              )}

              {(data.viewsReels30 || data.viewsStories30 || data.viewsPosts30) ? (
                <div className="hl-card rounded-2xl p-4">
                  <div className="text-[11px] font-mono uppercase tracking-wider text-hl-dim mb-3">Aufrufe nach Art · {rl}</div>
                  {([
                    { label: 'Reels', value: data.viewsReels30 || 0, color: '#E83E8C' },
                    { label: 'Stories', value: data.viewsStories30 || 0, color: '#8B7CFF' },
                    { label: 'Beiträge', value: data.viewsPosts30 || 0, color: '#F2A93B' },
                  ] as const).map((row) => (
                    <div key={row.label} className="mb-3 last:mb-0">
                      <div className="flex items-center justify-between text-[13px] font-sans mb-1">
                        <span className="font-semibold text-hl-text">{row.label}</span>
                        <span className="tabular-nums font-bold text-hl-text">{compact(row.value)}</span>
                      </div>
                      <div className="h-2.5 rounded-full overflow-hidden bg-white/10">
                        <div className="h-full rounded-full" style={{ width: `${(row.value / totalArt) * 100}%`, background: row.color }} />
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}

              <div className="grid grid-cols-2 gap-2.5">
                <StatTile icon={Heart} label={`Likes · ${rl}`} value={compact(data.totalLikes30)} />
                <StatTile icon={MessageCircle} label={`Kommentare · ${rl}`} value={compact(data.totalComments30)} />
              </div>

              {items.some((m) => m.views != null) && (
                <div className="hl-card rounded-2xl p-4">
                  <div className="text-[11px] font-mono uppercase tracking-wider text-hl-dim mb-3 flex items-center gap-1.5"><Flame className="w-3.5 h-3.5" /> Top-Content nach Aufrufen</div>
                  <div className="flex gap-2.5 overflow-x-auto no-scrollbar -mx-1 px-1">
                    {[...items].filter((m) => m.views != null).sort((a, b) => (b.views || 0) - (a.views || 0)).slice(0, 10).map((m) => (
                      <button key={m.id} onClick={() => setOpenMedia(m)} className="relative shrink-0 w-24 rounded-2xl overflow-hidden bg-black/20 active:scale-[.97] transition-transform" style={{ aspectRatio: '9 / 16' }}>
                        {m.thumbnail ? <img src={m.thumbnail} alt="" loading="lazy" className="absolute inset-0 w-full h-full object-cover" /> : <span className="absolute inset-0 flex items-center justify-center text-hl-faint"><Instagram className="w-6 h-6" /></span>}
                        <div className="absolute inset-x-0 bottom-0 p-1.5 pt-6" style={{ background: 'linear-gradient(0deg, rgba(0,0,0,.75), transparent)' }}>
                          <div className="flex items-center gap-1 text-white text-[11px] font-bold tabular-nums"><Play className="w-2.5 h-2.5 fill-current" /> {compact(m.views)}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : tab === 'content' ? (
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 mb-1">
                {([
                  { id: 'newest', label: 'Neueste' },
                  { id: 'views', label: 'Aufrufe' },
                  { id: 'likes', label: 'Likes' },
                ] as const).map((s) => (
                  <button key={s.id} onClick={() => setSort(s.id)} className="px-3 py-1.5 rounded-full text-[12px] font-sans font-bold cursor-pointer transition-colors" style={sort === s.id ? { background: IG_GRAD, color: '#fff' } : { color: 'var(--color-hl-mute)' }}>
                    {s.label}
                  </button>
                ))}
              </div>
              {[...items].sort((a, b) =>
                sort === 'views' ? (b.views || 0) - (a.views || 0)
                : sort === 'likes' ? (b.likes || 0) - (a.likes || 0)
                : (b.timestamp || '').localeCompare(a.timestamp || '')
              ).map((m) => (
                <button key={m.id} onClick={() => setOpenMedia(m)} className="w-full text-left flex items-center gap-3 hl-card rounded-2xl p-2.5 active:scale-[.99] transition-transform">
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
                </button>
              ))}
            </div>
          ) : (
            /* Zielgruppe */
            <div className="space-y-3">
              <div className="hl-card rounded-2xl p-4">
                <div className="text-[11px] font-mono uppercase tracking-wider text-hl-dim mb-1">Follower</div>
                <div className="flex items-baseline gap-3">
                  <span className="font-display font-black text-4xl tabular-nums text-hl-text leading-none">{compact(data.followers)}</span>
                  {data.newFollowers30 != null && <span className="text-[13px] font-sans font-bold text-hl-green">+{compact(data.newFollowers30)} · {rl}</span>}
                </div>
              </div>

              {followerDaily.length > 1 && (
                <div className="hl-card rounded-2xl p-4">
                  <div className="text-[11px] font-mono uppercase tracking-wider text-hl-dim mb-2">Follower-Zuwachs · {rl}</div>
                  <AreaChart data={followerDaily} label="Netto-Zuwachs / Tag" />
                </div>
              )}

              {demo?.gender?.length ? <DemoBars title="Geschlecht" data={demo.gender} mapKey={(k) => GENDER[k] || k} limit={3} /> : null}
              {demo?.age?.length ? <DemoBars title="Altersgruppen" data={demo.age} limit={6} /> : null}
              {demo?.country?.length ? <DemoBars title="Top-Länder" data={demo.country} mapKey={(k) => COUNTRY[k] || k} /> : null}
              {demo?.city?.length ? <DemoBars title="Top-Städte" data={demo.city} /> : null}

              {!demo?.gender?.length && !demo?.age?.length && !demo?.country?.length && (
                <div className="hl-card rounded-2xl p-6 text-center text-[13px] text-hl-mute">
                  Demografie-Daten sind noch nicht verfügbar (Instagram braucht dafür etwas Zeit / genug Follower).
                </div>
              )}
            </div>
          )}
        </div>
      </motion.div>

      {openMedia && <PostDetail media={openMedia} onClose={() => setOpenMedia(null)} />}
    </ModalPortal>
  );
}
