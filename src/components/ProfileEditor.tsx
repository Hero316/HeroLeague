import React, { useRef, useState } from 'react';
import { Camera, Loader2, Check } from 'lucide-react';
import type { SessionUser, UserStatus } from '../types';
import { USER_STATUS, USER_STATUS_LIST } from '../types';
import { uploadImage } from '../lib/api';
import { updateOwnProfile } from '../lib/collab';
import Avatar from './Avatar';

const inputClass =
  'w-full bg-[#060E0F] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-brand-accent-light';

export default function ProfileEditor({
  user,
  onSaved,
}: {
  user: SessionUser;
  onSaved: (p: { name: string; avatarUrl: string; status: UserStatus }) => void;
}) {
  const [name, setName] = useState(user.name || '');
  const [avatarUrl, setAvatarUrl] = useState(user.avatarUrl || '');
  const [status, setStatus] = useState<UserStatus>(user.status || 'online');
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [ok, setOk] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const isBootstrap = user.id === 'bootstrap';

  const onFile = async (file?: File) => {
    if (!file) return;
    setUploading(true);
    try {
      setAvatarUrl(await uploadImage(file, { maxDimension: 512 }));
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Bild konnte nicht hochgeladen werden.');
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    if (!name.trim()) return alert('Bitte einen Namen angeben.');
    setBusy(true);
    try {
      const saved = await updateOwnProfile({ name: name.trim(), avatarUrl, status });
      onSaved({ name: saved.name, avatarUrl: saved.avatarUrl, status: saved.status });
      setOk(true);
      setTimeout(() => setOk(false), 2500);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Speichern fehlgeschlagen.');
    } finally {
      setBusy(false);
    }
  };

  if (isBootstrap) {
    return (
      <p className="text-sm text-hl-mute font-sans">
        Du bist über das <strong className="text-hl-soft">Master-Passwort</strong> angemeldet – dafür gibt es kein persönliches Profil.
        Lege dir in <strong className="text-hl-soft">Zugänge → Benutzerverwaltung</strong> einen eigenen Account mit deiner E-Mail an
        und melde dich damit an (Code per Mail). Dann kannst du hier Name, Bild und Status setzen.
      </p>
    );
  }

  return (
    <div className="max-w-lg">
      <div className="flex items-center gap-4 mb-5">
        <div className="relative">
          <Avatar name={name || user.email} url={avatarUrl} status={status} size={72} showStatus ring="#0b1210" />
          <button
            onClick={() => fileRef.current?.click()}
            title="Profilbild ändern"
            className="absolute -bottom-1 -right-1 p-1.5 rounded-full bg-brand-accent-light text-white border-2 border-[#0b1210] cursor-pointer"
          >
            {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Camera className="w-3.5 h-3.5" />}
          </button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { void onFile(e.target.files?.[0]); e.target.value = ''; }} />
        </div>
        <div className="flex-1">
          <label className="block text-[10px] font-mono text-hl-dim uppercase mb-1">Anzeigename</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Dein Name" className={inputClass} />
        </div>
      </div>

      <label className="block text-[10px] font-mono text-hl-dim uppercase mb-1.5">Status</label>
      <div className="flex flex-wrap gap-2 mb-5">
        {USER_STATUS_LIST.map((s) => {
          const on = status === s;
          return (
            <button
              key={s}
              type="button"
              onClick={() => setStatus(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-sans font-semibold border transition-colors cursor-pointer flex items-center gap-1.5 ${
                on ? 'bg-brand-accent-light/20 border-brand-accent-light/50 text-brand-accent-light' : 'bg-white/5 border-white/10 text-hl-mute hover:text-white'
              }`}
            >
              <span>{USER_STATUS[s].emoji}</span>
              {USER_STATUS[s].label}
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={save}
          disabled={busy || uploading}
          className="px-5 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider bg-brand-accent-light hover:bg-brand-accent text-white cursor-pointer disabled:opacity-50"
        >
          Speichern
        </button>
        {ok && (
          <span className="text-xs text-emerald-400 font-sans flex items-center gap-1">
            <Check className="w-4 h-4" /> Gespeichert
          </span>
        )}
      </div>
    </div>
  );
}
