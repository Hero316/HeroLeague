import { useEffect, useMemo, useState } from 'react';
import { Check, Loader2, Search, X } from 'lucide-react';
import { useBackClose } from '../lib/backStack';
import { fetchTrackingAudio, fetchTrackingRules, linkTrackingAudio, parseVoice, type TrackingAudio, type VoiceRosterPlayer } from '../lib/voice';
import { resolveSelection, type VoicePlayer } from './VoiceTrackingPanel';
import { ModalPortal } from './ui';

// ===========================================================================
// „Vorlagen nachprüfen": die Aufnahme(n) eines Spiels noch einmal von Gemini
// auswerten lassen und NUR die Vorlagen mit dem Gespeicherten vergleichen.
// Abweichungen werden einzeln per Klick übernommen. Beim Nachtragen wird ein
// schon gezählter Pass zur Vorlage (Pässe bleiben gleich) – nichts doppelt.
// ===========================================================================

interface Props {
  matchId: string;
  matchDate?: string; // YYYY-MM-DD – Aufnahmen rund um diesen Tag zuerst
  homeName: string;
  awayName: string;
  players: VoicePlayer[];
  stored: Record<string, number>; // "teamId::Name" → gespeicherte Vorlagen
  onFix: (teamId: string, player: string, dir: 1 | -1) => void;
  onClose: () => void;
}

const BYTES_PER_SEC = 32000; // WAV 16 kHz mono
const fmtDur = (bytes?: number) => {
  if (!bytes) return '';
  const s = Math.round(bytes / BYTES_PER_SEC);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')} min`;
};
const fmtAt = (iso: string) =>
  new Date(iso).toLocaleString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

