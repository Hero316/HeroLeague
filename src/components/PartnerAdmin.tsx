import { useEffect, useState } from 'react';
import { Check, Copy, ExternalLink, Globe, Loader2, Mail, Phone, Plus, Trash2, X } from 'lucide-react';
import {
  PARTNER_TYPE_LABEL, partnerAdminDelete, partnerAdminList, partnerAdminSaveConfig, partnerAdminStatus,
  type PartnerRequest, type PartnerRequestStatus, type PartnerStat,
} from '../lib/partners';

// Backoffice: Partnerprogramm (/partner) an/aus, Kennzahlen der Landingpage
// pflegen und eingegangene Partneranfragen bearbeiten.

const STATUS: { id: PartnerRequestStatus; label: string; cls: string }[] = [
  { id: 'neu', label: 'Neu', cls: 'bg-amber-400/15 text-amber-200 border-amber-300/30' },
  { id: 'kontakt', label: 'In Kontakt', cls: 'bg-sky-400/15 text-sky-200 border-sky-300/30' },
  { id: 'abgeschlossen', label: 'Partner ✓', cls: 'bg-emerald-400/15 text-emerald-200 border-emerald-300/30' },
  { id: 'abgelehnt', label: 'Abgesagt', cls: 'bg-white/[.06] text-hl-mute border-white/15' },
];

const inp = 'w-full bg-brand-dark border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white font-sans focus:outline-none focus:border-brand-accent-light placeholder:text-hl-faint';

