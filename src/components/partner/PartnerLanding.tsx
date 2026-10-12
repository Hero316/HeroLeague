import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, MotionConfig, animate, motion, useInView, useScroll, useTransform } from 'motion/react';
import {
  ArrowLeft, ArrowRight, Check, CheckCircle2, ChevronDown, Crown, Eye, Flame, Gift, Globe, Handshake, Instagram, Loader2,
  MessageSquare, MousePointerClick, Send, Shirt, Sparkles, Trophy, Tv, Users,
} from 'lucide-react';
import type { HighlightsConfig, Match, PlayerStat, Team } from '../../types';
import type { Partner } from '../../types';
import { loadPartners, TrimmedLogo } from '../ui';
import { trackSponsorClick } from '../../lib/sponsors';
import { PartnerBar, BrandCorner } from '../ObsOverlay';
import { useTurnstile } from '../../lib/register';
import { applyPartner, loadPartnerProgram, type PartnerProgramPublic, type PartnerType } from '../../lib/partners';

// ===========================================================================
// /partner – Landingpage „Partner werden". Eigene Farbwelt (Schwarz + Gold),
// echte Zahlen (im Backoffice pflegbar) + Live-Zahlen der Liga, Pakete,
// aktuelle Partner und das Anfrage-Formular. Im Backoffice an/aus schaltbar;
// ausgeschaltet sehen Besucher einen kurzen Hinweis, Admins eine Vorschau.
// ===========================================================================

const P = {
  bg: '#050706',
  gold: '#F2C14E',
  goldLight: '#FFE7A3',
  teal: '#22DFC9',
  goldGrad: 'linear-gradient(180deg,#FFFFFF 0%,#FFE7A3 45%,#F2C14E 100%)',
} as const;
const EASE = [0.22, 1, 0.36, 1] as const;

interface Props {
  teams: Team[];
  matches: Match[];
  players: PlayerStat[];
  highlights?: HighlightsConfig;
  onNavigate: (path: string) => void;
}

// --- Bausteine ---------------------------------------------------------------

function Reveal({ children, delay = 0, className = '' }: { children: React.ReactNode; delay?: number; className?: string }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 34 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.75, delay, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}

function Counter({ value, suffix = '' }: { value: number; suffix?: string }) {
  const ref = useRef<HTMLSpanElement | null>(null);
  const inView = useInView(ref, { once: true, margin: '-40px' });
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!inView) return;
    const c = animate(0, value, { duration: 2.1, ease: [0.16, 1, 0.3, 1], onUpdate: setN });
    return () => c.stop();
  }, [inView, value]);
  return (
    <span ref={ref} className="tabular-nums">
      {Math.round(n).toLocaleString('de-DE')}
      {suffix}
    </span>
  );
}

function Marquee({ children, duration = 38 }: { children: React.ReactNode; duration?: number }) {
  const half = (hidden: boolean) => (
    <div className="flex shrink-0" aria-hidden={hidden || undefined}>
      {Array.from({ length: 4 }, (_, i) => <Fragment key={i}>{children}</Fragment>)}
    </div>
  );
  return (
    <div className="relative overflow-hidden">
      <motion.div className="flex w-max" animate={{ x: ['0%', '-50%'] }} transition={{ duration: duration * 4, ease: 'linear', repeat: Infinity }}>
        {half(false)}
        {half(true)}
      </motion.div>
    </div>
  );
}

function Kicker({ children, center = false }: { children: React.ReactNode; center?: boolean }) {
  return (
    <div className={`inline-flex items-center gap-2.5 text-[11px] sm:text-[12px] font-mono uppercase tracking-[.24em] ${center ? 'justify-center' : ''}`} style={{ color: P.gold }}>
      <span className="w-7 h-px" style={{ background: P.gold }} /> {children}
    </div>
  );
}

function SectionHead({ kicker, title, text, center = false }: { kicker: string; title: React.ReactNode; text?: string; center?: boolean }) {
  return (
    <Reveal className={`mb-10 sm:mb-14 max-w-3xl ${center ? 'mx-auto text-center' : ''}`}>
      <Kicker center={center}>{kicker}</Kicker>
      <h2 className="mt-4 font-display font-black uppercase tracking-tight text-white text-[40px] sm:text-[60px] lg:text-[68px] leading-[.88]">{title}</h2>
      {text && <p className="mt-5 text-white/65 text-[16px] sm:text-[18px] leading-relaxed">{text}</p>}
    </Reveal>
  );
}

const GoldText = ({ children }: { children: React.ReactNode }) => (
  <span className="bg-clip-text text-transparent" style={{ backgroundImage: P.goldGrad, padding: '0 .06em' }}>
    {children}
  </span>
);

// Feste 1920×1080-Bühne, passend in die Breite skaliert (für die Livestream-Vorschau).
function ScaledStage({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [s, setS] = useState(0.3);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const on = () => setS(el.clientWidth / 1920);
    on();
    const ro = new ResizeObserver(on);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={ref} className="relative w-full aspect-video overflow-hidden">
      <div className="absolute left-0 top-0 w-[1920px] h-[1080px] origin-top-left" style={{ transform: `scale(${s})` }}>
        {children}
      </div>
    </div>
  );
}

// Balken, die beim Sichtbarwerden nacheinander hochwachsen (Reichweiten-Karte).
function GrowthBars() {
  const heights = [22, 30, 26, 38, 34, 46, 42, 55, 51, 64, 72, 88];
  return (
    <div className="flex items-end gap-1.5 sm:gap-2 h-24 sm:h-32">
      {heights.map((h, i) => (
        <motion.span
          key={i}
          className="flex-1 rounded-t-md"
          style={{ background: i === heights.length - 1 ? P.gold : 'rgba(242,193,78,.28)' }}
          initial={{ height: 0 }}
          whileInView={{ height: `${h}%` }}
          viewport={{ once: true }}
          transition={{ duration: 0.9, delay: 0.25 + i * 0.06, ease: EASE }}
        />
      ))}
    </div>
  );
}

// --- Inhalte -------------------------------------------------------------------

