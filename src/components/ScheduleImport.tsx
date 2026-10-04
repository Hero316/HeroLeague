import { useMemo, useState } from 'react';
import { ClipboardPaste, Check, AlertTriangle, Loader2 } from 'lucide-react';
import type { Match, Team } from '../types';
import { addMinutes, GAME_MINUTES, BREAK_MINUTES } from '../lib/matchTiming';

// ===========================================================================
// Spielplan aus Tabelle übernehmen (Backend → Spielplan verwalten)
//
// Für spontane Umstellungen am Spieltag: neue Reihenfolge als Text einfügen –
// eine Zeile je Anstoßzeit:   19:00 | FC Apex – FC HODOD | Ninetys F.C. – Phalanx United
// („Frei" oder leer = auf dem Feld kein Spiel). Jede Paarung wird dem
// BESTEHENDEN geplanten Spiel dieser zwei Teams im Spieltag zugeordnet (das
// früheste, falls sie zweimal spielen) – es werden KEINE Spiele neu angelegt
// oder gelöscht, nur Anstoß, Feld und Heim/Gast umgestellt. Dadurch bleiben
// Kader/Torwart erhalten und Schiri-App, Website & OBS ziehen sofort mit.
// ===========================================================================

export interface ScheduleChange {
  id: string;
  time: string;
  field: number;
  homeTeamId: string;
  awayTeamId: string;
  slot: number;
}

const norm = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const STOP = new Set(['the', 'fc', 'f', 'c', 'sc', 'sv', 'united', 'club']);
const tokens = (s: string) => norm(s).split(' ').filter((t) => t && !STOP.has(t));

function matchTeam(raw: string, teams: Team[]): Team | null {
  const n = norm(raw);
  if (!n) return null;
  const exact = teams.find((t) => norm(t.name) === n || norm(t.shortName) === n);
  if (exact) return exact;
  // Ähnlichkeit über Wörter (ohne „FC", „The" …), z. B. „The Royal Five" ↔ „Royal Five"
  const a = new Set(tokens(raw));
  let best: Team | null = null;
  let bestScore = 0;
  let tie = false;
  for (const t of teams) {
    const b = new Set(tokens(t.name));
    if (!a.size || !b.size) continue;
    let inter = 0;
    a.forEach((x) => {
      if (b.has(x) || [...b].some((y) => y.startsWith(x) || x.startsWith(y))) inter += 1;
    });
    const score = inter / Math.max(a.size, b.size);
    if (score > bestScore) {
      best = t;
      bestScore = score;
      tie = false;
    } else if (score === bestScore && score > 0) tie = true;
  }
  return bestScore >= 0.5 && !tie ? best : null;
}

interface Row {
  line: number;
  time: string;
  field: number;
  homeRaw: string;
  awayRaw: string;
  home: Team | null;
  away: Team | null;
  match: Match | null;
  error?: string;
}

function parse(text: string, teams: Team[]): { rows: Row[]; errors: string[] } {
  const rows: Row[] = [];
  const errors: string[] = [];
  text.split(/\r?\n/).forEach((rawLine, idx) => {
    const line = rawLine.trim();
    if (!line) return;
    const m = /^(\d{1,2})[:.](\d{2})\s*(.*)$/.exec(line);
    if (!m) {
      if (!/^anstoß|^anstoss|^zeit/i.test(line)) errors.push(`Zeile ${idx + 1}: keine Uhrzeit am Anfang („${line.slice(0, 40)}")`);
      return;
    }
    const time = `${m[1].padStart(2, '0')}:${m[2]}`;
    const segs = m[3].split(/\s*\|\s*|\t+/).map((s) => s.trim());
    if (segs[0] === '') segs.shift();
    segs.forEach((seg, i) => {
      if (!seg || /^(frei|-|–|—|pause)$/i.test(seg)) return;
      const parts = seg.split(/\s+[–—-]\s+|\s+vs\.?\s+|\s+gegen\s+/i);
      if (parts.length !== 2) {
        errors.push(`Zeile ${idx + 1}, Feld ${i + 1}: Paarung nicht erkannt („${seg}") – Format „Team A – Team B"`);
        return;
      }
      const home = matchTeam(parts[0], teams);
      const away = matchTeam(parts[1], teams);
      rows.push({ line: idx + 1, time, field: i + 1, homeRaw: parts[0], awayRaw: parts[1], home, away, match: null });
    });
  });
  return { rows, errors };
}

