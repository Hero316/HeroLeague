import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence, MotionConfig, animate, useInView, useScroll, useTransform } from 'motion/react';
import {
  ArrowRight, ArrowLeft, Sparkles, Activity, IdCard, Tv, Trophy, BarChart3, Camera, Shirt, Mail, Users, CreditCard,
  CheckCircle2, ChevronDown, Clock, Lock, Eye, ShieldCheck, Hash, Zap,
} from 'lucide-react';
import type { HeroImages, HighlightsConfig, Match, MatchPlayerStat, PlayerStat, Team } from '../../types';
import {
  euro, fetchBookingConfig, formatDeadline, setAccessKey, type BookingPublicConfig, type PackageId,
} from '../../lib/booking';
import BookingFlow, { newDraft, type BookingDraft, type Step } from './BookingFlow';
import { S2 } from './theme';

// ===========================================================================
// /season2 – eigenständige Verkaufs-Landingpage für Season 2 mit
// verbindlicher Buchung. Eigene Farbwelt, Motion-Graphics, echte Zahlen aus
// Season 1. Bis zur Freigabe im Backoffice sehen Besucher nur „Noch nicht
// veröffentlicht"; Admins und Vorregistrierte (Vorab-Link) sehen alles.
// ===========================================================================

interface Props {
  teams: Team[];
  matches: Match[];
  players: PlayerStat[];
  trackingRows: MatchPlayerStat[];
  highlights: HighlightsConfig;
  heroImages: HeroImages;
  onNavigate: (path: string) => void;
}

const KEY_STORE = 'hl-s2-key';

// --- kleine Bausteine -------------------------------------------------------

function Reveal({ children, delay = 0, className = '' }: { children: React.ReactNode; delay?: number; className?: string }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 32 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.7, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}

// Zahl, die beim Sichtbarwerden hochzählt (und bei neuen Daten weiterzählt).
function Counter({ value, suffix = '' }: { value: number; suffix?: string }) {
  const ref = useRef<HTMLSpanElement | null>(null);
  const inView = useInView(ref, { once: true, margin: '-40px' });
  const [n, setN] = useState(0);
  const shown = useRef(0);
  useEffect(() => {
    if (!inView) return;
    const c = animate(shown.current, value, {
      duration: 1.9,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => {
        shown.current = v;
        setN(Math.round(v));
      },
    });
    return () => c.stop();
  }, [inView, value]);
  return <span ref={ref} className="tabular-nums">{n.toLocaleString('de-DE')}{suffix}</span>;
}

function Marquee({ children, duration = 40, reverse = false }: { children: React.ReactNode; duration?: number; reverse?: boolean }) {
  return (
    <div className="relative overflow-hidden">
      <motion.div
        className="flex w-max"
        animate={{ x: reverse ? ['-50%', '0%'] : ['0%', '-50%'] }}
        transition={{ duration, ease: 'linear', repeat: Infinity }}
      >
        <div className="flex shrink-0">{children}</div>
        <div className="flex shrink-0" aria-hidden="true">{children}</div>
      </motion.div>
    </div>
  );
}

// Live-Countdown bis zum Ende des Early Bird.
function Countdown({ target, compact = false }: { target: string; compact?: boolean }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const left = Math.max(0, new Date(target).getTime() - now);
  const d = Math.floor(left / 86400000);
  const h = Math.floor((left % 86400000) / 3600000);
  const m = Math.floor((left % 3600000) / 60000);
  const s = Math.floor((left % 60000) / 1000);
  const parts: [number, string][] = [[d, 'Tage'], [h, 'Std'], [m, 'Min'], [s, 'Sek']];
  if (compact) {
    return <span className="tabular-nums font-mono">{d}T {String(h).padStart(2, '0')}:{String(m).padStart(2, '0')}:{String(s).padStart(2, '0')}</span>;
  }
  return (
    <div className="grid grid-cols-4 gap-1.5 sm:gap-2">
      {parts.map(([v, l]) => (
        <div key={l} className="rounded-xl bg-black/35 border border-white/10 px-1 py-2 text-center min-w-0">
          <div className="font-display font-black text-white text-[22px] sm:text-[26px] leading-none tabular-nums">{String(v).padStart(2, '0')}</div>
          <div className="text-[9.5px] font-mono uppercase tracking-wider text-white/45 mt-1">{l}</div>
        </div>
      ))}
    </div>
  );
}

function SectionHead({ kicker, title, text, center = false }: { kicker: string; title: React.ReactNode; text?: string; center?: boolean }) {
  return (
    <Reveal className={`mb-9 sm:mb-12 ${center ? 'text-center mx-auto' : ''} max-w-3xl`}>
      <div className={`inline-flex items-center gap-2 text-[11px] font-mono uppercase tracking-[.22em] text-[#8FA8FF] ${center ? 'justify-center' : ''}`}>
        <span className="w-6 h-px bg-[#8FA8FF]" /> {kicker}
      </div>
      <h2 className="mt-3 font-display font-black uppercase tracking-tight text-white text-[38px] sm:text-[58px] leading-[.9]">{title}</h2>
      {text && <p className="mt-4 text-white/60 text-[15.5px] sm:text-[17px] leading-relaxed">{text}</p>}
    </Reveal>
  );
}

function Accordion({ items }: { items: { q: string; a: string }[] }) {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <div className="space-y-2.5">
      {items.map((it, i) => (
        <Reveal key={it.q} delay={Math.min(i, 6) * 0.04}>
          <div className={`rounded-2xl border transition-colors ${open === i ? 'border-[#5B7FFF]/50 bg-[#2F5BFF]/[.08]' : 'border-white/10 bg-white/[.03]'}`}>
            <button onClick={() => setOpen(open === i ? null : i)} className="w-full flex items-center justify-between gap-4 px-4 sm:px-5 py-4 text-left cursor-pointer">
              <span className="min-w-0 font-bold text-white text-[15px] sm:text-[16px]">{it.q}</span>
              <ChevronDown className={`w-5 h-5 shrink-0 text-white/50 transition-transform duration-300 ${open === i ? 'rotate-180' : ''}`} />
            </button>
            <AnimatePresence initial={false}>
              {open === i && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }} className="overflow-hidden">
                  <div className="px-4 sm:px-5 pb-4 text-[14.5px] text-white/65 leading-relaxed whitespace-pre-line">{it.a}</div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </Reveal>
      ))}
    </div>
  );
}