export default function AssistCheck({ matchId, matchDate, homeName, awayName, players, stored, onFix, onClose }: Props) {
  useBackClose(true, onClose);
  const [audio, setAudio] = useState<{ linked: TrackingAudio[]; recent: TrackingAudio[] } | null>(null);
  const [loadErr, setLoadErr] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [showAll, setShowAll] = useState(false);
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  // Ergebnis: Vorlagen laut Aufnahme je Spieler + die auslösenden Stellen.
  const [found, setFound] = useState<Record<string, { n: number; quotes: string[] }> | null>(null);
  const [done, setDone] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchTrackingAudio(matchId)
      .then((a) => {
        setAudio(a);
        setPicked(new Set(a.linked.map((x) => x.url)));
      })
      .catch((e) => setLoadErr(e instanceof Error ? e.message : 'Aufnahmen konnten nicht geladen werden.'));
  }, [matchId]);

  // Liste: verknüpfte zuerst, dann die übrigen – Aufnahmen rund ums Spieldatum oben.
  const list = useMemo(() => {
    if (!audio) return [];
    const linked = new Set(audio.linked.map((a) => a.url));
    const others = audio.recent.filter((a) => !linked.has(a.url));
    const near = (a: TrackingAudio) => {
      if (!matchDate) return 1;
      const d = Math.abs(new Date(a.at).getTime() - new Date(`${matchDate}T12:00:00`).getTime());
      return d <= 3 * 86400000 ? 0 : 1;
    };
    others.sort((a, b) => near(a) - near(b) || b.at.localeCompare(a.at));
    const sizeOf = new Map(audio.recent.map((a) => [a.url, a.size]));
    return [
      ...audio.linked.map((a) => ({ ...a, size: a.size ?? sizeOf.get(a.url), linked: true })),
      ...others.map((a) => ({ ...a, linked: false })),
    ];
  }, [audio, matchDate]);
  const visible = showAll ? list : list.slice(0, 8);

  const toggle = (url: string) =>
    setPicked((cur) => {
      const n = new Set(cur);
      if (n.has(url)) n.delete(url);
      else n.add(url);
      return n;
    });

  const run = async () => {
    const urls = list.filter((a) => picked.has(a.url)).map((a) => a.url);
    if (urls.length === 0) return;
    setErr('');
    setFound(null);
    setDone(new Set());
    try {
      const rules = (await fetchTrackingRules().catch(() => ({ text: '' }))).text;
      const ctxPlayers: VoiceRosterPlayer[] = players.map((p) => ({
        team: p.side,
        teamName: p.teamName,
        name: p.name,
        role: p.role,
        ...(typeof p.number === 'number' ? { number: p.number } : {}),
      }));
      const acc: Record<string, { n: number; quotes: string[] }> = {};
      for (let i = 0; i < urls.length; i++) {
        setBusy(`Gemini hört Aufnahme ${i + 1} von ${urls.length} noch einmal ab …`);
        const res = await parseVoice({
          audioUrl: urls[i],
          mimeType: 'audio/wav',
          context: { homeTeam: homeName, awayTeam: awayName, players: ctxPlayers, rules },
        });
        for (const ev of res.events) {
          if (ev.action !== 'assist') continue;
          const k = resolveSelection(ev, players);
          if (!k) continue;
          const cur = (acc[k] ??= { n: 0, quotes: [] });
          cur.n += Math.max(1, ev.delta || 1);
          if (ev.quote) cur.quotes.push(ev.quote);
        }
        // Gewählte Aufnahme fürs nächste Mal mit dem Spiel verknüpfen.
        void linkTrackingAudio(matchId, urls[i]).catch(() => {});
      }
      setFound(acc);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Auswertung fehlgeschlagen.');
    } finally {
      setBusy('');
    }
  };

  // Vergleich: alle Spieler mit gespeicherten ODER gefundenen Vorlagen.
  const diffs = useMemo(() => {
    if (!found) return [];
    const keys = new Set([...Object.keys(found), ...Object.keys(stored).filter((k) => (stored[k] ?? 0) > 0)]);
    return [...keys]
      .map((k) => {
        const [teamId, ...rest] = k.split('::');
        const name = rest.join('::');
        const p = players.find((x) => x.teamId === teamId && x.name === name);
        return { k, teamId, name, teamName: p?.teamName ?? '', have: stored[k] ?? 0, want: found[k]?.n ?? 0, quotes: found[k]?.quotes ?? [] };
      })
      .sort((a, b) => Math.abs(b.want - b.have) - Math.abs(a.want - a.have) || a.name.localeCompare(b.name, 'de'));
  }, [found, stored, players]);
  const open = diffs.filter((d) => d.want !== d.have && !done.has(d.k));

  const apply = (d: (typeof diffs)[number]) => {
    const dir: 1 | -1 = d.want > d.have ? 1 : -1;
    for (let i = 0; i < Math.abs(d.want - d.have); i++) onFix(d.teamId, d.name, dir);
    setDone((cur) => new Set(cur).add(d.k));
  };

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[130] flex items-end sm:items-center justify-center sm:p-6" role="dialog" aria-modal="true">
        <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
        <div
          className="hl-modal-card relative w-full sm:max-w-2xl max-h-[90vh] flex flex-col rounded-t-3xl sm:rounded-3xl border border-white/10 overflow-hidden"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          <div className="px-4 sm:px-5 pt-5 pb-3 border-b border-white/10 flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <div className="font-display font-black uppercase tracking-tight text-white text-lg">Vorlagen nachprüfen</div>
              <p className="text-xs text-hl-mute mt-0.5">
                {homeName} – {awayName} · Gemini hört die Aufnahme noch einmal ab und vergleicht nur die Vorlagen.
              </p>
            </div>
            <button onClick={onClose} aria-label="Schließen" className="w-9 h-9 shrink-0 grid place-items-center rounded-xl text-hl-mute hover:text-white hover:bg-white/10 cursor-pointer">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="overflow-y-auto p-4 sm:p-5 space-y-4">
            {/* 1. Aufnahmen wählen */}
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wider text-hl-dim mb-2">1 · Aufnahme(n) dieses Spiels</div>
              {loadErr && <p className="text-sm text-rose-300">{loadErr}</p>}
              {!audio && !loadErr && (
                <p className="text-sm text-hl-mute flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" /> Aufnahmen werden geladen …
                </p>
              )}
              {audio && list.length === 0 && <p className="text-sm text-hl-mute">Keine Audio-Aufnahmen gefunden.</p>}
              {audio && audio.linked.length === 0 && list.length > 0 && (
                <p className="text-xs text-amber-300/90 mb-2">
                  Diesem Spiel ist noch keine Aufnahme fest zugeordnet (ältere Spiele). Wähle anhand von Datum, Uhrzeit und Anhören die
                  passende(n) aus – danach merkt sich die Seite die Zuordnung.
                </p>
              )}
              <div className="space-y-1.5">
                {visible.map((a) => {
                  const on = picked.has(a.url);
                  return (
                    <div
                      key={a.url}
                      className={`rounded-xl border px-3 py-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 ${on ? 'border-brand-accent-light/60 bg-brand-accent/10' : 'border-white/10 bg-white/[.03]'}`}
                    >
                      <button type="button" onClick={() => toggle(a.url)} className="flex items-center gap-2.5 min-w-0 flex-1 text-left cursor-pointer">
                        <span className={`w-5 h-5 shrink-0 rounded-md border grid place-items-center ${on ? 'bg-brand-accent-light border-brand-accent-light text-[#062018]' : 'border-white/25'}`}>
                          {on && <Check className="w-3.5 h-3.5" strokeWidth={3} />}
                        </span>
                        <span className="min-w-0">
                          <span className="block text-sm font-semibold text-white truncate">
                            {fmtAt(a.at)}
                            {a.linked && <span className="ml-2 text-[10px] font-bold uppercase tracking-wider text-brand-accent-light">dieses Spiel</span>}
                          </span>
                          <span className="block text-[11px] text-hl-dim">{fmtDur(a.size)}</span>
                        </span>
                      </button>
                      <audio controls preload="none" src={a.url} className="h-8 w-full sm:w-56 shrink-0" />
                    </div>
                  );
                })}
              </div>
              {list.length > visible.length && (
                <button type="button" onClick={() => setShowAll(true)} className="mt-2 text-[11px] font-bold uppercase tracking-wider text-brand-accent-light cursor-pointer">
                  Alle {list.length} Aufnahmen zeigen
                </button>
              )}
              <button
                type="button"
                onClick={run}
                disabled={picked.size === 0 || !!busy}
                className="mt-3 w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider text-white cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ background: 'linear-gradient(135deg,#E6238E,#b81570)' }}
              >
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                {busy ? 'Prüfe …' : `Vorlagen prüfen (${picked.size} ${picked.size === 1 ? 'Aufnahme' : 'Aufnahmen'})`}
              </button>
              {busy && <p className="text-xs text-hl-mute mt-2">{busy}</p>}
              {err && <p className="text-sm text-rose-300 mt-2">{err}</p>}
            </div>

            {/* 2. Ergebnis */}
            {found && (
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wider text-hl-dim mb-2">2 · Ergebnis</div>
                {diffs.length === 0 ? (
                  <p className="text-sm text-hl-mute">Weder gespeichert noch in der Aufnahme gibt es Vorlagen.</p>
                ) : (
                  <div className="space-y-1.5">
                    {diffs.map((d) => {
                      const same = d.want === d.have || done.has(d.k);
                      return (
                        <div key={d.k} className="rounded-xl border border-white/10 bg-white/[.03] px-3 py-2.5">
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                            <div className="min-w-0 flex-1">
                              <div className="text-sm font-semibold text-white truncate">{d.name}</div>
                              <div className="text-[11px] text-hl-dim truncate">{d.teamName}</div>
                            </div>
                            <div className="text-xs text-hl-soft tabular-nums shrink-0">
                              gespeichert <b className="text-white">{d.have}</b> · laut Aufnahme <b className="text-white">{d.want}</b>
                            </div>
                            {same ? (
                              <span className="shrink-0 inline-flex items-center gap-1 text-xs font-bold text-emerald-400">
                                <Check className="w-4 h-4" /> {done.has(d.k) ? 'übernommen' : 'stimmt'}
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => apply(d)}
                                className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer border ${
                                  d.want > d.have ? 'border-emerald-400/50 text-emerald-300 hover:bg-emerald-400/10' : 'border-amber-400/50 text-amber-300 hover:bg-amber-400/10'
                                }`}
                              >
                                {d.want > d.have ? `+${d.want - d.have} Vorlage übernehmen` : `−${d.have - d.want} Vorlage entfernen`}
                              </button>
                            )}
                          </div>
                          {d.quotes.length > 0 && (
                            <div className="mt-1.5 space-y-0.5">
                              {d.quotes.slice(0, 4).map((q, i) => (
                                <div key={i} className="text-[11px] text-hl-mute italic truncate">„{q}"</div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
                {open.length > 1 && (
                  <button type="button" onClick={() => open.forEach(apply)} className="mt-3 text-xs font-bold uppercase tracking-wider text-brand-accent-light cursor-pointer">
                    Alle {open.length} Abweichungen übernehmen
                  </button>
                )}
                <p className="text-[11px] text-hl-faint mt-3 leading-snug">
                  Nachgetragene Vorlage = ein schon gezählter Pass wird zur Vorlage (die Pässe bleiben gleich). Entfernte Vorlage = sie
                  zählt wieder als normaler Pass. Alles lässt sich mit „Rückgängig" zurücknehmen.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
