import { useState } from 'react';
import { History } from 'lucide-react';
import type { Player, Team } from '../types';

// ===========================================================================
// EINMALIG (November 2026): Viele Spieler haben neue Kartenbilder bekommen
// (Action-Fotos – auf den FIFA-Karten top, in der Hero-One-Liste aber winzige
// Ganzkörper-Figuren oder mehrere Personen). Hero One soll die VORHERIGEN
// Porträts (freigestellt, Kopf & Schultern) zeigen. Die alten Bilder liegen
// weiter im Blob-Speicher; die Liste stammt aus dem Kader-Stand vom 14.11.2026.
// Ein Klick trägt sie als „Porträt" (portraitUrl) ein – Kartenbild und
// Freistellung bleiben unverändert. Danach kann diese Datei samt Aufruf im
// AdminPanel wieder entfernt werden.
// ===========================================================================

const PREVIOUS_PORTRAITS: { teamId: string; name: string; url: string }[] = [
  { teamId: "fc-apex", name: "Dennis Geist", url: "https://tex0dm5xyx3n9dmd.public.blob.vercel-storage.com/uploads/1791491133424-freigestellt.webp" },
  { teamId: "fc-patchwork", name: "Karl Hotz", url: "https://tex0dm5xyx3n9dmd.public.blob.vercel-storage.com/uploads/1791491149585-freigestellt.webp" },
  { teamId: "fc-patchwork", name: "Marc Hotz", url: "https://tex0dm5xyx3n9dmd.public.blob.vercel-storage.com/uploads/1791491145992-freigestellt.webp" },
  { teamId: "fc-patchwork", name: "Matteo Liserra", url: "https://tex0dm5xyx3n9dmd.public.blob.vercel-storage.com/uploads/1791491147110-freigestellt.webp" },
  { teamId: "fc-patchwork", name: "Noah Overhage", url: "https://tex0dm5xyx3n9dmd.public.blob.vercel-storage.com/uploads/1791491150666-freigestellt.webp" },
  { teamId: "fc-patchwork", name: "Samuel Forat", url: "https://tex0dm5xyx3n9dmd.public.blob.vercel-storage.com/uploads/1791491151821-freigestellt.webp" },
  { teamId: "fc-schuele", name: "Dogukan Albayrak", url: "https://tex0dm5xyx3n9dmd.public.blob.vercel-storage.com/uploads/1791491196804-freigestellt.webp" },
  { teamId: "fc-schuele", name: "Julian Singler", url: "https://tex0dm5xyx3n9dmd.public.blob.vercel-storage.com/uploads/1791491190348-freigestellt.webp" },
  { teamId: "fc-underdog", name: "Patrick Izoita", url: "https://tex0dm5xyx3n9dmd.public.blob.vercel-storage.com/uploads/1791491163591-freigestellt.webp" },
  { teamId: "fc-underdog", name: "Willi Pabst", url: "https://tex0dm5xyx3n9dmd.public.blob.vercel-storage.com/uploads/1791491157222-freigestellt.webp" },
  { teamId: "focus-fc", name: "Giovani Laera", url: "https://tex0dm5xyx3n9dmd.public.blob.vercel-storage.com/uploads/1791491169137-freigestellt.webp" },
  { teamId: "focus-fc", name: "Tomas Mohrland", url: "https://tex0dm5xyx3n9dmd.public.blob.vercel-storage.com/uploads/1791491175005-freigestellt.webp" },
  { teamId: "gego-trossingen", name: "Benjamin Erdei", url: "https://tex0dm5xyx3n9dmd.public.blob.vercel-storage.com/uploads/1794335162454-freigestellt.png" },
  { teamId: "gego-trossingen", name: "Jonathan Siegel", url: "https://tex0dm5xyx3n9dmd.public.blob.vercel-storage.com/uploads/1791491140849-freigestellt.webp" },
  { teamId: "gego-trossingen", name: "Richard Hotz", url: "https://tex0dm5xyx3n9dmd.public.blob.vercel-storage.com/uploads/1791491142058-freigestellt.webp" },
  { teamId: "new-way-f-c", name: "Jannik Thieringer", url: "https://tex0dm5xyx3n9dmd.public.blob.vercel-storage.com/uploads/1791491185998-freigestellt.webp" },
  { teamId: "new-way-f-c", name: "Maik Schirling", url: "https://tex0dm5xyx3n9dmd.public.blob.vercel-storage.com/uploads/1791491177669-freigestellt.webp" },
  { teamId: "new-way-f-c", name: "Nikola Tomovic", url: "https://tex0dm5xyx3n9dmd.public.blob.vercel-storage.com/uploads/1791491184826-freigestellt.webp" },
  { teamId: "new-way-f-c", name: "Sam Schirling", url: "https://tex0dm5xyx3n9dmd.public.blob.vercel-storage.com/uploads/1791491183673-freigestellt.webp" },
  { teamId: "new-way-f-c", name: "Stefano Catanzaro", url: "https://tex0dm5xyx3n9dmd.public.blob.vercel-storage.com/uploads/1791491181400-freigestellt.webp" },
  { teamId: "phalanx-united", name: "Benjamin Braun", url: "https://tex0dm5xyx3n9dmd.public.blob.vercel-storage.com/uploads/1791491202373-freigestellt.webp" },
  { teamId: "phalanx-united", name: "Harry Braun", url: "https://tex0dm5xyx3n9dmd.public.blob.vercel-storage.com/uploads/1791491208270-freigestellt.webp" },
  { teamId: "phalanx-united", name: "Levi Reinbold", url: "https://tex0dm5xyx3n9dmd.public.blob.vercel-storage.com/uploads/1794350327679-freigestellt.webp" },
  { teamId: "steel-united", name: "Devin Janzen", url: "https://tex0dm5xyx3n9dmd.public.blob.vercel-storage.com/uploads/1791491213379-freigestellt.webp" },
  { teamId: "steel-united", name: "Donaldo Prendi", url: "https://tex0dm5xyx3n9dmd.public.blob.vercel-storage.com/uploads/1791491217990-freigestellt.webp" },
  { teamId: "steel-united", name: "Lukas Baklakov", url: "https://tex0dm5xyx3n9dmd.public.blob.vercel-storage.com/uploads/1791491216827-freigestellt.webp" },
  { teamId: "suess-fc", name: "Adrian S\u00fcss", url: "https://tex0dm5xyx3n9dmd.public.blob.vercel-storage.com/uploads/1791491219543-freigestellt.webp" },
  { teamId: "suess-fc", name: "Dominic Binefeld", url: "https://tex0dm5xyx3n9dmd.public.blob.vercel-storage.com/uploads/1791491223336-freigestellt.webp" },
  { teamId: "suess-fc", name: "Sebastian Sukac", url: "https://tex0dm5xyx3n9dmd.public.blob.vercel-storage.com/uploads/1791491222099-freigestellt.webp" },
  { teamId: "suess-fc", name: "\u2060Alexander Buchmiller", url: "https://tex0dm5xyx3n9dmd.public.blob.vercel-storage.com/uploads/1791491227086-freigestellt.webp" },
  { teamId: "the-royal-five", name: "Lucas Mogosescu", url: "https://tex0dm5xyx3n9dmd.public.blob.vercel-storage.com/uploads/1791491231210-freigestellt.webp" },
  { teamId: "trossingen-f-c", name: "Justin Binefeld", url: "https://tex0dm5xyx3n9dmd.public.blob.vercel-storage.com/uploads/1791491243574-freigestellt.webp" },
  { teamId: "trossingen-f-c", name: "Levin Janzen", url: "https://tex0dm5xyx3n9dmd.public.blob.vercel-storage.com/uploads/1791491245923-freigestellt.webp" },
];

