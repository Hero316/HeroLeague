import React from 'react';

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

// Spielerfoto mit Initialen-Fallback in Vereinsfarbe
export default function PlayerAvatar({ name, imageUrl, color = '#3B82F6', size = 'md' }: PlayerAvatarProps) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');

  if (imageUrl) {
    return (
      <img
        src={imageUrl}
        alt={name}
        referrerPolicy="no-referrer"
        className={`${SIZES[size]} rounded-full object-cover border shrink-0`}
        style={{ borderColor: color }}
      />
    );
  }

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
