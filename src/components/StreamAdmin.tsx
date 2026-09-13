import { useEffect, useState } from 'react';
import { Loader2, Check, Twitch } from 'lucide-react';
import type { StreamsConfig } from '../types';
import { fetchStreams, saveStreams, fetchLeagueStreams, saveLeagueStreams } from '../lib/streams';

// Admin: die beiden Streams (Feld 1 / Feld 2) konfigurieren.
// variant='event'  → Testspieltag-Kanäle (Settings-Key 'streams')
// variant='league' → echte Liga-Kanäle   (Settings-Key 'leagueStreams')
export default function StreamAdmin({ variant = 'event' }: { variant?: 'event' | 'league' }) {
  const load = variant === 'league' ? fetchLeagueStreams : fetchStreams;
  const persist: (cfg: StreamsConfig) => Promise<StreamsConfig> = variant === 'league' ? saveLeagueStreams : saveStreams;
  const context = variant === 'league' ? 'die echte Liga' : 'den Testspieltag';

  const [active, setActive] = useState(false);
  const [field1, setField1] = useState('');
  const [field2, setField2] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    load()
      .then((c) => { setActive(!!c.active); setField1(c.field1 || ''); setField2(c.field2 || ''); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [variant]);

  const save = async (nextActive?: boolean) => {
    const a = nextActive ?? active;
    setSaving(true);
    setSaved(false);
    try {
      const c = await persist({ active: a, field1: field1.trim(), field2: field2.trim() });
      setActive(!!c.active); setField1(c.field1 || ''); setField2(c.field2 || '');
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="flex items-center justify-center py-6 text-hl-mute"><Loader2 className="w-5 h-5 animate-spin" /></div>;

  const inputCls = 'w-full bg-brand-dark border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white font-sans focus:outline-none focus:border-brand-accent-light placeholder:text-hl-faint';

  return (
    <div>
      <p className="text-[13px] text-hl-mute font-sans mb-4 leading-relaxed">
        Zwei parallele Twitch-Streams für {context} (Feld 1 &amp; Feld 2). Trage nur den <b>Kanalnamen</b> ein
        (nicht die ganze URL), z. B. <span className="font-mono text-hl-soft">heroleague1</span>. Das Live-Scoreboard
        (Teams, Tore, Minute) erscheint automatisch über dem Bild, sobald der Schiedsrichter das Spiel auf dem Feld live
        schaltet.
      </p>

      <div className="flex items-center justify-between gap-3 hl-surf-soft border border-white/10 rounded-xl px-4 py-3 mb-4">
        <div className="min-w-0">
          <div className="text-sm font-sans font-bold text-white">Streams anzeigen</div>
          <div className="text-[12px] text-hl-mute font-sans">Blendet den Live-Bereich auf der Startseite ein.</div>
        </div>
        <button
          onClick={() => save(!active)}
          disabled={saving}
          className={`shrink-0 relative w-12 h-7 rounded-full transition-colors cursor-pointer ${active ? 'bg-brand-accent-light' : 'bg-white/15'}`}
          aria-pressed={active}
        >
          <span className={`absolute top-0.5 left-0.5 w-6 h-6 rounded-full bg-white transition-transform ${active ? 'translate-x-5' : ''}`} />
        </button>
      </div>

      <div className="space-y-3">
        <div>
          <label className="flex items-center gap-1.5 text-[12px] font-sans font-bold uppercase tracking-wider text-hl-dim mb-1">
            <Twitch className="w-3.5 h-3.5" style={{ color: '#9147FF' }} /> Feld 1 – Twitch-Kanal
          </label>
          <input value={field1} onChange={(e) => setField1(e.target.value)} placeholder="z. B. heroleague1" className={inputCls} />
        </div>
        <div>
          <label className="flex items-center gap-1.5 text-[12px] font-sans font-bold uppercase tracking-wider text-hl-dim mb-1">
            <Twitch className="w-3.5 h-3.5" style={{ color: '#9147FF' }} /> Feld 2 – Twitch-Kanal
          </label>
          <input value={field2} onChange={(e) => setField2(e.target.value)} placeholder="z. B. heroleague2" className={inputCls} />
        </div>
      </div>

      <button
        onClick={() => save()}
        disabled={saving}
        className="mt-4 w-full inline-flex items-center justify-center gap-2 rounded-xl bg-brand-accent-light px-4 py-2.5 text-sm font-sans font-black uppercase tracking-wider text-[#04120d] cursor-pointer active:scale-[0.98] transition-transform disabled:opacity-60"
      >
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <Check className="w-4 h-4" /> : null}
        {saved ? 'Gespeichert' : 'Kanäle speichern'}
      </button>
    </div>
  );
}
