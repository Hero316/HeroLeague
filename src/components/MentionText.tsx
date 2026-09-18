import React, { useMemo } from 'react';

// ===========================================================================
// Nachrichtentext mit sichtbaren @Erwähnungen.
// Bisher stand eine Erwähnung als grauer Fließtext in der Blase – man sah also
// nicht, dass überhaupt jemand angesprochen wurde („das @ macht ja nichts").
// Hier wird jeder erkannte Name farbig hervorgehoben; die EIGENE Erwähnung
// bekommt zusätzlich eine gefüllte Pille, damit sie im Verlauf sofort auffällt.
//
// Erkannt wird genau das, was der Server auch als Erwähnung wertet:
// „@alle" (bzw. @all/@everyone/@channel/@team) und die Namen aus der Liste –
// voller Name sowie eindeutiger Vorname. Längere Namen gewinnen, damit
// „@Timo Berg" nicht als „@Timo" endet.
// ===========================================================================

export const EVERYONE_RE = /^(alle|all|everyone|channel|team)$/i;

// Kandidaten-Labels in absteigender Länge – einmal pro Namensliste berechnet.
function buildLabels(names: string[]): string[] {
  const firstCount = new Map<string, number>();
  for (const n of names) {
    const full = n.trim().toLowerCase();
    const first = full.split(/\s+/)[0];
    if (first && first !== full) firstCount.set(first, (firstCount.get(first) ?? 0) + 1);
  }
  const out = new Set<string>();
  for (const n of names) {
    const full = n.trim().toLowerCase();
    if (!full) continue;
    out.add(full);
    const first = full.split(/\s+/)[0];
    if (first && first !== full && firstCount.get(first) === 1) out.add(first);
  }
  return [...out].sort((a, b) => b.length - a.length);
}

type Part = { text: string; mention: null | 'other' | 'me' | 'all' };

function split(text: string, labels: string[], myLabels: Set<string>): Part[] {
  const parts: Part[] = [];
  let buf = '';
  let i = 0;
  const lower = text.toLowerCase();
  while (i < text.length) {
    if (text[i] === '@') {
      // „@alle" zuerst, danach den längsten passenden Namen suchen.
      const word = /^@([\p{L}\p{N}_]+)/u.exec(text.slice(i));
      let hit: { len: number; kind: Part['mention'] } | null = null;
      if (word && EVERYONE_RE.test(word[1])) hit = { len: word[0].length, kind: 'all' };
      if (!hit) {
        for (const label of labels) {
          if (lower.startsWith(label, i + 1)) {
            hit = { len: label.length + 1, kind: myLabels.has(label) ? 'me' : 'other' };
            break;
          }
        }
      }
      if (hit) {
        if (buf) { parts.push({ text: buf, mention: null }); buf = ''; }
        parts.push({ text: text.slice(i, i + hit.len), mention: hit.kind });
        i += hit.len;
        continue;
      }
    }
    buf += text[i];
    i++;
  }
  if (buf) parts.push({ text: buf, mention: null });
  return parts;
}

export default function MentionText({
  text,
  names,
  myName,
  mine = false,
  className = '',
}: {
  text: string;
  names: string[]; // Anzeigenamen aller Beteiligten
  myName?: string; // eigener Anzeigename (wird stärker hervorgehoben)
  mine?: boolean; // eigene (türkise) Blase ⇒ hellere Farbwelt
  className?: string;
}) {
  const labels = useMemo(() => buildLabels(names), [names]);
  const myLabels = useMemo(() => {
    const set = new Set<string>();
    const full = (myName ?? '').trim().toLowerCase();
    if (full) {
      set.add(full);
      const first = full.split(/\s+/)[0];
      if (first && labels.includes(first)) set.add(first);
    }
    return set;
  }, [myName, labels]);
  const parts = useMemo(() => split(text, labels, myLabels), [text, labels, myLabels]);

  return (
    <p className={className}>
      {parts.map((p, idx) => {
        if (!p.mention) return <React.Fragment key={idx}>{p.text}</React.Fragment>;
        // Mich selbst (oder „@alle") = gefüllte Pille, sonst nur farbig & fett.
        const strong = p.mention === 'me' || p.mention === 'all';
        if (strong) {
          return (
            <span
              key={idx}
              className={`inline rounded px-1 py-px font-semibold ${
                mine ? 'bg-white/25 text-white' : 'bg-brand-accent-light/25 text-brand-accent-light'
              }`}
            >
              {p.text}
            </span>
          );
        }
        return (
          <span key={idx} className={`font-semibold ${mine ? 'text-white/85' : 'text-brand-accent-light/90'}`}>
            {p.text}
          </span>
        );
      })}
    </p>
  );
}
