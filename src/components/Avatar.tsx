import type { UserStatus } from '../types';
import { USER_STATUS } from '../types';

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}

// Einheitliche Avatar-Darstellung: Profilbild oder Initialen, optional mit
// Präsenz-Punkt. Überall (Chat, Tickets, Aufgaben) wiederverwendet.
export default function Avatar({
  name,
  url,
  status,
  size = 36,
  showStatus = false,
  ring = '#0a1110',
}: {
  name: string;
  url?: string | null;
  status?: UserStatus | null;
  size?: number;
  showStatus?: boolean;
  ring?: string;
}) {
  const dot = Math.max(8, Math.round(size * 0.28));
  return (
    <span className="relative inline-flex shrink-0" style={{ width: size, height: size }}>
      {url ? (
        <img src={url} alt={name} className="w-full h-full rounded-full object-cover border border-white/10" />
      ) : (
        <span
          className="w-full h-full rounded-full bg-brand-accent/25 border border-brand-accent-light/40 text-brand-accent-light font-bold flex items-center justify-center"
          style={{ fontSize: Math.round(size * 0.4) }}
        >
          {initials(name) || '?'}
        </span>
      )}
      {showStatus && status && (
        <span
          title={USER_STATUS[status].label}
          className={`absolute -bottom-0.5 -right-0.5 rounded-full ${USER_STATUS[status].dot}`}
          style={{ width: dot, height: dot, boxShadow: `0 0 0 2px ${ring}` }}
        />
      )}
    </span>
  );
}
