import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { shade } from './ui';

interface PlayerAvatarProps {
  name: string;
  imageUrl?: string;
  color?: string; // Vereinsfarbe für den Initialen-Fallback
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

// Größen im neuen Design: abgerundete Rechtecke statt Kreise
const SIZES = {
  sm: 'w-8 h-8 text-[11px] rounded-[10px]',
  md: 'w-11 h-11 text-base rounded-[13px]',
  lg: 'w-[58px] h-[58px] text-xl rounded-[16px]',
  xl: 'w-[104px] h-[104px] text-4xl rounded-[26px]',
};

// Spielerfoto mit Initialen-Fallback in Vereinsfarbe.
// Bei vorhandenem Foto per Klick als mittelgroße Lightbox anzeigbar.
export default function PlayerAvatar({ name, imageUrl, color = '#22DFC9', size = 'md' }: PlayerAvatarProps) {
  const [open, setOpen] = useState(false);

  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  if (!imageUrl) {
    return (
      <span
        className={`${SIZES[size]} grid place-items-center font-display font-black text-white shrink-0 shadow-[inset_0_0_0_1px_rgba(255,255,255,.18)]`}
        style={{ background: `linear-gradient(140deg, ${color}, ${shade(color, 0.45)})` }}
        title={name}
      >
        {initials || '?'}
      </span>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={`${name} – Foto vergrößern`}
        className="shrink-0 transition-transform duration-150 hover:scale-105 focus:outline-none focus:ring-2 focus:ring-brand-accent-light rounded-[13px] cursor-zoom-in"
      >
        <img
          src={imageUrl}
          alt={name}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          className={`${SIZES[size]} object-cover border`}
          style={{ borderColor: color }}
        />
      </button>

      {open &&
        createPortal(
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
            onClick={() => setOpen(false)}
            role="dialog"
            aria-modal="true"
            aria-label={`Foto von ${name}`}
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
                src={imageUrl}
                alt={name}
                referrerPolicy="no-referrer"
                className="w-64 sm:w-80 max-w-[80vw] aspect-square object-cover rounded-2xl border-4 shadow-2xl"
                style={{ borderColor: color }}
              />
              <span className="mt-4 font-display font-black text-lg text-white uppercase tracking-tight text-center">{name}</span>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