const TYPES: { id: PartnerType; title: string; tag: string; text: string; icon: typeof Crown; points: string[]; featured?: boolean }[] = [
  {
    id: 'main',
    title: 'Hauptpartnerschaft',
    tag: 'Nur 1 Platz',
    icon: Crown,
    featured: true,
    text: 'Der Name, den man mit der Hero League verbindet.',
    points: [
      'Logo dauerhaft im Livestream – auf jedem Feld, in jedem Spiel',
      'Ganz oben im Partnerbereich auf jeder Seite der Website',
      'Nennung in Posts, Reels und im Livestream',
      'Awards und Highlights „präsentiert von“ euch',
      'Eigenes Event mit Teams und Community',
      'Exklusiv in eurer Branche',
    ],
  },
  {
    id: 'partner',
    title: 'Partnerschaft',
    tag: 'Exklusiv je Branche',
    icon: Handshake,
    text: 'Stark sichtbar – und in eurer Kategorie allein. Bank, Ausrüstung, Getränke, Mobilität …',
    points: [
      'Logo im Livestream (im Wechsel)',
      'Eigene Rubrik im Partnerbereich der Website',
      'Erwähnung auf Instagram',
      'Aktionen und Vorteile für Spieler möglich',
    ],
  },
  {
    id: 'team',
    title: 'Teampartner',
    tag: 'Direkt am Team',
    icon: Shirt,
    text: 'Ihr unterstützt ein Team – und steht auf seiner Brust.',
    points: [
      'Logo auf dem Trikot eines Teams',
      'Sichtbar auf der Teamseite der Website',
      'In jedem Foto, Clip und Stream des Teams',
      'Ideal für lokale Unternehmen',
    ],
  },
  {
    id: 'other',
    title: 'Weitere',
    tag: 'Individuell',
    icon: Gift,
    text: 'Gewinnspiel, Event, Catering, Sachpreise – oder eure ganz eigene Idee. Schreibt sie uns einfach ins Formular.',
    points: [
      'Gewinnspiele im Livestream (z. B. PS5-Verlosung)',
      'Präsenz bei Spieltagen und Events',
      'Produkte vor Ort, Sampling, Aktionen',
      'Einmalig oder für eine ganze Season',
      'Eigene Idee? Einfach unten ins Textfeld schreiben',
    ],
  },
];

const TOUCHPOINTS = [
  { icon: Tv, title: 'Livestream', text: 'Euer Logo steht dauerhaft im Bild. Wer zuschaut – ob Familie, Freunde oder Fans –, sieht euch. Spiel für Spiel.' },
  { icon: Globe, title: 'Website', text: 'Auf jeder einzelnen Seite im Partnerbereich, verlinkt zu euch. Jeder Klick auf euer Logo wird gezählt – ihr bekommt die Zahlen.' },
  { icon: Instagram, title: 'Instagram', text: 'Reels, Spieltag-Posts, Stories: Partner werden genannt und markiert – genau da, wo die Reichweite entsteht.' },
  { icon: Trophy, title: 'Awards', text: 'Spieler des Monats, Spieler des Spieltags, Torschützenkönig – die Momente, die geteilt werden. Präsentiert von euch.' },
  { icon: Flame, title: 'Events', text: 'Saisonstart, Siegerehrung, Grillabend: Wir bringen Teams und Partner an einen Tisch – wie beim Grillabend mit Florian Hinterheller (DVAG).' },
  { icon: Shirt, title: 'Trikots', text: 'Als Teampartner steht ihr auf dem Trikot eines Teams – auf dem Platz, in jedem Foto und jedem Highlight.' },
];

const STEPS = [
  { icon: Send, title: 'Anfrage senden', text: 'Zwei Minuten – das Formular unten reicht.' },
  { icon: MessageSquare, title: 'Kennenlernen', text: 'Wir melden uns persönlich und hören zu, was ihr erreichen wollt.' },
  { icon: Sparkles, title: 'Paket schnüren', text: 'Ihr bekommt ein konkretes Angebot – passend zu euch.' },
  { icon: Eye, title: 'Sichtbar werden', text: 'Logo, Livestream, Instagram, Events – es geht los.' },
];

const FAQ = [
  { q: 'Was kostet eine Partnerschaft?', a: 'Das hängt vom Paket und der Laufzeit ab. Nach dem ersten Gespräch bekommt ihr ein konkretes Angebot – mit allen Leistungen schwarz auf weiß.' },
  { q: 'Wie lange läuft eine Partnerschaft?', a: 'Das legen wir gemeinsam fest. Üblich ist eine Season; einzelne Aktionen wie ein Gewinnspiel gehen auch einmalig.' },
  { q: 'Geht mehr als ein Logo?', a: 'Unbedingt. Gewinnspiele im Stream, Vorteile für Spieler, Auftritte bei Events, Produkte vor Ort – je mehr ihr Teil der Liga seid, desto stärker wirkt es.' },
  { q: 'Wie sehen wir, ob es sich lohnt?', a: 'Klicks auf euer Logo zählt die Website automatisch mit. Dazu kommen die Zahlen aus Instagram und dem Livestream – die teilen wir mit euch.' },
];


// --- Formular -------------------------------------------------------------------

