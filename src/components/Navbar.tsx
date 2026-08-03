import React, { useEffect, useState } from 'react';
import { Menu, X, LogOut, LayoutDashboard, Instagram, Youtube, Zap, Smartphone, Shield } from 'lucide-react';
import { ActiveTab, SocialLinks } from '../types';
import { numberWord } from '../lib/heroAward';
import { apiFetch } from '../lib/api';

// TikTok-Symbol – lucide hat kein Marken-Icon, daher als schlankes Inline-SVG.
function TikTokIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M16.5 3c.29 2.06 1.45 3.6 3.5 3.86v2.94c-1.36.1-2.55-.29-3.66-1.02v5.68c0 3.4-2.62 5.54-5.34 5.54A5.34 5.34 0 0 1 5.66 14.7c0-3.02 2.5-5.06 5.4-4.62v3.02c-.41-.13-.85-.19-1.28-.11-.95.16-1.66.99-1.6 1.96a1.8 1.8 0 0 0 3.6-.02V3h2.72z" />
    </svg>
  );
}

interface NavbarProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  isAdmin: boolean;
  onLogout: () => void;
  onOpenLogin: () => void;
  onOpenBackoffice: () => void;
  onOpenReferee?: () => void; // Admin: direkt in den Schiedsrichtermodus wechseln
  seasonLabel?: string;
  seasonNumber?: number; // für den HERO-Award-Titel (HERO ONE/TWO …)
  hasLiveMatch?: boolean;
  eventActive?: boolean; // Sonder-Event sichtbar? -> farbiger Menüpunkt
  eventTitle?: string;
  onOpenEvent?: () => void;
  hasHighlights?: boolean; // Highlights vorhanden (oder Admin) -> Menüpunkt zeigen
  mobileMode?: boolean; // Handy-Modus (Bottom-Dock) aktiv?
  onToggleMobileMode?: () => void;
}

