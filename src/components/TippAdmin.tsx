import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Loader2, Download, RefreshCw, CheckCircle2, Clock, Mail, Copy, ChevronDown, Search } from 'lucide-react';
import { fetchTippUsers, type TippUser } from '../lib/tips';

// Super-Admin: Teilnehmerliste des Tippspiels. Draufklicken zeigt alle Daten;
// direkter „E-Mail schreiben"-Knopf (für Gewinner-Kontakt) + CSV-Export.
export default function TippAdmin() {
  const [users, setUsers] = useState<TippUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [openEmail, setOpenEmail] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [q, setQ] = useState('');

  const load = () => {
    setLoading(true);
    fetchTippUsers()
      .then(setUsers)
      .catch((e) => setErr(e instanceof Error ? e.message : 'Fehler'))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const verified = users.filter((u) => u.verified);
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return users;
    return users.filter((u) => `${u.firstName} ${u.lastName} ${u.email}`.toLowerCase().includes(s));
  }, [users, q]);

  const fmt = (v?: string | null) => (v ? new Date(v).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' }) : '—');

  const copyEmail = async (email: string) => {
    try { await navigator.clipboard.writeText(email); setCopied(email); setTimeout(() => setCopied(null), 1500); } catch { /* egal */ }
  };

  const exportCsv = () => {
    const head = ['Vorname', 'Nachname', 'E-Mail', 'Alter', 'Gefunden über', 'Bestätigt', 'Vorschlag', 'Angemeldet am', 'AGB-Version', 'AGB akzeptiert am'];
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = [head.map(esc).join(',')];
    users.forEach((u) => {
      lines.push([u.firstName, u.lastName, u.email, u.age ?? '', u.foundVia ?? '', u.verified ? 'ja' : 'nein', u.suggestion ?? '', u.createdAt, u.termsVersion ?? '', u.termsAcceptedAt ?? ''].map(esc).join(','));
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

  const Row = ({ label, value }: { label: string; value: React.ReactNode }) => (
    <div className="flex items-start justify-between gap-3 py-1.5 border-b border-white/5 last:border-b-0">
      <span className="text-[12px] font-sans text-hl-dim shrink-0">{label}</span>
      <span className="text-[13px] font-sans text-white text-right min-w-0 break-words">{value}</span>
    </div>
  );

  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
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

      {users.length > 0 && (
        <div className="relative mb-3">
          <Search className="w-4 h-4 text-hl-dim absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Suchen (Name oder E-Mail)…"
            className="w-full bg-brand-dark border border-white/10 rounded-xl pl-9 pr-3 py-2 text-sm text-white font-sans focus:outline-none focus:border-brand-accent-light placeholder:text-hl-faint"
          />
        </div>
      )}

      {users.length === 0 ? (
        <p className="text-sm text-hl-mute font-sans py-4 text-center">Noch keine Anmeldungen.</p>
      ) : (
        <div className="space-y-2">
          {shown.map((u) => {
            const open = openEmail === u.email;
            return (
              <div key={u.email} className="hl-surf-soft border border-white/10 rounded-xl overflow-hidden">
                <button onClick={() => setOpenEmail(open ? null : u.email)} className="w-full flex items-center gap-2 p-3 text-left cursor-pointer">
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="font-sans font-bold text-white truncate">{u.firstName} {u.lastName}</span>
                      {u.verified ? <CheckCircle2 className="w-3.5 h-3.5 text-brand-accent-light shrink-0" /> : <Clock className="w-3.5 h-3.5 text-hl-dim shrink-0" />}
                    </span>
                    <span className="block text-[12px] text-hl-mute font-sans truncate">{u.email}</span>
                  </span>
                  <ChevronDown className={`w-4 h-4 text-hl-dim shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
                </button>

                <AnimatePresence initial={false}>
                  {open && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.22, ease: [0.32, 0.72, 0, 1] }} style={{ overflow: 'hidden' }}>
                      <div className="px-3 pb-3">
                        <div className="rounded-lg bg-black/20 border border-white/10 px-3 py-1">
                          <Row label="Anzeigename (Rangliste)" value={u.displayName} />
                          <Row label="E-Mail" value={u.email} />
                          <Row label="Alter" value={u.age ?? '—'} />
                          <Row label="Gefunden über" value={u.foundVia || '—'} />
                          <Row label="Verbesserungsvorschlag" value={u.suggestion || '—'} />
                          <Row label="Status" value={u.verified ? 'Bestätigt' : 'Ausstehend'} />
                          <Row label="Angemeldet am" value={fmt(u.createdAt)} />
                          <Row label="E-Mail bestätigt am" value={fmt(u.verifiedAt)} />
                          <Row label="AGB akzeptiert" value={u.termsAcceptedAt ? `${u.termsVersion || '—'} · ${fmt(u.termsAcceptedAt)}` : '—'} />
                        </div>
                        <div className="flex items-center gap-2 mt-3">
                          <a
                            href={`mailto:${u.email}?subject=${encodeURIComponent('HERO League – Tippspiel')}`}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-brand-accent-light px-3 py-2 text-xs font-sans font-black uppercase tracking-wider text-[#04120d] cursor-pointer active:scale-95 transition-transform"
                          >
                            <Mail className="w-3.5 h-3.5" /> E-Mail schreiben
                          </a>
                          <button
                            onClick={() => copyEmail(u.email)}
                            className="inline-flex items-center gap-1.5 rounded-lg hl-surf-soft border border-white/10 px-3 py-2 text-xs font-sans font-bold uppercase tracking-wider text-hl-mute hover:text-white cursor-pointer active:scale-95 transition-all"
                          >
                            <Copy className="w-3.5 h-3.5" /> {copied === u.email ? 'Kopiert!' : 'E-Mail kopieren'}
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