export default function PartnerAdmin() {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [active, setActive] = useState(false);
  const [stats, setStats] = useState<PartnerStat[]>([]);
  const [savedStats, setSavedStats] = useState('');
  const [requests, setRequests] = useState<PartnerRequest[]>([]);
  const [filter, setFilter] = useState<PartnerRequestStatus | 'alle'>('alle');
  const [busy, setBusy] = useState('');
  const [copied, setCopied] = useState(false);
  const url = `${typeof window !== 'undefined' ? window.location.origin : ''}/partner`;

  const load = () =>
    partnerAdminList()
      .then((d) => {
        setActive(d.config.active);
        setStats(d.config.stats);
        setSavedStats(JSON.stringify(d.config.stats));
        setRequests(d.requests);
      })
      .catch((e) => setErr(e instanceof Error ? e.message : 'Laden fehlgeschlagen.'))
      .finally(() => setLoading(false));
  useEffect(() => {
    void load();
  }, []);

  const toggle = async () => {
    const next = !active;
    if (next && !window.confirm('Partnerprogramm jetzt einschalten? Dann ist /partner öffentlich und der „Partner werden"-Balken erscheint auf jeder Seite.')) return;
    setBusy('toggle');
    try {
      const r = await partnerAdminSaveConfig({ active: next });
      setActive(r.active);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Speichern fehlgeschlagen.');
    } finally {
      setBusy('');
    }
  };
  const saveStats = async () => {
    setBusy('stats');
    try {
      const r = await partnerAdminSaveConfig({ stats });
      setStats(r.stats);
      setSavedStats(JSON.stringify(r.stats));
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Speichern fehlgeschlagen.');
    } finally {
      setBusy('');
    }
  };
  const setStatus = async (id: string, status: PartnerRequestStatus) => {
    setRequests((l) => l.map((r) => (r.id === id ? { ...r, status } : r)));
    try {
      await partnerAdminStatus(id, status);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Speichern fehlgeschlagen.');
      void load();
    }
  };
  const remove = async (r: PartnerRequest) => {
    if (!window.confirm(`Anfrage von „${r.company}" endgültig löschen?`)) return;
    try {
      await partnerAdminDelete(r.id);
      setRequests((l) => l.filter((x) => x.id !== r.id));
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Löschen fehlgeschlagen.');
    }
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      window.prompt('Link kopieren:', url);
    }
  };

  if (loading) return <div className="flex items-center justify-center py-6 text-hl-mute"><Loader2 className="w-5 h-5 animate-spin" /></div>;

  const shown = filter === 'alle' ? requests : requests.filter((r) => r.status === filter);
  const count = (s: PartnerRequestStatus) => requests.filter((r) => r.status === s).length;
  const statsDirty = JSON.stringify(stats) !== savedStats;

  return (
    <div className="space-y-6 min-w-0">
      {err && (
        <div className="flex items-start gap-2 rounded-xl border border-hl-red/30 bg-hl-red/10 px-3 py-2 text-sm text-hl-red-soft">
          <span className="flex-1">{err}</span>
          <button onClick={() => setErr('')} className="cursor-pointer" aria-label="Schließen"><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* An / Aus + Link */}
      <div className={`rounded-2xl border p-4 ${active ? 'border-emerald-400/30 bg-emerald-500/[.07]' : 'border-white/10 bg-black/20'}`}>
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={toggle}
            disabled={busy === 'toggle'}
            className={`relative w-12 h-7 rounded-full transition-colors cursor-pointer shrink-0 ${active ? 'bg-emerald-500' : 'bg-white/15'}`}
            aria-label="Partnerprogramm an/aus"
          >
            <span className={`absolute top-1 w-5 h-5 rounded-full bg-white transition-all ${active ? 'left-6' : 'left-1'}`} />
          </button>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-sans font-bold text-white">{active ? 'Partnerprogramm ist aktiv' : 'Partnerprogramm ist aus'}</div>
            <div className="text-[12px] text-hl-mute font-sans">
              {active ? '/partner ist öffentlich, der „Partner werden"-Balken steht auf jeder Seite.' : 'Besucher sehen nur einen Hinweis. Du als Admin siehst /partner trotzdem als Vorschau.'}
            </div>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="min-w-0 max-w-full truncate font-mono text-[12px] text-hl-soft bg-black/30 border border-white/10 rounded-lg px-2 py-1.5">{url}</span>
          <button onClick={copy} className="inline-flex items-center gap-1 rounded-lg bg-brand-accent-light px-3 py-1.5 text-[11px] font-sans font-black uppercase tracking-wider text-[#04120d] cursor-pointer">
            {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />} {copied ? 'Kopiert' : 'Link kopieren'}
          </button>
          <a href="/partner" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-lg border border-white/15 px-3 py-1.5 text-[11px] font-sans font-bold uppercase tracking-wider text-white hover:border-white/30">
            <ExternalLink className="w-3.5 h-3.5" /> Seite öffnen
          </a>
        </div>
      </div>

      {/* Anfragen */}
      <div>
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <h4 className="text-[11px] font-mono uppercase tracking-wider text-hl-dim mr-1">Partneranfragen ({requests.length})</h4>
          {(['alle', ...STATUS.map((s) => s.id)] as const).map((id) => (
            <button
              key={id}
              onClick={() => setFilter(id)}
              className={`rounded-full px-3 py-1 text-[12px] font-sans font-bold border cursor-pointer ${filter === id ? 'bg-white text-[#04120d] border-white' : 'border-white/15 text-hl-soft'}`}
            >
              {id === 'alle' ? 'Alle' : STATUS.find((s) => s.id === id)!.label} {id !== 'alle' && count(id) > 0 ? `· ${count(id)}` : ''}
            </button>
          ))}
        </div>
        {shown.length === 0 ? (
          <p className="text-sm text-hl-mute font-sans rounded-xl border border-white/10 bg-black/20 px-4 py-6 text-center">
            {requests.length ? 'Keine Anfragen in diesem Filter.' : 'Noch keine Anfragen. Sobald jemand das Formular auf /partner abschickt, steht es hier – und ihr bekommt eine E-Mail.'}
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-3">
            {shown.map((r) => {
              const st = STATUS.find((s) => s.id === r.status) ?? STATUS[0];
              return (
                <div key={r.id} className="rounded-2xl border border-white/10 bg-black/25 p-4 min-w-0">
                  <div className="flex flex-wrap items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="font-sans font-black text-white text-[16px] break-words">{r.company}</div>
                      <div className="text-[12.5px] text-hl-mute font-sans">
                        {r.contact} · {new Date(r.createdAt).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                    <span className="shrink-0 rounded-full border border-[#F2C14E]/40 bg-[#F2C14E]/10 px-2.5 py-1 text-[11px] font-sans font-black uppercase tracking-wider text-[#F2C14E]">
                      {PARTNER_TYPE_LABEL[r.type] ?? r.type}
                    </span>
                    <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-sans font-bold ${st.cls}`}>{st.label}</span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <a href={`mailto:${r.email}`} className="inline-flex items-center gap-1.5 rounded-lg border border-white/12 px-2.5 py-1.5 text-[12.5px] text-white hover:border-white/30 min-w-0 max-w-full">
                      <Mail className="w-3.5 h-3.5 shrink-0" /> <span className="truncate">{r.email}</span>
                    </a>
                    {r.phone && (
                      <a href={`tel:${r.phone.replace(/\s+/g, '')}`} className="inline-flex items-center gap-1.5 rounded-lg border border-white/12 px-2.5 py-1.5 text-[12.5px] text-white hover:border-white/30">
                        <Phone className="w-3.5 h-3.5" /> {r.phone}
                      </a>
                    )}
                    {r.website && (
                      <a href={r.website} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-white/12 px-2.5 py-1.5 text-[12.5px] text-white hover:border-white/30 min-w-0 max-w-full">
                        <Globe className="w-3.5 h-3.5 shrink-0" /> <span className="truncate">{r.website.replace(/^https?:\/\//, '')}</span>
                      </a>
                    )}
                    {r.budget && <span className="inline-flex items-center rounded-lg bg-white/[.05] px-2.5 py-1.5 text-[12.5px] text-hl-soft">Budget: {r.budget}</span>}
                  </div>
                  <p className="mt-3 text-[13.5px] text-hl-soft font-sans leading-relaxed whitespace-pre-wrap break-words">{r.message}</p>
                  <div className="mt-3 pt-3 border-t border-white/[.06] flex flex-wrap items-center gap-2">
                    {STATUS.map((s) => (
                      <button
                        key={s.id}
                        onClick={() => setStatus(r.id, s.id)}
                        className={`rounded-lg px-2.5 py-1.5 text-[12px] font-sans font-bold border cursor-pointer ${r.status === s.id ? s.cls : 'border-white/10 text-hl-mute hover:text-white'}`}
                      >
                        {s.label}
                      </button>
                    ))}
                    <div className="flex-1" />
                    <button onClick={() => remove(r)} className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[12px] font-sans font-bold text-hl-red-soft hover:bg-hl-red/10 cursor-pointer">
                      <Trash2 className="w-3.5 h-3.5" /> Löschen
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Kennzahlen */}
      <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
        <h4 className="text-[11px] font-mono uppercase tracking-wider text-hl-dim">Zahlen auf der Partner-Seite</h4>
        <p className="mt-1 text-[12px] text-hl-mute font-sans">Die erste Zahl steht groß (Instagram). Bitte regelmäßig aktualisieren – z. B. einmal im Monat aus den Instagram-Insights und der Website-Statistik.</p>
        <div className="mt-3 space-y-2.5">
          {stats.map((s, i) => (
            <div key={i} className="grid grid-cols-[1fr_64px_32px] sm:grid-cols-[120px_64px_1fr_1fr_32px] gap-2 items-center">
              <input type="number" min={0} value={s.value} onChange={(e) => setStats((l) => l.map((x, j) => (j === i ? { ...x, value: Number(e.target.value) || 0 } : x)))} className={inp} aria-label="Zahl" />
              <input value={s.suffix} onChange={(e) => setStats((l) => l.map((x, j) => (j === i ? { ...x, suffix: e.target.value } : x)))} placeholder="+" className={inp} aria-label="Zusatz" maxLength={6} />
              <button onClick={() => setStats((l) => l.filter((_, j) => j !== i))} className="sm:order-last grid place-items-center w-8 h-8 rounded-lg text-hl-mute hover:text-hl-red-soft cursor-pointer" aria-label="Zahl entfernen">
                <X className="w-4 h-4" />
              </button>
              <input value={s.label} onChange={(e) => setStats((l) => l.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} placeholder="Aufrufe auf Instagram" className={`${inp} col-span-3 sm:col-span-1`} maxLength={60} />
              <input value={s.sub} onChange={(e) => setStats((l) => l.map((x, j) => (j === i ? { ...x, sub: e.target.value } : x)))} placeholder="in den letzten 30 Tagen" className={`${inp} col-span-3 sm:col-span-1`} maxLength={60} />
            </div>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {stats.length < 8 && (
            <button onClick={() => setStats((l) => [...l, { value: 0, suffix: '+', label: '', sub: 'in den letzten 30 Tagen' }])} className="inline-flex items-center gap-1.5 rounded-xl border border-white/15 px-3 py-2 text-[12.5px] font-sans font-bold text-white cursor-pointer">
              <Plus className="w-4 h-4" /> Zahl hinzufügen
            </button>
          )}
          <button
            onClick={saveStats}
            disabled={!statsDirty || busy === 'stats'}
            className="inline-flex items-center gap-1.5 rounded-xl bg-brand-accent-light px-4 py-2 text-[12.5px] font-sans font-black uppercase tracking-wider text-[#04120d] cursor-pointer disabled:opacity-40"
          >
            {busy === 'stats' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Zahlen speichern
          </button>
        </div>
      </div>
    </div>
  );
}
