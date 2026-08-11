import React, { useRef, useState } from 'react';
import Avatar from './Avatar';

// Textfeld mit @-Erwähnung (Auswahlliste wie im Chat). Kontrolliert über value/onChange.
// onEnter (optional) sendet bei Enter ohne Shift – solange keine Erwähnungsliste offen ist.
export default function MentionTextarea({
  value,
  onChange,
  mentionable,
  placeholder,
  rows = 2,
  className = '',
  onEnter,
  onPaste,
}: {
  value: string;
  onChange: (v: string) => void;
  mentionable: { id: string; name: string }[];
  placeholder?: string;
  rows?: number;
  className?: string;
  onEnter?: () => void;
  onPaste?: (e: React.ClipboardEvent) => void;
}) {
  const [query, setQuery] = useState<string | null>(null);
  const ref = useRef<HTMLTextAreaElement>(null);

  const change = (val: string) => {
    onChange(val);
    const m = /@([^\s@]*)$/.exec(val);
    setQuery(m ? m[1].toLowerCase() : null);
  };
  const matches = query !== null ? mentionable.filter((mm) => mm.name.toLowerCase().includes(query)).slice(0, 6) : [];
  const pick = (name: string) => {
    onChange(value.replace(/@([^\s@]*)$/, `@${name} `));
    setQuery(null);
    ref.current?.focus();
  };

  return (
    <div className="relative">
      {matches.length > 0 && (
        <div className="absolute bottom-full left-0 mb-1.5 w-56 bg-[#0f1614] border border-white/15 rounded-xl shadow-2xl shadow-black/50 overflow-hidden z-20">
          {matches.map((mm) => (
            <button
              key={mm.id}
              type="button"
              onClick={() => pick(mm.name)}
              className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-white/[.05] cursor-pointer"
            >
              <Avatar name={mm.name} size={22} />
              <span className="text-sm text-hl-soft truncate">{mm.name}</span>
            </button>
          ))}
        </div>
      )}
      <textarea
        ref={ref}
        value={value}
        onChange={(e) => change(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            if (matches.length > 0) {
              e.preventDefault();
              pick(matches[0].name);
              return;
            }
            if (onEnter) {
              e.preventDefault();
              onEnter();
            }
          }
        }}
        onPaste={onPaste}
        rows={rows}
        placeholder={placeholder}
        className={className}
      />
    </div>
  );
}