function ApplyForm({ cfg, type, setType }: { cfg: PartnerProgramPublic; type: PartnerType | null; setType: (t: PartnerType) => void }) {
  const [f, setF] = useState({ company: '', contact: '', email: '', phone: '', website: '', message: '', hp: '' });
  const [privacy, setPrivacy] = useState(false);
  const [terms, setTerms] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState(false);
  const turnstile = useTurnstile(cfg.turnstileSiteKey || undefined);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF((x) => ({ ...x, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    if (!f.company.trim() || !f.contact.trim() || !f.email.trim()) return setErr('Bitte Unternehmen, Ansprechperson und E-Mail ausfüllen.');
    if (!type) return setErr('Bitte auswählen, welche Partnerschaft euch interessiert.');
    if (f.message.trim().length < 10) return setErr('Erzählt uns kurz, wer ihr seid und was ihr euch vorstellt.');
    if (!privacy || !terms) return setErr('Bitte beide Häkchen setzen.');
    if (!turnstile.ready) return setErr('Bitte kurz die Bot-Prüfung abwarten.');
    setBusy(true);
    try {
      await applyPartner({
        company: f.company, contact: f.contact, email: f.email, phone: f.phone, website: f.website, type, budget: '', message: f.message,
        acceptPrivacy: privacy, acceptTerms: terms, website2: f.hp, turnstileToken: turnstile.token,
      });
      setDone(true);
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : 'Senden hat nicht geklappt. Bitte noch einmal versuchen.');
      turnstile.reset();
    } finally {
      setBusy(false);
    }
  };

  const inp =
    'w-full rounded-xl bg-black/40 border border-white/12 px-4 py-3.5 text-[15px] text-white placeholder:text-white/30 focus:outline-none focus:border-[#F2C14E] focus:ring-2 focus:ring-[#F2C14E]/25 transition-colors';
  const lbl = 'block text-[11px] font-mono uppercase tracking-[.16em] text-white/50 mb-1.5';

  if (done) {
    return (
      <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.5, ease: EASE }} className="text-center py-10 sm:py-14 px-4">
        <motion.div
          initial={{ scale: 0, rotate: -30 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: 'spring', stiffness: 220, damping: 14, delay: 0.1 }}
          className="mx-auto w-20 h-20 rounded-full grid place-items-center"
          style={{ background: P.gold, boxShadow: '0 0 60px rgba(242,193,78,.45)' }}
        >
          <Check className="w-10 h-10 text-black" strokeWidth={3} />
        </motion.div>
        <h3 className="mt-7 font-display font-black uppercase text-white text-[34px] sm:text-[44px] leading-[.9]">Danke, {f.contact.split(' ')[0] || 'ihr'}!</h3>
        <p className="mt-4 text-white/70 text-[16px] leading-relaxed max-w-md mx-auto">
          Eure Anfrage ist bei uns. Wir melden uns persönlich bei euch – eine Bestätigung ist schon unterwegs an <strong className="text-white [overflow-wrap:anywhere]">{f.email}</strong>.
        </p>
      </motion.div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      <div>
        <span className={lbl}>Was interessiert euch? *</span>
        <div className="grid grid-cols-1 min-[420px]:grid-cols-2 gap-2">
          {TYPES.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setType(t.id)}
              className={`relative flex items-center gap-2 rounded-xl border px-3 py-3 text-left text-[13.5px] sm:text-[14px] font-bold cursor-pointer transition-colors min-w-0 ${
                type === t.id ? 'border-[#F2C14E] bg-[#F2C14E]/12 text-white' : 'border-white/12 bg-white/[.03] text-white/70 hover:border-white/25'
              }`}
            >
              <t.icon className="w-4 h-4 shrink-0" style={{ color: type === t.id ? P.gold : undefined }} />
              <span className="min-w-0 break-words leading-tight">{t.title}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <label className="block">
          <span className={lbl}>Unternehmen *</span>
          <input value={f.company} onChange={set('company')} className={inp} placeholder="Firma GmbH" autoComplete="organization" maxLength={120} />
        </label>
        <label className="block">
          <span className={lbl}>Ansprechperson *</span>
          <input value={f.contact} onChange={set('contact')} className={inp} placeholder="Vor- und Nachname" autoComplete="name" maxLength={120} />
        </label>
        <label className="block">
          <span className={lbl}>E-Mail *</span>
          <input value={f.email} onChange={set('email')} type="email" className={inp} placeholder="name@firma.de" autoComplete="email" maxLength={200} />
        </label>
        <label className="block">
          <span className={lbl}>Telefon</span>
          <input value={f.phone} onChange={set('phone')} type="tel" className={inp} placeholder="+49 …" autoComplete="tel" maxLength={40} />
        </label>
        <label className="block sm:col-span-2">
          <span className={lbl}>Website</span>
          <input value={f.website} onChange={set('website')} className={inp} placeholder="www.firma.de" autoComplete="url" maxLength={200} />
        </label>
      </div>
      {/* Honeypot – für Menschen unsichtbar */}
      <input value={f.hp} onChange={set('hp')} tabIndex={-1} autoComplete="off" aria-hidden className="absolute -left-[9999px] w-px h-px opacity-0" name="website2" />
      <label className="block">
        <span className={lbl}>Über euch *</span>
        <textarea
          value={f.message}
          onChange={set('message')}
          rows={5}
          maxLength={3000}
          className={`${inp} resize-y min-h-[130px]`}
          placeholder={
            type === 'other'
              ? 'Erzählt uns eure Idee – Gewinnspiel, Event, Aktion … und wer ihr seid.'
              : 'Wer seid ihr, was macht ihr – und was stellt ihr euch mit der Hero League vor?'
          }
        />
      </label>
      <div className="space-y-3">
        {[
          {
            on: privacy,
            set: setPrivacy,
            text: (
              <>
                Ich bin einverstanden, dass die Hero League meine Angaben speichert, um die Anfrage zu bearbeiten und mich zu kontaktieren. Mehr dazu in der{' '}
                <a href="/datenschutz" target="_blank" rel="noopener noreferrer" className="underline decoration-white/40 underline-offset-2 hover:text-white">
                  Datenschutzerklärung
                </a>
                . *
              </>
            ),
          },
          {
            on: terms,
            set: setTerms,
            text: <>Mir ist bewusst, dass die Anfrage unverbindlich ist. Eine Partnerschaft entsteht erst mit einer schriftlichen Vereinbarung über Leistungen, Laufzeit und Preis. *</>,
          },
        ].map((c, i) => (
          <label key={i} className="flex items-start gap-3 cursor-pointer select-none">
            <input type="checkbox" checked={c.on} onChange={(e) => c.set(e.target.checked)} className="sr-only" />
            <span
              className={`mt-0.5 shrink-0 w-5 h-5 rounded-md border grid place-items-center transition-colors ${c.on ? 'border-[#F2C14E] bg-[#F2C14E]' : 'border-white/30 bg-black/30'}`}
            >
              {c.on && <Check className="w-3.5 h-3.5 text-black" strokeWidth={3} />}
            </span>
            <span className="text-[13px] sm:text-[13.5px] text-white/65 leading-snug">{c.text}</span>
          </label>
        ))}
      </div>
      {cfg.turnstileSiteKey && <div ref={turnstile.ref} className="flex justify-center" />}
      {err && <p className="text-[14px] text-[#FF8578] font-semibold">{err}</p>}
      <button
        type="submit"
        disabled={busy}
        className="group relative w-full overflow-hidden inline-flex items-center justify-center gap-2.5 rounded-2xl px-6 py-4 font-display font-black uppercase tracking-wide text-[18px] text-black cursor-pointer disabled:opacity-60 active:scale-[.99] transition-transform"
        style={{ background: P.gold, boxShadow: '0 18px 50px -14px rgba(242,193,78,.6)' }}
      >
        <span className="pointer-events-none absolute inset-y-0 -left-1/3 w-1/3 skew-x-[-20deg] bg-white/40 opacity-0 group-hover:opacity-100 group-hover:translate-x-[420%] transition-all duration-700" />
        {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
        Anfrage senden
      </button>
      <p className="text-[12px] text-white/40 text-center">Unverbindlich · Antwort persönlich · Keine Weitergabe eurer Daten</p>
    </form>
  );
}

// --- Seite ----------------------------------------------------------------------

export default function PartnerLanding({ teams, matches, players, highlights, onNavigate }: Props) {
  const [cfg, setCfg] = useState<PartnerProgramPublic | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [type, setType] = useState<PartnerType | null>(null);
  const [scrolled, setScrolled] = useState(false);
  const [faqOpen, setFaqOpen] = useState<number | null>(0);

  useEffect(() => {
    loadPartnerProgram().then((c) => {
      setCfg(c);
      setLoaded(true);
    });
    void loadPartners().then(setPartners);
    document.title = 'Partner werden · Hero League';
    const on = () => setScrolled(window.scrollY > 24);
    on();
    window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, []);

  const heroRef = useRef<HTMLElement | null>(null);
  const { scrollYProgress } = useScroll({ target: heroRef, offset: ['start start', 'end start'] });
  const bgY = useTransform(scrollYProgress, [0, 1], ['0%', '28%']);
  const bgScale = useTransform(scrollYProgress, [0, 1], [1.06, 1.22]);
  const titleY = useTransform(scrollYProgress, [0, 1], ['0%', '35%']);
  const titleOpacity = useTransform(scrollYProgress, [0, 0.8], [1, 0]);

  // Live-Zahlen aus Season 1
  const league = useMemo(() => {
    const done = matches.filter((m) => m.status === 'beendet');
    const goals = done.reduce((a, m) => a + (m.homeScore ?? 0) + (m.awayScore ?? 0), 0);
    const squad = teams.reduce((a, t) => a + (t.spielerliste?.length ?? 0), 0);
    return [
      { label: 'Teams in Season 1', value: teams.length },
      { label: 'Spieler', value: squad || players.length },
      { label: 'Spiele gespielt', value: done.length },
      { label: 'Tore gefallen', value: goals },
    ].filter((x) => x.value > 0);
  }, [teams, matches, players]);

  const withLogo = partners.filter((p) => p.logoUrl);
  // Gemeinschaftsfoto: das erste hervorgehobene Highlight-Bild aus dem Backoffice
  // (wie früher oben auf /season2), sonst das Hallenfoto.
  const groupPhoto = useMemo(() => {
    if (!highlights) return '/assets/season2-hero.webp';
    const all = [...highlights.items, ...highlights.albums.flatMap((a) => a.items)].filter((m) => m.type === 'image' && m.url);
    return (all.find((m) => m.featured) ?? all[0])?.url || '/assets/season2-hero.webp';
  }, [highlights]);
  const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const pick = (t: PartnerType) => {
    setType(t);
    scrollTo('anfrage');
  };

  // --- Pausiert / Laden -----------------------------------------------------
  if (!loaded || !cfg || (!cfg.active && !cfg.preview)) {
    return (
      <div className="min-h-[100svh] text-white font-sans relative overflow-hidden flex flex-col" style={{ background: P.bg }}>
        <div className="absolute inset-0 opacity-25 bg-cover bg-center" style={{ backgroundImage: 'url(/assets/season2-hero.webp)' }} />
        <div className="absolute inset-0" style={{ background: `radial-gradient(70% 55% at 50% 30%, rgba(242,193,78,.22), transparent 70%), linear-gradient(180deg, rgba(5,7,6,.55), ${P.bg} 85%)` }} />
        <header className="relative px-4" style={{ paddingTop: 'calc(env(safe-area-inset-top) + .9rem)' }}>
          <div className="max-w-6xl mx-auto flex items-center justify-between">
            <button onClick={() => onNavigate('/')} className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-white/60 hover:text-white cursor-pointer">
              <ArrowLeft className="w-4 h-4" /> Zur Website
            </button>
            <img src="/assets/hero-league-logo.png" alt="Hero League" className="h-8 w-auto" />
          </div>
        </header>
        <main className="relative flex-1 grid place-items-center px-4 py-16 text-center">
          {!loaded ? (
            <div className="w-8 h-8 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8 }} className="max-w-xl">
              <Kicker center>Partnerprogramm</Kicker>
              <h1 className="mt-5 font-display font-black uppercase leading-[.85] tracking-tight text-[clamp(3.2rem,14vw,6.5rem)]">
                Partner <GoldText>werden</GoldText>
              </h1>
              <p className="mt-5 text-white/65 text-[16px] leading-relaxed">
                Das Partnerprogramm ist gerade nicht geöffnet. Ihr wollt trotzdem mit uns sprechen? Schreibt uns über Instagram oder per E-Mail – wir melden uns.
              </p>
              <button onClick={() => onNavigate('/')} className="mt-8 inline-flex items-center gap-2 rounded-2xl px-6 py-3.5 font-display font-black uppercase tracking-wide text-white border border-white/20 hover:bg-white/10 cursor-pointer">
                Zur Website
              </button>
            </motion.div>
          )}
        </main>
      </div>
    );
  }

  const [big, ...more] = cfg.stats;
  const tickerItems = [
    ...cfg.stats.map((s) => `${s.value.toLocaleString('de-DE')}${s.suffix} ${s.label}`),
    'Jeder Spieltag live im Stream',
    'Season 2: 24 Teams in zwei Ligen',
    'Jede Aktion getrackt',
  ];

  return (
    <MotionConfig reducedMotion="user">
      <div className="min-h-screen text-white font-sans overflow-x-hidden" style={{ background: P.bg }}>
        {/* Kopfzeile (fest, Safe-Area) */}
        <header
          className={`fixed inset-x-0 top-0 z-50 transition-colors duration-300 ${scrolled ? 'bg-[#050706]/80 backdrop-blur-xl border-b border-white/[.07]' : ''}`}
          style={{ paddingTop: 'env(safe-area-inset-top)' }}
        >
          {cfg.preview && (
            <div className="text-center text-[11.5px] font-bold px-4 py-1.5 text-black leading-snug" style={{ background: P.gold }}>
              <Eye className="w-3.5 h-3.5 inline -mt-0.5 mr-1" /> Admin-Vorschau – das Partnerprogramm ist im Backoffice noch ausgeschaltet
            </div>
          )}
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-3">
            <button onClick={() => onNavigate('/')} className="shrink-0 flex items-center gap-2 cursor-pointer" aria-label="Zur Website">
              <img src="/assets/hero-league-logo.png" alt="Hero League" className="h-8 sm:h-9 w-auto" />
            </button>
            <span className="hidden sm:inline text-[11px] font-mono uppercase tracking-[.22em] text-white/45">Partnerprogramm</span>
            <div className="flex-1" />
            <button onClick={() => onNavigate('/')} className="hidden md:inline-flex items-center gap-1.5 text-[13px] font-semibold text-white/60 hover:text-white cursor-pointer px-2">
              <ArrowLeft className="w-4 h-4" /> Zur Website
            </button>
            <button
              onClick={() => scrollTo('anfrage')}
              className="shrink-0 inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-[13px] font-black uppercase tracking-wide text-black cursor-pointer active:scale-95 transition-transform"
              style={{ background: P.gold }}
            >
              Partner werden <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </header>

        {/* HERO */}
        <section ref={heroRef} className="relative min-h-[100svh] flex flex-col overflow-hidden">
          <motion.div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: 'url(/assets/season2-hero.webp)', y: bgY, scale: bgScale }} />
          <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(5,7,6,.55) 0%, rgba(5,7,6,.72) 45%, #050706 96%)' }} />
          <div className="absolute inset-0" style={{ background: 'radial-gradient(60% 50% at 75% 20%, rgba(242,193,78,.28), transparent 70%)' }} />
          {/* Licht-Sweep */}
          <motion.div
            className="pointer-events-none absolute -inset-y-20 w-[40%] rotate-12"
            style={{ background: 'linear-gradient(90deg, transparent, rgba(255,231,163,.10), transparent)' }}
            initial={{ left: '-50%' }}
            animate={{ left: '130%' }}
            transition={{ duration: 3.2, delay: 0.6, repeat: Infinity, repeatDelay: 5, ease: 'easeInOut' }}
          />
          <motion.div style={{ y: titleY, opacity: titleOpacity }} className="relative flex-1 flex items-center">
            <div className="max-w-7xl w-full mx-auto px-4 sm:px-6 pt-32 pb-16 sm:pt-36">
              <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.1 }}>
                <span className="inline-flex items-center gap-2 rounded-full border border-[#F2C14E]/40 bg-[#F2C14E]/10 px-3.5 py-1.5 text-[11px] sm:text-[12px] font-mono uppercase tracking-[.2em]" style={{ color: P.goldLight }}>
                  <Handshake className="w-3.5 h-3.5" /> Partnerprogramm · Season 2
                </span>
              </motion.div>
              <h1 className="mt-6 font-display font-black uppercase tracking-tight leading-[.84] text-[clamp(3.4rem,13vw,10rem)]">
                {['Eure Marke.', 'Mitten im Spiel.'].map((line, i) => (
                  <span key={line} className="block overflow-hidden pb-[.06em]">
                    <motion.span
                      className="block"
                      initial={{ y: '105%' }}
                      animate={{ y: '0%' }}
                      transition={{ duration: 0.9, delay: 0.25 + i * 0.14, ease: [0.16, 1, 0.3, 1] }}
                    >
                      {i === 1 ? <GoldText>{line}</GoldText> : line}
                    </motion.span>
                  </span>
                ))}
              </h1>
              <motion.p
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.7, delay: 0.65, ease: EASE }}
                className="mt-7 max-w-2xl text-[17px] sm:text-[20px] leading-relaxed text-white/75"
              >
                Hero League ist Kleinfeldfußball, wie man ihn sonst nur vom Profisport kennt: jeder Spieltag live im Stream, jede Aktion getrackt, jede Woche
                Content auf Instagram. Als Partner hängt ihr nicht irgendwo am Zaun – <span className="text-white font-semibold">ihr seid dabei, wenn es passiert.</span>
              </motion.p>
              <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.8, ease: EASE }} className="mt-9 flex flex-wrap gap-3">
                <button
                  onClick={() => scrollTo('anfrage')}
                  className="inline-flex items-center gap-2 rounded-2xl px-6 sm:px-7 py-4 font-display font-black uppercase tracking-wide text-[17px] text-black cursor-pointer active:scale-[.98] transition-transform"
                  style={{ background: P.gold, boxShadow: '0 18px 50px -14px rgba(242,193,78,.65)' }}
                >
                  Partner werden <ArrowRight className="w-5 h-5" />
                </button>
                <button
                  onClick={() => scrollTo('zahlen')}
                  className="inline-flex items-center gap-2 rounded-2xl px-6 sm:px-7 py-4 font-display font-black uppercase tracking-wide text-[17px] text-white border border-white/25 hover:bg-white/10 cursor-pointer"
                >
                  Zahlen ansehen
                </button>
              </motion.div>
              {withLogo.length > 0 && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.1, duration: 0.8 }} className="mt-10 flex flex-wrap items-center gap-x-4 gap-y-2">
                  <span className="text-[11px] font-mono uppercase tracking-[.2em] text-white/45">Bereits dabei</span>
                  {withLogo.map((p) => (
                    <span key={p.id} className="inline-flex items-center gap-2 text-[14px] font-semibold text-white/80">
                      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: P.gold }} /> {p.name}
                    </span>
                  ))}
                </motion.div>
              )}
            </div>
          </motion.div>
          <button onClick={() => scrollTo('zahlen')} className="relative mx-auto mb-6 text-white/45 hover:text-white cursor-pointer" aria-label="Weiter">
            <motion.span className="block" animate={{ y: [0, 8, 0] }} transition={{ duration: 1.8, repeat: Infinity }}>
              <ChevronDown className="w-7 h-7" />
            </motion.span>
          </button>
          {/* Laufband */}
          <div className="relative border-y border-white/[.08] bg-black/40 backdrop-blur py-3.5">
            <Marquee duration={30}>
              {tickerItems.map((t) => (
                <span key={t} className="inline-flex items-center gap-3 px-6 font-display font-black uppercase text-[17px] sm:text-[20px] tracking-wide text-white/85 whitespace-nowrap">
                  <Sparkles className="w-4 h-4" style={{ color: P.gold }} /> {t}
                </span>
              ))}
            </Marquee>
          </div>
        </section>

        {/* ZAHLEN */}
        <section id="zahlen" className="relative scroll-mt-20 py-20 sm:py-28">
          <div className="max-w-7xl mx-auto px-4 sm:px-6">
            <SectionHead kicker="Reichweite" title={<>Zahlen, die <GoldText>für sich sprechen.</GoldText></>} text="Stand: die letzten 30 Tage. Website-Besuche und Klicks auf Partner-Logos zählt unsere Website selbst mit – die Instagram-Zahlen kommen direkt aus den Insights." />
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
              {big && (
                <Reveal className="md:col-span-2 lg:row-span-2">
                  <div className="relative h-full overflow-hidden rounded-[28px] border border-[#F2C14E]/30 p-6 sm:p-9 flex flex-col" style={{ background: 'linear-gradient(150deg, rgba(242,193,78,.16), rgba(255,255,255,.02) 60%)' }}>
                    <div className="absolute -top-24 -right-24 w-72 h-72 rounded-full" style={{ background: 'radial-gradient(circle, rgba(242,193,78,.35), transparent 65%)' }} />
                    <div className="relative flex items-center gap-2 text-[12px] font-mono uppercase tracking-[.18em]" style={{ color: P.goldLight }}>
                      <Instagram className="w-4 h-4" /> {big.sub}
                    </div>
                    <div className="relative mt-4 font-display font-black leading-[.85] text-[clamp(4rem,16vw,9rem)] lg:text-[clamp(5rem,9vw,9.5rem)]">
                      <GoldText>
                        <Counter value={big.value} suffix={big.suffix} />
                      </GoldText>
                    </div>
                    <div className="relative mt-2 font-display font-black uppercase text-[24px] sm:text-[32px] text-white leading-none">{big.label}</div>
                    <div className="relative mt-auto pt-8">
                      <GrowthBars />
                    </div>
                  </div>
                </Reveal>
              )}
              {more.map((s, i) => (
                <Reveal key={s.label} delay={0.08 * (i + 1)}>
                  <div className="h-full rounded-[24px] border border-white/10 bg-white/[.035] p-6 sm:p-7">
                    <div className="w-11 h-11 rounded-xl grid place-items-center border border-white/10 bg-white/[.05]" style={{ color: P.gold }}>
                      {i === 0 ? <Users className="w-5 h-5" /> : <MousePointerClick className="w-5 h-5" />}
                    </div>
                    <div className="mt-5 font-display font-black text-white text-[52px] sm:text-[60px] leading-none">
                      <Counter value={s.value} suffix={s.suffix} />
                    </div>
                    <div className="mt-2 text-[16px] font-bold text-white">{s.label}</div>
                    <div className="text-[13px] text-white/50">{s.sub}</div>
                  </div>
                </Reveal>
              ))}
              {league.length > 0 && (
                <Reveal delay={0.2} className="md:col-span-2">
                  <div className="h-full rounded-[24px] border border-white/10 bg-white/[.035] p-6 sm:p-7">
                    <div className="text-[12px] font-mono uppercase tracking-[.18em] text-white/50">Season 1 – live aus der Liga</div>
                    <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-4">
                      {league.map((l) => (
                        <div key={l.label} className="min-w-0">
                          <div className="font-display font-black text-[40px] sm:text-[46px] leading-none" style={{ color: P.teal }}>
                            <Counter value={l.value} />
                          </div>
                          <div className="mt-1 text-[13px] text-white/60 leading-tight">{l.label}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </Reveal>
              )}
            </div>
          </div>
        </section>

        {/* SICHTBARKEIT + Livestream-Vorschau */}
        <section className="relative py-20 sm:py-28 border-t border-white/[.06]">
          <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(50% 40% at 15% 30%, rgba(34,223,201,.08), transparent 70%)' }} />
          <div className="relative max-w-7xl mx-auto px-4 sm:px-6">
            <SectionHead kicker="Sichtbarkeit" title={<>Hier <GoldText>sieht man euch.</GoldText></>} text="Kein Logo, das irgendwo untergeht: Ihr seid an den Stellen, an denen die Liga passiert – live, online und vor Ort." />
            <Reveal>
              <div className="rounded-[28px] overflow-hidden border border-white/10 shadow-[0_40px_120px_-30px_rgba(0,0,0,.9)]">
                <div className="flex items-center gap-2 px-4 py-2.5 bg-white/[.04] border-b border-white/10">
                  <span className="inline-flex items-center gap-1.5 rounded-md bg-[#FF2D3D] px-2 py-0.5 text-[10.5px] font-black tracking-wider">
                    <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" /> LIVE
                  </span>
                  <span className="text-[12.5px] text-white/60 font-semibold truncate">So steht euer Logo im Livestream – dauerhaft im Bild</span>
                </div>
                <ScaledStage>
                  <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: 'url(/assets/season2-hero.webp)' }} />
                  <div className="absolute inset-0 bg-black/15" />
                  <div className="absolute top-10 right-10">
                    <BrandCorner instagram="" />
                  </div>
                  <div className="absolute bottom-10 right-10">
                    <PartnerBar />
                  </div>
                </ScaledStage>
              </div>
            </Reveal>
            <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
              {TOUCHPOINTS.map((t, i) => (
                <Reveal key={t.title} delay={0.06 * i}>
                  <div className="group h-full rounded-[24px] border border-white/10 bg-white/[.03] p-6 sm:p-7 transition-colors hover:border-[#F2C14E]/40 hover:bg-[#F2C14E]/[.05]">
                    <div className="w-12 h-12 rounded-2xl grid place-items-center transition-transform group-hover:scale-110 group-hover:-rotate-6" style={{ background: 'rgba(242,193,78,.12)', color: P.gold }}>
                      <t.icon className="w-6 h-6" />
                    </div>
                    <h3 className="mt-5 font-display font-black uppercase text-[26px] text-white leading-none">{t.title}</h3>
                    <p className="mt-3 text-[15px] text-white/65 leading-relaxed">{t.text}</p>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* ERLEBNIS */}
        <section className="relative py-20 sm:py-28 border-t border-white/[.06]">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-center">
            <Reveal>
              <div className="relative rounded-[28px] overflow-hidden aspect-[4/3] border border-white/10">
                <motion.img
                  src={groupPhoto}
                  alt="Hero League – Teams und Partner"
                  className="absolute inset-0 w-full h-full object-cover"
                  initial={{ scale: 1.15 }}
                  whileInView={{ scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ duration: 1.6, ease: EASE }}
                />
                <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, transparent 50%, rgba(5,7,6,.85))' }} />
                <div className="absolute left-5 bottom-5 right-5 flex items-end justify-between gap-3">
                  <span className="font-display font-black uppercase text-[24px] sm:text-[30px] leading-none">Die Liga lebt.</span>
                  <span className="shrink-0 rounded-full px-3 py-1 text-[11px] font-black uppercase tracking-wider text-black" style={{ background: P.gold }}>Season 1</span>
                </div>
              </div>
            </Reveal>
            <div>
              <SectionHead
                kicker="Erlebnis statt Banner"
                title={<>Wir bringen euch <GoldText>an den Tisch.</GoldText></>}
                text="Partnerschaft heißt bei uns: echte Begegnungen. Beim Grillabend mit unserem Hauptpartner Florian Hinterheller (DVAG) saßen Teams, Spieler und Partner zusammen – genau solche Momente machen aus einem Logo eine Marke, an die man sich erinnert."
              />
              <Reveal>
                <ul className="space-y-3">
                  {['Events mit Teams und Community', 'Gewinnspiele live im Stream – wie die PS5-Verlosung', 'Siegerehrungen und Awards mit eurem Namen'].map((x) => (
                    <li key={x} className="flex items-start gap-3 text-[16px] text-white/80">
                      <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" style={{ color: P.gold }} /> {x}
                    </li>
                  ))}
                </ul>
              </Reveal>
            </div>
          </div>
        </section>

        {/* PAKETE */}
        <section id="pakete" className="relative py-20 sm:py-28 border-t border-white/[.06] scroll-mt-20">
          <div className="max-w-7xl mx-auto px-4 sm:px-6">
            <SectionHead center kicker="Partnerschaften" title={<>Findet euren <GoldText>Platz.</GoldText></>} text="Jedes Paket stellen wir mit euch zusammen – die Punkte unten sind der Rahmen, nicht die Grenze." />
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 sm:gap-5">
              {TYPES.map((t, i) => (
                <Reveal key={t.id} delay={0.07 * i}>
                  <div
                    className={`relative h-full flex flex-col rounded-[28px] p-6 sm:p-7 border ${t.featured ? 'border-[#F2C14E]/60' : 'border-white/10'}`}
                    style={{ background: t.featured ? 'linear-gradient(165deg, rgba(242,193,78,.2), rgba(255,255,255,.02) 55%)' : 'rgba(255,255,255,.03)', boxShadow: t.featured ? '0 30px 90px -30px rgba(242,193,78,.45)' : undefined }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="w-12 h-12 rounded-2xl grid place-items-center" style={{ background: t.featured ? P.gold : 'rgba(242,193,78,.12)', color: t.featured ? '#000' : P.gold }}>
                        <t.icon className="w-6 h-6" />
                      </div>
                      <span className={`rounded-full px-3 py-1 text-[10.5px] font-black uppercase tracking-wider whitespace-nowrap ${t.featured ? 'text-black' : 'text-white/75 border border-white/15'}`} style={t.featured ? { background: P.gold } : undefined}>
                        {t.tag}
                      </span>
                    </div>
                    <h3 lang="de" className="mt-6 font-display font-black uppercase text-[30px] sm:text-[32px] xl:text-[clamp(22px,1.7vw,32px)] text-white leading-[.92] hyphens-auto [overflow-wrap:anywhere]">{t.title}</h3>
                    <p className="mt-3 text-[15px] text-white/65 leading-relaxed">{t.text}</p>
                    <ul className="mt-6 space-y-2.5 flex-1">
                      {t.points.map((pt) => (
                        <li key={pt} className="flex items-start gap-2.5 text-[14.5px] text-white/80 leading-snug">
                          <Check className="w-4 h-4 shrink-0 mt-0.5" style={{ color: P.gold }} strokeWidth={3} /> {pt}
                        </li>
                      ))}
                    </ul>
                    <button
                      onClick={() => pick(t.id)}
                      className={`mt-7 w-full inline-flex items-center justify-center gap-2 rounded-2xl px-5 py-3.5 font-display font-black uppercase tracking-wide text-[16px] cursor-pointer active:scale-[.98] transition-transform ${
                        t.featured ? 'text-black' : 'text-white border border-white/20 hover:bg-white/10'
                      }`}
                      style={t.featured ? { background: P.gold } : undefined}
                    >
                      Anfragen <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* AKTUELLE PARTNER */}
        {withLogo.length > 0 && (
          <section className="relative py-20 sm:py-24 border-t border-white/[.06]">
            <div className="max-w-7xl mx-auto px-4 sm:px-6">
              <SectionHead center kicker="Wer schon dabei ist" title={<>In guter <GoldText>Gesellschaft.</GoldText></>} />
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
                {withLogo.map((p, i) => {
                  // Hauptpartner (oft weißes Logo) auf dunkler Gold-Karte, die übrigen auf Weiß.
                  const dark = p.tier === 'main' || /white|weiss|weiß/i.test(p.logoUrl);
                  return (
                    <Reveal key={p.id} delay={0.07 * i}>
                      <a
                        href={p.linkUrl || undefined}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => trackSponsorClick(p.id, p.name, 'partner-page')}
                        className={`group flex flex-col h-full rounded-[24px] p-6 sm:p-7 text-center transition-transform hover:-translate-y-1 overflow-hidden ${dark ? 'border border-[#F2C14E]/50' : 'bg-white'}`}
                        style={dark ? { background: 'linear-gradient(150deg,#2a2412,#0d0f0a 75%)' } : undefined}
                      >
                        <div className={`text-[11px] font-mono uppercase tracking-[.18em] ${dark ? 'text-[#F2C14E]' : 'text-black/50'}`}>{p.label || 'Partner'}</div>
                        <div className="mt-5 flex-1 flex items-center justify-center min-h-[110px] transition-transform group-hover:scale-105">
                          <TrimmedLogo url={p.logoUrl} alt={p.name} maxH={p.tier === 'main' ? 104 : 72} maxW={260} />
                        </div>
                        <div className={`mt-5 text-[14px] font-bold ${dark ? 'text-white' : 'text-black/80'}`}>{p.name}</div>
                      </a>
                    </Reveal>
                  );
                })}
              </div>
            </div>
          </section>
        )}

        {/* ABLAUF */}
        <section className="relative py-20 sm:py-28 border-t border-white/[.06]">
          <div className="max-w-7xl mx-auto px-4 sm:px-6">
            <SectionHead kicker="So läuft's" title={<>In vier Schritten <GoldText>dabei.</GoldText></>} />
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
              {STEPS.map((s, i) => (
                <Reveal key={s.title} delay={0.08 * i}>
                  <div className="relative h-full rounded-[24px] border border-white/10 bg-white/[.03] p-6 sm:p-7 overflow-hidden">
                    <span className="absolute -right-2 -top-6 font-display font-black text-[120px] leading-none text-white/[.05] select-none">{i + 1}</span>
                    <div className="relative w-12 h-12 rounded-2xl grid place-items-center" style={{ background: 'rgba(242,193,78,.12)', color: P.gold }}>
                      <s.icon className="w-6 h-6" />
                    </div>
                    <h3 className="relative mt-5 font-display font-black uppercase text-[24px] text-white leading-none">{s.title}</h3>
                    <p className="relative mt-3 text-[15px] text-white/65 leading-relaxed">{s.text}</p>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* ANFRAGE */}
        <section id="anfrage" className="relative py-20 sm:py-28 border-t border-white/[.06] scroll-mt-16 overflow-hidden">
          <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(55% 45% at 80% 30%, rgba(242,193,78,.14), transparent 70%)' }} />
          <div className="relative max-w-7xl mx-auto px-4 sm:px-6 grid grid-cols-1 lg:grid-cols-[1fr_1.15fr] gap-10 lg:gap-16 items-start">
            <div className="lg:sticky lg:top-28">
              <SectionHead kicker="Partner werden" title={<>Lasst uns <GoldText>reden.</GoldText></>} text="Erzählt uns kurz, wer ihr seid. Wir melden uns persönlich und schauen gemeinsam, welche Partnerschaft zu euch passt." />
              <Reveal>
                <ul className="space-y-4">
                  {[
                    ['Unverbindlich', 'Eine Anfrage verpflichtet zu nichts.'],
                    ['Persönlich', 'Kein Bot, keine Warteschleife – ihr sprecht direkt mit uns.'],
                    ['Konkret', 'Ihr bekommt ein klares Angebot mit allen Leistungen.'],
                  ].map(([a, b]) => (
                    <li key={a} className="flex items-start gap-3.5">
                      <span className="shrink-0 w-9 h-9 rounded-xl grid place-items-center" style={{ background: 'rgba(242,193,78,.14)', color: P.gold }}>
                        <Check className="w-5 h-5" strokeWidth={3} />
                      </span>
                      <span>
                        <span className="block font-bold text-white text-[16px]">{a}</span>
                        <span className="block text-white/60 text-[14.5px]">{b}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </Reveal>
            </div>
            <Reveal>
              <div className="rounded-[28px] border border-white/12 bg-[#0b0e0c]/90 backdrop-blur p-5 sm:p-8 shadow-[0_40px_120px_-30px_rgba(0,0,0,.9)]">
                <AnimatePresence mode="wait">
                  <ApplyForm cfg={cfg} type={type} setType={setType} />
                </AnimatePresence>
              </div>
            </Reveal>
          </div>
        </section>

        {/* FAQ */}
        <section className="relative py-20 sm:py-24 border-t border-white/[.06]">
          <div className="max-w-3xl mx-auto px-4 sm:px-6">
            <SectionHead center kicker="Fragen" title={<>Kurz <GoldText>erklärt.</GoldText></>} />
            <div className="space-y-3">
              {FAQ.map((f, i) => (
                <div key={f.q} className="rounded-2xl border border-white/10 bg-white/[.03] overflow-hidden">
                  <button
                    onClick={() => setFaqOpen(faqOpen === i ? null : i)}
                    className="w-full flex items-center justify-between gap-4 px-5 py-4 text-left cursor-pointer"
                    aria-expanded={faqOpen === i}
                  >
                    <span className="font-bold text-white text-[16px]">{f.q}</span>
                    <ChevronDown className={`w-5 h-5 shrink-0 text-white/50 transition-transform ${faqOpen === i ? 'rotate-180' : ''}`} />
                  </button>
                  <AnimatePresence initial={false}>
                    {faqOpen === i && (
                      <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.3, ease: EASE }}>
                        <p className="px-5 pb-5 text-[15px] text-white/65 leading-relaxed">{f.a}</p>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              ))}
            </div>
            <Reveal className="mt-14 text-center">
              <button
                onClick={() => scrollTo('anfrage')}
                className="inline-flex items-center gap-2 rounded-2xl px-7 py-4 font-display font-black uppercase tracking-wide text-[17px] text-black cursor-pointer active:scale-[.98] transition-transform"
                style={{ background: P.gold, boxShadow: '0 18px 50px -14px rgba(242,193,78,.6)' }}
              >
                Jetzt Partner werden <ArrowRight className="w-5 h-5" />
              </button>
            </Reveal>
          </div>
        </section>
      </div>
    </MotionConfig>
  );
}
