import { useEffect, useMemo, useState } from 'react';
import { Check, Copy, ExternalLink, Loader2, MonitorPlay, Pencil, Plus, Square, X, Zap } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { fetchStudio, fireCue, saveStudioPresets, prettyLink, STUDIO_PARTNERS, type CueBody, type CueKind, type PartnerId, type StudioPreset } from '../lib/studio';

// ===========================================================================
// Admin: „Live-Regie" für den Studio-Stream. Knöpfe drücken → das OBS-Overlay
// (/overlay/studio) zeigt die Einblendung ca. 1 Sekunde später im Stream.
// ===========================================================================

const DURATIONS = [5, 10, 15, 20, 30];
const EMOJIS = ['🔥', '⚽', '🎉', '👏', '❤️', '😂', '🏆', '💯', '😱', '🙌'];

type FormKind = 'headline' | 'lowerthird' | 'link' | 'countdown';
const FORM_KINDS: { id: FormKind; label: string; hint: string }[] = [
  { id: 'headline', label: 'Schlagzeile', hint: 'Groß in der Mitte – z. B. „Willkommen im Studio"' },
  { id: 'lowerthird', label: 'Bauchbinde', hint: 'Name + Rolle unten links – z. B. für Gäste' },
  { id: 'link', label: 'Link', hint: 'Link groß einblenden – z. B. Anmeldung oder Instagram' },
  { id: 'countdown', label: 'Countdown', hint: 'Zählt runter, am Ende „Los!" mit Konfetti' },
];

const KIND_LABEL: Record<CueKind, string> = {
  confetti: 'Konfetti',
  emoji: 'Emoji-Regen',
  headline: 'Schlagzeile',
  lowerthird: 'Bauchbinde',
  link: 'Link',
  partner: 'Partner',
  countdown: 'Countdown',
  clear: 'Gestoppt',
};

const blank = (kind: CueKind, duration: number): CueBody => ({ kind, title: '', text: '', link: '', emoji: '', partner: '', duration });

function defaultPresets(host: string, instagram: string): StudioPreset[] {
  const list: StudioPreset[] = [
    { id: 'd-welcome', label: 'Willkommen', cue: { ...blank('headline', 8), title: 'Willkommen im Studio', text: 'Hero League · Live' } },
    { id: 'd-season2', label: 'Season 2 – Anmeldung', cue: { ...blank('link', 15), title: 'Jetzt anmelden', link: `${host}/season2`, text: 'Season 2 · Die Plätze sind begrenzt' } },
    { id: 'd-web', label: 'Website', cue: { ...blank('link', 12), title: 'Alle Infos', link: host } },
    { id: 'd-chat', label: 'Schreibt in den Chat', cue: { ...blank('headline', 8), title: 'Ab in den Chat', text: 'Schreibt uns eure Fragen!' } },
  ];
  if (instagram) list.splice(2, 0, { id: 'd-insta', label: 'Instagram folgen', cue: { ...blank('link', 12), title: 'Folgt uns', link: instagram } });
  return list;
}

