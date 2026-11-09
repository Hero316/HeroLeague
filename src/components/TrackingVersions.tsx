import { useMemo, useState } from 'react';
import { ChevronDown, GitCompare, Trash2, Check, UserRound, ShieldCheck } from 'lucide-react';
import type { ActionCounts, Match, ScoringConfig, StatRole, Team } from '../types';
import { ACTION_META } from '../lib/scoring';
import { matchNote, normalizeCounts } from '../lib/rating';
import type { TrackVersion } from '../lib/stats';

// ===========================================================================
// Statistik-Center → Spiel: Vergleichsmodus. Eine zweite Person trackt dasselbe
// Spiel als EIGENE Version (getrennt gespeichert). Hier: Umschalter oben im Spiel
// und die Gegenüberstellung zweier Versionen (je Spieler + Summen + Übereinstimmung).
// Die offiziellen Daten ändern sich nur über „Übernehmen" (Super-Admin).
// ===========================================================================

export type VersionView = 'official' | 'compare' | 'mine';

interface SourceRow {
  teamId: string;
  playerName: string;
  role: StatRole;
  out: boolean;
  counts: ActionCounts;
}
type Source = { key: string; label: string; rows: Map<string, SourceRow> };

const total = (c: ActionCounts) => Object.values(c).reduce((s, v) => s + (Number(v) || 0), 0);
const played = (r?: SourceRow) => !!r && !r.out && (r.role === 'keeper' || total(r.counts) > 0);
const fmtNote = (n: number) => n.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const isBackup = (key: string) => key.startsWith('backup:');

// --- Umschalter oben im Spiel ---------------------------------------------------
export function VersionBar({
  view,
  onView,
  officialBy,
  me,
  hasMine,
  versionCount,
}: {
  view: VersionView;
  onView: (v: VersionView) => void;
  officialBy?: string;
  me: { key: string; name: string };
  hasMine: boolean;
  versionCount: number;
}) {
  const chip = (active: boolean) =>
    `inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold uppercase tracking-wider border cursor-pointer transition-colors ${
      active ? 'bg-brand-accent/20 border-brand-accent-light/50 text-white' : 'bg-white/5 border-white/10 text-hl-mute hover:text-hl-text'
    }`;
  return (
    <div className="mb-4">
      <div className="flex flex-wrap items-center gap-2">
        <button className={chip(view === 'official')} onClick={() => onView('official')}>
          <ShieldCheck className="w-3.5 h-3.5" /> Offiziell{officialBy ? ` · ${officialBy}` : ''}
        </button>
        <button className={chip(view === 'mine')} onClick={() => onView('mine')}>
          <UserRound className="w-3.5 h-3.5" /> {hasMine || view === 'mine' ? `Meine Version · ${me.name}` : 'Zum Vergleich tracken'}
        </button>
        {/* Vergleich geht, sobald es eine Version gibt – oder man gerade die eigene trackt. */}
        <button
          className={`${chip(view === 'compare')} disabled:opacity-40 disabled:cursor-default`}
          onClick={() => onView('compare')}
          disabled={versionCount === 0 && view !== 'mine'}
        >
          <GitCompare className="w-3.5 h-3.5" /> Vergleich
        </button>
      </div>
      {view === 'mine' && (
        <p className="mt-2 text-[12px] text-[#E9C46A]">
          Du trackst deine eigene Version. Sie zählt nicht für die Website, bis ein Super-Admin sie übernimmt.
        </p>
      )}
    </div>
  );
}

