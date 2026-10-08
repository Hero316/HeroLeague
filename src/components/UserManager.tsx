import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Users, Plus, Trash2, Check, ShieldCheck, ClipboardList, LogOut, SlidersHorizontal, X } from 'lucide-react';
import { AppUser, UserRole, AdminPermission, ALL_ADMIN_PERMISSIONS } from '../types';
import { apiFetch } from '../lib/api';
import { useBackClose, goBackLayer } from '../lib/backStack';
import {
  ROLE_DEFAULT_PERMISSIONS,
  TRACKING_ADMIN_PRESET,
  customizableRole,
  normalizePermissions,
} from '../lib/permissions';

const ROLE_LABEL: Record<UserRole, string> = {
  superadmin: 'Super-Admin',
  match_admin: 'Spiel-Admin',
  referee: 'Schiedsrichter',
  team_member: 'Team-Mitglied',
};
const areaLabel = (id: AdminPermission) => ALL_ADMIN_PERMISSIONS.find((a) => a.id === id)?.label ?? id;

const inputClass =
  'w-full bg-[#060E0F] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-brand-accent-light';

export default function UserManager() {
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [newEmail, setNewEmail] = useState('');
  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState<UserRole>('match_admin');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [logoutAllBusy, setLogoutAllBusy] = useState(false);
  const [logoutAllDone, setLogoutAllDone] = useState(false);
  // Rechte-Editor: welcher Benutzer ist gerade aufgeklappt?
  const [rightsId, setRightsId] = useState<string | null>(null);
  useBackClose(rightsId !== null, () => setRightsId(null));

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
        body: JSON.stringify({ email: newEmail.trim(), name: newName.trim(), role: newRole }),
      });
      setNewEmail('');
      setNewName('');
      setNewRole('match_admin');
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Fehler beim Anlegen.');
    } finally {
      setBusyId(null);
    }
  };

  const updateUser = async (
    user: AppUser,
    patch: Partial<Pick<AppUser, 'role' | 'isActive' | 'name' | 'permissions'>>
  ): Promise<boolean> => {
    setBusyId(user.id);
    try {
      await apiFetch(`/api/users/${user.id}`, { method: 'PUT', body: JSON.stringify(patch) });
      await load();
      return true;
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Fehler beim Speichern.');
      return false;
    } finally {
      setBusyId(null);
    }
  };

  const handleLogoutAll = async () => {
    if (
      !confirm(
        'Alle anderen Geräte und Nutzer abmelden?\n\nAlle müssen sich danach neu anmelden. Du selbst bleibst auf diesem Gerät angemeldet.'
      )
    )
      return;
    setLogoutAllBusy(true);
    try {
      await apiFetch('/api/auth/logout-all', { method: 'POST' });
      setLogoutAllDone(true);
      setTimeout(() => setLogoutAllDone(false), 4000);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Fehler beim Abmelden.');
    } finally {
      setLogoutAllBusy(false);
    }
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
        <strong className="text-hl-soft">Spiel-Admins</strong> standardmäßig Tracking, Ergebnisse, Klubs, Auszeichnungen & Highlights,{' '}
        <strong className="text-hl-soft">Schiedsrichter</strong> nur den Schiedsrichtermodus,{' '}
        <strong className="text-hl-soft">Team-Mitglieder</strong> nur die Team-App (Chat, Aufgaben, Tickets).
        Über <strong className="text-hl-soft">„Rechte"</strong> kannst du bei Spiel-Admins und Team-Mitgliedern jeden
        Backend-Bereich einzeln an- oder abhaken (z. B. ein Team-Mitglied, das zusätzlich nur das Statistics Center sieht).
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
            <option value="team_member">Team-Mitglied</option>
            <option value="referee">Schiedsrichter</option>
            <option value="match_admin">Spiel-Admin</option>
            <option value="superadmin">Super-Admin</option>
          </select>
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
            <div key={u.id} className="bg-[#060E0F]/40 border border-white/5 rounded-lg">
            <div
              className={`flex flex-wrap items-center justify-between gap-3 px-3 py-2.5 ${u.isActive ? '' : 'opacity-60'}`}
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
                  {customizableRole(u.role) && normalizePermissions(u.permissions).length > 0 && (
                    <div className="text-[10.5px] font-sans text-[#E9C46A] truncate mt-0.5">
                      Individuell: {normalizePermissions(u.permissions).map(areaLabel).join(' · ')}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={u.role}
                  disabled={busyId === u.id}
                  onChange={(e) => updateUser(u, { role: e.target.value as UserRole })}
                  className="bg-brand-dark border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-brand-accent-light cursor-pointer disabled:opacity-50"
                  title="Rolle ändern"
                >
                  <option value="team_member">Team-Mitglied</option>
                  <option value="referee">Schiedsrichter</option>
                  <option value="match_admin">Spiel-Admin</option>
                  <option value="superadmin">Super-Admin</option>
                </select>

                {u.role === 'superadmin' && (
                  <span className="px-2 py-1.5 rounded-lg text-[10px] font-mono uppercase tracking-wider bg-[rgba(34,223,201,.1)] border border-[rgba(34,223,201,.25)] text-brand-accent-light">
                    alle Rechte
                  </span>
                )}

                {customizableRole(u.role) && (
                  <button
                    type="button"
                    disabled={busyId === u.id}
                    onClick={() => setRightsId((cur) => (cur === u.id ? null : u.id))}
                    aria-expanded={rightsId === u.id}
                    className={`px-2.5 py-1.5 rounded-lg text-[11px] font-sans font-semibold border transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-1 ${
                      rightsId === u.id
                        ? 'bg-[rgba(233,196,106,.16)] border-[rgba(233,196,106,.45)] text-[#E9C46A]'
                        : 'bg-white/5 border-white/10 text-hl-soft hover:text-white'
                    }`}
                    title="Rechte bearbeiten"
                  >
                    <SlidersHorizontal className="w-3 h-3" /> Rechte
                  </button>
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
            {rightsId === u.id && customizableRole(u.role) && (
              <RightsEditor
                key={u.id}
                user={u}
                busy={busyId === u.id}
                onCancel={() => goBackLayer()}
                onSave={async (permissions) => {
                  if (await updateUser(u, { permissions })) goBackLayer();
                }}
              />
            )}
            </div>
          ))}
        </div>
      )}

      {/* Sicherheit: alle anderen abmelden */}
      <div className="mt-8 pt-6 border-t border-white/10">
        <h4 className="font-display font-bold text-sm uppercase tracking-tight text-white mb-1.5 flex items-center gap-2">
          <LogOut className="w-4 h-4 text-hl-red-soft" />
          Sicherheit
        </h4>
        <p className="text-xs text-gray-400 font-sans mb-3">
          Meldet <strong className="text-hl-soft">alle anderen</strong> Geräte und Nutzer ab – jeder muss sich danach neu anmelden.
          Nützlich, wenn jemand das Team verlässt oder ein Gerät verloren geht. Du selbst bleibst auf diesem Gerät angemeldet.
          Die Abmeldung greift innerhalb von etwa einer Minute überall.
        </p>
        <button
          type="button"
          disabled={logoutAllBusy}
          onClick={handleLogoutAll}
          className="px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider border border-rose-500/30 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20 transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
        >
          <LogOut className="w-4 h-4" />
          <span>{logoutAllBusy ? 'Melde ab…' : 'Alle anderen abmelden'}</span>
        </button>
        {logoutAllDone && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-3 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-xs text-emerald-400 uppercase tracking-wider"
          >
            ✓ Alle anderen wurden abgemeldet
          </motion.div>
        )}
      </div>
    </div>
  );
}

