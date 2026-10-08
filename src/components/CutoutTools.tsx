import { useState } from 'react';
import { Scissors } from 'lucide-react';
import type { Player, Team } from '../types';
import { makeCutout } from '../lib/cutout';
import { validCutout } from '../lib/playerPhoto';

// ===========================================================================
// Freisteller im Backoffice: Hintergrund aus Spielerfotos entfernen.
//  • CutoutButton – pro Spieler (Schere neben der Kamera)
//  • CutoutBatch  – alle Fotos aller Vereine auf einmal (nur fehlende)
// Das Originalfoto bleibt immer erhalten; die Freistellung kommt dazu.
// ===========================================================================

// Schere pro Spieler: ohne Freistellung → freistellen; mit → entfernen.
export function CutoutButton({ player, onDone }: { player: Player; onDone: (patch: Partial<Player>) => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  if (!player.imageUrl) return null;
  const has = Boolean(validCutout(player));
  const run = async () => {
    if (has) {
      if (window.confirm('Freistellung entfernen? Auf der Website erscheint dann wieder das normale Foto.')) {
        onDone({ cutoutUrl: undefined, cutoutSrc: undefined });
      }
      return;
    }
    setBusy(true);
    setErr('');
    try {
      const src = player.imageUrl!;
      onDone({ cutoutUrl: await makeCutout(src), cutoutSrc: src });
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Freistellen fehlgeschlagen');
    } finally {
      setBusy(false);
    }
  };
  return (
    <button
      type="button"
      onClick={run}
      disabled={busy}
      title={err ? `Fehler: ${err} – nochmal versuchen` : has ? 'Freigestellt ✓ – klicken zum Entfernen' : 'Hintergrund entfernen (freistellen)'}
      className={`shrink-0 p-1.5 rounded-md transition-colors cursor-pointer disabled:opacity-60 ${
        err ? 'text-rose-400 hover:bg-rose-500/10' : has ? 'text-emerald-400 hover:bg-emerald-500/10' : 'text-gray-500 hover:text-brand-accent-light hover:bg-white/5'
      }`}
    >
      {busy ? (
        <span className="block w-4 h-4 border-2 border-brand-accent-light border-t-transparent rounded-full animate-spin" />
      ) : (
        <Scissors className="w-4 h-4" />
      )}
    </button>
  );
}

// Alle Vereine: jedes Foto ohne (passende) Freistellung freistellen und den
// Kader des Vereins danach speichern.
export function CutoutBatch({
  teams,
  onEditTeam,
  onTeamSaved,
}: {
  teams: Team[];
  onEditTeam: (teamId: string, data: Partial<Team>) => Promise<boolean>;
  onTeamSaved?: (teamId: string, roster: Player[]) => void;
}) {
  const open = teams.flatMap((t) => (t.spielerliste ?? []).filter((p) => p.imageUrl && !validCutout(p)).map((p) => ({ t, p })));
  const [state, setState] = useState<{ done: number; total: number; failed: number } | null>(null);
  const running = state !== null && state.done < state.total;

  const runAll = async () => {
    if (open.length === 0) return;
    const total = open.length;
    let done = 0;
    let failed = 0;
    setState({ done, total, failed });
    for (const team of teams) {
      const roster = team.spielerliste ?? [];
      if (!roster.some((p) => p.imageUrl && !validCutout(p))) continue;
      const next: Player[] = [];
      let changed = false;
      for (const p of roster) {
        if (p.imageUrl && !validCutout(p)) {
          try {
            next.push({ ...p, cutoutUrl: await makeCutout(p.imageUrl), cutoutSrc: p.imageUrl });
            changed = true;
          } catch {
            failed += 1;
            next.push(p);
          }
          done += 1;
          setState({ done, total, failed });
        } else next.push(p);
      }
      if (changed && (await onEditTeam(team.id, { spielerliste: next }))) onTeamSaved?.(team.id, next);
    }
  };

  if (open.length === 0 && !state) {
    return (
      <p className="text-[11px] text-emerald-400/80 font-sans flex items-center gap-1.5">
        <Scissors className="w-3.5 h-3.5" /> Alle Spielerfotos sind freigestellt.
      </p>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={runAll}
        disabled={running || open.length === 0}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-wider border border-brand-accent/40 text-brand-accent-light hover:bg-brand-accent/10 cursor-pointer disabled:opacity-50"
      >
        <Scissors className="w-3.5 h-3.5" />
        {running ? `Freistellen … ${state!.done}/${state!.total}` : `Alle Fotos freistellen (${open.length})`}
      </button>
      {state && !running && (
        <span className="text-[11px] font-sans text-hl-mute">
          Fertig: {state.done - state.failed} freigestellt{state.failed ? ` · ${state.failed} fehlgeschlagen` : ''}
        </span>
      )}
      {running && <span className="text-[11px] font-sans text-hl-dim">Beim ersten Mal wird das Modell geladen (einige Sekunden).</span>}
    </div>
  );
}