// Volltext (Regelwerk / Teilnahmebedingungen) – Überschriften = Zeilen ohne Punkt am Ende vor einem Absatz.
function LegalText({ text }: { text: string }) {
  const blocks = text.split(/\n\s*\n/);
  return (
    <div className="space-y-4">
      {blocks.map((b, i) => {
        const lines = b.split('\n');
        const head = lines.length > 1 && !/[.:!?]$/.test(lines[0].trim()) ? lines[0] : null;
        const body = head ? lines.slice(1).join('\n') : b;
        return (
          <div key={i}>
            {head && <h4 className="font-display font-black uppercase tracking-tight text-white text-[18px] mb-1.5">{head}</h4>}
            <p className="text-[14.5px] text-white/65 leading-relaxed whitespace-pre-line">{body}</p>
          </div>
        );
      })}
    </div>
  );
}

// --- Seite ------------------------------------------------------------------

export default function Season2Landing({ teams, matches, players, trackingRows, highlights, heroImages, onNavigate }: Props) {
  const [cfg, setCfg] = useState<BookingPublicConfig | null>(null);
  const [loadErr, setLoadErr] = useState(false);
  const [flowOpen, setFlowOpen] = useState(false);
  const [step, setStep] = useState<Step>('email');
  const [intro, setIntro] = useState<'prereg' | 'new'>('new');
  const [draft, setDraft] = useState<BookingDraft>(() => newDraft(8));
  const [preregHint, setPreregHint] = useState<'' | 'prereg' | 'soon'>('');
  const [scrolled, setScrolled] = useState(false);

  // Vorab-Zugang aus dem Link übernehmen (und aus der Adresszeile entfernen).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    let key = params.get('zugang') || '';
    try {
      if (key) sessionStorage.setItem(KEY_STORE, key);
      else key = sessionStorage.getItem(KEY_STORE) || '';
    } catch {
      /* privater Modus */
    }
    setAccessKey(key);
    if (params.has('zugang')) window.history.replaceState(window.history.state, '', window.location.pathname);
    fetchBookingConfig()
      .then((c) => {
        setCfg(c);
        if (c.minSquad) setDraft((d) => (d.token ? d : newDraft(c.minSquad)));
      })
      .catch(() => setLoadErr(true));
  }, []);

  useEffect(() => {
    const prev = document.title;
    document.title = 'Season 2 – Startplatz sichern | Hero League';
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      document.title = prev;
      window.removeEventListener('scroll', onScroll);
    };
  }, []);

  // Early Bird läuft live ab – alle 15 s neu bewerten.
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 15000);
    return () => clearInterval(t);
  }, []);
  const earlyActive = useMemo(() => {
    void tick;
    return Boolean(cfg?.earlyBirdUntil && Date.now() < new Date(cfg.earlyBirdUntil).getTime());
  }, [cfg, tick]);

  // Echte Zahlen aus Season 1.
  const stats = useMemo(() => {
    const done = matches.filter((m) => m.status === 'beendet' && m.homeScore !== null && m.awayScore !== null);
    const goals = done.reduce((s, m) => s + (m.homeScore ?? 0) + (m.awayScore ?? 0), 0);
    const squad = teams.reduce((s, t) => s + (t.spielerliste?.length ?? 0), 0);
    const actions = trackingRows.reduce((s, r) => s + Object.values(r.counts ?? {}).reduce((a, v) => a + (typeof v === 'number' ? v : 0), 0), 0);
    return [
      { label: 'Teams', value: teams.length, icon: Users },
      { label: 'Spieler', value: squad, icon: Shirt },
      { label: 'Spiele', value: done.length, icon: Activity },
      { label: 'Tore', value: goals, icon: Trophy },
      { label: 'Getrackte Aktionen', value: actions, icon: BarChart3 },
    ].filter((x) => x.value > 0);
  }, [teams, matches, trackingRows]);

  // Bilder: Highlights der Liga, sonst die eingebauten Motive.
  const images = useMemo(() => {
    const all = [...highlights.items, ...highlights.albums.flatMap((a) => a.items)].filter((m) => m.type === 'image' && m.url);
    const featured = all.filter((m) => m.featured);
    return [...featured, ...all.filter((m) => !m.featured)].map((m) => m.url).filter((u, i, a) => a.indexOf(u) === i);
  }, [highlights]);
  // Fester Hintergrund oben: Foto aus der Halle (Season 1).
  const heroBg = '/assets/season2-hero.webp';
  const logos = teams.filter((t) => t.logoUrl);
  const topScorers = useMemo(() => [...players].filter((p) => p.goals > 0).sort((a, b) => b.goals - a.goals).slice(0, 3), [players]);

  const heroRef = useRef<HTMLElement | null>(null);
  const { scrollYProgress } = useScroll({ target: heroRef, offset: ['start start', 'end start'] });
  const bgY = useTransform(scrollYProgress, [0, 1], ['0%', '30%']);
  const bgScale = useTransform(scrollYProgress, [0, 1], [1.08, 1.25]);
  const titleY = useTransform(scrollYProgress, [0, 1], ['0%', '40%']);
  const titleOpacity = useTransform(scrollYProgress, [0, 0.8], [1, 0]);

  const canBook = Boolean(cfg?.canBook);
  // Vorregistrierung noch offen? (im Backoffice abschaltbar) – sonst keine
  // „Vorregistrieren"-Tasten mehr, nur „Startet in Kürze".
  const preregOpen = cfg?.signupOpen !== false;
  const mainLabel = canBook ? 'Startplatz buchen' : preregOpen ? 'Unverbindlich vorregistrieren' : 'Buchung startet in Kürze';
  const mainAction = () => (canBook ? openFlow('new') : preregOpen ? onNavigate('/anmeldung') : setPreregHint('soon'));
  const openFlow = (mode: 'prereg' | 'new', pkg?: PackageId) => {
    if (!canBook) {
      setPreregHint(mode === 'prereg' ? 'prereg' : preregOpen ? '' : 'soon');
      if (mode !== 'prereg' && preregOpen) onNavigate('/anmeldung');
      return;
    }
    setIntro(mode);
    if (pkg) setDraft((d) => ({ ...d, pkg }));
    if (step === 'done' || step === 'status') {
      setDraft(newDraft(cfg?.minSquad ?? 8));
      setStep('email');
    } else if (!draft.token) setStep('email');
    setFlowOpen(true);
  };
  const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  // --- Noch nicht veröffentlicht / Laden ------------------------------------
  if (!cfg || !cfg.visible) {
    return (
      <div className="min-h-[100svh] text-white font-sans relative overflow-hidden flex flex-col" style={{ background: S2.bg }}>
        <div className="absolute inset-0 opacity-25 bg-cover bg-center" style={{ backgroundImage: `url(${heroBg})` }} />
        <div className="absolute inset-0" style={{ background: `radial-gradient(80% 60% at 50% 30%, rgba(47,91,255,.35), transparent 70%), linear-gradient(180deg, rgba(4,6,14,.55), ${S2.bg} 85%)` }} />
        <header className="relative px-4" style={{ paddingTop: 'calc(env(safe-area-inset-top) + .9rem)' }}>
          <div className="max-w-6xl mx-auto flex items-center justify-between">
            <button onClick={() => onNavigate('/')} className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-white/60 hover:text-white cursor-pointer"><ArrowLeft className="w-4 h-4" /> Zur Website</button>
            <img src="/assets/hero-league-logo.png" alt="Hero League" className="h-8 w-auto" />
          </div>
        </header>
        <main className="relative flex-1 grid place-items-center px-4 py-16 text-center">
          {!cfg && !loadErr ? (
            <div className="w-8 h-8 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8 }} className="max-w-xl">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-white/15 bg-white/[.05] text-[11px] font-mono uppercase tracking-[.2em] text-white/70">
                <Lock className="w-3.5 h-3.5" /> Noch nicht veröffentlicht
              </div>
              <h1 className="mt-6 font-display font-black uppercase leading-[.82] tracking-tight text-[clamp(4rem,20vw,9rem)]">
                {cfg?.seasonLabel || 'Season 2'}
              </h1>
              <p className="mt-5 text-white/65 text-[16px] leading-relaxed">
                {loadErr ? 'Die Seite konnte gerade nicht geladen werden. Bitte versuch es gleich noch einmal.' : 'Hier entsteht gerade etwas Großes. Die Seite ist noch nicht freigeschaltet – schau bald wieder vorbei.'}
                {cfg?.startInfo ? <><br /><span className="text-white/85 font-semibold">{cfg.startInfo}</span></> : null}
              </p>
              <div className="mt-8 flex flex-wrap justify-center gap-3">
                {cfg?.signupOpen !== false && <button onClick={() => onNavigate('/anmeldung')} className="inline-flex items-center gap-2 rounded-2xl px-6 py-3.5 font-display font-black uppercase tracking-wide text-[#06091A] cursor-pointer" style={{ background: S2.volt }}>
                  Unverbindlich vorregistrieren <ArrowRight className="w-4 h-4" />
                </button>}
                <button onClick={() => onNavigate('/')} className="inline-flex items-center gap-2 rounded-2xl px-6 py-3.5 font-display font-black uppercase tracking-wide text-white border border-white/20 hover:bg-white/10 cursor-pointer">Zur Website</button>
              </div>
            </motion.div>
          )}
        </main>
      </div>
    );
  }

  const seasonWord = cfg.seasonLabel.replace(/\s*\S+$/, '') || 'Season';
  const seasonNum = cfg.seasonLabel.match(/\S+$/)?.[0] ?? '2';
  const saveTwo = cfg.prices.one * 2 - cfg.prices.two;
  const saveEarly = cfg.prices.one * 2 - cfg.prices.twoEarly;
  const deadlineTxt = cfg.earlyBirdUntil ? formatDeadline(cfg.earlyBirdUntil) : '';
  const earlyEnded = Boolean(cfg.earlyBirdUntil) && !earlyActive;

  const features = [
    { icon: Activity, title: 'Jedes Spiel getrackt', text: 'Pässe, Zweikämpfe, Schüsse, Paraden – wir erfassen eure Spiele Aktion für Aktion. Keine Schätzungen, echte Daten.' },
    { icon: IdCard, title: 'Eure eigene Spielerkarte', text: 'Jeder Spieler bekommt eine Karte im FIFA-Style – mit Werten, die sich aus seinen echten Leistungen berechnen.' },
    { icon: BarChart3, title: 'Live-Tabelle & Statistiken', text: 'Tabelle, Torschützen, Vorlagen, Torhüter-Ranking: alles automatisch und sofort nach dem Spiel online.' },
    { icon: Trophy, title: 'Awards & HERO ONE', text: 'Spieler des Spieltags, Torwart des Spieltags, Golden Glove, Torschützenkönig – Leistung wird gefeiert.' },
    { icon: Tv, title: 'Livestream', text: 'Spieltage laufen live auf Twitch – Familie, Freunde und Fans sind von überall dabei.' },
    { icon: Camera, title: 'Fotos & Highlights', text: 'Highlights und Bilder von den Spieltagen – auf der Website und zum Teilen für euer Team.' },
  ];

  const faq = [
    { q: 'Was bedeutet „verbindlich buchen"?', a: `Mit dem Abschluss der Buchung sichert ihr euch verbindlich einen Startplatz. ${cfg.bindingNotice}` },
    { q: 'Wie bezahlen wir?', a: 'Nach der Buchung bekommt ihr einen Revolut-Zahlungslink – bezahlt wird bequem per Karte, ein Revolut-Konto braucht ihr nicht. Gebt bei der Zahlung eure Buchungsnummer und euren Teamnamen als Verwendungszweck an.' },
    { q: 'Wann ist unser Startplatz fix?', a: 'Sobald eure Zahlung bei uns eingegangen ist. Dann bekommt ihr eine Bestätigung per E-Mail.' },
    { q: 'Bis wann gilt der Early Bird?', a: deadlineTxt
      ? `Der Early-Bird-Preis von ${euro(cfg.prices.twoEarly)} gilt nur für das Paket mit zwei Seasons und endet am ${deadlineTxt}. ${cfg.deadlineBasis === 'payment' ? 'Maßgeblich ist der Zahlungseingang bis zu diesem Zeitpunkt.' : 'Maßgeblich ist der verbindliche Buchungsabschluss bis zu diesem Zeitpunkt.'} Danach kostet das Zweierpaket ${euro(cfg.prices.two)}.`
      : `Der Early-Bird-Preis von ${euro(cfg.prices.twoEarly)} gilt nur für kurze Zeit ab dem Start der Buchung – und nur für das Paket mit zwei Seasons. Den genauen Stichtag geben wir mit der Öffnung bekannt.` },
    { q: 'Wir haben uns schon vorregistriert – was jetzt?', a: 'Klickt auf „Schon vorregistriert?" und gebt die E-Mail-Adresse eurer Vorregistrierung ein. Nach der Bestätigung per Code sind eure Angaben schon eingetragen – ihr ergänzt nur noch Kader, Logo und Paket.' },
    { q: 'Brauchen wir eigene Trikots?', a: 'Ja. Ab Season 2 sind einheitliche Teamtrikots mit gut lesbaren, kontrastreichen Rückennummern Pflicht. Jede Nummer ist im Team nur einmal vergeben und fest einem Spieler zugeordnet.' },
    { q: 'Können wir den Kader später ändern?', a: 'Ja. Änderungen und Nachmeldungen müssen vor dem jeweiligen Einsatz gemeldet werden – inklusive Rückennummer.' },
    { q: 'Was passiert, wenn eine Season ausfällt?', a: 'Findet eine gebuchte Season nicht statt, wird der auf diese Season entfallende bereits gezahlte Teilnahmebeitrag erstattet. Alle Details stehen in den Teilnahmebedingungen.' },
  ];

  const steps = [
    { icon: Mail, title: 'E-Mail bestätigen', text: 'Code eingeben – Vorregistrierte sind sofort ausgefüllt.' },
    { icon: Users, title: 'Team & Kader', text: 'Teamname, Ansprechpartner, Spieler mit Rückennummer.' },
    { icon: ShieldCheck, title: 'Verbindlich buchen', text: 'Paket wählen, Logo hochladen, Bedingungen bestätigen.' },
    { icon: CreditCard, title: 'Bezahlen', text: 'Per Revolut-Link – danach ist euer Startplatz fix.' },
  ];

  // Zwei Karten – die 2-Seasons-Karte zeigt immer den Preis, der beim Buchen
  // JETZT tatsächlich gilt (Early Bird während der Frist, sonst Zweierpaket).
  const twoPoints = earlyActive
    ? [`${euro(saveEarly)} gespart ggü. 2× einzeln (${euro(cfg.prices.one * 2)})`, 'Startplatz für zwei Seasons gesichert', `Early Bird nur bis ${deadlineTxt} – danach ${euro(cfg.prices.two)}`]
    : earlyEnded
      ? [`${euro(saveTwo)} gespart ggü. 2× einzeln (${euro(cfg.prices.one * 2)})`, 'Startplatz für zwei Seasons gesichert', 'Ein Preis für beide Seasons']
      : [`${euro(saveTwo)} gespart ggü. 2× einzeln (${euro(cfg.prices.one * 2)})`, 'Startplatz für zwei Seasons gesichert', `Early Bird zum Start: ${euro(cfg.prices.twoEarly)} – nur für kurze Zeit`];
  const plans: { id: PackageId; title: string; sub: string; cents: number; strike?: number; perSeason: number; badge?: string; hot?: boolean; points: string[] }[] = [
    { id: 'one', title: '1 Season', sub: cfg.seasonLabel, cents: cfg.prices.one, perSeason: cfg.prices.one, points: ['Startplatz für eine Season', 'Tracking, Statistiken & Spielerkarten', 'Alle Awards & Highlights'] },
    {
      id: 'two', title: '2 Seasons', sub: earlyActive ? 'Early Bird' : 'Zweierpaket',
      cents: earlyActive ? cfg.prices.twoEarly : cfg.prices.two, strike: earlyActive ? cfg.prices.two : undefined,
      perSeason: Math.round((earlyActive ? cfg.prices.twoEarly : cfg.prices.two) / 2),
      badge: earlyActive ? 'Early Bird' : 'Bester Preis', hot: true, points: twoPoints,
    },
  ];

  return (
    <MotionConfig reducedMotion="user">
      <div className="min-h-screen text-white font-sans overflow-x-hidden" style={{ background: S2.bg }}>
        {/* Kopfzeile (fest, um die Safe-Area gepolstert) – inkl. Vorschau-Hinweis */}
        <header
          className={`fixed inset-x-0 top-0 z-50 transition-colors duration-300 ${scrolled ? 'bg-[#04060E]/80 backdrop-blur-xl border-b border-white/[.07]' : ''}`}
          style={{ paddingTop: 'env(safe-area-inset-top)' }}
        >
          {cfg.preview && (
            <div className="text-center text-[11px] sm:text-[11.5px] font-bold px-4 py-1.5 text-[#06091A] leading-snug" style={{ background: S2.volt }}>
              <Eye className="w-3.5 h-3.5 inline -mt-0.5 mr-1" />
              {cfg.testMode ? 'Admin-Vorschau – Seite noch nicht öffentlich · Buchungen sind Testbuchungen' : 'Exklusiver Vorab-Zugang für vorregistrierte Teams'}
            </div>
          )}
          <div className="h-2.5" />
          <div className="max-w-6xl mx-auto px-4 pb-2.5 flex items-center gap-3">
            <button onClick={() => onNavigate('/')} className="shrink-0 flex items-center gap-2 cursor-pointer" aria-label="Zur Website">
              <img src="/assets/hero-league-logo.png" alt="Hero League" className="h-8 sm:h-9 w-auto" />
            </button>
            <div className="flex-1" />
            <button onClick={() => openFlow('prereg')} className="shrink-0 inline-flex items-center gap-1.5 rounded-full px-3 sm:px-4 py-2 text-[12px] sm:text-[13px] font-bold text-white border border-white/20 bg-white/[.06] hover:bg-white/15 cursor-pointer">
              <Sparkles className="w-3.5 h-3.5 text-[#D7FF3B]" /> <span className="hidden min-[400px]:inline">Schon</span> vorregistriert?
            </button>
            <button onClick={() => (canBook ? openFlow('new') : scrollTo('preise'))} className="hidden sm:inline-flex shrink-0 items-center gap-1.5 rounded-full px-4 py-2 text-[13px] font-black uppercase tracking-wide text-[#06091A] cursor-pointer" style={{ background: S2.volt }}>
              Platz sichern <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </header>

        {/* HERO */}
        <section ref={heroRef} className="relative min-h-[100svh] flex items-end overflow-hidden">
          <motion.div className="absolute inset-0" style={{ y: bgY, scale: bgScale }}>
            <img src={heroBg} alt="" className="w-full h-full object-cover" onError={(e) => { (e.currentTarget as HTMLImageElement).src = '/assets/hero-stadium.png'; }} />
          </motion.div>
          <div className="absolute inset-0" style={{ background: `linear-gradient(180deg, rgba(4,6,14,.55) 0%, rgba(4,6,14,.35) 35%, rgba(4,6,14,.85) 75%, ${S2.bg} 100%)` }} />
          <div className="absolute inset-0 opacity-[.13]" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.5) 1px, transparent 1px)', backgroundSize: '64px 64px', maskImage: 'radial-gradient(70% 60% at 50% 40%, #000, transparent)' }} />
          {/* schwebende Lichtkugeln */}
          <motion.div className="absolute -top-24 -left-24 w-[420px] h-[420px] rounded-full blur-[90px]" style={{ background: 'rgba(47,91,255,.45)' }} animate={{ x: [0, 80, 0], y: [0, 40, 0] }} transition={{ duration: 14, repeat: Infinity, ease: 'easeInOut' }} />
          <motion.div className="absolute top-1/3 -right-32 w-[380px] h-[380px] rounded-full blur-[100px]" style={{ background: 'rgba(215,255,59,.16)' }} animate={{ x: [0, -60, 0], y: [0, -50, 0] }} transition={{ duration: 18, repeat: Infinity, ease: 'easeInOut' }} />
          {/* Lichtstrahl */}
          <motion.div className="absolute inset-y-0 w-1/3 -skew-x-12" style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,.07), transparent)' }} initial={{ left: '-40%' }} animate={{ left: ['-40%', '140%'] }} transition={{ duration: 6, repeat: Infinity, repeatDelay: 3, ease: 'easeInOut' }} />

          <motion.div className="relative w-full max-w-6xl mx-auto px-4 pb-14 sm:pb-20 pt-32" style={{ y: titleY, opacity: titleOpacity }}>
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1, duration: 0.6 }} className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[.06] backdrop-blur px-3 py-1.5 text-[11px] font-mono uppercase tracking-[.2em] text-white/80">
              <span className="relative flex w-2 h-2"><span className="absolute inset-0 rounded-full bg-[#D7FF3B] animate-ping opacity-70" /><span className="relative w-2 h-2 rounded-full bg-[#D7FF3B]" /></span>
              {canBook ? 'Buchung geöffnet' : 'Anmeldung startet bald'}
            </motion.div>
            <h1 className="mt-5 font-display font-black uppercase tracking-tight leading-[.8]">
              <span className="block overflow-hidden">
                <motion.span className="block text-[clamp(3.6rem,17vw,10rem)]" initial={{ y: '105%' }} animate={{ y: 0 }} transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1], delay: 0.15 }}>
                  {seasonWord}
                </motion.span>
              </span>
              <span className="block overflow-hidden -mt-1">
                <motion.span
                  className="relative inline-block text-[clamp(7rem,38vw,22rem)] leading-[.78] bg-clip-text text-transparent pr-[.04em]"
                  style={{ backgroundImage: `linear-gradient(160deg, ${S2.volt} 0%, ${S2.volt} 40%, #ffffff 70%, ${S2.blueLight} 100%)` }}
                  initial={{ y: '105%' }}
                  animate={{ y: 0 }}
                  transition={{ duration: 1, ease: [0.22, 1, 0.36, 1], delay: 0.3 }}
                >
                  {seasonNum}
                </motion.span>
              </span>
            </h1>
            <motion.p initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.7, duration: 0.7 }} className="mt-5 max-w-xl text-[17px] sm:text-[20px] text-white/80 leading-snug">
              Euer Team. Echte Daten. Große Bühne.{' '}
              <span className="text-white/55">Jedes Spiel getrackt, jede Aktion gezählt{cfg.startInfo ? ` – ${cfg.startInfo}.` : '.'}</span>
            </motion.p>
            <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.85, duration: 0.7 }} className="mt-7 flex flex-wrap gap-3">
              <button onClick={mainAction} className="group inline-flex items-center gap-2 rounded-2xl px-6 py-4 font-display font-black uppercase tracking-wide text-[17px] text-[#06091A] cursor-pointer active:scale-[.98] transition-transform" style={{ background: S2.volt, boxShadow: '0 18px 50px -16px rgba(215,255,59,.6)' }}>
                {mainLabel} <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </button>
              <button onClick={() => openFlow('prereg')} className="inline-flex items-center gap-2 rounded-2xl px-6 py-4 font-display font-black uppercase tracking-wide text-[17px] text-white border border-white/25 bg-white/[.06] backdrop-blur hover:bg-white/15 cursor-pointer">
                <Sparkles className="w-5 h-5 text-[#D7FF3B]" /> Schon vorregistriert?
              </button>
            </motion.div>
            <AnimatePresence>
              {preregHint && (
                <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-4 max-w-xl rounded-2xl border border-white/15 bg-black/40 backdrop-blur px-4 py-3 text-[14px] text-white/80">
                  {preregHint === 'prereg'
                    ? 'Super, dass ihr dabei seid! Sobald die verbindliche Buchung startet, meldet ihr euch hier mit der E-Mail eurer Vorregistrierung an – alle Angaben sind dann schon ausgefüllt. Wir sagen euch per E-Mail Bescheid.'
                    : 'Die verbindliche Buchung startet in Kürze – schaut bald wieder vorbei. Alle Infos und Preise findet ihr schon hier auf der Seite.'}
                </motion.div>
              )}
            </AnimatePresence>
            {earlyActive && cfg.earlyBirdUntil && (
              <motion.button
                onClick={() => scrollTo('preise')}
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.1 }}
                className="mt-6 inline-flex flex-wrap items-center gap-x-2 gap-y-1 rounded-full border border-[#D7FF3B]/40 bg-[#D7FF3B]/10 px-4 py-2 text-[13px] text-[#E9FF9A] cursor-pointer text-left"
              >
                <Clock className="w-4 h-4 shrink-0" /> Early Bird {euro(cfg.prices.twoEarly)} endet in <strong className="text-white"><Countdown target={cfg.earlyBirdUntil} compact /></strong>
              </motion.button>
            )}
          </motion.div>
          <motion.button onClick={() => scrollTo('zahlen')} className="absolute bottom-5 left-1/2 -translate-x-1/2 text-white/50 cursor-pointer hidden sm:block" animate={{ y: [0, 8, 0] }} transition={{ duration: 1.8, repeat: Infinity }} aria-label="Weiter scrollen">
            <ChevronDown className="w-6 h-6" />
          </motion.button>
        </section>

        {/* Laufband */}
        <div className="relative border-y border-white/[.07] py-4 -rotate-1 scale-[1.03]" style={{ background: S2.blue }}>
          <Marquee duration={28}>
            {['Jedes Spiel getrackt', 'Eigene Spielerkarte', 'Live-Tabelle', 'Livestream', 'Awards', 'Highlights', 'Feste Rückennummern', 'Echte Daten'].map((w) => (
              <span key={w} className="flex items-center gap-6 pr-6 font-display font-black uppercase tracking-tight text-[22px] sm:text-[28px] text-white whitespace-nowrap">
                {w} <Zap className="w-5 h-5 text-[#D7FF3B] fill-[#D7FF3B]" />
              </span>
            ))}
          </Marquee>
        </div>

        {/* Zahlen */}
        {stats.length > 0 && (
          <section id="zahlen" className="relative max-w-6xl mx-auto px-4 pt-24 sm:pt-32 pb-8">
            <SectionHead kicker="Season 1 in Zahlen" title={<>Das war erst<br /><span className="text-[#8FA8FF]">der Anfang.</span></>} />
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
              {stats.map((s, i) => (
                <Reveal key={s.label} delay={i * 0.08} className={i === stats.length - 1 && stats.length % 2 === 1 ? 'col-span-2 lg:col-span-1' : ''}>
                  <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-b from-white/[.07] to-white/[.02] p-5 sm:p-6 h-full">
                    <s.icon className="w-5 h-5 text-[#8FA8FF]" />
                    <div className="mt-6 font-display font-black text-white text-[44px] sm:text-[56px] leading-none"><Counter value={s.value} /></div>
                    <div className="mt-2 text-[12px] font-mono uppercase tracking-[.14em] text-white/50">{s.label}</div>
                    <div className="absolute -bottom-10 -right-10 w-28 h-28 rounded-full blur-2xl" style={{ background: 'rgba(47,91,255,.25)' }} />
                  </div>
                </Reveal>
              ))}
            </div>
          </section>
        )}

        {/* Was euch erwartet */}
        <section id="leistungen" className="relative max-w-6xl mx-auto px-4 pt-20 sm:pt-28">
          <SectionHead kicker="Was euch erwartet" title={<>Spielt wie die<br /><span className="text-[#D7FF3B]">Profis.</span></>} text="Hero League ist mehr als eine Hobbyliga: Bei uns bekommt jedes Team die Bühne, die Daten und die Aufmerksamkeit, die sonst nur Profis haben." />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
            {features.map((f, i) => (
              <Reveal key={f.title} delay={(i % 3) * 0.08}>
                <motion.div whileHover={{ y: -6 }} transition={{ type: 'spring', stiffness: 300, damping: 22 }} className="group relative h-full overflow-hidden rounded-3xl border border-white/10 bg-white/[.03] p-6">
                  <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500" style={{ background: 'radial-gradient(80% 60% at 0% 0%, rgba(47,91,255,.25), transparent 70%)' }} />
                  <span className="relative inline-grid place-items-center w-12 h-12 rounded-2xl text-white" style={{ background: S2.grad }}><f.icon className="w-6 h-6" /></span>
                  <h3 className="relative mt-5 font-display font-black uppercase tracking-tight text-white text-[24px] leading-none">{f.title}</h3>
                  <p className="relative mt-2.5 text-[14.5px] text-white/60 leading-relaxed">{f.text}</p>
                </motion.div>
              </Reveal>
            ))}
          </div>
        </section>

        {/* Bühne: Top-Torschützen mit freigestellten Fotos */}
        {topScorers.length > 0 && (
          <section className="relative max-w-6xl mx-auto px-4 pt-20 sm:pt-28">
            <SectionHead kicker="Die Bühne gehört euch" title={<>Nächste Season<br /><span className="text-[#8FA8FF]">steht ihr hier.</span></>} text="Die Top-Torjäger aus Season 1 – mit eigener Karte, eigenen Stats und ihrem Moment auf der Startseite." />
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
              {topScorers.map((p, i) => (
                <Reveal key={p.id} delay={i * 0.1}>
                  <div className="relative h-56 sm:h-72 overflow-hidden rounded-3xl border border-white/10" style={{ background: `linear-gradient(160deg, ${i === 0 ? 'rgba(215,255,59,.22)' : 'rgba(47,91,255,.28)'}, rgba(255,255,255,.02))` }}>
                    <div className="absolute left-5 top-5 z-10">
                      <div className="font-display font-black text-white text-[64px] sm:text-[76px] leading-none tabular-nums">{p.goals}</div>
                      <div className="text-[11px] font-mono uppercase tracking-wider text-white/55">Tore</div>
                    </div>
                    <div className="absolute left-5 bottom-5 right-[45%] z-10 min-w-0">
                      <div className="font-display font-black uppercase text-white text-[20px] leading-none truncate">{p.name}</div>
                      <div className="text-[12px] text-white/55 truncate mt-1">{p.teamName}</div>
                    </div>
                    {(p.cutoutUrl || p.imageUrl) && (
                      <motion.img
                        src={p.cutoutUrl || p.imageUrl}
                        alt=""
                        className={`absolute bottom-0 right-0 h-[92%] w-auto max-w-[62%] object-contain object-bottom ${p.cutoutUrl ? '' : 'rounded-tl-3xl opacity-80'}`}
                        initial={{ x: 30, opacity: 0 }}
                        whileInView={{ x: 0, opacity: 1 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.8, delay: 0.2 + i * 0.1 }}
                      />
                    )}
                  </div>
                </Reveal>
              ))}
            </div>
          </section>
        )}

        {/* Bilder-Laufband */}
        {images.length > 2 && (
          <section className="relative pt-20 sm:pt-28 space-y-3">
            <Marquee duration={60}>
              {images.slice(0, 10).map((u, i) => (
                <div key={u} className="pr-3">
                  <div className={`w-[240px] sm:w-[340px] aspect-[4/3] overflow-hidden rounded-2xl border border-white/10 ${i % 2 ? 'rotate-1' : '-rotate-1'}`}>
                    <img src={u} alt="" loading="lazy" className="w-full h-full object-cover" />
                  </div>
                </div>
              ))}
            </Marquee>
            {images.length > 6 && (
              <Marquee duration={70} reverse>
                {images.slice(10, 20).concat(images.slice(0, Math.max(0, 6 - images.slice(10, 20).length))).map((u, i) => (
                  <div key={`${u}-${i}`} className="pr-3">
                    <div className="w-[200px] sm:w-[280px] aspect-[4/3] overflow-hidden rounded-2xl border border-white/10 opacity-70">
                      <img src={u} alt="" loading="lazy" className="w-full h-full object-cover" />
                    </div>
                  </div>
                ))}
              </Marquee>
            )}
          </section>
        )}

        {/* Teams aus Season 1 */}
        {logos.length > 3 && (
          <section className="relative max-w-6xl mx-auto px-4 pt-20 sm:pt-28 text-center">
            <Reveal>
              <div className="text-[11px] font-mono uppercase tracking-[.22em] text-white/45">Diese Teams waren in Season 1 dabei</div>
            </Reveal>
            <div className="mt-6 -mx-4">
              <Marquee duration={35}>
                {logos.map((t) => (
                  <div key={t.id} className="px-4 sm:px-6">
                    <img src={t.logoUrl} alt={t.name} title={t.name} className="h-14 sm:h-20 w-auto max-w-[110px] object-contain opacity-80 hover:opacity-100 transition-opacity" loading="lazy" />
                  </div>
                ))}
              </Marquee>
            </div>
          </section>
        )}

        {/* Preise */}
        <section id="preise" className="relative max-w-6xl mx-auto px-4 pt-24 sm:pt-32 scroll-mt-20">
          <div className="absolute inset-x-0 top-24 h-[420px] pointer-events-none" style={{ background: 'radial-gradient(60% 60% at 50% 40%, rgba(47,91,255,.22), transparent 70%)' }} />
          <SectionHead center kicker="Preise pro Team" title={<>Sichert euch<br /><span className="text-[#D7FF3B]">euren Platz.</span></>} text="Ein Preis pro Team – egal wie groß euer Kader ist. Wer gleich zwei Seasons bucht, spart." />

          {earlyActive && cfg.earlyBirdUntil && (
            <Reveal className="max-w-xl mx-auto mb-8">
              <div className="rounded-3xl border border-[#D7FF3B]/35 p-4 sm:p-5" style={{ background: 'linear-gradient(140deg, rgba(215,255,59,.12), rgba(47,91,255,.10))' }}>
                <div className="flex items-start gap-2.5 mb-3">
                  <Clock className="w-5 h-5 text-[#D7FF3B] shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <div className="font-display font-black uppercase text-white text-[18px] leading-tight">Early Bird endet am {deadlineTxt}</div>
                    <div className="text-[12.5px] text-white/60 mt-1">{cfg.deadlineBasis === 'payment' ? 'Maßgeblich ist der Zahlungseingang bis zu diesem Zeitpunkt.' : 'Maßgeblich ist der verbindliche Buchungsabschluss bis zu diesem Zeitpunkt.'} Danach kostet das Zweierpaket {euro(cfg.prices.two)}.</div>
                  </div>
                </div>
                <Countdown target={cfg.earlyBirdUntil} />
              </div>
            </Reveal>
          )}

          <div className="relative grid grid-cols-1 md:grid-cols-2 gap-4 items-stretch max-w-4xl mx-auto">
            {plans.map((pl, i) => (
              <Reveal key={pl.id} delay={i * 0.1} className={pl.hot ? 'md:-mt-4' : ''}>
                <div className={`relative h-full flex flex-col rounded-[28px] p-6 sm:p-7 border ${pl.hot ? 'border-[#D7FF3B]/60' : 'border-white/10'}`} style={{ background: pl.hot ? 'linear-gradient(170deg, rgba(47,91,255,.35), rgba(7,11,28,.9) 70%)' : 'rgba(255,255,255,.03)', boxShadow: pl.hot ? '0 30px 80px -30px rgba(47,91,255,.7)' : undefined }}>
                  {pl.badge && (
                    <span className="absolute -top-3 left-6 px-3 py-1 rounded-full text-[11px] font-black uppercase tracking-wider text-[#06091A]" style={{ background: S2.volt }}>{pl.badge}</span>
                  )}
                  <div className="text-[12px] font-mono uppercase tracking-[.16em] text-white/50">{pl.sub}</div>
                  <div className="font-display font-black uppercase text-white text-[30px] leading-none mt-1">{pl.title}</div>
                  <div className="mt-6 flex items-end gap-2 flex-wrap">
                    <span className="font-display font-black text-[56px] leading-none tabular-nums">{euro(pl.cents)}</span>
                    {pl.strike && <span className="text-[18px] text-white/40 line-through tabular-nums mb-1.5">{euro(pl.strike)}</span>}
                  </div>
                  <div className="text-[13px] text-white/50 mt-1.5">{pl.id === 'one' ? 'pro Team' : `= ${euro(pl.perSeason)} pro Season`}</div>
                  <ul className="mt-6 space-y-2.5 flex-1">
                    {pl.points.map((pt) => (
                      <li key={pt} className="flex items-start gap-2.5 text-[14px] text-white/75"><CheckCircle2 className="w-4 h-4 text-[#8FA8FF] shrink-0 mt-0.5" /><span className="min-w-0">{pt}</span></li>
                    ))}
                  </ul>
                  <button
                    onClick={() => openFlow('new', pl.id)}
                    className={`mt-7 w-full inline-flex items-center justify-center gap-2 rounded-2xl px-5 py-4 font-display font-black uppercase tracking-wide text-[16px] cursor-pointer active:scale-[.98] transition-transform ${pl.hot ? 'text-[#06091A]' : 'text-white border border-white/20 hover:bg-white/10'}`}
                    style={pl.hot ? { background: S2.volt } : undefined}
                  >
                    {canBook ? 'Jetzt buchen' : preregOpen ? 'Vorregistrieren' : 'Startet in Kürze'} <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </Reveal>
            ))}
          </div>
          <Reveal className="mt-6 text-center text-[12.5px] text-white/45 max-w-2xl mx-auto">
            Alle Preise pro Team inkl. aller Leistungen. Das Early-Bird-Angebot gilt ausschließlich für die gemeinsame Buchung beider Seasons{deadlineTxt ? ` bis ${deadlineTxt}` : ' – nur für kurze Zeit ab dem Start der Buchung'}.
            {!canBook && (preregOpen
              ? <><br />Die verbindliche Buchung ist noch nicht geöffnet – registriert euch jetzt unverbindlich vor, dann melden wir uns zuerst bei euch.</>
              : <><br />Die verbindliche Buchung startet in Kürze.</>)}
          </Reveal>
        </section>

        {/* Ablauf */}
        <section className="relative max-w-6xl mx-auto px-4 pt-24 sm:pt-32">
          <SectionHead kicker="So läuft die Buchung" title={<>In 5 Minuten<br /><span className="text-[#8FA8FF]">startklar.</span></>} />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            {steps.map((s, i) => (
              <Reveal key={s.title} delay={i * 0.08}>
                <div className="relative h-full rounded-3xl border border-white/10 bg-white/[.03] p-6 overflow-hidden">
                  <div className="absolute -right-2 -top-6 font-display font-black text-[120px] leading-none text-white/[.04] select-none">{i + 1}</div>
                  <s.icon className="relative w-6 h-6 text-[#D7FF3B]" />
                  <h3 className="relative mt-5 font-display font-black uppercase text-white text-[22px] leading-none">{s.title}</h3>
                  <p className="relative mt-2 text-[14px] text-white/60 leading-relaxed">{s.text}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </section>

        {/* Trikot-Pflicht */}
        <section className="relative max-w-6xl mx-auto px-4 pt-24 sm:pt-32">
          <Reveal>
            <div className="relative overflow-hidden rounded-[32px] border border-white/10 p-6 sm:p-10" style={{ background: 'linear-gradient(130deg, #0B1745 0%, #16277A 45%, #2F5BFF 120%)' }}>
              <motion.div className="absolute -right-6 sm:right-6 top-1/2 -translate-y-1/2 font-display font-black text-[180px] sm:text-[300px] leading-none text-white/[.07] select-none" animate={{ rotate: [0, 3, 0] }} transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}>
                10
              </motion.div>
              <div className="relative max-w-2xl">
                <div className="inline-flex items-center gap-2 text-[11px] font-mono uppercase tracking-[.22em] text-[#D7FF3B]"><Hash className="w-3.5 h-3.5" /> Neu ab {cfg.seasonLabel}</div>
                <h2 className="mt-3 font-display font-black uppercase tracking-tight text-white text-[34px] sm:text-[52px] leading-[.9]">Einheitliche Trikots.<br />Feste Nummern.</h2>
                <p className="mt-4 text-[15px] sm:text-[16.5px] text-white/80 leading-relaxed">
                  Ab Season Two sind einheitliche Teamtrikots mit gut lesbaren, kontrastreichen Rückennummern verpflichtend. Jede Rückennummer darf innerhalb eines Teams nur einmal vergeben sein und muss einem Spieler eindeutig zugeordnet werden.
                </p>
                <p className="mt-3 text-[14.5px] text-white/65 leading-relaxed">
                  Die Zuordnung ist vor dem ersten Einsatz in der Kaderliste zu hinterlegen. Änderungen und Nachmeldungen müssen vor dem jeweiligen Einsatz gemeldet werden. Die Rückennummern dienen der zuverlässigen Erfassung und Zuordnung der Spielerdaten und Statistiken.
                </p>
              </div>
            </div>
          </Reveal>
        </section>

        {/* Regelwerk & Teilnahmebedingungen */}
        <section id="regeln" className="relative max-w-4xl mx-auto px-4 pt-24 sm:pt-32">
          <SectionHead kicker="Transparent von Anfang an" title={<>Regelwerk &amp;<br />Bedingungen.</>} text="Alles, was ihr vor der Buchung wissen müsst – zum Nachlesen, ganz ohne Kleingedrucktes." />
          <div className="space-y-3">
            <LegalPanel title="Regelwerk" text={cfg.rules} />
            <LegalPanel title={`Teilnahmebedingungen · ${cfg.termsVersion}`} text={cfg.terms} />
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="relative max-w-4xl mx-auto px-4 pt-24 sm:pt-32">
          <SectionHead kicker="Häufige Fragen" title={<>Noch Fragen?</>} />
          <Accordion items={faq} />
        </section>

        {/* Schluss-CTA */}
        <section className="relative px-4 pt-24 sm:pt-32 pb-16">
          <Reveal className="max-w-5xl mx-auto">
            <div className="relative overflow-hidden rounded-[36px] border border-white/10 px-6 py-14 sm:py-20 text-center">
              <img src={images[1] || '/assets/hero-crowd.png'} alt="" className="absolute inset-0 w-full h-full object-cover opacity-30" loading="lazy" />
              <div className="absolute inset-0" style={{ background: `radial-gradient(70% 80% at 50% 100%, rgba(47,91,255,.55), transparent 70%), linear-gradient(180deg, rgba(4,6,14,.6), rgba(4,6,14,.9))` }} />
              <div className="relative">
                <h2 className="font-display font-black uppercase tracking-tight text-white text-[44px] sm:text-[84px] leading-[.85]">Seid dabei,<br /><span className="text-[#D7FF3B]">wenn’s losgeht.</span></h2>
                {cfg.startInfo && <p className="mt-5 text-white/70 text-[16px]">{cfg.startInfo}</p>}
                <div className="mt-8 flex flex-wrap justify-center gap-3">
                  <button onClick={mainAction} className="inline-flex items-center gap-2 rounded-2xl px-7 py-4 font-display font-black uppercase tracking-wide text-[17px] text-[#06091A] cursor-pointer" style={{ background: S2.volt }}>
                    {mainLabel} <ArrowRight className="w-5 h-5" />
                  </button>
                  <button onClick={() => openFlow('prereg')} className="inline-flex items-center gap-2 rounded-2xl px-7 py-4 font-display font-black uppercase tracking-wide text-[17px] text-white border border-white/25 hover:bg-white/10 cursor-pointer">Schon vorregistriert?</button>
                </div>
              </div>
            </div>
          </Reveal>
        </section>

        <footer className="border-t border-white/[.07] px-4 pt-8" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 2rem)' }}>
          <div className="max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-4 text-[12.5px] text-white/45">
            <img src="/assets/hero-league-logo.png" alt="Hero League" className="h-7 w-auto opacity-80" />
            <div className="flex flex-wrap gap-4">
              <button onClick={() => onNavigate('/')} className="hover:text-white cursor-pointer">Zur Website</button>
              <button onClick={() => onNavigate('/impressum')} className="hover:text-white cursor-pointer">Impressum</button>
              <button onClick={() => onNavigate('/datenschutz')} className="hover:text-white cursor-pointer">Datenschutz</button>
            </div>
          </div>
        </footer>

        {/* Mobile: feste Buchen-Taste unten */}
        <AnimatePresence>
          {scrolled && !flowOpen && (
            <motion.div initial={{ y: 100 }} animate={{ y: 0 }} exit={{ y: 100 }} transition={{ type: 'spring', stiffness: 260, damping: 28 }} className="sm:hidden fixed inset-x-0 bottom-0 z-40 px-4 pt-3 bg-gradient-to-t from-[#04060E] via-[#04060E]/90 to-transparent" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + .75rem)' }}>
              <button onClick={mainAction} className="w-full inline-flex items-center justify-center gap-2 rounded-2xl px-5 py-4 font-display font-black uppercase tracking-wide text-[16px] text-[#06091A] cursor-pointer" style={{ background: S2.volt, boxShadow: '0 14px 40px -12px rgba(215,255,59,.55)' }}>
                {canBook && earlyActive ? `Platz sichern · ab ${euro(Math.round(cfg.prices.twoEarly / 2))}/Season` : mainLabel} <ArrowRight className="w-4 h-4" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {canBook && (
          <BookingFlow
            open={flowOpen}
            onClose={() => setFlowOpen(false)}
            cfg={cfg}
            draft={draft}
            setDraft={setDraft}
            step={step}
            setStep={setStep}
            earlyActive={earlyActive}
            intro={intro}
          />
        )}
      </div>
    </MotionConfig>
  );
}

function LegalPanel({ title, text }: { title: string; text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <Reveal>
      <div className={`rounded-3xl border transition-colors ${open ? 'border-[#5B7FFF]/50 bg-[#2F5BFF]/[.06]' : 'border-white/10 bg-white/[.03]'}`}>
        <button onClick={() => setOpen((o) => !o)} className="w-full flex items-center justify-between gap-4 px-5 sm:px-6 py-5 text-left cursor-pointer">
          <span className="min-w-0 font-display font-black uppercase tracking-tight text-white text-[22px] sm:text-[26px] leading-none">{title}</span>
          <span className="shrink-0 inline-flex items-center gap-1.5 text-[12px] font-bold text-white/55">{open ? 'Schließen' : 'Lesen'} <ChevronDown className={`w-4 h-4 transition-transform duration-300 ${open ? 'rotate-180' : ''}`} /></span>
        </button>
        <AnimatePresence initial={false}>
          {open && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }} className="overflow-hidden">
              <div className="px-5 sm:px-6 pb-6"><LegalText text={text} /></div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </Reveal>
  );
}