export default function StudioRegie() {
  const host = typeof window !== 'undefined' ? window.location.host : '';
  const base = typeof window !== 'undefined' ? window.location.origin : '';
  const [presets, setPresets] = useState<StudioPreset[] | null>(null);
  const [instagram, setInstagram] = useState('');
  const [loading, setLoading] = useState(true);
  const [duration, setDuration] = useState(10);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [running, setRunning] = useState<{ label: string; until: number } | null>(null);
  const [now, setNow] = useState(Date.now());
  const [editing, setEditing] = useState(false);
  const [customEmoji, setCustomEmoji] = useState('');
  const [preview, setPreview] = useState<'off' | 'quer' | 'hoch'>('off');
  const [copied, setCopied] = useState<string | null>(null);

  // Eigene Einblendung
  const [fk, setFk] = useState<FormKind>('headline');
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [link, setLink] = useState('');
  const [cdSec, setCdSec] = useState(10);
  const [saveName, setSaveName] = useState('');

  useEffect(() => {
    Promise.all([
      fetchStudio().catch(() => null),
      apiFetch<{ instagram?: string }>('/api/twitch?resource=social').catch(() => null),
    ]).then(([s, soc]) => {
      const raw = (soc?.instagram || '').trim();
      const m = /instagram\.com\/([^/?#]+)/i.exec(raw);
      const insta = raw ? `instagram.com/${(m ? m[1] : raw).replace(/^@/, '')}` : '';
      setInstagram(insta);
      setPresets(s?.presets ?? defaultPresets(host, insta));
      setLoading(false);
    });
  }, [host]);

  // Restzeit der laufenden Einblendung
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      setNow(Date.now());
      if (Date.now() > running.until) setRunning(null);
    }, 250);
    return () => clearInterval(id);
  }, [running]);

  const fire = async (key: string, label: string, cue: Partial<CueBody> & { kind: CueKind }) => {
    setBusy(key);
    setError('');
    try {
      const r = await fireCue(cue);
      if (cue.kind === 'clear') setRunning(null);
      else {
        const secs = cue.kind === 'confetti' ? 6 : r.cue.duration + (cue.kind === 'countdown' ? 3 : 0);
        setRunning({ label, until: Date.now() + secs * 1000 });
        setNow(Date.now());
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Hat nicht geklappt.');
    } finally {
      setTimeout(() => setBusy((b) => (b === key ? null : b)), 500);
    }
  };

  const persist = async (next: StudioPreset[]) => {
    setPresets(next);
    try {
      const r = await saveStudioPresets(next);
      setPresets(r.presets);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Speichern fehlgeschlagen.');
    }
  };

  const formCue = useMemo((): CueBody => {
    const c = blank(fk, fk === 'countdown' ? cdSec : duration);
    return { ...c, title: title.trim(), text: text.trim(), link: fk === 'link' ? link.trim() : '' };
  }, [fk, title, text, link, duration, cdSec]);
  const formOk = fk === 'link' ? !!link.trim() : fk === 'countdown' ? true : !!title.trim();

  const copy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(url);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      window.prompt('Link kopieren:', url);
    }
  };

  if (loading) return <div className="flex items-center justify-center py-6 text-hl-mute"><Loader2 className="w-5 h-5 animate-spin" /></div>;

  const left = running ? Math.max(0, Math.ceil((running.until - now) / 1000)) : 0;
  const tile =
    'relative flex flex-col items-center justify-center gap-1 rounded-2xl border px-2 py-3 min-h-[86px] text-center cursor-pointer active:scale-95 transition-transform disabled:opacity-50';
  const inputCls =
    'w-full bg-brand-dark border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white font-sans focus:outline-none focus:border-brand-accent-light placeholder:text-hl-faint';
  const sectionTitle = 'font-sans font-black uppercase tracking-[1.5px] text-[11px] text-hl-dim mb-2';
  const links = [
    { label: 'Querformat', size: '1920 × 1080', url: `${base}/overlay/studio` },
    { label: 'Hochformat', size: '1080 × 1920', url: `${base}/overlay/studio?format=hoch` },
  ];

  return (
    <div className="space-y-6 min-w-0">
      {/* OBS-Links */}
      <div>
        <p className="text-[13px] text-hl-mute font-sans leading-relaxed">
          In OBS eine Quelle <b>„Browser"</b> hinzufügen, Link einfügen, Größe wie angegeben, über die Kamera legen – der Hintergrund ist
          durchsichtig. Logo und Partner (DVAG fest, die anderen wechseln) stehen dauerhaft drin. Alles darunter löst du hier live aus.
        </p>
        <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
          {links.map((l) => (
            <div key={l.url} className="rounded-xl border border-white/10 bg-black/25 p-3 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <span className="font-display font-black uppercase tracking-tight text-white text-base">{l.label}</span>
                <span className="text-[11px] font-sans font-bold uppercase tracking-wider text-hl-dim shrink-0">{l.size}</span>
              </div>
              <div className="mt-2 truncate font-mono text-[12px] text-hl-soft bg-black/30 border border-white/10 rounded-lg px-2 py-1.5">{l.url}</div>
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  onClick={() => copy(l.url)}
                  className="inline-flex items-center gap-1 rounded-lg bg-brand-accent-light px-3 py-1.5 text-[11px] font-sans font-black uppercase tracking-wider text-[#04120d] cursor-pointer active:scale-95 transition-transform"
                >
                  {copied === l.url ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied === l.url ? 'Kopiert' : 'Link kopieren'}
                </button>
                <a
                  href={`${l.url}${l.url.includes('?') ? '&' : '?'}demo=1`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 rounded-lg border border-white/15 px-3 py-1.5 text-[11px] font-sans font-bold uppercase tracking-wider text-white hover:border-white/30"
                >
                  <ExternalLink className="w-3.5 h-3.5" /> Demo
                </a>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Status + Stopp */}
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-white/10 bg-black/30 px-4 py-3">
        <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${running ? 'bg-hl-red animate-pulse' : 'bg-hl-faint'}`} />
        <span className="flex-1 min-w-0 break-words font-sans text-sm text-white">
          {running ? (
            <>
              <b>Im Stream:</b> {running.label} <span className="text-hl-mute">· noch {left} s</span>
            </>
          ) : (
            <span className="text-hl-mute">Gerade keine Einblendung</span>
          )}
        </span>
        <button
          onClick={() => fire('clear', 'Stopp', { kind: 'clear' })}
          disabled={busy === 'clear'}
          className="inline-flex items-center gap-1.5 rounded-xl bg-hl-red px-4 py-2 text-xs font-sans font-black uppercase tracking-wider text-white cursor-pointer active:scale-95 transition-transform shrink-0"
        >
          <Square className="w-3.5 h-3.5 fill-current" /> Alles weg
        </button>
      </div>
      {error && <p className="text-sm text-hl-red-soft font-sans -mt-3">{error}</p>}

      {/* Dauer */}
      <div>
        <div className={sectionTitle}>Wie lange einblenden?</div>
        <div className="flex flex-wrap gap-2">
          {DURATIONS.map((d) => (
            <button
              key={d}
              onClick={() => setDuration(d)}
              className={`rounded-xl px-4 py-2 text-sm font-sans font-bold cursor-pointer border transition-colors ${
                duration === d ? 'bg-brand-accent-light text-[#04120d] border-brand-accent-light' : 'border-white/15 text-white hover:border-white/30'
              }`}
            >
              {d} s
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-[11.5px] text-hl-dim font-sans">Gilt für Emojis, Partner und eigene Einblendungen. Schnelltasten haben ihre eigene Dauer.</p>
      </div>

      {/* Sofort-Effekte */}
      <div>
        <div className={sectionTitle}>Sofort</div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          <button
            onClick={() => fire('confetti', 'Konfetti', { kind: 'confetti', duration: 6 })}
            className={`${tile} border-[#FFC53D]/40 bg-[linear-gradient(135deg,rgba(255,197,61,.18),rgba(232,62,140,.14))]`}
          >
            <span className="text-3xl leading-none">🎉</span>
            <span className="font-sans font-black text-sm text-white">Konfetti</span>
            {busy === 'confetti' && <Check className="absolute top-2 right-2 w-4 h-4 text-hl-green" />}
          </button>
          {(Object.keys(STUDIO_PARTNERS) as PartnerId[]).map((id) => {
            const p = STUDIO_PARTNERS[id];
            const key = `partner-${id}`;
            return (
              <button
                key={id}
                onClick={() => fire(key, `Partner: ${id === 'dvag' ? 'DVAG' : p.name}`, { kind: 'partner', partner: id, duration })}
                className={`${tile} border-white/12 bg-white/[.04]`}
              >
                <span className={`grid place-items-center h-9 px-2 rounded-lg ${p.dark ? 'bg-[#1b1a10]' : 'bg-white'}`}>
                  <img src={p.logo} alt="" className="h-6 w-auto max-w-[90px] object-contain" />
                </span>
                <span className="font-sans font-bold text-[12.5px] text-white leading-tight">{id === 'dvag' ? 'DVAG' : p.name.split(' –')[0]}</span>
                {busy === key && <Check className="absolute top-2 right-2 w-4 h-4 text-hl-green" />}
              </button>
            );
          })}
        </div>
      </div>

      {/* Emoji-Regen */}
      <div>
        <div className={sectionTitle}>Emoji-Regen</div>
        <div className="flex flex-wrap gap-2">
          {EMOJIS.map((e) => (
            <button
              key={e}
              onClick={() => fire(`emoji-${e}`, `Emoji-Regen ${e}`, { kind: 'emoji', emoji: e, duration })}
              className={`relative grid place-items-center w-14 h-14 rounded-2xl border text-[28px] cursor-pointer active:scale-90 transition-transform ${
                busy === `emoji-${e}` ? 'border-hl-green bg-hl-green/10' : 'border-white/12 bg-white/[.04] hover:border-white/30'
              }`}
            >
              {e}
            </button>
          ))}
        </div>
        <div className="mt-2 flex gap-2 max-w-sm">
          <input value={customEmoji} onChange={(e) => setCustomEmoji(e.target.value)} placeholder="Eigene Emojis, z. B. 🥳🍕" className={inputCls} maxLength={16} />
          <button
            onClick={() => customEmoji.trim() && fire('emoji-custom', `Emoji-Regen ${customEmoji.trim()}`, { kind: 'emoji', emoji: customEmoji.trim(), duration })}
            disabled={!customEmoji.trim()}
            className="shrink-0 rounded-xl border border-white/15 px-4 text-sm font-sans font-bold text-white cursor-pointer disabled:opacity-40"
          >
            Los
          </button>
        </div>
      </div>

      {/* Schnelltasten */}
      <div>
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className={sectionTitle + ' mb-0'}>Schnelltasten</div>
          {presets && presets.length > 0 && (
            <button onClick={() => setEditing((v) => !v)} className="inline-flex items-center gap-1 text-[12px] font-sans font-bold text-hl-mute hover:text-white cursor-pointer">
              {editing ? <Check className="w-3.5 h-3.5" /> : <Pencil className="w-3.5 h-3.5" />}
              {editing ? 'Fertig' : 'Bearbeiten'}
            </button>
          )}
        </div>
        {presets && presets.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
            {presets.map((p) => {
              const key = `preset-${p.id}`;
              return (
                <div key={p.id} className="relative min-w-0">
                  <button
                    onClick={() => !editing && fire(key, p.label, p.cue)}
                    className={`${tile} w-full items-start text-left px-3 border-brand-accent-light/25 bg-brand-accent-light/[.06] ${editing ? 'cursor-default' : ''}`}
                  >
                    <span className="flex items-center gap-1.5 text-[10.5px] font-sans font-black uppercase tracking-wider text-brand-accent-light">
                      <Zap className="w-3 h-3" />
                      {KIND_LABEL[p.cue.kind]} · {p.cue.duration} s
                    </span>
                    <span className="font-sans font-black text-sm text-white leading-tight w-full line-clamp-2 break-words">{p.label}</span>
                    <span className="text-[11.5px] text-hl-mute font-sans w-full truncate">
                      {p.cue.kind === 'link' ? prettyLink(p.cue.link) : p.cue.title || p.cue.text}
                    </span>
                    {busy === key && <Check className="absolute top-2 right-2 w-4 h-4 text-hl-green" />}
                  </button>
                  {editing && (
                    <button
                      onClick={() => window.confirm(`Schnelltaste „${p.label}" löschen?`) && persist(presets.filter((x) => x.id !== p.id))}
                      className="absolute -top-2 -right-2 grid place-items-center w-7 h-7 rounded-full bg-hl-red text-white cursor-pointer shadow-lg"
                      aria-label="Schnelltaste löschen"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-hl-mute font-sans">Noch keine Schnelltasten – unten eine Einblendung bauen und speichern.</p>
        )}
      </div>

      {/* Eigene Einblendung */}
      <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
        <div className={sectionTitle}>Eigene Einblendung</div>
        <div className="flex flex-wrap gap-2">
          {FORM_KINDS.map((k) => (
            <button
              key={k.id}
              onClick={() => setFk(k.id)}
              className={`rounded-xl px-3.5 py-2 text-sm font-sans font-bold cursor-pointer border transition-colors ${
                fk === k.id ? 'bg-white text-[#04120d] border-white' : 'border-white/15 text-white hover:border-white/30'
              }`}
            >
              {k.label}
            </button>
          ))}
        </div>
        <p className="mt-2 text-[12px] text-hl-mute font-sans">{FORM_KINDS.find((k) => k.id === fk)?.hint}</p>

        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
          {fk === 'link' && (
            <label className="block sm:col-span-2">
              <span className="block text-[11px] text-hl-dim font-sans font-bold uppercase tracking-wider mb-1">Link</span>
              <input value={link} onChange={(e) => setLink(e.target.value)} placeholder={`${host}/season2`} className={inputCls} />
            </label>
          )}
          <label className="block">
            <span className="block text-[11px] text-hl-dim font-sans font-bold uppercase tracking-wider mb-1">
              {fk === 'lowerthird' ? 'Name' : fk === 'link' ? 'Überschrift (optional)' : fk === 'countdown' ? 'Überschrift (optional)' : 'Titel'}
            </span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={fk === 'lowerthird' ? 'Max Mustermann' : fk === 'link' ? 'Jetzt anmelden' : fk === 'countdown' ? 'Gewinnspiel startet in' : 'Willkommen im Studio'}
              className={inputCls}
              maxLength={80}
            />
          </label>
          <label className="block">
            <span className="block text-[11px] text-hl-dim font-sans font-bold uppercase tracking-wider mb-1">
              {fk === 'lowerthird' ? 'Rolle / Info' : fk === 'countdown' ? 'Text am Ende' : 'Zusatztext (optional)'}
            </span>
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={fk === 'lowerthird' ? 'Captain · FC Beispiel' : fk === 'countdown' ? 'Los!' : 'Hero League · Live'}
              className={inputCls}
              maxLength={160}
            />
          </label>
          {fk === 'countdown' && (
            <label className="block">
              <span className="block text-[11px] text-hl-dim font-sans font-bold uppercase tracking-wider mb-1">Sekunden</span>
              <input
                type="number"
                min={3}
                max={600}
                value={cdSec}
                onChange={(e) => setCdSec(Math.max(3, Math.min(600, Number(e.target.value) || 10)))}
                className={inputCls}
              />
            </label>
          )}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            onClick={() => fire('form', title.trim() || prettyLink(link) || FORM_KINDS.find((k) => k.id === fk)!.label, formCue)}
            disabled={!formOk}
            className="inline-flex items-center gap-2 rounded-xl bg-brand-accent-light px-5 py-2.5 text-sm font-sans font-black uppercase tracking-wider text-[#04120d] cursor-pointer active:scale-95 transition-transform disabled:opacity-40"
          >
            {busy === 'form' ? <Check className="w-4 h-4" /> : <MonitorPlay className="w-4 h-4" />}
            Jetzt einblenden
          </button>
          <span className="text-[12px] text-hl-dim font-sans">{fk === 'countdown' ? `${cdSec} s` : `${duration} s`}</span>
        </div>

        <div className="mt-4 pt-4 border-t border-white/[.06] flex flex-col sm:flex-row gap-2">
          <input value={saveName} onChange={(e) => setSaveName(e.target.value)} placeholder="Name der Schnelltaste" className={inputCls} maxLength={40} />
          <button
            onClick={() => {
              const label = saveName.trim() || title.trim() || prettyLink(link);
              if (!label || !formOk) return;
              persist([...(presets ?? []), { id: `p${Date.now()}`, label, cue: formCue }]);
              setSaveName('');
            }}
            disabled={!formOk}
            className="inline-flex items-center justify-center gap-1.5 shrink-0 rounded-xl border border-white/15 px-4 py-2.5 text-sm font-sans font-bold text-white cursor-pointer hover:border-white/30 disabled:opacity-40"
          >
            <Plus className="w-4 h-4" /> Als Schnelltaste speichern
          </button>
        </div>
      </div>

      {/* Live-Vorschau */}
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <div className={sectionTitle + ' mb-0 mr-2'}>Live-Vorschau</div>
          {(['off', 'quer', 'hoch'] as const).map((v) => (
            <button
              key={v}
              onClick={() => setPreview(v)}
              className={`rounded-lg px-3 py-1.5 text-[12px] font-sans font-bold cursor-pointer border ${
                preview === v ? 'bg-white text-[#04120d] border-white' : 'border-white/15 text-white'
              }`}
            >
              {v === 'off' ? 'Aus' : v === 'quer' ? 'Querformat' : 'Hochformat'}
            </button>
          ))}
        </div>
        {preview !== 'off' && (
          <div
            className={`mt-3 relative overflow-hidden rounded-xl border border-white/10 ${preview === 'quer' ? 'w-full aspect-video' : 'w-[240px] max-w-full aspect-[9/16] mx-auto'}`}
          >
            <img src="/assets/season2-hero.webp" alt="" className="absolute inset-0 w-full h-full object-cover opacity-60" />
            <iframe
              key={preview}
              src={`/overlay/studio?format=${preview}`}
              title="Studio-Overlay Vorschau"
              className="absolute inset-0 w-full h-full border-0"
              style={{ background: 'transparent' }}
              allowTransparency
            />
          </div>
        )}
        <p className="mt-1.5 text-[11.5px] text-hl-dim font-sans">Zeigt genau das, was gerade in OBS läuft (Hintergrundbild nur als Beispiel für die Kamera).</p>
      </div>
    </div>
  );
}