export default function ScheduleImport({
  teams,
  matches,
  onApply,
}: {
  teams: Team[];
  matches: Match[];
  onApply: (changes: ScheduleChange[]) => Promise<boolean>;
}) {
  const days = useMemo(() => [...new Set(matches.map((m) => m.matchday))].sort((a, b) => a - b), [matches]);
  const defaultDay = useMemo(() => {
    const next = [...matches].filter((m) => m.status === 'geplant').sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`))[0];
    return next?.matchday ?? days[days.length - 1] ?? 1;
  }, [matches, days]);
  const [day, setDay] = useState<number | null>(null);
  const md = day ?? defaultDay;
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState('');

  const result = useMemo(() => {
    const { rows, errors } = parse(text, teams);
    const dayMatches = matches.filter((m) => m.matchday === md);
    const used = new Set<string>();
    const sortedOld = [...dayMatches].sort((a, b) => a.time.localeCompare(b.time) || (a.slot ?? 0) - (b.slot ?? 0) || (a.field ?? 0) - (b.field ?? 0));
    for (const r of rows) {
      if (!r.home) r.error = `„${r.homeRaw}" nicht gefunden`;
      else if (!r.away) r.error = `„${r.awayRaw}" nicht gefunden`;
      else if (r.home.id === r.away.id) r.error = 'gleiches Team zweimal';
      if (r.error) continue;
      const pair = (m: Match) =>
        (m.homeTeamId === r.home!.id && m.awayTeamId === r.away!.id) || (m.homeTeamId === r.away!.id && m.awayTeamId === r.home!.id);
      const cand = sortedOld.find((m) => !used.has(m.id) && pair(m));
      if (!cand) {
        r.error = `Paarung gibt es am ${md}. Spieltag nicht (mehr)`;
        continue;
      }
      if (cand.status !== 'geplant') {
        r.error = cand.status === 'live' ? 'Spiel läuft gerade' : 'Spiel ist schon beendet';
        continue;
      }
      used.add(cand.id);
      r.match = cand;
    }
    // Doppelte Belegung desselben Feldes zur selben Zeit?
    const seen = new Set<string>();
    for (const r of rows) {
      const k = `${r.time}|${r.field}`;
      if (seen.has(k)) r.error = r.error ?? `Feld ${r.field} um ${r.time} doppelt belegt`;
      seen.add(k);
    }
    // Teams, die zur selben Zeit zweimal spielen würden?
    const busyAt = new Map<string, string>();
    for (const r of rows) {
      if (!r.home || !r.away) continue;
      for (const t of [r.home, r.away]) {
        const k = `${r.time}|${t.id}`;
        if (busyAt.has(k)) r.error = r.error ?? `${t.name} spielt um ${r.time} zweimal`;
        busyAt.set(k, r.time);
      }
    }
    const ok = rows.length > 0 && errors.length === 0 && rows.every((r) => !r.error && r.match);
    // Nicht genannte, noch geplante Spiele NACH dem neuen Block (z. B. 2. Block):
    // überschneiden sie sich mit dem neuen Block, rücken sie im 8+3-Takt dahinter.
    const newTimes = rows.map((r) => r.time).sort();
    const firstNew = newTimes[0] ?? '';
    const lastNew = newTimes[newTimes.length - 1] ?? '';
    const later = dayMatches.filter((m) => !used.has(m.id) && m.status === 'geplant' && m.time >= firstNew);
    const needShift = later.some((m) => m.time <= lastNew);
    const shifted = new Map<string, string>();
    if (ok && needShift) {
      const groups = [...new Set(later.map((m) => m.time))].sort();
      const step = GAME_MINUTES + BREAK_MINUTES;
      const start = addMinutes(lastNew, step);
      groups.forEach((t, i) => later.filter((m) => m.time === t).forEach((m) => shifted.set(m.id, addMinutes(start, i * step))));
    }
    // Zeitfenster (slot) für den GANZEN Spieltag neu durchnummerieren.
    const finalTime = new Map<string, string>(dayMatches.map((m) => [m.id, m.time]));
    rows.forEach((r) => r.match && finalTime.set(r.match.id, r.time));
    shifted.forEach((t, id) => finalTime.set(id, t));
    const distinct = [...new Set(finalTime.values())].sort();
    const slotOf = (t: string) => distinct.indexOf(t) + 1;
    const changes: ScheduleChange[] = [];
    if (ok) {
      const touched = new Set<string>();
      for (const r of rows) {
        const m = r.match!;
        touched.add(m.id);
        changes.push({ id: m.id, time: r.time, field: r.field, homeTeamId: r.home!.id, awayTeamId: r.away!.id, slot: slotOf(r.time) });
      }
      for (const m of dayMatches) {
        if (touched.has(m.id)) continue;
        const t = finalTime.get(m.id) ?? m.time;
        const s = slotOf(t);
        if (m.slot !== s || t !== m.time) changes.push({ id: m.id, time: t, field: m.field ?? 1, homeTeamId: m.homeTeamId, awayTeamId: m.awayTeamId, slot: s });
      }
    }
    const untouched = dayMatches.filter((m) => !used.has(m.id));
    return { rows, errors, ok, changes, untouched, shifted };
  }, [text, teams, matches, md]);

  const apply = async () => {
    if (!result.ok) return;
    if (!window.confirm(`${result.rows.length} Spiele des ${md}. Spieltags umstellen (Anstoß, Feld, Heim/Gast)?\n\nSchiri-App, Website und OBS übernehmen das automatisch.`)) return;
    setBusy(true);
    setDone('');
    const ok = await onApply(result.changes);
    setBusy(false);
    if (ok) {
      setDone(`✓ ${result.rows.length} Spiele umgestellt. Schiris: App einmal neu laden.`);
      setText('');
    }
  };

  const nameOf = (id: string) => teams.find((t) => t.id === id)?.name ?? '?';

  return (
    <div className="bg-[#060E0F]/40 border border-brand-accent-light/25 rounded-xl p-4">
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <ClipboardPaste className="w-4 h-4 text-brand-accent-light" />
        <h4 className="text-sm font-bold text-white font-sans">Spielplan aus Tabelle übernehmen</h4>
        <label className="ml-auto inline-flex items-center gap-2 text-xs font-mono text-gray-400 uppercase tracking-wider">
          Spieltag
          <select value={md} onChange={(e) => setDay(Number(e.target.value))} className="bg-[#060E0F] border border-white/10 rounded-lg px-2 py-1.5 text-sm text-white cursor-pointer">
            {days.map((d) => (
              <option key={d} value={d}>
                {d}.
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="text-[11px] text-gray-400 font-sans mb-3 leading-relaxed">
        Eine Zeile je Anstoß: <code className="text-brand-accent-light">19:00 | FC Apex – FC HODOD | Ninetys F.C. – Phalanx United</code> (Feld 1 | Feld 2,
        „Frei" = kein Spiel). Bestehende Spiele werden nur umgestellt (Anstoß, Feld, Heim/Gast) – nichts wird gelöscht. Nicht genannte Spiele
        (z. B. 2. Block) bleiben, wie sie sind.
      </p>
      <textarea
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setDone('');
        }}
        rows={8}
        placeholder={'19:00 | FC Apex – FC HODOD | Ninetys F.C. – Phalanx United\n19:11 | FC Apex – The Royal Five | FC Patchwork – Phalanx United\n19:22 | Frei | Ninetys F.C. – FC HODOD'}
        className="w-full bg-[#060E0F] border border-white/10 rounded-xl px-3 py-2.5 text-[13px] text-white font-mono focus:outline-none focus:border-brand-accent-light"
      />

      {(result.rows.length > 0 || result.errors.length > 0) && (
        <div className="mt-3 space-y-2">
          {result.errors.map((e) => (
            <div key={e} className="flex items-start gap-2 text-[12px] text-amber-200"><AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />{e}</div>
          ))}
          <div className="overflow-x-auto">
            <table className="w-full text-[12px] font-sans">
              <thead>
                <tr className="text-gray-500 text-left uppercase tracking-wider text-[10px]">
                  <th className="py-1 pr-2">Neu</th>
                  <th className="py-1 pr-2">Feld</th>
                  <th className="py-1 pr-2">Paarung</th>
                  <th className="py-1 pr-2">Vorher</th>
                </tr>
              </thead>
              <tbody>
                {result.rows.map((r, i) => (
                  <tr key={i} className={`border-t border-white/5 ${r.error ? 'text-red-300' : 'text-white'}`}>
                    <td className="py-1 pr-2 tabular-nums font-bold">{r.time}</td>
                    <td className="py-1 pr-2">{r.field}</td>
                    <td className="py-1 pr-2">
                      {r.home?.name ?? <span className="underline decoration-dotted">{r.homeRaw}</span>} – {r.away?.name ?? <span className="underline decoration-dotted">{r.awayRaw}</span>}
                      {r.error && <span className="ml-2 text-[11px]">⚠ {r.error}</span>}
                    </td>
                    <td className="py-1 pr-2 text-gray-500 tabular-nums">{r.match ? `${r.match.time} · F${r.match.field ?? 1}` : '–'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {result.ok && result.shifted.size > 0 && (
            <div className="rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-[12px] text-amber-100">
              <b>Weitere Spiele rücken nach hinten</b> (sonst würden sie sich mit dem neuen Block überschneiden):
              <div className="mt-1 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-0.5 text-[11px]">
                {result.untouched
                  .filter((m) => result.shifted.has(m.id))
                  .sort((a, b) => a.time.localeCompare(b.time) || (a.field ?? 0) - (b.field ?? 0))
                  .map((m) => (
                    <span key={m.id} className="truncate">
                      {m.time} → <b>{result.shifted.get(m.id)}</b> · F{m.field ?? 1} · {nameOf(m.homeTeamId)} – {nameOf(m.awayTeamId)}
                    </span>
                  ))}
              </div>
            </div>
          )}
          {result.ok && result.untouched.length > result.shifted.size && (
            <div className="text-[11px] text-gray-400">
              Bleiben unverändert ({result.untouched.length - result.shifted.size}):{' '}
              {result.untouched
                .filter((m) => !result.shifted.has(m.id))
                .slice(0, 6)
                .map((m) => `${m.time} ${nameOf(m.homeTeamId)} – ${nameOf(m.awayTeamId)}`)
                .join(' · ')}
              {result.untouched.length - result.shifted.size > 6 ? ' …' : ''}
            </div>
          )}
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={!result.ok || busy}
          onClick={apply}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider bg-brand-accent-light/15 border border-brand-accent-light/40 text-brand-accent-light hover:bg-brand-accent-light/25 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
          {result.ok ? `${result.rows.length} Spiele übernehmen` : 'Übernehmen'}
        </button>
        {done && <span className="text-xs text-emerald-400 font-sans">{done}</span>}
      </div>
    </div>
  );
}