// „Rechte bearbeiten": Standard der Rolle ODER jeden Backend-Bereich einzeln
// anhaken. Gespeichert wird die Liste; der Server prüft dieselben Bereiche.
function RightsEditor({
  user,
  busy,
  onCancel,
  onSave,
}: {
  user: AppUser;
  busy: boolean;
  onCancel: () => void;
  onSave: (permissions: AdminPermission[]) => void;
}) {
  const initial = normalizePermissions(user.permissions);
  const [custom, setCustom] = useState(initial.length > 0);
  const [picked, setPicked] = useState<AdminPermission[]>(
    initial.length > 0 ? initial : ROLE_DEFAULT_PERMISSIONS[user.role]
  );
  const defaults = ROLE_DEFAULT_PERMISSIONS[user.role];
  const toggle = (id: AdminPermission) =>
    setPicked((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  const save = () => {
    if (custom && picked.length === 0) {
      alert('Bitte mindestens einen Bereich anhaken – oder „Standard der Rolle" wählen.');
      return;
    }
    onSave(custom ? picked : []);
  };

  return (
    <div className="border-t border-white/[.06] px-3 py-3.5 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-display font-black uppercase tracking-tight text-white text-[15px] leading-tight">
            Rechte · {user.name || user.email}
          </div>
          <div className="text-[11px] text-hl-mute font-sans mt-0.5">
            Rolle: {ROLE_LABEL[user.role]} · Team-App (Chat, Aufgaben) bleibt immer erhalten.
          </div>
        </div>
        <button
          type="button"
          onClick={onCancel}
          aria-label="Schließen"
          className="shrink-0 p-1.5 rounded-lg text-hl-mute hover:text-white hover:bg-white/5 cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setCustom(false)}
          className={`text-left rounded-xl border px-3 py-2.5 cursor-pointer transition-colors ${
            !custom ? 'border-brand-accent-light/50 bg-brand-accent-light/10' : 'border-white/10 bg-white/[.02] hover:border-white/25'
          }`}
        >
          <div className="text-[13px] font-bold text-white">Standard der Rolle</div>
          <div className="text-[11px] text-hl-mute mt-0.5">
            {defaults.length ? defaults.map(areaLabel).join(' · ') : 'Kein Backend – nur Team-App'}
          </div>
        </button>
        <button
          type="button"
          onClick={() => setCustom(true)}
          className={`text-left rounded-xl border px-3 py-2.5 cursor-pointer transition-colors ${
            custom ? 'border-[rgba(233,196,106,.55)] bg-[rgba(233,196,106,.1)]' : 'border-white/10 bg-white/[.02] hover:border-white/25'
          }`}
        >
          <div className="text-[13px] font-bold text-white">Individuell einstellen</div>
          <div className="text-[11px] text-hl-mute mt-0.5">Jeden Bereich einzeln an- oder abhaken</div>
        </button>
      </div>

      {custom && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-mono uppercase tracking-wider text-hl-faint">Vorlage:</span>
            <button
              type="button"
              onClick={() => setPicked(TRACKING_ADMIN_PRESET)}
              className="px-2.5 py-1 rounded-full text-[11px] font-semibold border border-brand-accent-light/35 bg-brand-accent-light/10 text-brand-accent-light hover:bg-brand-accent-light/20 cursor-pointer"
            >
              Tracking-Admin
            </button>
            <button
              type="button"
              onClick={() => setPicked(ROLE_DEFAULT_PERMISSIONS.match_admin)}
              className="px-2.5 py-1 rounded-full text-[11px] font-semibold border border-white/15 bg-white/5 text-hl-soft hover:text-white cursor-pointer"
            >
              Wie Spiel-Admin
            </button>
            <button
              type="button"
              onClick={() => setPicked([])}
              className="px-2.5 py-1 rounded-full text-[11px] font-semibold border border-white/15 bg-white/5 text-hl-soft hover:text-white cursor-pointer"
            >
              Alle abwählen
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            {ALL_ADMIN_PERMISSIONS.map((a) => {
              const on = picked.includes(a.id);
              return (
                <label
                  key={a.id}
                  className={`flex items-start gap-2.5 rounded-xl border px-3 py-2.5 cursor-pointer transition-colors ${
                    on ? 'border-[rgba(233,196,106,.45)] bg-[rgba(233,196,106,.07)]' : 'border-white/[.07] bg-white/[.015] hover:border-white/20'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => toggle(a.id)}
                    className="mt-0.5 w-4 h-4 accent-[#E9C46A] shrink-0 cursor-pointer"
                  />
                  <span className="min-w-0">
                    <span className="block text-[13px] font-semibold text-white">{a.label}</span>
                    <span className="block text-[11px] text-hl-mute leading-snug">{a.hint}</span>
                  </span>
                </label>
              );
            })}
          </div>
          <p className="text-[11px] text-hl-faint font-sans">
            Benutzerverwaltung und Saisons bleiben immer beim Super-Admin. Änderungen greifen nach wenigen Sekunden –
            ohne neu anmelden (ggf. Seite einmal neu laden).
          </p>
        </>
      )}

      <div className="flex flex-wrap justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider border border-white/10 bg-white/5 text-hl-soft hover:text-white cursor-pointer"
        >
          Abbrechen
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={save}
          className="px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider bg-brand-accent-light hover:bg-brand-accent text-white disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
        >
          <Check className="w-3.5 h-3.5" /> {busy ? 'Speichere…' : 'Speichern'}
        </button>
      </div>
    </div>
  );
}
