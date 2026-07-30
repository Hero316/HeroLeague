import React from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, X, Smartphone } from 'lucide-react';
import { ActiveTab, Team } from '../types';
import { useInstall } from './InstallProvider';

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

// box = einheitlicher quadratischer Slot (alle Logos gleich groß & zentriert),
// img = Bildgröße; freigestellte Logos füllen den Slot (fast) vollständig aus.
const CREST_SIZES = {
  xs: { box: 'w-5 h-5 text-[8px] rounded-[6px]', img: 'w-5 h-5' },
  sm: { box: 'w-7 h-7 text-[11px] rounded-[9px]', img: 'w-7 h-7' },
  md: { box: 'w-8 h-8 text-xs rounded-[10px]', img: 'w-8 h-8' },
  lg: { box: 'w-11 h-11 text-base rounded-[13px]', img: 'w-11 h-11' },
  xl: { box: 'w-[58px] h-[58px] text-2xl rounded-[16px]', img: 'w-[58px] h-[58px]' },
  hero: { box: 'w-24 h-24 text-4xl rounded-[26px]', img: 'w-24 h-24' },
} as const;

export type CrestSize = keyof typeof CREST_SIZES;

interface TeamCrestProps {
  name: string; // voller Name (für alt/title)
  shortName?: string;
  color: string;
  logoUrl?: string;
  size?: CrestSize;
  onSelect?: () => void; // gesetzt = anklickbar, öffnet die Vereinsseite
}

// Vereins-Wappen: Logo-Bild falls gepflegt, sonst Verlaufs-Monogramm im Design-Stil.
// Mit onSelect wird das Wappen zu einer Taste, die die Vereinsseite öffnet (Desktop + Handy).
export function TeamCrest({ name, shortName, color, logoUrl, size = 'md', onSelect }: TeamCrestProps) {
  const s = CREST_SIZES[size];
  const isLogo = Boolean(logoUrl);

  const inner = isLogo ? (
    <img src={logoUrl} alt={name} loading="lazy" decoding="async" className={`${s.img} object-contain`} referrerPolicy="no-referrer" />
  ) : (
    monogram(shortName || name)
  );

  const baseClass = `${s.box} grid place-items-center shrink-0`;
  const fallbackClass = isLogo ? '' : 'font-display font-black text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,.16)]';
  const fallbackStyle = isLogo
    ? undefined
    : { background: `linear-gradient(140deg, ${color || '#22DFC9'}, ${shade(color || '#22DFC9', 0.45)})` };

  if (onSelect) {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onSelect();
        }}
        title={`${name} – Vereinsseite öffnen`}
        className={`${baseClass} ${fallbackClass} cursor-pointer transition-transform duration-150 hover:scale-110 focus:outline-none focus:ring-2 focus:ring-brand-accent-light`}
        style={fallbackStyle}
      >
        {inner}
      </button>
    );
  }

  return (
    <span className={`${baseClass} ${fallbackClass}`} style={fallbackStyle} title={name}>
      {inner}
    </span>
  );
}

