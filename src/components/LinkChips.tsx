import { useState } from 'react';
import { ExternalLink, X, Plus } from 'lucide-react';
import type { LinkItem } from '../types';

// Benannte Links als „Tasten": Man fügt eine Adresse ein und gibt ihr einen
// Namen (z.B. „Hier das Video"). Angezeigt wird nur der Name (oder der Host),
// nicht die lange URL. Klick öffnet den Link. Wird bei Aufgaben, Terminen,
// Tickets und Ideen eingesetzt. Persistenz macht der aufrufende Bereich (onChange).

const inputClass =
  'w-full hl-surf-0 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-accent-light transition-colors';

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

export default function LinkChips({
  links,
  onChange,
  editable = true,
}: {
  links: LinkItem[];
  onChange?: (links: LinkItem[]) => void;
  editable?: boolean;
}) {
  const [url, setUrl] = useState('');
  const [label, setLabel] = useState('');
  const [adding, setAdding] = useState(false);
  const list = links ?? [];
  const canEdit = editable && !!onChange;

  const add = () => {
    let u = url.trim();
    if (u && !/^https?:\/\//i.test(u)) u = 'https://' + u; // fehlendes https:// ergänzen
    if (!/^https?:\/\//i.test(u)) {
      alert('Bitte eine gültige Adresse eingeben.');
      return;
    }
    onChange?.([...list, { url: u, label: label.trim() }]);
    setUrl('');
    setLabel('');
    setAdding(false);
  };
  const remove = (i: number) => onChange?.(list.filter((_, idx) => idx !== i));

  if (!list.length && !canEdit) return null;

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {list.map((l, i) => (
          <span
            key={i}
            className="inline-flex items-center gap-1 rounded-full bg-brand-accent-light/12 border border-brand-accent-light/30 pl-2.5 pr-1 py-1 max-w-full"
          >
            <a
              href={l.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-1.5 text-brand-accent-light text-xs font-sans font-semibold hover:underline truncate max-w-[210px]"
              title={l.url}
            >
              <ExternalLink className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">{l.label || hostOf(l.url)}</span>
            </a>
            {canEdit && (
              <button
                onClick={() => remove(i)}
                className="p-0.5 rounded-full text-hl-mute hover:text-white cursor-pointer shrink-0"
                title="Link entfernen"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </span>
        ))}
        {canEdit && !adding && (
          <button
            onClick={() => setAdding(true)}
            className="inline-flex items-center gap-1 rounded-full bg-white/5 border border-white/12 px-2.5 py-1 text-xs font-sans font-semibold text-hl-mute hover:text-white cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" /> Link
          </button>
        )}
      </div>

      {canEdit && adding && (
        <div className="mt-2 space-y-2 hl-surf-soft border border-white/10 rounded-xl p-3">
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Adresse einfügen (z.B. Google-Drive-Link)" className={inputClass} autoFocus />
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Name der Taste (z.B. „Hier das Video“)" className={inputClass} />
          <div className="flex gap-2">
            <button onClick={add} className="px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider bg-brand-accent-light hover:bg-brand-accent text-white cursor-pointer">
              Hinzufügen
            </button>
            <button
              onClick={() => {
                setAdding(false);
                setUrl('');
                setLabel('');
              }}
              className="px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider bg-white/5 border border-white/10 text-hl-mute hover:text-white cursor-pointer"
            >
              Abbrechen
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
