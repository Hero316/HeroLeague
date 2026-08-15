// Backend-Startseite („Übersicht"): alle wichtigen Zahlen auf einen Blick –
// Website-Besuche (bestehendes Live-Besucher-Panel) plus schnelle Kacheln, die
// direkt in den passenden Detail-Bereich springen (z. B. Sponsoren-Klicks).
import { useEffect, useState } from 'react';
import { BarChart3, Users, CalendarDays, ChevronRight } from 'lucide-react';
import LiveVisitors from './LiveVisitors';
import { useAdminNav } from './ui';
import { fetchSponsorClicks } from '../lib/sponsors';

function Tile({
  icon, label, value, sub, accent, onClick,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  sub?: string;
  accent: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group text-left rounded-2xl bg-[#060E0F]/60 border border-white/[.07] hover:border-white/25 p-4 transition-colors cursor-pointer"
    >
      <div className="flex items-center justify-between mb-2.5">
        <span
          className="grid place-items-center w-9 h-9 rounded-xl border"
          style={{ background: `${accent}1a`, borderColor: `${accent}40`, color: accent }}
        >
          {icon}
        </span>
        <ChevronRight className="w-4 h-4 text-hl-faint group-hover:text-white transition-colors" />
      </div>
      <div className="font-display font-black text-2xl text-white tabular-nums leading-none">{value}</div>
      <div className="text-[11px] font-mono uppercase tracking-wider text-hl-mute mt-1.5">{label}</div>
      {sub && <div className="text-[11px] text-hl-faint font-sans mt-0.5">{sub}</div>}
    </button>
  );
}

export default function AdminDashboard({
  teamsCount,
  matchesCount,
  canSeeSponsors,
  canManageClubs,
}: {
  teamsCount: number;
  matchesCount: number;
  canSeeSponsors: boolean;
  canManageClubs: boolean;
}) {
  const { openSection } = useAdminNav();
  const [sponsorTotal, setSponsorTotal] = useState<number | null>(null);
  const [sponsorCount, setSponsorCount] = useState(0);

  useEffect(() => {
    if (!canSeeSponsors) return;
    fetchSponsorClicks()
      .then((map) => {
        const vals = Object.values(map || {});
        setSponsorTotal(vals.reduce((s, e) => s + (Number(e?.total) || 0), 0));
        setSponsorCount(vals.length);
      })
      .catch(() => { /* noch keine Klicks / kein Zugriff */ });
  }, [canSeeSponsors]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display font-black text-xl sm:text-2xl text-white uppercase tracking-tight">Übersicht</h2>
        <p className="text-sm text-hl-mute font-sans mt-1">Alle wichtigen Zahlen auf einen Blick.</p>
      </div>

      {/* Website-Besuche (bestehendes Panel: online / heute / Ø / Verlauf) */}
      <LiveVisitors />

      {/* Schnell-Kacheln → springen direkt in den Detail-Bereich */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {canSeeSponsors && (
          <Tile
            icon={<BarChart3 className="w-5 h-5" />}
            accent="#E6238E"
            label="Sponsoren-Klicks"
            value={sponsorTotal ?? '–'}
            sub={`${sponsorCount} Sponsoren · Details ›`}
            onClick={() => openSection('sponsor-clicks', 'startseite')}
          />
        )}
        {canManageClubs && (
          <Tile
            icon={<Users className="w-5 h-5" />}
            accent="#22DFC9"
            label="Klubs"
            value={teamsCount}
            sub="Verwalten ›"
            onClick={() => openSection('clubs', 'spiele')}
          />
        )}
        {canManageClubs && (
          <Tile
            icon={<CalendarDays className="w-5 h-5" />}
            accent="#43E5A0"
            label="Spiele"
            value={matchesCount}
            sub="Ergebnisse ›"
            onClick={() => openSection('results', 'spiele')}
          />
        )}
      </div>
    </div>
  );
}