// --- Gegenüberstellung ------------------------------------------------------------
export function VersionCompare({
  match,
  resolveTeam,
  officialRows,
  officialBy,
  versions,
  cfg,
  me,
  canAdopt,
  busy,
  onAdopt,
  onDelete,
}: {
  match: Match;
  resolveTeam: (key: string) => Team | undefined;
  officialRows: { teamId: string; playerName: string; role: StatRole; out?: boolean; counts: ActionCounts }[];
  officialBy?: string;
  versions: TrackVersion[];
  cfg: ScoringConfig;
  me: { key: string; name: string };
  canAdopt: boolean;
  busy: boolean;
  onAdopt: (versionKey: string, label: string) => void;
  onDelete: (versionKey: string, label: string) => void;
}) {
  const sources = useMemo<Source[]>(() => {
    const toMap = (rows: { teamId: string; playerName: string; role: string; out?: boolean; counts: unknown }[]) => {
      const m = new Map<string, SourceRow>();
      for (const r of rows) {
        m.set(`${r.teamId}::${r.playerName}`, {
          teamId: r.teamId,
          playerName: r.playerName,
          role: r.role === 'keeper' ? 'keeper' : 'field',
          out: r.out === true || r.role === 'out',
          counts: normalizeCounts(r.counts as ActionCounts),
        });
      }
      return m;
    };
    return [
      { key: 'official', label: `Offiziell${officialBy ? ` (${officialBy})` : ''}`, rows: toMap(officialRows) },
      ...versions.map((v) => ({ key: v.key, label: v.key === me.key ? `${v.name} (du)` : v.name, rows: toMap(v.rows) })),
    ];
  }, [officialRows, officialBy, versions, me.key]);

  const firstOther = sources.find((s) => s.key !== 'official' && !isBackup(s.key))?.key ?? sources[1]?.key ?? 'official';
  const [aKey, setAKey] = useState('official');
  const [bKey, setBKey] = useState(firstOther);
  const A = sources.find((s) => s.key === aKey) ?? sources[0];
  const B = sources.find((s) => s.key === bKey) ?? sources[Math.min(1, sources.length - 1)];
  const [open, setOpen] = useState<string | null>(null);

  const data = useMemo(() => {
    const keys = new Set<string>();
    for (const s of [A, B]) for (const [k, r] of s.rows) if (played(r) || r.out) keys.add(k);
    let sumMin = 0;
    let sumMax = 0;
    const actionTotals = new Map<string, { a: number; b: number }>();
    const players = [...keys].map((k) => {
      const a = A.rows.get(k);
      const b = B.rows.get(k);
      const ref = a ?? b!;
      const diffs: { key: string; label: string; a: number; b: number }[] = [];
      for (const m of ACTION_META) {
        const va = a && !a.out ? a.counts[m.key] || 0 : 0;
        const vb = b && !b.out ? b.counts[m.key] || 0 : 0;
        sumMin += Math.min(va, vb);
        sumMax += Math.max(va, vb);
        const t = actionTotals.get(m.key) ?? { a: 0, b: 0 };
        t.a += va;
        t.b += vb;
        actionTotals.set(m.key, t);
        if (va !== vb) diffs.push({ key: m.key, label: m.label, a: va, b: vb });
      }
      const noteA = played(a) ? matchNote(a!.counts, cfg, a!.role) : null;
      const noteB = played(b) ? matchNote(b!.counts, cfg, b!.role) : null;
      const actA = a && !a.out ? total(a.counts) : 0;
      const actB = b && !b.out ? total(b.counts) : 0;
      return {
        k,
        teamId: ref.teamId,
        name: ref.playerName,
        noteA,
        noteB,
        actA,
        actB,
        diffs,
        gap: Math.abs(actA - actB) + diffs.reduce((s, d) => s + Math.abs(d.a - d.b), 0),
      };
    });
    players.sort((x, y) => (x.teamId === y.teamId ? y.gap - x.gap || x.name.localeCompare(y.name) : x.teamId === match.homeTeamId ? -1 : 1));
    const actions = ACTION_META.map((m) => ({ key: m.key, label: m.label, ...(actionTotals.get(m.key) ?? { a: 0, b: 0 }) }))
      .filter((x) => x.a || x.b)
      .sort((x, y) => Math.abs(y.a - y.b) - Math.abs(x.a - x.b));
    const agreement = sumMax > 0 ? Math.round((sumMin / sumMax) * 100) : 100;
    return { players, actions, agreement };
  }, [A, B, cfg, match.homeTeamId]);

  const sel = 'bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-[13px] font-bold text-white cursor-pointer min-w-0 max-w-full';
  const agreeTone = data.agreement >= 85 ? 'text-hl-green' : data.agreement >= 70 ? 'text-[#E9C46A]' : 'text-red-300';

  return (
    <div className="space-y-4 hl-fade">
      {/* Auswahl A / B */}
      <div className="hl-card p-3 sm:p-4 grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] gap-2 items-center">
        <select value={A.key} onChange={(e) => setAKey(e.target.value)} className={sel}>
          {sources.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
        <span className="text-center text-hl-faint text-xs font-bold uppercase tracking-wider">vs</span>
        <select value={B.key} onChange={(e) => setBKey(e.target.value)} className={sel}>
          {sources.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
      </div>

      {/* Übereinstimmung + Aktionen gesamt */}
      <div className="grid grid-cols-1 lg:grid-cols-[220px_minmax(0,1fr)] gap-3">
        <div className="hl-card p-4 flex flex-col items-center justify-center text-center">
          <div className={`font-display font-black text-5xl tabular-nums leading-none ${agreeTone}`}>{data.agreement}%</div>
          <div className="text-[11px] font-bold uppercase tracking-wider text-hl-dim mt-2">Übereinstimmung</div>
        </div>
        <div className="hl-card p-3 sm:p-4 min-w-0">
          <div className="grid grid-cols-[minmax(0,1fr)_56px_56px_52px] gap-2 text-[10px] font-bold uppercase tracking-wider text-hl-faint pb-2 border-b border-white/[.06]">
            <span>Aktion (ganzes Spiel)</span>
            <span className="text-right truncate">A</span>
            <span className="text-right truncate">B</span>
            <span className="text-right">Diff.</span>
          </div>
          <div className="max-h-[220px] overflow-y-auto">
            {data.actions.map((x) => (
              <div key={x.key} className="grid grid-cols-[minmax(0,1fr)_56px_56px_52px] gap-2 py-1.5 text-[13px] border-b border-white/[.04] last:border-0">
                <span className="truncate text-hl-text">{x.label}</span>
                <span className="text-right tabular-nums text-white">{x.a}</span>
                <span className="text-right tabular-nums text-white">{x.b}</span>
                <span className={`text-right tabular-nums font-bold ${x.a === x.b ? 'text-hl-faint' : 'text-[#E9C46A]'}`}>{x.b - x.a > 0 ? '+' : ''}{x.b - x.a}</span>
              </div>
            ))}
            {data.actions.length === 0 && <div className="py-3 text-[13px] text-hl-mute">Noch keine Werte.</div>}
          </div>
        </div>
      </div>

      {/* Je Spieler */}
      <div className="hl-card divide-y divide-white/[.05] overflow-hidden">
        <div className="grid grid-cols-[minmax(0,1fr)_64px_64px_24px] gap-2 px-3 sm:px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-hl-faint">
          <span>Spieler</span>
          <span className="text-right truncate">Note A</span>
          <span className="text-right truncate">Note B</span>
          <span />
        </div>
        {data.players.map((p) => {
          const diffNote = p.noteA !== null && p.noteB !== null ? Math.abs(p.noteA - p.noteB) : p.noteA === p.noteB ? 0 : 99;
          const tone = diffNote >= 0.5 ? 'bg-[#E9C46A]/[.06]' : '';
          const isOpen = open === p.k;
          return (
            <div key={p.k} className={tone}>
              <button onClick={() => setOpen(isOpen ? null : p.k)} className="w-full grid grid-cols-[minmax(0,1fr)_64px_64px_24px] gap-2 items-center px-3 sm:px-4 py-2.5 text-left cursor-pointer hover:bg-white/[.03]">
                <span className="min-w-0">
                  <span className="block truncate font-semibold text-white text-[14px]">{p.name}</span>
                  <span className="block truncate text-[11px] text-hl-dim">
                    {resolveTeam(p.teamId)?.name ?? p.teamId} · {p.actA} / {p.actB} Aktionen{p.diffs.length ? ` · ${p.diffs.length} Abweichungen` : ''}
                  </span>
                </span>
                <span className="text-right font-display font-black tabular-nums text-white">{p.noteA === null ? '–' : fmtNote(p.noteA)}</span>
                <span className="text-right font-display font-black tabular-nums text-white">{p.noteB === null ? '–' : fmtNote(p.noteB)}</span>
                <ChevronDown className={`w-4 h-4 text-hl-faint transition-transform ${isOpen ? 'rotate-180' : ''}`} />
              </button>
              {isOpen && (
                <div className="px-3 sm:px-4 pb-3">
                  {p.diffs.length === 0 ? (
                    <div className="text-[12px] text-hl-green flex items-center gap-1.5"><Check className="w-3.5 h-3.5" /> Beide Versionen identisch.</div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6">
                      {p.diffs.map((d) => (
                        <div key={d.key} className="grid grid-cols-[minmax(0,1fr)_40px_40px] gap-2 py-1 text-[12.5px] border-b border-white/[.04]">
                          <span className="truncate text-hl-soft">{d.label}</span>
                          <span className="text-right tabular-nums text-white">{d.a}</span>
                          <span className="text-right tabular-nums text-white">{d.b}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {data.players.length === 0 && <div className="px-4 py-6 text-center text-[13px] text-hl-mute">In beiden Versionen noch keine Werte.</div>}
      </div>

      {/* Übernehmen / Löschen */}
      <div className="flex flex-wrap gap-2">
        {[A, B]
          .filter((s, i, arr) => s.key !== 'official' && arr.findIndex((x) => x.key === s.key) === i)
          .map((s) => (
            <div key={s.key} className="flex flex-wrap gap-2">
              {canAdopt && (
                <button
                  disabled={busy}
                  onClick={() => onAdopt(s.key, s.label)}
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider bg-brand-accent text-white cursor-pointer disabled:opacity-50"
                >
                  <ShieldCheck className="w-3.5 h-3.5" /> „{s.label}" übernehmen
                </button>
              )}
              {(s.key === me.key || canAdopt) && (
                <button
                  disabled={busy}
                  onClick={() => onDelete(s.key, s.label)}
                  className="inline-flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider border border-red-500/30 text-red-300 hover:bg-red-500/10 cursor-pointer disabled:opacity-50"
                >
                  <Trash2 className="w-3.5 h-3.5" /> löschen
                </button>
              )}
            </div>
          ))}
      </div>
    </div>
  );
}
