import React, { useState } from 'react';
import { Menu, X, Shield, Lock, Unlock, LogOut } from 'lucide-react';
import { ActiveTab } from '../types';

interface NavbarProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  isAdmin: boolean;
  onLogout: () => void;
  onOpenLogin: () => void;
}

export default function Navbar({
  activeTab,
  setActiveTab,
  isAdmin,
  onLogout,
  onOpenLogin,
}: NavbarProps) {
  const [isOpen, setIsOpen] = useState(false);

  const navItems: { label: string; value: ActiveTab }[] = [
    { label: 'Home', value: 'home' },
    { label: 'Spielplan', value: 'spielplan' },
    { label: 'Tabelle', value: 'tabelle' },
    { label: 'Statistiken', value: 'statistiken' },
  ];

  return (
    <nav className="sticky top-0 z-50 bg-[#0A0118]/90 backdrop-blur-md border-b border-white/10 px-4 py-3">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        {/* Brand Logo */}
        <div 
          className="flex items-center space-x-3 cursor-pointer group"
          onClick={() => setActiveTab('home')}
        >
          <div className="relative flex items-center justify-center w-10 h-10 rounded-lg bg-brand-accent-light font-black italic text-xl shadow-lg shadow-brand-accent-light/30 transition-transform duration-300 group-hover:scale-105">
            HL
          </div>
          <div>
            <span className="font-display font-bold text-xl tracking-tighter uppercase text-white group-hover:text-brand-accent-light transition-colors">
              HERO <span className="text-brand-accent-light">LEAGUE</span>
            </span>
            <span className="block text-[9px] text-gray-400 font-mono tracking-widest uppercase mt-0.5">
              The Ultimate Football Arena
            </span>
          </div>
        </div>

        {/* Desktop Navigation */}
        <div className="hidden md:flex items-center space-x-8">
          {navItems.map((item) => (
            <button
              key={item.value}
              onClick={() => setActiveTab(item.value)}
              className={`font-sans text-sm font-medium uppercase tracking-wider transition-all duration-200 pb-1 cursor-pointer ${
                activeTab === item.value
                  ? 'text-brand-accent-light border-b-2 border-brand-accent-light'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {/* Desktop Admin Status / Action */}
        <div className="hidden md:flex items-center space-x-3">
          {isAdmin ? (
            <div className="flex items-center space-x-3">
              <span className="flex h-2 w-2 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <span className="text-xs font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-1 rounded">
                Admin-Modus
              </span>
              <button
                onClick={onLogout}
                className="px-5 py-2 bg-rose-600 hover:bg-rose-700 rounded-full text-xs font-bold uppercase transition-all shadow-lg shadow-rose-600/20 cursor-pointer text-white"
              >
                Logout
              </button>
            </div>
          ) : (
            <button
              onClick={onOpenLogin}
              className="px-6 py-2 bg-brand-accent-light hover:bg-brand-accent rounded-full text-xs font-bold uppercase transition-all shadow-lg shadow-brand-accent-light/20 cursor-pointer text-white"
            >
              Login
            </button>
          )}
        </div>

        {/* Mobile menu button */}
        <div className="md:hidden flex items-center space-x-2">
          {isAdmin && (
            <div className="flex h-2 w-2 relative mr-1">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </div>
          )}
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="text-gray-300 hover:text-white hover:bg-[#150a30] p-2 rounded-lg cursor-pointer"
          >
            {isOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </div>

      {/* Mobile Menu */}
      {isOpen && (
        <div className="md:hidden mt-2 bg-[#0d0524] border border-[#221445] rounded-xl p-3 space-y-2">
          {navItems.map((item) => (
            <button
              key={item.value}
              onClick={() => {
                setActiveTab(item.value);
                setIsOpen(false);
              }}
              className={`block w-full text-left px-4 py-2.5 rounded-lg font-sans text-sm font-medium transition-colors ${
                activeTab === item.value
                  ? 'bg-brand-accent text-white shadow-md'
                  : 'text-gray-300 hover:bg-[#1b0b42] hover:text-white'
              }`}
            >
              {item.label}
            </button>
          ))}
          <div className="border-t border-[#221445] pt-2 mt-2">
            {isAdmin ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between px-4 py-1.5">
                  <span className="text-xs font-mono text-emerald-400">Admin-Modus aktiv</span>
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-500"></span>
                </div>
                <button
                  onClick={() => {
                    onLogout();
                    setIsOpen(false);
                  }}
                  className="w-full flex items-center justify-center space-x-1.5 bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Abmelden (Logout)</span>
                </button>
              </div>
            ) : (
              <button
                onClick={() => {
                  onOpenLogin();
                  setIsOpen(false);
                }}
                className="w-full flex items-center justify-center space-x-1.5 bg-brand-accent hover:bg-brand-accent-light text-white py-2 rounded-lg text-sm font-medium transition-all duration-200 shadow-md cursor-pointer"
              >
                <Lock className="w-4 h-4" />
                <span>Admin Login</span>
              </button>
            )}
          </div>
        </div>
      )}
    </nav>
  );
}