// Form-Pille (W/U/N) im Design-Stil
export function FormPill({ result, size = 'md' }: { result: 'W' | 'D' | 'L'; size?: 'sm' | 'md' }) {
  const styles: Record<string, string> = {
    W: 'bg-[rgba(67,229,160,.15)] text-hl-green-soft',
    D: 'bg-[rgba(233,196,106,.16)] text-[#F0CE77]',
    L: 'bg-[rgba(255,84,66,.15)] text-hl-red-soft',
  };
  const labels: Record<string, string> = { W: 'Sieg', D: 'Unentschieden', L: 'Niederlage' };
  const chars: Record<string, string> = { W: 'S', D: 'U', L: 'N' };
  // sm: kompakte Variante für die Anzeige direkt unter dem Vereinsnamen (mobil).
  const sizeCls = size === 'sm' ? 'w-[15px] h-[15px] rounded text-[9px]' : 'w-[22px] h-[22px] rounded-md text-[11px]';
  return (
    <span
      className={`grid place-items-center font-sans font-extrabold ${sizeCls} ${styles[result]}`}
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
    <div className="relative">
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
  // Navigation zu Nicht-Tab-Seiten (Impressum/Datenschutz) über den rohen Pfad.
  onNavigatePath?: (path: string) => void;
}

export function Footer({ onNavigate, onNavigatePath }: FooterProps) {
  // Dauerhafter „App installieren"-Zugang – auch wenn das Auto-Banner weggeklickt
  // wurde. Bei bereits installierter App (Standalone) ausgeblendet.
  const { isStandalone, openHelp } = useInstall();
  const links: { label: string; tab: ActiveTab }[] = [
    { label: 'SPIELPLAN', tab: 'spielplan' },
    { label: 'TABELLE', tab: 'tabelle' },
    { label: 'HERO ONE', tab: 'heroone' },
    { label: 'STATISTIKEN', tab: 'statistiken' },
  ];
  const legalLinks: { label: string; path: string }[] = [
    { label: 'IMPRESSUM', path: '/impressum' },
    { label: 'DATENSCHUTZ', path: '/datenschutz' },
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
          {onNavigatePath &&
            legalLinks.map((l) => (
              <button
                key={l.path}
                onClick={() => onNavigatePath(l.path)}
                className="font-sans font-semibold text-xs tracking-wider text-hl-faint hover:text-hl-text transition-colors cursor-pointer"
              >
                {l.label}
              </button>
            ))}
          {!isStandalone && (
            <button
              onClick={openHelp}
              className="inline-flex items-center gap-1.5 font-sans font-semibold text-xs tracking-wider text-brand-accent-light hover:text-white transition-colors cursor-pointer"
            >
              <Smartphone className="w-3.5 h-3.5" />
              APP INSTALLIEREN
            </button>
          )}
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

export function crestFromTeam(team: Team | undefined, size: CrestSize = 'md', onSelect?: () => void) {
  if (!team) return null;
  return (
    <TeamCrest
      name={team.name}
      shortName={team.shortName}
      color={team.logoColor}
      logoUrl={team.logoUrl}
      size={size}
      onSelect={onSelect}
    />
  );
}

// Bild, das per Klick als Lightbox vergrößert wird – gleiches Muster wie die Spieler-Portraits.
// Wird z.B. für das große Vereins-Logo auf der Team-Seite genutzt.
export function ImageZoom({
  src,
  alt,
  className,
  zoomClassName,
}: {
  src: string;
  alt: string;
  className?: string; // Darstellung im normalen Fluss
  zoomClassName?: string; // Darstellung in der Lightbox
}) {
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        title={`${alt} – vergrößern`}
        className="shrink-0 cursor-zoom-in transition-transform duration-150 hover:scale-105 focus:outline-none focus:ring-2 focus:ring-brand-accent-light rounded-2xl"
      >
        <img src={src} alt={alt} loading="lazy" decoding="async" referrerPolicy="no-referrer" className={className} />
      </button>

      {open &&
        createPortal(
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
            onClick={() => setOpen(false)}
            role="dialog"
            aria-modal="true"
            aria-label={alt}
          >
            <div className="relative flex flex-col items-center" onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Schließen"
                className="absolute -top-3 -right-3 z-10 w-9 h-9 rounded-full bg-brand-deep border border-white/20 text-hl-soft hover:text-white flex items-center justify-center shadow-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
              <img
                src={src}
                alt={alt}
                referrerPolicy="no-referrer"
                className={zoomClassName ?? 'w-64 sm:w-80 max-w-[80vw] max-h-[80vh] object-contain'}
              />
              <span className="mt-4 font-display font-black text-lg text-white uppercase tracking-tight text-center">
                {alt}
              </span>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Akkordeon: aufgeräumte „dicke Tasten", von denen immer nur eine offen ist.
// Wird im Backoffice genutzt, damit man nicht endlos scrollen muss.
// ---------------------------------------------------------------------------

interface AccordionContextValue {
  openId: string | null;
  toggle: (id: string) => void;
}

const AccordionContext = React.createContext<AccordionContextValue | null>(null);

// Gruppiert mehrere AccordionSection; sorgt dafür, dass immer nur eine offen ist.
// Standardmäßig ist alles zugeklappt (defaultOpenId = null).
export function AccordionGroup({
  children,
  defaultOpenId = null,
}: {
  children: React.ReactNode;
  defaultOpenId?: string | null;
}) {
  const [openId, setOpenId] = React.useState<string | null>(defaultOpenId);
  const toggle = React.useCallback((id: string) => {
    setOpenId((current) => (current === id ? null : id));
  }, []);
  return <AccordionContext.Provider value={{ openId, toggle }}>{children}</AccordionContext.Provider>;
}

// Eine „dicke Taste": Kopf mit Symbol + Titel + Pfeil; klappt den Inhalt sanft auf.
export function AccordionSection({
  id,
  title,
  icon,
  subtitle,
  accent = '#22DFC9',
  children,
}: {
  id: string;
  title: string;
  icon?: React.ReactNode;
  subtitle?: string;
  accent?: string; // Farbe des Symbol-Kästchens
  children: React.ReactNode;
}) {
  const ctx = React.useContext(AccordionContext);
  const open = ctx?.openId === id;
  const panelId = `acc-panel-${id}`;

  return (
    <div
      className={`hl-card overflow-hidden transition-colors ${
        open ? 'border-brand-accent-light/25' : ''
      }`}
    >
      <button
        type="button"
        onClick={() => ctx?.toggle(id)}
        aria-expanded={open}
        aria-controls={panelId}
        className="w-full flex items-center gap-3 sm:gap-4 p-4 sm:p-5 text-left cursor-pointer hover:bg-white/[.03] transition-colors"
      >
        {icon && (
          <span
            className="grid place-items-center w-10 h-10 rounded-xl shrink-0 border"
            style={{ background: `${accent}1a`, borderColor: `${accent}40`, color: accent }}
          >
            {icon}
          </span>
        )}
        <span className="flex-1 min-w-0">
          <span className="block font-display font-black text-base sm:text-lg text-white uppercase tracking-tight leading-tight">
            {title}
          </span>
          {subtitle && <span className="block text-[11px] sm:text-xs text-hl-mute font-sans mt-0.5">{subtitle}</span>}
        </span>
        <ChevronDown
          className={`w-5 h-5 shrink-0 text-hl-mute transition-transform duration-300 ${open ? 'rotate-180 text-brand-accent-light' : ''}`}
        />
      </button>

      {/* Sanftes Auf-/Zuklappen ohne feste Höhe (grid-rows 0fr↔1fr) */}
      <div
        id={panelId}
        className={`grid transition-[grid-template-rows] duration-300 ease-out ${open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}
      >
        <div className="overflow-hidden min-h-0">
          <div className="px-4 sm:px-5 pb-5 pt-1 border-t border-white/[.06]">{children}</div>
        </div>
      </div>
    </div>
  );
}