export function PortraitRestore({
  teams,
  onEditTeam,
  onTeamSaved,
}: {
  teams: Team[];
  onEditTeam: (teamId: string, data: Partial<Team>) => Promise<boolean>;
  onTeamSaved?: (teamId: string, roster: Player[]) => void;
}) {
  const [result, setResult] = useState<{ done: number; failed: number } | null>(null);
  const [busy, setBusy] = useState(false);
  // Nur Spieler, die es (unter diesem Namen im selben Verein) noch gibt und noch kein Porträt haben.
  const pending = PREVIOUS_PORTRAITS.filter((e) =>
    teams.find((t) => t.id === e.teamId)?.spielerliste?.some((p) => p.name === e.name && !p.portraitUrl)
  );
  if (pending.length === 0 && !result) return null;

  const run = async () => {
    setBusy(true);
    let done = 0;
    let failed = 0;
    for (const teamId of [...new Set(pending.map((e) => e.teamId))]) {
      const team = teams.find((t) => t.id === teamId);
      if (!team) continue;
      const entries = pending.filter((e) => e.teamId === teamId);
      const next: Player[] = (team.spielerliste ?? []).map((p) => {
        const e = entries.find((x) => x.name === p.name);
        return e && !p.portraitUrl ? { ...p, portraitUrl: e.url } : p;
      });
      if (await onEditTeam(teamId, { spielerliste: next })) {
        done += entries.length;
        onTeamSaved?.(teamId, next);
      } else failed += entries.length;
    }
    setResult({ done, failed });
    setBusy(false);
  };

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      {pending.length > 0 && (
        <button
          type="button"
          onClick={run}
          disabled={busy}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-wider border border-hl-gold/50 text-hl-gold hover:bg-hl-gold/10 cursor-pointer disabled:opacity-50"
        >
          <History className="w-3.5 h-3.5" />
          {busy ? 'Übernehme …' : `Vorherige Porträts für Hero One übernehmen (${pending.length})`}
        </button>
      )}
      {result && (
        <span className="text-[11px] font-sans text-hl-mute">
          Fertig: {result.done} Porträts übernommen{result.failed ? ` · ${result.failed} fehlgeschlagen` : ''}
        </span>
      )}
    </div>
  );
}
