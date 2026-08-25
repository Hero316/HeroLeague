import { useMemo, useState } from 'react';
import { FlaskConical, Plus, Check, Trophy, Trash2, Rocket, Users } from 'lucide-react';
import type { Season, Team } from '../types';

// ===========================================================================
// „Season 2 (Entwurf) vorbereiten" – Admin-Sektion für das Mehr-Saison-System.
// Legt eine versteckte Entwurf-Saison an, ordnet ihr Teams zu (aus einer
// bestehenden Saison übernehmen ODER neu anlegen, z.B. Black Eagle) und
// veröffentlicht sie später (= live schalten). Öffentlich bleibt bis dahin
// alles unsichtbar. Bewusst als eigene Komponente, um das große AdminPanel
// nicht anzufassen.
// ===========================================================================

interface Props {
  seasons: Season[]; // alle inkl. Entwurf
  teams: Team[]; // alle echten Vereine (voller Pool)
  currentSeason: Season | null; // aktuelle/live Saison (Quelle zum Übernehmen)
  currentSeasonName: string;
  defaultLabel: string; // Vorschlag für den Entwurf-Namen (z.B. „SEASON TWO")
  onCreateDraft: (label: string) => Promise<boolean>;
  onPublish: (id: string) => Promise<boolean>;
  onDeleteDraft: (id: string) => Promise<boolean>;
  onAddTeam: (teamId: string, seasonId: string) => Promise<boolean>;
  onRemoveTeam: (teamId: string, seasonId: string) => Promise<boolean>;
  onCreateTeam: (team: Omit<Team, 'id'>, seasonId: string) => Promise<boolean>;
}

const isMemberOf = (t: Team, seasonId: string) => Array.isArray(t.seasonIds) && t.seasonIds.includes(seasonId);

