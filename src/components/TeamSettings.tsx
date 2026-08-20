import { Globe, LogOut, Sun, Moon, UserCircle, Bell, Palette } from 'lucide-react';
import type { SessionUser, UserStatus } from '../types';
import { USER_STATUS } from '../types';
import Avatar from './Avatar';
import ProfileEditor from './ProfileEditor';
import NotificationSettings from './NotificationSettings';

// Einstellungs-/Profil-Bereich der Team-App (WhatsApp-artig): Profil, Benach-
// richtigungen, Darstellung und der Wechsel zurück zur Hero-League-Website bzw.
// Abmelden – alles gebündelt an einem Ort. Bewusst als eigener Tab, damit sich
// die Team-App wie eine echte App anfühlt.
export default function TeamSettings({
  user,
  onUpdateUser,
  theme,
  onToggleTheme,
  onGoWebsite,
  onLogout,
}: {
  user: SessionUser;
  onUpdateUser: (p: { name: string; avatarUrl: string; status: UserStatus }) => void;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  onGoWebsite: () => void;
  onLogout: () => void;
}) {
  const displayName = user.name?.trim() || user.email || 'Ich';

  return (
    <div className="hl-settings h-full overflow-y-auto p-3 pb-8">
      <div className="max-w-lg mx-auto space-y-4">
        {/* Profil-Kopf */}
        <div className="hl-card p-5 flex items-center gap-4">
          <Avatar name={displayName} url={user.avatarUrl} status={user.status} size={60} showStatus ring="#0b1210" />
          <div className="min-w-0">
            <div className="font-display font-black text-lg text-white truncate">{displayName}</div>
            <div className="text-xs text-hl-mute font-sans truncate">
              {USER_STATUS[user.status]?.emoji} {USER_STATUS[user.status]?.label ?? 'Online'}
              {user.email ? ` · ${user.email}` : ''}
            </div>
          </div>
        </div>

        {/* Mein Profil */}
        <section className="hl-card p-5">
          <h3 className="flex items-center gap-2 font-display font-bold text-white uppercase tracking-tight mb-4">
            <UserCircle className="w-5 h-5 text-brand-accent-light" /> Mein Profil
          </h3>
          <ProfileEditor user={user} onSaved={onUpdateUser} />
        </section>

        {/* Benachrichtigungen */}
        <section className="hl-card p-5">
          <h3 className="flex items-center gap-2 font-display font-bold text-white uppercase tracking-tight mb-4">
            <Bell className="w-5 h-5 text-brand-accent-light" /> Benachrichtigungen
          </h3>
          <NotificationSettings user={user} />
        </section>

        {/* Darstellung */}
        <section className="hl-card p-5">
          <h3 className="flex items-center gap-2 font-display font-bold text-white uppercase tracking-tight mb-4">
            <Palette className="w-5 h-5 text-brand-accent-light" /> Darstellung
          </h3>
          <button
            onClick={onToggleTheme}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-white/10 bg-white/[.03] hover:bg-white/[.06] text-hl-soft cursor-pointer transition-colors"
          >
            {theme === 'light' ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
            <span className="font-sans font-semibold text-sm text-left">
              {theme === 'light' ? 'Auf dunkle Ansicht umschalten' : 'Auf helle Ansicht umschalten'}
            </span>
            <span className="ml-auto text-xs text-hl-mute uppercase tracking-wider">{theme === 'light' ? 'Hell' : 'Dunkel'}</span>
          </button>
        </section>

        {/* App-Wechsel & Abmelden */}
        <section className="space-y-2">
          <button
            onClick={onGoWebsite}
            className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl border border-[rgba(34,223,201,.3)] bg-[rgba(34,223,201,.1)] text-brand-accent-light font-sans font-bold text-sm hover:bg-[rgba(34,223,201,.18)] cursor-pointer transition-colors"
          >
            <Globe className="w-5 h-5 shrink-0" />
            Zur Hero-League-Website
          </button>
          <button
            onClick={onLogout}
            className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl border border-[rgba(255,84,66,.3)] bg-[rgba(255,84,66,.1)] text-hl-red-soft font-sans font-bold text-sm hover:bg-[rgba(255,84,66,.18)] cursor-pointer transition-colors"
          >
            <LogOut className="w-5 h-5 shrink-0" />
            Abmelden
          </button>
        </section>
      </div>
    </div>
  );
}
