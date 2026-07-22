import React, { useEffect, useState } from 'react';
import { Radio, Users, CalendarDays, CalendarRange, CalendarClock } from 'lucide-react';
import { apiFetch } from '../lib/api';

interface VisitStats {
  online: number;
  today: number;
  perDay: number;
  perWeek: number;
  perMonth: number;
  daily: { day: string; count: number }[];
}

const REFRESH_MS = 20_000;

function StatTile({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="rounded-xl bg-[#060E0F]/50 border border-white/[.06] px-3 py-3 flex flex-col gap-1">
      <div className="flex items-center gap-1.5 text-hl-mute">
        {icon}
        <span className="text-[10px] font-mono uppercase tracking-wider">{label}</span>
      </div>
      <span className="font-display font-black text-2xl text-white leading-none tabular-nums">{value}</span>
    </div>
  );
}

// Mini-Balkenverlauf der letzten Tage (keine externe Chart-Library nötig)
function Sparkline({ data }: { data: { day: string; count: number }[] }) {
  if (data.length === 0) return null;
  const max = Math.max(1, ...data.map((d) => d.count));
  return (
    <div className="flex items-end gap-[3px] h-10 mt-1">
      {data.map((d) => (
        <div
          key={d.day}
          title={`${d.day}: ${d.count}`}
          className="flex-1 min-w-[3px] rounded-sm bg-hl-green/70"
          style={{ height: `${Math.max(6, (d.count / max) * 100)}%` }}
        />
      ))}
    </div>
  );
}

export default function LiveVisitors() {
  const [stats, setStats] = useState<VisitStats | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    const load = () =>
      apiFetch<VisitStats>('/api/seasons?stats')
        .then((data) => active && (setStats(data), setError(false)))
        .catch(() => active && setError(true));
    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  return (
    <div className="hl-card p-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="relative flex h-3 w-3">
            <span className="absolute inline-flex h-full w-full rounded-full bg-hl-green opacity-60 animate-ping" />
            <span className="relative inline-flex rounded-full h-3 w-3 bg-hl-green" />
          </span>
          <div>
            <h3 className="font-display font-black text-lg text-white uppercase tracking-tight leading-none">
              {stats ? stats.online : '–'} <span className="text-hl-green">gerade online</span>
            </h3>
            <p className="text-[11px] text-hl-mute font-sans mt-1">
              {error ? 'Statistik gerade nicht erreichbar.' : 'Echtzeit-Besucher auf der Website'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 text-hl-mute text-[10px] font-mono uppercase tracking-wider">
          <Radio className="w-3.5 h-3.5" />
          <span>Live</span>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5">
        <StatTile icon={<Users className="w-3.5 h-3.5" />} label="Heute" value={stats?.today ?? 0} />
        <StatTile icon={<CalendarDays className="w-3.5 h-3.5" />} label="Ø / Tag" value={stats?.perDay ?? 0} />
        <StatTile icon={<CalendarRange className="w-3.5 h-3.5" />} label="Ø / Woche" value={stats?.perWeek ?? 0} />
        <StatTile icon={<CalendarClock className="w-3.5 h-3.5" />} label="Ø / Monat" value={stats?.perMonth ?? 0} />
      </div>

      {stats && stats.daily.length > 1 && (
        <div className="mt-5">
          <span className="text-[10px] font-mono uppercase tracking-wider text-hl-mute">Verlauf (letzte 14 Tage)</span>
          <Sparkline data={stats.daily} />
        </div>
      )}
    </div>
  );
}