export default function SeasonDraftManager({
  seasons,
  teams,
  currentSeason,
  currentSeasonName,
  defaultLabel,
  onCreateDraft,
  onPublish,
  onDeleteDraft,
  onAddTeam,
  onRemoveTeam,
  onCreateTeam,
}: Props) {
  const draft = useMemo(() => seasons.find((s) => s.draft) ?? null, [seasons]);
  const [label, setLabel] = useState(defaultLabel);
  const [busy, setBusy] = useState(false);

  // Neuer Verein (für die Entwurf-Saison)
  const [nName, setNName] = useState('');
  const [nShort, setNShort] = useState('');
  const [nColor, setNColor] = useState('#2F5BFF');
  const [nIcon, setNIcon] = useState('⚽');

  const sortedTeams = useMemo(() => [...teams].sort((a, b) => a.name.localeCompare(b.name)), [teams]);

  const run = async (fn: () => Promise<boolean>) => {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };

  // --- Entwurf anlegen ------------------------------------------------------
  if (!draft) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-hl-mute leading-relaxed">
          Bereite eine neue Saison im Hintergrund vor – <b>öffentlich unsichtbar</b>, bis du sie veröffentlichst. Danach kannst du in
          Ruhe Teams (auch neue wie „Black Eagle") und deren Kader/Logos einpflegen. Season 1 bleibt völlig unberührt.
        </p>
        <div className="hl-card p-4 flex flex-col sm:flex-row items-stretch sm:items-end gap-3">
          <label className="flex-1 min-w-0">
            <span className="block text-[11px] font-bold uppercase tracking-wider text-hl-dim mb-1">Name der neuen Saison</span>
            <input value={label} onChange={(e) => setLabel(e.target.value)} className="hl-input w-full px-3 py-2 rounded-xl text-sm font-semibold" />
          </label>
          <button
            onClick={() => label.trim() && run(() => onCreateDraft(label.trim()))}
            disabled={busy || !label.trim()}
            className="px-5 py-2.5 rounded-xl font-bold text-white flex items-center justify-center gap-2 cursor-pointer active:scale-95 transition disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg,#2F5BFF,#16277A)' }}
          >
            <FlaskConical className="w-4 h-4" /> Als Entwurf anlegen
          </button>
        </div>
      </div>
    );
  }

  // --- Entwurf vorhanden ----------------------------------------------------
  const members = sortedTeams.filter((t) => isMemberOf(t, draft.id));
  const currentTeams = currentSeason ? sortedTeams.filter((t) => isMemberOf(t, currentSeason.id)) : [];
  const missingFromCurrent = currentTeams.filter((t) => !isMemberOf(t, draft.id));

  const copyAllFromCurrent = async () => {
    setBusy(true);
    try {
      for (const t of missingFromCurrent) {
        await onAddTeam(t.id, draft.id);
      }
    } finally {
      setBusy(false);
    }
  };

  const createTeam = async () => {
    if (!nName.trim() || !nShort.trim()) return;
    setBusy(true);
    try {
      const ok = await onCreateTeam(
        { name: nName.trim(), shortName: nShort.trim().toUpperCase(), logoColor: nColor, logoIcon: nIcon || '⚽', logoUrl: '', spielerliste: [] },
        draft.id
      );
      if (ok) {
        setNName('');
        setNShort('');
        setNIcon('⚽');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Kopf */}
      <div className="hl-card p-4 flex flex-wrap items-center gap-3">
        <div className="w-9 h-9 rounded-xl grid place-items-center shrink-0" style={{ background: 'rgba(47,91,255,.15)', border: '1px solid rgba(47,91,255,.35)' }}>
          <FlaskConical className="w-4 h-4" style={{ color: '#6E8BFF' }} />
        </div>
        <div className="min-w-0">
          <div className="font-display font-black uppercase tracking-tight">{draft.label}</div>
          <div className="text-[11px] uppercase tracking-wider text-hl-dim">Entwurf · öffentlich unsichtbar · {members.length} Team(s)</div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => {
              if (window.confirm(`„${draft.label}" jetzt VERÖFFENTLICHEN und live schalten? Sie wird damit zur aktuellen Saison und ist öffentlich sichtbar.`))
                run(() => onPublish(draft.id));
            }}
            disabled={busy}
            className="px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider text-white flex items-center gap-1.5 cursor-pointer active:scale-95 transition disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg,#22c55e,#16a34a)' }}
          >
            <Rocket className="w-3.5 h-3.5" /> Veröffentlichen
          </button>
          <button
            onClick={() => {
              if (window.confirm(`Entwurf „${draft.label}" verwerfen? Die vorbereiteten Zuordnungen und der Spielplan dieser Entwurf-Saison gehen verloren (Vereine bleiben erhalten).`))
                run(() => onDeleteDraft(draft.id));
            }}
            disabled={busy}
            title="Entwurf verwerfen"
            className="w-9 h-9 grid place-items-center rounded-xl border border-white/10 bg-white/5 hover:bg-hl-red/15 hover:border-hl-red/40 hover:text-hl-red cursor-pointer disabled:opacity-50"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Teams übernehmen */}
      {currentSeason && (
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={copyAllFromCurrent}
            disabled={busy || missingFromCurrent.length === 0}
            className="px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider border border-white/10 bg-white/5 hover:bg-white/10 flex items-center gap-2 cursor-pointer disabled:opacity-50"
          >
            <Users className="w-3.5 h-3.5" />
            Alle Teams aus {currentSeasonName || 'Season 1'} übernehmen
            {missingFromCurrent.length > 0 && <span className="text-hl-faint">(+{missingFromCurrent.length})</span>}
          </button>
          <span className="text-[11px] text-hl-dim">Häkchen = gehört zu {draft.label}. Antippen zum Hinzufügen/Entfernen.</span>
        </div>
      )}

      {/* Team-Liste mit Zugehörigkeit */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {sortedTeams.map((t) => {
          const member = isMemberOf(t, draft.id);
          return (
            <button
              key={t.id}
              onClick={() => run(() => (member ? onRemoveTeam(t.id, draft.id) : onAddTeam(t.id, draft.id)))}
              disabled={busy}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-xl border text-left transition-colors cursor-pointer disabled:opacity-60 ${
                member ? 'border-hl-green/40 bg-hl-green/10' : 'border-white/10 bg-white/[.03] hover:bg-white/[.06]'
              }`}
            >
              <span
                className="w-6 h-6 rounded-full grid place-items-center text-[13px] shrink-0 overflow-hidden"
                style={{ background: t.logoColor }}
              >
                {t.logoUrl ? <img src={t.logoUrl} alt="" className="w-full h-full object-cover" /> : t.logoIcon}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold text-sm truncate">{t.name}</span>
                <span className="block text-[10px] uppercase tracking-wider text-hl-dim truncate">{t.shortName}</span>
              </span>
              <span
                className={`w-5 h-5 rounded grid place-items-center shrink-0 border ${
                  member ? 'bg-hl-green/20 border-hl-green/50 text-hl-green' : 'border-white/15 text-transparent'
                }`}
              >
                <Check className="w-3.5 h-3.5" />
              </span>
            </button>
          );
        })}
      </div>

      {/* Neuen Verein für die Entwurf-Saison anlegen */}
      <div className="hl-card p-4">
        <div className="flex items-center gap-2 mb-3">
          <Trophy className="w-4 h-4 text-hl-mute" />
          <span className="font-display font-black uppercase tracking-tight text-sm">Neuen Verein anlegen (nur {draft.label})</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <input value={nName} onChange={(e) => setNName(e.target.value)} placeholder="Vereinsname (z.B. Black Eagle)" className="hl-input px-3 py-2 rounded-xl text-sm" />
          <input value={nShort} onChange={(e) => setNShort(e.target.value.toUpperCase())} placeholder="Kürzel (z.B. BLE)" maxLength={5} className="hl-input px-3 py-2 rounded-xl text-sm" />
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-xs text-hl-mute">
              Farbe
              <input type="color" value={nColor} onChange={(e) => setNColor(e.target.value)} className="w-9 h-9 rounded-lg border border-white/10 bg-transparent cursor-pointer" />
            </label>
            <label className="flex items-center gap-2 text-xs text-hl-mute">
              Emoji
              <input value={nIcon} onChange={(e) => setNIcon(e.target.value.slice(0, 2))} className="hl-input w-14 px-2 py-2 rounded-lg text-center text-lg" />
            </label>
          </div>
          <button
            onClick={createTeam}
            disabled={busy || !nName.trim() || !nShort.trim()}
            className="px-4 py-2 rounded-xl font-bold text-white flex items-center justify-center gap-2 cursor-pointer active:scale-95 transition disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg,#2F5BFF,#16277A)' }}
          >
            <Plus className="w-4 h-4" /> Verein anlegen
          </button>
        </div>
        <p className="text-[11px] text-hl-dim mt-3 leading-relaxed">
          Logo (Bild), Kader &amp; Trikotnummern setzt du danach wie gewohnt unter „Club &amp; Kader bearbeiten" – der neue Verein taucht dort
          sofort auf. Ein dort gesetztes Logo erscheint automatisch auch im Testspieltag (Namens-Abgleich).
        </p>
      </div>
    </div>
  );
}
