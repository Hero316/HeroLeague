import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { fetchSignupConfig } from '../lib/register';
import { fetchBookingConfig } from '../lib/booking';

// ===========================================================================
// Startbild der Startseite: „DEINE KLEINFELD-LIGA" – damit jeder, der neu auf
// die Seite kommt, sofort versteht, worum es geht und dass er mitmachen kann.
// Der Titel passt sich der Bildschirmbreite an (PC: eine Reihe, Handy: zwei
// Zeilen). Das Foto blendet per Verlauf in den Countdown über (children).
// Beim ersten Runterscrollen zoomt das Bild leicht und der Titel gleitet weg.
// ===========================================================================

interface Props {
  image?: string; // Hintergrundbild (später ggf. Video)
  onNavigate: (path: string) => void;
  onOpenSchedule: () => void;
  children?: React.ReactNode; // z. B. der Countdown – sitzt im Verlauf unten
}

export default function HomeIntro({ image, onNavigate, onOpenSchedule, children }: Props) {
  const heroRef = useRef<HTMLElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const longRef = useRef<HTMLSpanElement>(null);
  const [joinPath, setJoinPath] = useState<string | null>('/anmeldung');

  // Ziel von „Jetzt dabei sein": veröffentlichte Season-Landingpage, sonst die
  // Vorregistrierung. Ist beides zu, verschwindet die Taste.
  useEffect(() => {
    let landing = false;
    let signup = true;
    Promise.allSettled([
      fetchBookingConfig().then((b) => (landing = Boolean(b.published))),
      fetchSignupConfig().then((c) => (signup = c.open)),
    ]).then(() => setJoinPath(landing ? '/season2' : signup ? '/anmeldung' : null));
  }, []);

  // Titel genau auf die verfügbare Breite setzen. Gemessen wird bei 100px
  // Schriftgröße, dann linear skaliert – passt bei jeder Bildschirmgröße.
  useLayoutEffect(() => {
    const box = boxRef.current;
    const title = titleRef.current;
    const long = longRef.current;
    if (!box || !title || !long) return;
    const fit = () => {
      const wide = window.innerWidth >= 760;
      title.style.fontSize = '100px';
      const measure = wide ? title.getBoundingClientRect().width : long.getBoundingClientRect().width;
      const avail = box.clientWidth;
      if (measure > 0 && avail > 0) title.style.fontSize = `${Math.min(wide ? 210 : 150, Math.floor((100 * avail) / measure) - 1)}px`;
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(box);
    document.fonts?.ready.then(fit).catch(() => {});
    return () => ro.disconnect();
  }, []);

  // Scroll-Effekt NUR am Computer (Maus/Trackpad): Bild zoomt leicht, ein
  // dunkler Schleier blendet ein, der Titel gleitet weg. Am Handy bewusst AUS –
  // dort ruckelt ein an das Scrollen gekoppelter Effekt und bringt die
  // weichgezeichnete Kopfleiste (iOS) zum Flackern. Nur transform/opacity,
  // direkt an den drei Elementen gesetzt (keine CSS-Variable am ganzen Block).
  const mediaRef = useRef<HTMLDivElement>(null);
  const dimRef = useRef<HTMLDivElement>(null);
  const topRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const hero = heroRef.current;
    if (!hero) return;
    const desktop = window.matchMedia?.('(hover: hover) and (pointer: fine)').matches;
    if (!desktop || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    let raf = 0;
    let last = -1;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const p = Math.min(1, Math.max(0, window.scrollY / Math.max(1, hero.offsetHeight * 0.8)));
        if (Math.abs(p - last) < 0.002) return;
        last = p;
        if (mediaRef.current) mediaRef.current.style.transform = `scale(${(1.04 + p * 0.12).toFixed(4)})`;
        if (dimRef.current) dimRef.current.style.opacity = (p * 0.55).toFixed(3);
        if (topRef.current) {
          topRef.current.style.transform = `translate3d(0, ${(-p * 48).toFixed(1)}px, 0)`;
          topRef.current.style.opacity = Math.max(0, 1 - p * 1.35).toFixed(3);
        }
      });
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <header ref={heroRef} className="hl-intro relative overflow-hidden">
      {/* Bild (leichter Kameraschwenk + Zoom beim Scrollen) */}
      <div className="absolute inset-0 overflow-hidden" aria-hidden="true">
        <div ref={mediaRef} className="hl-intro-media absolute -inset-[4%]">
          <img
            src={image || '/assets/season2-hero.webp'}
            alt=""
            fetchPriority="high"
            className="w-full h-full object-cover"
            style={{ objectPosition: '50% 38%' }}
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).src = '/assets/hero-stadium.png';
            }}
          />
        </div>
      </div>
      {/* Dunkler Schleier beim Scrollen (nur Computer, per opacity) */}
      <div ref={dimRef} className="absolute inset-0 bg-[#0A1415] pointer-events-none" style={{ opacity: 0 }} aria-hidden="true" />
      {/* Verlauf: oben leicht dunkel, unten weich in den Seitenhintergrund (Countdown) */}
      <div
        className="absolute inset-0 pointer-events-none"
        aria-hidden="true"
        style={{
          background:
            'radial-gradient(55% 32% at 50% 62%, rgba(34,223,201,.12), transparent 70%), linear-gradient(180deg, rgba(7,10,8,.55) 0%, rgba(7,10,8,.12) 26%, rgba(10,20,21,.5) 48%, rgba(10,20,21,.93) 68%, #0A1415 82%, #0A1415 100%)',
        }}
      />

      <div ref={topRef} className="hl-intro-top relative z-[2] max-w-[1320px] xl:max-w-[1600px] 2xl:max-w-[1780px] mx-auto px-4 sm:px-10 pt-[clamp(72px,12vw,168px)] pb-[clamp(14px,2.6vw,32px)]">
        <div ref={boxRef} className="w-full">
          <h1
            ref={titleRef}
            className="inline-block font-display font-black uppercase leading-[.86] tracking-[-.012em] text-white [text-shadow:0_10px_40px_rgba(0,0,0,.45)] text-[15vw] min-[760px]:whitespace-nowrap"
          >
            <span className="block min-[760px]:inline overflow-hidden pb-[.03em]">
              <span className="hl-intro-word inline-block">Deine</span>
            </span>
            <span className="hidden min-[760px]:inline"> </span>
            <span className="block min-[760px]:inline overflow-hidden pb-[.03em]">
              <span
                ref={longRef}
                className="hl-intro-word hl-intro-word-2 inline-block whitespace-nowrap bg-clip-text text-transparent pr-[.05em]"
                style={{ backgroundImage: 'linear-gradient(100deg, #22DFC9 0%, #8FFFF0 60%, #E9C46A 115%)' }}
              >
                Kleinfeld{'‑'}Liga
              </span>
            </span>
          </h1>
        </div>
        <div className="hl-intro-actions mt-5 sm:mt-7 flex flex-wrap gap-2.5 sm:gap-3">
          {joinPath && (
            <button
              type="button"
              onClick={() => onNavigate(joinPath)}
              className="inline-flex items-center gap-2 px-5 py-3 sm:px-6 sm:py-[15px] rounded-[11px] sm:rounded-[13px] bg-brand-accent-light text-[#062018] font-sans font-extrabold text-xs sm:text-sm tracking-wider uppercase shadow-[0_10px_30px_rgba(34,223,201,.32)] transition-[transform,box-shadow] duration-150 hover:-translate-y-0.5 hover:shadow-[0_16px_42px_rgba(34,223,201,.45)] active:scale-[.97] cursor-pointer"
            >
              Jetzt dabei sein <span aria-hidden="true">→</span>
            </button>
          )}
          <button
            type="button"
            onClick={onOpenSchedule}
            className="inline-flex items-center gap-2 px-5 py-3 sm:px-6 sm:py-[15px] rounded-[11px] sm:rounded-[13px] bg-[rgba(11,17,17,.5)] backdrop-blur-md border border-white/[.16] text-hl-text font-sans font-bold text-xs sm:text-sm tracking-wider uppercase transition-[border-color,background-color,transform] duration-150 hover:border-brand-accent-light hover:bg-[rgba(34,223,201,.08)] active:scale-[.97] cursor-pointer"
          >
            ▸ Spielplan
          </button>
        </div>
      </div>

      {children && <div className="relative z-[2]">{children}</div>}
    </header>
  );
}
