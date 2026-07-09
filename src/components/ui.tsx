import React from 'react';
import { ActiveTab, Team } from '../types';

// Gemeinsame Design-Bausteine des neuen Hero-League-Looks.

// Hex-Farbe abdunkeln (für die Verlaufs-Wappen)
export function shade(hex: string, factor: number): string {
  const clean = (hex || '#22DFC9').replace('#', '');
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
  const num = parseInt(full, 16);
  if (Number.isNaN(num)) return '#0c1413';
  const r = Math.round(((num >> 16) & 255) * factor);
  const g = Math.round(((num >> 8) & 255) * factor);
  const b = Math.round((num & 255) * factor);
  return `rgb(${r}, ${g}, ${b})`;
}

// Monogramm aus dem Kürzel bzw. Namen (max. 2 Zeichen)
export function monogram(name: string): string {
  const trimmed = (name || '').trim();
  if (!trimmed) return '?';
  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return trimmed.slice(0, 2).toUpperCase();
}

const CREST_SIZES = {
  xs: { box: 'w-5 h-5 text-[8px] rounded-[6px]', img: 'w-3.5 h-3.5' },
  sm: { box: 'w-7 h-7 text-[11px] rounded-[9px]', img: 'w-5 h-5' },
  md: { box: 'w-8 h-8 text-xs rounded-[10px]', img: 'w-6 h-6' },
  lg: { box: 'w-11 h-11 text-base rounded-[13px]', img: 'w-8 h-8' },
  xl: { box: 'w-[58px] h-[58px] text-2xl rounded-[16px]', img: 'w-11 h-11' },
  hero: { box: 'w-24 h-24 text-4xl rounded-[26px]', img: 'w-16 h-16' },
} as const;

export type CrestSize = keyof typeof CREST_SIZES;

interface TeamCrestProps {
  name: string; // voller Name (für alt/title)
  shortName?: string;
  color: string;
  logoUrl?: string;
  size?: CrestSize;
}

// Vereins-Wappen: Logo-Bild falls gepflegt, sonst Verlaufs-Monogramm im Design-Stil
export function TeamCrest({ name, shortName, color, logoUrl, size = 'md' }: TeamCrestProps) {
  const s = CREST_SIZES[size];
  if (logoUrl) {
    return (
      <span
        className={`${s.box} grid place-items-center shrink-0 overflow-hidden border border-white/15 bg-white/5`}
        title={name}
      >
        <img src={logoUrl} alt={name} className={`${s.img} object-contain`} referrerPolicy="no-referrer" />
      </span>
    );
  }
  return (
    <span
      className={`${s.box} grid place-items-center shrink-0 font-display font-black text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,.16)]`}
      style={{ background: `linear-gradient(140deg, ${color || '#22DFC9'}, ${shade(color || '#22DFC9', 0.45)})` }}
      title={name}
    >
      {monogram(shortName || name)}
    </span>
  );
}

// Form-Pille (W/U/N) im Design-Stil
export function FormPill({ result }: { result: 'W' | 'D' | 'L' }) {
  const styles: Record<string, string> = {
    W: 'bg-[rgba(67,229,160,.15)] text-hl-green-soft',
    D: 'bg-[rgba(233,196,106,.16)] text-[#F0CE77]',
    L: 'bg-[rgba(255,84,66,.15)] text-hl-red-soft',
  };
  const labels: Record<string, string> = { W: 'Sieg', D: 'Unentschieden', L: 'Niederlage' };
  const chars: Record<string, string> = { W: 'S', D: 'U', L: 'N' };
  return (
    <span
      className={`grid place-items-center w-[22px] h-[22px] rounded-md font-sans font-extrabold text-[11px] ${styles[result]}`}
      title={labels[result]}
    >
      {chars[result]}
    </span>
  );
}

interface PageHeaderProps {
  kicker: string;
  title: string;
  text?: string;
}

// Seitenkopf der Unterseiten (Spielplan, Tabelle, ...)
export function PageHeader({ kicker, title, text }: PageHeaderProps) {
  return (
    <div className="relative overflow-hidden">
      <div className="absolute -top-40 -left-32 w-[560px] h-[560px] bg-[radial-gradient(circle,rgba(34,223,201,.12),transparent_66%)] pointer-events-none" />
      <div className="relative max-w-[1320px] mx-auto px-4 sm:px-10 pt-10 sm:pt-13 pb-6">
        <div className="font-sans font-extrabold text-xs tracking-[3px] text-brand-accent-light uppercase hl-fade">{kicker}</div>
        <h1 className="mt-3 font-display font-black text-5xl sm:text-7xl leading-[.86] tracking-tight uppercase text-white hl-fade">
          {title}
        </h1>
        {text && <p className="mt-3.5 max-w-[560px] text-[15.5px] leading-relaxed text-hl-mute hl-fade">{text}</p>}
      </div>
    </div>
  );
}