export default function Navbar({
  activeTab,
  setActiveTab,
  isAdmin,
  onLogout,
  onOpenBackoffice,
  onOpenReferee,
  seasonLabel,
  seasonNumber,
  hasLiveMatch,
  eventActive,
  eventTitle,
  onOpenEvent,
  hasHighlights,
  mobileMode,
  onToggleMobileMode,
}: NavbarProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [social, setSocial] = useState<SocialLinks>({ instagram: '', tiktok: '', youtube: '' });

  useEffect(() => {
    apiFetch<SocialLinks>('/api/twitch?resource=social')
      .then((data) => setSocial({ instagram: data.instagram || '', tiktok: data.tiktok || '', youtube: data.youtube || '' }))
      .catch(() => {
        /* noch nicht konfiguriert – keine Symbole */
      });
  }, []);

  // Nur gepflegte Kanäle bekommen ein anklickbares Symbol.
  const socialItems = [
    { key: 'instagram', url: social.instagram, label: 'Instagram', Icon: Instagram },
    { key: 'tiktok', url: social.tiktok, label: 'TikTok', Icon: TikTokIcon },
    { key: 'youtube', url: social.youtube, label: 'YouTube', Icon: Youtube },
  ].filter((s) => s.url);

  const socialLinks = (
    <div className="flex items-center gap-0.5 sm:gap-1">
      {socialItems.map(({ key, url, label, Icon }) => (
        <a
          key={key}
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={label}
          title={label}
          className="p-1.5 sm:p-2 rounded-lg text-hl-soft hover:text-white hover:bg-white/5 transition-colors"
        >
          <Icon className="w-5 h-5" />
        </a>
      ))}
    </div>
  );

  const navItems: { label: string; value: ActiveTab }[] = [
    { label: 'HOME', value: 'home' },
    { label: 'SPIELPLAN', value: 'spielplan' },
    { label: 'TABELLE', value: 'tabelle' },
    { label: 'HERO ONE', value: 'heroone' },
    { label: 'STATISTIKEN', value: 'statistiken' },
    ...(hasHighlights ? [{ label: 'HIGHLIGHTS', value: 'highlights' as ActiveTab }] : []),
  ];

  // HERO-Award: „HERO" kräftig, Zahlwort golden leuchtend – hebt sich bewusst
  // von den übrigen Tabs ab (höchste Auszeichnung der Liga).
  const heroWord = numberWord(seasonNumber ?? 1);
  const heroLabel = (compact = false) => (
    <span className={`inline-flex items-baseline gap-1 font-display ${compact ? 'text-[15px]' : 'text-[15px]'}`}>
      <span className="font-black tracking-wide text-white">HERO</span>
      <span className="font-black tracking-wide hl-gold-text">{heroWord}</span>
    </span>
  );

  // Saison-Pille: zeigt den Saison-Namen (z. B. „SEASON ONE").
  const seasonShort = seasonLabel || '';

  return (
    <div className="sticky top-0 z-50 bg-[rgba(7,10,8,.72)] backdrop-blur-xl border-b border-white/[.07] pt-[env(safe-area-inset-top)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]">
      <div className="max-w-[1320px] mx-auto px-4 sm:px-10 h-[68px] sm:h-[76px] flex items-center gap-5 lg:gap-9">
        {/* Logo + Claim */}
        <button
          onClick={() => setActiveTab('home')}
          className="flex items-center gap-3 sm:gap-4 cursor-pointer shrink-0"
          aria-label="Zur Startseite"
        >
          <img src="/assets/hero-league-logo.png" alt="Hero League" className="h-8 sm:h-10 w-auto block" />
          <div className="hidden sm:block w-px h-7 bg-white/[.13]" />
          <div className="hidden sm:block font-sans font-semibold text-[9px] tracking-[2.6px] text-[#5b6560] leading-normal max-w-[92px] text-left">
            THE ULTIMATE FOOTBALL ARENA
          </div>
        </button>

        {/* Desktop-Navigation */}
        <nav className="hidden lg:flex gap-8 ml-3.5">
          {navItems.map((item) => {
            const isHero = item.value === 'heroone';
            return (
              <button
                key={item.value}
                onClick={() => setActiveTab(item.value)}
                className={`relative py-1.5 transition-colors cursor-pointer ${
                  isHero
                    ? ''
                    : `font-sans text-[13px] tracking-[1.5px] ${
                        activeTab === item.value ? 'font-bold text-white' : 'font-semibold text-hl-dim hover:text-hl-text'
                      }`
                }`}
              >
                {isHero ? heroLabel() : item.label}
                {activeTab === item.value && (
                  <span
                    className={`absolute left-0 right-0 -bottom-[7px] h-0.5 rounded-sm ${
                      isHero
                        ? 'bg-hl-gold shadow-[0_0_8px_rgba(233,196,106,.7)]'
                        : 'bg-brand-accent-light shadow-[0_0_8px_rgba(34,223,201,.6)]'
                    }`}
                  />
                )}
              </button>
            );
          })}
          {eventActive && onOpenEvent && (
            <button
              onClick={onOpenEvent}
              className="relative py-1.5 inline-flex items-center gap-1.5 font-sans font-bold text-[13px] tracking-[1.5px] text-[#ff7ac4] hover:text-white transition-colors cursor-pointer"
              title={eventTitle}
            >
              <Zap className="w-3.5 h-3.5" fill="currentColor" />
              {(eventTitle || 'Testspiel').toUpperCase()}
              <span className="absolute -top-1 -right-2 w-1.5 h-1.5 rounded-full bg-[#E6238E] hl-pulse" />
            </button>
          )}
        </nav>

        {/* Rechts: LIVE-Pille, Saison, Admin */}
        <div className="ml-auto flex items-center gap-2 sm:gap-3">
          {hasLiveMatch && (
            <div className="flex items-center gap-2 px-3.5 py-2 rounded-full bg-[rgba(255,84,66,.12)] border border-[rgba(255,84,66,.3)]">
              <span className="w-2 h-2 rounded-full bg-hl-red hl-pulse" />
              <span className="font-sans font-extrabold text-xs tracking-[1.5px] text-hl-red-soft">LIVE</span>
            </div>
          )}
          {seasonShort && (
            <div className="hidden sm:block px-[15px] py-[9px] rounded-full border border-white/[.12] font-sans font-bold text-xs tracking-wider text-hl-soft">
              {seasonShort}
            </div>
          )}
          {isAdmin && (
            <button
              onClick={onOpenBackoffice}
              className="hidden lg:flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-[rgba(34,223,201,.1)] border border-[rgba(34,223,201,.3)] text-brand-accent-light font-sans font-bold text-[11px] tracking-wider uppercase hover:bg-[rgba(34,223,201,.2)] transition-colors cursor-pointer"
              title="Backoffice öffnen"
            >
              <LayoutDashboard className="w-3.5 h-3.5" />
              Backoffice
            </button>
          )}
          {isAdmin && onOpenReferee && (
            <button
              onClick={onOpenReferee}
              className="hidden lg:flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-white/[.06] border border-white/15 text-white font-sans font-bold text-[11px] tracking-wider uppercase hover:bg-white/[.12] transition-colors cursor-pointer"
              title="Schiedsrichtermodus öffnen"
            >
              <Shield className="w-3.5 h-3.5 text-brand-accent-light" />
              Schiri
            </button>
          )}
          {isAdmin && (
            <button
              onClick={onLogout}
              className="hidden lg:flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-[rgba(255,84,66,.1)] border border-[rgba(255,84,66,.25)] text-hl-red-soft font-sans font-bold text-[11px] tracking-wider uppercase hover:bg-[rgba(255,84,66,.2)] transition-colors cursor-pointer"
              title="Admin abmelden"
            >
              <LogOut className="w-3.5 h-3.5" />
              Logout
            </button>
          )}

          {/* Social-Media-Symbole (Instagram / TikTok / YouTube) – Handy & PC */}
          {socialItems.length > 0 && socialLinks}

          {/* Mobile-Menü-Button */}
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="lg:hidden text-hl-soft hover:text-white p-2 rounded-lg cursor-pointer"
            aria-label="Menü öffnen"
          >
            {isOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </div>

      {/* Mobile-Menü */}
      {isOpen && (
        <div className="lg:hidden border-t border-white/[.07] bg-[#080c0a] px-4 py-3 space-y-1">
          {eventActive && onOpenEvent && (
            <button
              onClick={() => {
                onOpenEvent();
                setIsOpen(false);
              }}
              className="block w-full text-left px-4 py-3 rounded-xl mb-1 bg-[linear-gradient(100deg,rgba(230,35,142,.22),rgba(233,196,106,.12))] border border-[rgba(230,35,142,.5)] cursor-pointer"
            >
              <span className="flex items-center gap-2 font-sans font-black text-sm tracking-[1px] uppercase text-white">
                <Zap className="w-4 h-4 text-[#ff7ac4]" fill="currentColor" />
                {eventTitle || 'Testspiel'}
                <span className="ml-auto w-2 h-2 rounded-full bg-[#E6238E] hl-pulse" />
              </span>
            </button>
          )}
          {navItems.map((item) => {
            const isHero = item.value === 'heroone';
            return (
              <button
                key={item.value}
                onClick={() => {
                  setActiveTab(item.value);
                  setIsOpen(false);
                }}
                className={`block w-full text-left px-4 py-2.5 rounded-xl transition-colors cursor-pointer ${
                  isHero
                    ? activeTab === item.value
                      ? 'bg-[rgba(233,196,106,.12)] border border-[rgba(233,196,106,.35)]'
                      : 'hover:bg-white/5'
                    : `font-sans text-sm tracking-[1.5px] ${
                        activeTab === item.value
                          ? 'bg-[rgba(34,223,201,.12)] text-brand-accent-light font-bold border border-[rgba(34,223,201,.3)]'
                          : 'text-hl-mute hover:bg-white/5 hover:text-white font-semibold'
                      }`
                }`}
              >
                {isHero ? heroLabel(true) : item.label}
              </button>
            );
          })}

          {/* Handy-Modus: Bottom-Dock zur Daumen-Steuerung an/aus (für jeden) */}
          {onToggleMobileMode && (
            <button
              onClick={onToggleMobileMode}
              className={`w-full flex items-center gap-2.5 mt-2 px-4 py-3 rounded-xl border transition-colors cursor-pointer ${
                mobileMode
                  ? 'bg-[rgba(34,223,201,.12)] border-[rgba(34,223,201,.3)] text-brand-accent-light'
                  : 'bg-white/[.03] border-white/10 text-hl-mute hover:text-white'
              }`}
            >
              <Smartphone className="w-4 h-4 shrink-0" />
              <span className="font-sans font-bold text-sm tracking-[.5px] text-left">Handy-Modus</span>
              {/* Schalter-Optik */}
              <span
                className={`ml-auto relative w-10 h-[22px] rounded-full transition-colors ${
                  mobileMode ? 'bg-brand-accent-light' : 'bg-white/15'
                }`}
              >
                <span
                  className={`absolute top-[3px] w-4 h-4 rounded-full bg-white shadow transition-all ${
                    mobileMode ? 'left-[21px]' : 'left-[3px]'
                  }`}
                />
              </span>
            </button>
          )}

          {isAdmin && (
            <button
              onClick={() => {
                onOpenBackoffice();
                setIsOpen(false);
              }}
              className="w-full flex items-center justify-center gap-1.5 mt-2 bg-[rgba(34,223,201,.12)] border border-[rgba(34,223,201,.3)] text-brand-accent-light py-2.5 rounded-xl text-sm font-bold transition-colors cursor-pointer"
            >
              <LayoutDashboard className="w-4 h-4" />
              Backoffice öffnen
            </button>
          )}
          {isAdmin && onOpenReferee && (
            <button
              onClick={() => {
                onOpenReferee();
                setIsOpen(false);
              }}
              className="w-full flex items-center justify-center gap-1.5 mt-2 bg-white/[.06] border border-white/15 text-white py-2.5 rounded-xl text-sm font-bold transition-colors cursor-pointer hover:bg-white/[.1]"
            >
              <Shield className="w-4 h-4 text-brand-accent-light" />
              Schiedsrichtermodus
            </button>
          )}
          {isAdmin && (
            <button
              onClick={() => {
                onLogout();
                setIsOpen(false);
              }}
              className="w-full flex items-center justify-center gap-1.5 mt-2 bg-[rgba(255,84,66,.12)] border border-[rgba(255,84,66,.3)] text-hl-red-soft py-2.5 rounded-xl text-sm font-bold transition-colors cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
              Abmelden (Logout)
            </button>
          )}
        </div>
      )}
    </div>
  );
}
