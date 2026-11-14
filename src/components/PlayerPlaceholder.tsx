import React from 'react';
import { monogram } from './ui';
import { PLAYER_PHOTO_BG } from '../lib/playerPhoto';

// Spieler ohne Foto: derselbe Hintergrund wie bei den fertigen Spielerbildern
// (dunkel mit türkisem Lichtkegel), darauf die Initialen. Gilt automatisch für
// jeden Spieler ohne Foto – auch für neu angelegte. Größe, Rundung, Rahmen und
// Schriftgröße kommen über className/style.
export default function PlayerPlaceholder({
  name,
  mark,
  className = '',
  style,
  textClassName = '',
  textStyle,
}: {
  name: string;
  mark?: React.ReactNode; // statt der Initialen (z. B. „?")
  className?: string;
  style?: React.CSSProperties;
  textClassName?: string;
  textStyle?: React.CSSProperties;
}) {
  return (
    <span className={`relative grid place-items-center overflow-hidden shrink-0 bg-[#03080a] ${className}`} style={style} title={name}>
      <img
        src={PLAYER_PHOTO_BG}
        alt=""
        aria-hidden="true"
        decoding="async"
        draggable={false}
        className="absolute inset-0 w-full h-full max-w-none object-cover object-top pointer-events-none select-none"
      />
      <span className={`relative font-display font-black leading-none text-[#E6EFEC]/60 select-none ${textClassName}`} style={textStyle}>
        {mark ?? monogram(name)}
      </span>
    </span>
  );
}
