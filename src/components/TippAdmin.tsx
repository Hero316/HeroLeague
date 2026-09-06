import { useEffect, useState } from 'react';
import { Loader2, Download, RefreshCw, CheckCircle2, Clock } from 'lucide-react';
import { fetchTippUsers, type TippUser } from '../lib/tips';

// Super-Admin: Teilnehmerliste des Tippspiels (für Gewinner-Auswahl & Kontakt).
export default function TippAdmin() {
  const [users, setUsers] = useState<TippUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  const load = () => {
    setLoading(true);
    fetchTippUsers()
      .then(setUsers)
      .catch((e) => setErr(e instanceof Error ? e.message : 'Fehler'))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const verified = users.filter((u) => u.verified);

  const exportCsv = () => {
    const head = ['Vorname', 'Nachname', 'E-Mail', 'Alter', 'Gefunden über', 'Bestätigt', 'Vorschlag', 'Angemeldet am'];
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = [head.map(esc).join(',')];
    users.forEach((u) => {
      lines.push([u.firstName, u.lastName, u.email, u.age ?? '', u.foundVia ?? '', u.verified ? 'ja' : 'nein', u.suggestion ?? '', u.createdAt].map(esc).join(','));
    });
    const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'tippspiel-teilnehmer.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  if (loading) return <div className="flex items-center justify-center py-8 text-hl-mute"><Loader2 className="w-5 h-5 animate-spin" /></div>;
  if (err) return <div className="text-sm text-rose-300 font-sans py-2">{err}</div>;

  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
        <div className="text-sm font-sans text-hl-soft">
          <span className="font-bold text-white">{verified.length}</span> bestätigt · {users.length} gesamt
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} className="inline-flex items-center gap-1.5 rounded-lg hl-surf-soft border border-white/10 px-3 py-1.5 text-xs font-sans font-bold uppercase tracking-wider text-hl-mute hover:text-white cursor-pointer transition-colors">
            <RefreshCw className="w-3.5 h-3.5" /> Aktualisieren
          </button>
          <button onClick={exportCsv} disabled={users.length === 0} className="inline-flex items-center gap-1.5 rounded-lg bg-brand-accent-light/15 border border-brand-accent-light/35 px-3 py-1.5 text-xs font-sans font-bold uppercase tracking-wider text-brand-accent-light cursor-pointer disabled:opacity-40 transition-colors">
            <Download className="w-3.5 h-3.5" /> CSV
          </button>
        </div>
      </div>

      {users.length === 0 ? (
        <p className="text-sm text-hl-mute font-sans py-4 text-center">Noch keine Anmeldungen.</p>
      ) : (
        <div className="space-y-2">
          {users.map((u) => (
            <div key={u.email} className="hl-surf-soft border border-white/10 rounded-xl p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="font-sans font-bold text-white truncate">{u.firstName} {u.lastName}</span>
                    {u.verified ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-brand-accent-light shrink-0" />
                    ) : (
                      <Clock className="w-3.5 h-3.5 text-hl-dim shrink-0" />
                    )}
                  </div>
                  <div className="text-[12px] text-hl-mute font-sans truncate">{u.email}</div>
                </div>
                <div className="text-right shrink-0 text-[11px] text-hl-mute font-sans">
                  {u.age != null && <div>{u.age} J.</div>}
                  {u.foundVia && <div className="truncate max-w-[120px]">{u.foundVia}</div>}
                </div>
              </div>
              {u.suggestion && (
                <p className="mt-2 text-[12px] text-hl-soft font-sans bg-black/20 rounded-lg px-2.5 py-1.5 leading-snug">„{u.suggestion}"</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
