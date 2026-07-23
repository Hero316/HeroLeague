import React, { useState } from 'react';
import { Menu, X, LogOut, LayoutDashboard } from 'lucide-react';
import { ActiveTab } from '../types';
import { numberWord } from '../lib/heroAward';

interface NavbarProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  isAdmin: boolean;
  onLogout: () => void;
  onOpenLogin: () => void;
  onOpenBackoffice: () => void;
  seasonLabel?: string;
  seasonNumber?: number; // für den HERO-Award-Titel (HERO ONE/TWO …)
  hasLiveMatch?: boolean;
}

export default function Navbar({
  activeTab,
  setActiveTab,
  isAdmin,
  onLogout,
  onOpenBackoffice,
  seasonLabel,
  seasonNumber,
  hasLiveMatch,
}: NavbarProps) {
  const [isOpen, setIsOpen] = useState(false);

  const navItems: { label: string; value: ActiveTab }[] = [
    { label: 'HOME', value: 'home' },
    { label: 'SPIELPLAN', value: 'spielplan' },
    { label: 'TABELLE', value: 'tabelle' },
    { label: 'HERO ONE', value: 'heroone' },
    { label: 'STATISTIKEN', value: 'statistiken' },
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

  // Saison-Pille: "2026/27" -> "26/27"
  const seasonShort = seasonLabel ? seasonLabel.replace(/^20(\d{2})\/(\d{2})$/, '$1/$2') : '';

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
