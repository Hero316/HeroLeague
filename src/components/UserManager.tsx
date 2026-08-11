import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Users, Plus, Trash2, Check, ShieldCheck, ClipboardList } from 'lucide-react';
import { AppUser, UserRole, AdminPermission, ALL_ADMIN_PERMISSIONS } from '../types';
import { apiFetch } from '../lib/api';

const inputClass =
  'w-full bg-[#060E0F] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-brand-accent-light';

const ROLE_LABEL: Record<UserRole, string> = {
  superadmin: 'Super-Admin',
  match_admin: 'Spiel-Admin',
  referee: 'Schiedsrichter',
  ticket_manager: 'Ticket-Manager',
};

export default function UserManager() {
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [newEmail, setNewEmail] = useState('');
  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState<UserRole>('match_admin');
  const [newPermissions, setNewPermissions] = useState<AdminPermission[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const load = async () => {
    try {
      setUsers(await apiFetch<AppUser[]>('/api/users'));
    } catch (err) {
      console.error('Benutzer konnten nicht geladen werden', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmail.trim()) {
      alert('Bitte eine E-Mail-Adresse eingeben.');
      return;
    }
    setBusyId('new');
    try {
      await apiFetch('/api/users', {
        method: 'POST',
        body: JSON.stringify({ email: newEmail.trim(), name: newName.trim(), role: newRole, permissions: newPermissions }),
      });
      setNewEmail('');
      setNewName('');
      setNewRole('match_admin');
      setNewPermissions([]);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Fehler beim Anlegen.');
    } finally {
      setBusyId(null);
    }
  };

  const updateUser = async (user: AppUser, patch: Partial<Pick<AppUser, 'role' | 'isActive' | 'name' | 'permissions'>>) => {
    setBusyId(user.id);
    try {
      await apiFetch(`/api/users/${user.id}`, { method: 'PUT', body: JSON.stringify(patch) });
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Fehler beim Speichern.');
    } finally {
      setBusyId(null);
    }
  };

  // Ein Zusatzrecht eines Nutzers an-/ausschalten.
  const togglePermission = (user: AppUser, perm: AdminPermission) => {
    const has = (user.permissions ?? []).includes(perm);
    const next = has ? (user.permissions ?? []).filter((p) => p !== perm) : [...(user.permissions ?? []), perm];
    updateUser(user, { permissions: next });
  };

  const deleteUser = async (user: AppUser) => {
    if (!confirm(`Benutzer "${user.email}" wirklich löschen? Der Zugang wird sofort entzogen.`)) return;
    setBusyId(user.id);
    try {
      await apiFetch(`/api/users/${user.id}`, { method: 'DELETE' });
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Fehler beim Löschen.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div>
      <h3 className="font-display font-bold text-xl uppercase tracking-tight text-white mb-4 flex items-center gap-2">
        <Users className="w-5 h-5 text-brand-accent-light" />
        Benutzerverwaltung
      </h3>
      <p className="text-xs text-gray-400 font-sans mb-6">
        Lege Zugänge an und vergib Rollen. <strong className="text-hl-soft">Super-Admins</strong> dürfen alles,{' '}
        <strong className="text-hl-soft">Spiel-Admins</strong> nur Ergebnisse, Live-Ticker und Spielplan pflegen,{' '}
        <strong className="text-hl-soft">Schiedsrichter</strong> ausschließlich den Schiedsrichtermodus (Spiele pfeifen),{' '}
        <strong className="text-hl-soft">Ticket-Manager</strong> ausschließlich Tickets bearbeiten.
        Angemeldet wird passwortlos per Code an die hinterlegte E-Mail.
      </p>

      {/* Neuen Benutzer anlegen */}
      <form
        onSubmit={handleCreate}
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[2fr_1.5fr_1fr_auto] gap-3 items-end bg-[#060E0F]/40 border border-white/5 rounded-xl p-4 mb-6"
      >
        <div>
          <label className="block text-xs font-mono text-gray-400 mb-1.5 uppercase tracking-wider">E-Mail</label>
          <input
            type="email"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            placeholder="person@verein.de"
            className={inputClass}
          />
        </div>
        <div>
          <label className="block text-xs font-mono text-gray-400 mb-1.5 uppercase tracking-wider">Name (optional)</label>
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="z.B. Max Mustermann"
            className={inputClass}
          />
        </div>
        <div>
          <label className="block text-xs font-mono text-gray-400 mb-1.5 uppercase tracking-wider">Rolle</label>
          <select value={newRole} onChange={(e) => setNewRole(e.target.value as UserRole)} className={`${inputClass} cursor-pointer`}>
            <option value="referee">Schiedsrichter</option>
            <option value="ticket_manager">Ticket-Manager</option>
            <option value="match_admin">Spiel-Admin</option>
            <option value="superadmin">Super-Admin</option>
          </select>
        </div>
        <div className="sm:col-span-2 lg:col-span-3">
          <label className="block text-xs font-mono text-gray-400 mb-1.5 uppercase tracking-wider">Zusatzrechte</label>
          <div className="flex flex-wrap gap-2">
            {ALL_ADMIN_PERMISSIONS.map((p) => {
              const on = newPermissions.includes(p.id);
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() =>
                    setNewPermissions((prev) => (on ? prev.filter((x) => x !== p.id) : [...prev, p.id]))
                  }
                  className={`px-3 py-1.5 rounded-lg text-[11px] font-sans font-semibold border transition-colors cursor-pointer ${
                    on
                      ? 'bg-brand-accent-light/20 border-brand-accent-light/50 text-brand-accent-light'
                      : 'bg-white/5 border-white/10 text-hl-mute hover:text-white'
                  }`}
                >
                  {on ? '✓ ' : ''}
                  {p.label}
                </button>
              );
            })}
            {newRole === 'superadmin' && (
              <span className="text-[11px] text-hl-faint font-sans self-center">Super-Admins haben ohnehin alle Rechte.</span>
            )}
          </div>
        </div>
        <button
          type="submit"
          disabled={busyId === 'new'}
          className="px-4 py-2.5 bg-brand-accent-light hover:bg-brand-accent disabled:opacity-50 rounded-xl text-xs font-bold uppercase tracking-wider transition-all text-white flex items-center justify-center gap-1.5 cursor-pointer self-end"
        >
          <Plus className="w-4 h-4" />
          <span>Anlegen</span>
        </button>
      </form>

      {success && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-4 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-center text-xs text-emerald-400 uppercase tracking-wider"
        >
          ✓ Benutzer angelegt
        </motion.div>
      )}

      {/* Liste */}
      {loading ? (
        <p className="text-sm text-gray-400 font-sans text-center py-6">Lade Benutzer…</p>
      ) : users.length === 0 ? (
        <div className="flex flex-col items-center gap-2 text-center py-8 text-hl-mute">
          <ClipboardList className="w-6 h-6 text-hl-faint" />
          <p className="text-sm font-sans">Noch keine Benutzer angelegt. Der Master-Passwort-Zugang bleibt als Notzugang bestehen.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {users.map((u) => (
            <div
              key={u.id}
              className={`flex flex-wrap items-center justify-between gap-3 bg-[#060E0F]/40 border border-white/5 rounded-lg px-3 py-2.5 ${
                u.isActive ? '' : 'opacity-60'
              }`}
            >
              <div className="min-w-0 flex items-center gap-2.5">
                <div
                  className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border ${
                    u.role === 'superadmin'
                      ? 'bg-[rgba(34,223,201,.12)] border-[rgba(34,223,201,.3)] text-brand-accent-light'
                      : 'bg-white/5 border-white/10 text-hl-soft'
                  }`}
                >
                  <ShieldCheck className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="font-sans font-semibold text-sm text-white truncate">
                    {u.name || u.email}
                    {!u.isActive && <span className="ml-2 text-[10px] font-mono text-hl-red-soft uppercase">deaktiviert</span>}
                  </div>
                  {u.name && <div className="text-[11px] font-mono text-hl-dim truncate">{u.email}</div>}
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <select
                  value={u.role}
                  disabled={busyId === u.id}
                  onChange={(e) => updateUser(u, { role: e.target.value as UserRole })}
                  className="bg-brand-dark border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-brand-accent-light cursor-pointer disabled:opacity-50"
                  title="Rolle ändern"
                >
                  <option value="referee">Schiedsrichter</option>
                  <option value="ticket_manager">Ticket-Manager</option>
                  <option value="match_admin">Spiel-Admin</option>
                  <option value="superadmin">Super-Admin</option>
                </select>

                {u.role === 'superadmin' ? (
                  <span className="px-2 py-1.5 rounded-lg text-[10px] font-mono uppercase tracking-wider bg-[rgba(34,223,201,.1)] border border-[rgba(34,223,201,.25)] text-brand-accent-light">
                    alle Rechte
                  </span>
                ) : (
                  ALL_ADMIN_PERMISSIONS.map((p) => {
                    const on = (u.permissions ?? []).includes(p.id);
                    return (
                      <button
                        key={p.id}
                        type="button"
                        disabled={busyId === u.id}
                        onClick={() => togglePermission(u, p.id)}
                        title={`${p.label} ${on ? 'entziehen' : 'erlauben'}`}
                        className={`px-2.5 py-1.5 rounded-lg text-[11px] font-sans font-semibold border transition-colors cursor-pointer disabled:opacity-50 ${
                          on
                            ? 'bg-brand-accent-light/20 border-brand-accent-light/50 text-brand-accent-light'
                            : 'bg-white/5 border-white/10 text-hl-mute hover:text-white'
                        }`}
                      >
                        {on ? '✓ ' : ''}
                        {p.label}
                      </button>
                    );
                  })
                )}

                <button
                  type="button"
                  disabled={busyId === u.id}
                  onClick={() => updateUser(u, { isActive: !u.isActive })}
                  className={`px-2.5 py-1.5 rounded-lg text-[11px] font-sans font-semibold border transition-colors cursor-pointer disabled:opacity-50 ${
                    u.isActive
                      ? 'bg-[rgba(67,229,160,.12)] border-[rgba(67,229,160,.3)] text-hl-green-soft'
                      : 'bg-white/5 border-white/10 text-hl-mute hover:text-white'
                  }`}
                  title={u.isActive ? 'Zugang deaktivieren' : 'Zugang aktivieren'}
                >
                  {u.isActive ? (
                    <span className="flex items-center gap-1">
                      <Check className="w-3 h-3" /> Aktiv
                    </span>
                  ) : (
                    'Inaktiv'
                  )}
                </button>

                <button
                  type="button"
                  disabled={busyId === u.id}
                  onClick={() => deleteUser(u)}
                  title="Benutzer löschen"
                  className="p-1.5 text-gray-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-md transition-colors cursor-pointer disabled:opacity-50"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
