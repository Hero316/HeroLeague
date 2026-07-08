import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

interface PlayerAvatarProps {
  name: string;
  imageUrl?: string;
  color?: string; // Vereinsfarbe für den Initialen-Fallback
  size?: 'sm' | 'md' | 'lg';
}

const SIZES = {
  sm: 'w-7 h-7 text-[9px]',
  md: 'w-10 h-10 text-xs',
  lg: 'w-14 h-14 text-sm',
};

// Spielerfoto mit Initialen-Fallback in Vereinsfarbe.
// Bei vorhandenem Foto per Klick als mittelgroße Lightbox anzeigbar.
export default function PlayerAvatar({ name, imageUrl, color = '#3B82F6', size = 'md' }: PlayerAvatarProps) {
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
        className={`${SIZES[size]} rounded-full flex items-center justify-center font-mono font-bold text-white border shrink-0`}
        style={{ backgroundColor: `${color}30`, borderColor: color }}
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
        className="shrink-0 rounded-full transition-transform duration-150 hover:scale-105 focus:outline-none focus:ring-2 focus:ring-brand-accent-light cursor-zoom-in"
      >
        <img
          src={imageUrl}
          alt={name}
          referrerPolicy="no-referrer"
          className={`${SIZES[size]} rounded-full object-cover border`}
          style={{ borderColor: color }}
        />
      </button>

      {open &&
        createPortal(
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fadeIn"
            onClick={() => setOpen(false)}
            role="dialog"
            aria-modal="true"
            aria-label={`Foto von ${name}`}
          >
            <div
              className="relative flex flex-col items-center"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Schließen"
                className="absolute -top-3 -right-3 z-10 w-9 h-9 rounded-full bg-[#1E1B4B] border border-white/20 text-gray-300 hover:text-white flex items-center justify-center shadow-lg cursor-pointer"
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
              <span className="mt-4 font-display font-bold text-lg text-white uppercase tracking-tight text-center">
                {name}
              </span>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
