import { useEffect, useState } from 'react';
import { Globe, LogOut, Sun, Moon, UserCircle, Bell, Palette, Users, UserMinus, Trash2, Loader2 } from 'lucide-react';
import type { SessionUser, UserStatus, AppUser, UserRole } from '../types';
import { USER_STATUS } from '../types';
import { fetchAllUsers, purgeUserFromTeamApp } from '../lib/collab';
import Avatar from './Avatar';
import ProfileEditor from './ProfileEditor';
import NotificationSettings from './NotificationSettings';

const ROLE_LABEL: Record<UserRole, string> = {
  superadmin: 'Super-Admin',
  match_admin: 'Spiel-Admin',
  referee: 'Schiedsrichter',
  team_member: 'Team',
};

// Super-Admin: Personen aus der Team-App entfernen (aus allen Chats/Ideen/
// Aufgaben/Huddles) oder Test-Konten ganz löschen. Räumt Karteileichen auf.
function TeamMemberAdmin({ currentUserId }: { currentUserId: string }) {
  const [users, setUsers] = useState<AppUser[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = () => fetchAllUsers().then(setUsers).catch(() => setUsers([]));
  useEffect(() => { load(); }, []);

  const purge = async (u: AppUser, deleteAccount: boolean) => {
    const q = deleteAccount
      ? `Konto von „${u.name || u.email}" WIRKLICH ganz löschen? (Entfernt die Person überall und löscht den Account.)`
      : `„${u.name || u.email}" aus der ganzen Team-App entfernen? (Aus allen Chats, Ideen, Aufgaben & Huddles – Konto/Rolle bleibt.)`;
    if (!window.confirm(q)) return;
    setBusyId(u.id);
    try {
      await purgeUserFromTeamApp(u.id, deleteAccount);
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Aktion fehlgeschlagen.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="hl-card p-5">
      <h3 className="flex items-center gap-2 font-display font-bold text-white uppercase tracking-tight mb-1">
        <Users className="w-5 h-5 text-brand-accent-light" /> Personen verwalten
      </h3>
      <p className="text-[12px] text-hl-mute mb-4">Nur Super-Admin. Entfernt Personen aus allen Chats/Ideen/Aufgaben oder löscht Test-Konten.</p>
      {users === null ? (
        <div className="flex justify-center py-4 text-hl-mute"><Loader2 className="w-5 h-5 animate-spin" /></div>
      ) : users.length === 0 ? (
        <p className="text-sm text-hl-faint">Keine Personen.</p>
      ) : (
        <div className="space-y-2">
          {users.map((u) => {
            const self = u.id === currentUserId;
            const nm = u.name?.trim() || u.email;
            return (
              <div key={u.id} className="flex items-center gap-2.5 rounded-xl border border-white/10 bg-white/[.03] px-3 py-2">
                <Avatar name={nm} url={u.avatarUrl} size={32} />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-sans font-semibold text-white truncate">{nm}{self && ' (du)'}</div>
                  <div className="text-[11px] font-mono text-hl-dim truncate">{ROLE_LABEL[u.role] ?? u.role}{u.isActive ? '' : ' · inaktiv'}</div>
                </div>
                {!self && (
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => purge(u, false)}
                      disabled={busyId === u.id}
                      title="Aus der Team-App entfernen"
                      className="p-2 rounded-lg bg-white/5 border border-white/10 text-hl-soft hover:text-white cursor-pointer disabled:opacity-50"
                    >
                      {busyId === u.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserMinus className="w-4 h-4" />}
                    </button>
                    <button
                      onClick={() => purge(u, true)}
                      disabled={busyId === u.id}
                      title="Konto ganz löschen"
                      className="p-2 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 hover:bg-rose-500/20 cursor-pointer disabled:opacity-50"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

// Einstellungs-/Profil-Bereich der Team-App (WhatsApp-artig): Profil, Benach-
// richtigungen, Darstellung und der Wechsel zurück zur Hero-League-Website bzw.
// Abmelden – alles gebündelt an einem Ort. Bewusst als eigener Tab, damit sich
// die Team-App wie eine echte App anfühlt.
export default function TeamSettings({
  user,
  currentUserId,
  isSuperadmin = false,
  onUpdateUser,
  theme,
  onToggleTheme,
  onGoWebsite,
  onLogout,
}: {
  user: SessionUser;
  currentUserId: string;
  isSuperadmin?: boolean;
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

        {/* Personen verwalten (nur Super-Admin) */}
        {isSuperadmin && <TeamMemberAdmin currentUserId={currentUserId} />}

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