interface FooterProps {
  onNavigate: (tab: ActiveTab) => void;
}

export function Footer({ onNavigate }: FooterProps) {
  const links: { label: string; tab: ActiveTab }[] = [
    { label: 'SPIELPLAN', tab: 'spielplan' },
    { label: 'TABELLE', tab: 'tabelle' },
    { label: 'TORSCHÜTZEN', tab: 'torschuetzen' },
    { label: 'STATISTIKEN', tab: 'statistiken' },
  ];
  return (
    <footer className="border-t border-white/[.07] bg-[#080b09]">
      <div className="max-w-[1320px] mx-auto px-4 sm:px-10 py-7 flex items-center justify-between gap-6 flex-wrap">
        <div className="flex items-center gap-3">
          <img src="/assets/hero-league-logo.png" alt="Hero League" className="h-7 w-auto opacity-90" />
          <span className="font-sans font-semibold text-xs text-hl-faint">© 2026 HERO LEAGUE · ALLE RECHTE VORBEHALTEN</span>
        </div>
        <div className="flex gap-5 sm:gap-6 flex-wrap">
          {links.map((l) => (
            <button
              key={l.tab}
              onClick={() => onNavigate(l.tab)}
              className="font-sans font-semibold text-xs tracking-wider text-hl-dim hover:text-hl-text transition-colors cursor-pointer"
            >
              {l.label}
            </button>
          ))}
        </div>
      </div>
    </footer>
  );
}

// Aktuelle Live-Minute aus dem Anstoß-Zeitstempel, tickt selbstständig weiter.
// Ohne Zeitstempel (0) blenden die Aufrufer die Minute einfach aus.
export function useLiveMinute(liveStartedAt?: string | null): number {
  const [minute, setMinute] = React.useState(0);

  React.useEffect(() => {
    if (!liveStartedAt) {
      setMinute(0);
      return;
    }
    const compute = () => {
      const elapsedMs = Date.now() - new Date(liveStartedAt).getTime();
      const elapsedMin = Math.floor(elapsedMs / 60000) + 1;
      setMinute(elapsedMin > 90 ? 90 : elapsedMin < 1 ? 1 : elapsedMin);
    };
    compute();
    const interval = setInterval(compute, 10000);
    return () => clearInterval(interval);
  }, [liveStartedAt]);

  return minute;
}

// Live-Badge inkl. mitlaufender Minute – für Match-Karten auf der Startseite.
export function LiveBadge({ liveStartedAt }: { liveStartedAt?: string | null }) {
  const minute = useLiveMinute(liveStartedAt);
  return <MatchStatusBadge status="live" liveMinute={minute || undefined} />;
}

// Status-Badge für Match-Karten
export function MatchStatusBadge({ status, liveMinute }: { status: 'geplant' | 'live' | 'beendet'; liveMinute?: number }) {
  if (status === 'live') {
    return (
      <span className="px-2.5 py-1 rounded-md font-sans font-extrabold text-[9.5px] tracking-[1.2px] bg-[rgba(255,84,66,.15)] text-hl-red-soft">
        ● LIVE{liveMinute ? ` ${liveMinute}'` : ''}
      </span>
    );
  }
  if (status === 'beendet') {
    return (
      <span className="px-2.5 py-1 rounded-md font-sans font-extrabold text-[9.5px] tracking-[1.2px] bg-white/[.06] text-hl-mute">
        BEENDET
      </span>
    );
  }
  return (
    <span className="px-2.5 py-1 rounded-md font-sans font-extrabold text-[9.5px] tracking-[1.2px] bg-[rgba(34,223,201,.12)] text-brand-accent-light">
      ANSTOSS
    </span>
  );
}

// Kurzform des Datums: "14.08."
export function shortDate(dateStr: string): string {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
}

export function crestFromTeam(team: Team | undefined, size: CrestSize = 'md') {
  if (!team) return null;
  return (
    <TeamCrest name={team.name} shortName={team.shortName} color={team.logoColor} logoUrl={team.logoUrl} size={size} />
  );
}
