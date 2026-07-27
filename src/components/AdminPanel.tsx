import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Shield, Plus, Check, Upload, Award, Trash2, CalendarPlus, Camera, X, Radio, Sparkles, Share2, Zap } from 'lucide-react';
import { Player, Team, Match, EventConfig } from '../types';
import { apiFetch, uploadImage } from '../lib/api';
import PlayerAvatar from './PlayerAvatar';
import { AccordionSection } from './ui';

function ImageUploader({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (url: string) => void;
}) {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  const handleFile = async (file: File) => {
    setIsUploading(true);
    try {
      onChange(await uploadImage(file));
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Fehler beim Bild-Upload.');
    } finally {
      setIsUploading(false);
    }
  };

  const pickFile = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/png,image/jpeg,image/webp,image/gif';
    input.onchange = () => {
      const file = input.files?.[0];
      if (file) handleFile(file);
    };
    input.click();
  };

  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-mono text-gray-400 uppercase tracking-wider">{label}</label>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          const file = e.dataTransfer.files?.[0];
          if (file) handleFile(file);
        }}
        className={`relative border-2 border-dashed rounded-xl p-4 transition-all flex flex-col items-center justify-center cursor-pointer ${
          isDragging ? 'border-brand-accent-light bg-brand-accent/10' : 'border-white/10 hover:border-white/20 bg-[#060E0F]/40'
        }`}
        onClick={pickFile}
      >
        {isUploading ? (
          <div className="flex flex-col items-center py-2">
            <div className="animate-spin rounded-full h-5 w-5 border-2 border-brand-accent-light border-t-transparent mb-1.5" />
            <span className="text-[10px] text-gray-400 font-mono">Lädt hoch...</span>
          </div>
        ) : value ? (
          <div className="flex items-center gap-3 w-full">
            <img src={value} alt="Vorschau" className="w-10 h-10 rounded object-contain bg-white/5 border border-white/10 shrink-0" referrerPolicy="no-referrer" />
            <div className="flex-1 min-w-0">
              <span className="text-[10px] text-gray-400 font-mono block truncate">{value}</span>
              <span className="text-[9px] text-brand-accent-light hover:underline block mt-0.5">Anderes Bild wählen</span>
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onChange('');
              }}
              title="Bild entfernen"
              aria-label="Bild entfernen"
              className="shrink-0 p-1.5 rounded-md text-gray-400 hover:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <div className="text-center py-1.5 flex flex-col items-center justify-center">
            <Upload className="w-4 h-4 text-brand-accent-light mb-1" />
            <span className="text-brand-accent-light text-[11px] block font-semibold">Bild hochladen</span>
            <span className="text-[9px] text-gray-500 block mt-0.5">Drag & Drop oder Klick (max. 3 MB)</span>
          </div>
        )}
      </div>
    </div>
  );
}

// Kader-Editor: Spieler mit Name + optionalem Foto
function RosterEditor({
  roster,
  teamColor,
  onChange,
}: {
  roster: Player[];
  teamColor: string;
  onChange: (roster: Player[]) => void;
}) {
  const [uploadingIndex, setUploadingIndex] = useState<number | null>(null);

  const updatePlayer = (index: number, patch: Partial<Player>) => {
    onChange(roster.map((p, i) => (i === index ? { ...p, ...patch } : p)));
  };

  const handlePhoto = (index: number) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/png,image/jpeg,image/webp,image/gif';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      setUploadingIndex(index);
      try {
        updatePlayer(index, { imageUrl: await uploadImage(file) });
      } catch (err) {
        alert(err instanceof Error ? err.message : 'Fehler beim Bild-Upload.');
      } finally {
        setUploadingIndex(null);
      }
    };
    input.click();
  };

  return (
    <div className="space-y-2">
      {roster.map((player, index) => (
        <div key={index} className="flex items-center gap-2 bg-[#060E0F]/60 border border-white/5 rounded-lg px-2.5 py-2">
          <PlayerAvatar name={player.name || '?'} imageUrl={player.imageUrl} color={teamColor} size="sm" />
          <input
            type="text"
            value={player.name}
            placeholder="Spielername"
            onChange={(e) => updatePlayer(index, { name: e.target.value })}
            className="flex-1 min-w-0 bg-transparent border-b border-white/10 focus:border-brand-accent-light px-1 py-1 text-sm text-white focus:outline-none"
          />
          <button
            type="button"
            onClick={() => handlePhoto(index)}
            disabled={uploadingIndex === index}
            title="Spielerfoto hochladen"
            className="shrink-0 p-1.5 text-gray-400 hover:text-brand-accent-light hover:bg-white/5 rounded-md transition-colors cursor-pointer disabled:opacity-40"
          >
            {uploadingIndex === index ? (
              <span className="block w-4 h-4 border-2 border-brand-accent-light border-t-transparent rounded-full animate-spin" />
            ) : (
              <Camera className="w-4 h-4" />
            )}
          </button>
          {player.imageUrl && (
            <button
              type="button"
              onClick={() => updatePlayer(index, { imageUrl: undefined })}
              title="Foto entfernen"
              className="shrink-0 p-1.5 text-gray-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-md transition-colors cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            type="button"
            onClick={() => onChange(roster.filter((_, i) => i !== index))}
            title="Spieler entfernen"
            className="shrink-0 p-1.5 text-gray-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-md transition-colors cursor-pointer"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...roster, { name: '' }])}
        className="w-full flex items-center justify-center gap-1.5 border border-dashed border-white/15 hover:border-brand-accent-light/50 text-gray-400 hover:text-brand-accent-light rounded-lg py-2 text-xs font-mono uppercase tracking-wider transition-colors cursor-pointer"
      >
        <Plus className="w-3.5 h-3.5" />
        Spieler hinzufügen
      </button>
    </div>
  );
}

interface AdminPanelProps {
  teams: Team[];
  matches: Match[];
  currentSeasonLabel: string;
  isSuperadmin: boolean;
  onAddTeam: (team: Omit<Team, 'id'>) => Promise<boolean>;
  onEditTeam: (teamId: string, updatedData: Partial<Team>) => Promise<boolean>;
  onDeleteTeam: (teamId: string) => Promise<boolean>;
  onStartSeason: (label: string) => Promise<boolean>;
  demoActive: boolean;
  onToggleDemo: () => Promise<boolean>;
}

const MONTH_NAMES = [
  'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
];

// Pro-Spieler-Monatswerte (Tore/Vorlagen) aus den Torschützen-/Vorlagendaten.
// Nutzt den aktuellen Kalendermonat; gibt es dort keine Daten, den jüngsten Monat mit Spielen.
function monthPlayerStats(matches: Match[]) {
  const withGoals = matches.filter(
    (m) => (m.status === 'beendet' || m.status === 'live') && Array.isArray(m.scorers) && m.scorers.length > 0
  );
  if (withGoals.length === 0) return null;

  const monthOf = (d: string) => (d || '').slice(0, 7); // 'YYYY-MM'
  const now = new Date();
  const currentKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const monthKeys = Array.from(new Set(withGoals.map((m) => monthOf(m.date))));
  const key = monthKeys.includes(currentKey) ? currentKey : monthKeys.sort().reverse()[0];

  const monthMatches = withGoals.filter((m) => monthOf(m.date) === key);
  // Verschlüsselt nach Team UND Name, damit gleiche Namen in verschiedenen Teams
  // nicht verschmelzen (Schlüssel: `teamId::name`).
  const byName: Record<string, { name: string; teamId: string; goals: number; assists: number }> = {};
  const bump = (name: string, teamId: string, field: 'goals' | 'assists') => {
    if (!name || name === 'Eigentor' || name === 'Unbekannt') return;
    const k = `${teamId}::${name}`;
    if (!byName[k]) byName[k] = { name, teamId, goals: 0, assists: 0 };
    byName[k][field] += 1;
  };

  monthMatches.forEach((m) =>
    (m.scorers || []).forEach((s) => {
      bump(s.playerName, s.teamId, 'goals');
      if (s.assistName) bump(s.assistName, s.teamId, 'assists');
    })
  );

  const [y, mm] = key.split('-');
  return { byName, key, monthLabel: `${MONTH_NAMES[parseInt(mm, 10) - 1]} ${y}` };
}

// Ermittelt den besten Spieler eines Monats (Tore zählen doppelt, Vorlagen einfach).
function computeMonthPom(matches: Match[], teams: Team[]) {
  const month = monthPlayerStats(matches);
  if (!month) return null;

  const ranked = Object.values(month.byName).sort(
    (a, b) => b.goals * 2 + b.assists - (a.goals * 2 + a.assists) || b.goals - a.goals
  );
  const top = ranked[0];
  if (!top) return null;

  const team = teams.find((t) => t.id === top.teamId);
  return {
    name: top.name,
    teamId: top.teamId,
    teamName: team?.name ?? '',
    goals: top.goals,
    assists: top.assists,
    imageUrl: team?.spielerliste?.find((p) => p.name === top.name)?.imageUrl ?? '',
    monthLabel: month.monthLabel,
  };
}

// Vorschlag für das Label der Folgesaison: "2026/27" -> "2027/28"
function suggestNextSeasonLabel(current: string): string {
  const match = current.match(/^(\d{4})\/(\d{2})$/);
  if (!match) return '';
  const startYear = parseInt(match[1], 10) + 1;
  return `${startYear}/${String((startYear + 1) % 100).padStart(2, '0')}`;
}

export default function AdminPanel({
  teams,
  matches,
  currentSeasonLabel,
  isSuperadmin,
  onAddTeam,
  onEditTeam,
  onDeleteTeam,
  onStartSeason,
  demoActive,
  onToggleDemo,
}: AdminPanelProps) {
  const [isTogglingDemo, setIsTogglingDemo] = useState(false);
  const colors = [
    { name: 'Blau', hex: '#3B82F6' },
    { name: 'Gelb', hex: '#F59E0B' },
    { name: 'Rot', hex: '#EF4444' },
    { name: 'Grün', hex: '#10B981' },
    { name: 'Lila', hex: '#8B5CF6' },
    { name: 'Cyan', hex: '#06B6D4' },
    { name: 'Pink', hex: '#EC4899' },
    { name: 'Teal', hex: '#14B8A6' },
    { name: 'Orange', hex: '#F97316' },
  ];
  const emojis = ['🛡️', '🦁', '🦅', '🐻', '🔥', '⚓', '🐝', '🐂', '⚽', '🏆', '⚡', '🌟', '🦄'];

  // Neuen Club anlegen
  const [newTeamName, setNewTeamName] = useState('');
  const [newTeamShort, setNewTeamShort] = useState('');
  const [newTeamColor, setNewTeamColor] = useState('#3B82F6');
  const [newTeamEmoji, setNewTeamEmoji] = useState('🛡️');
  const [formSuccess, setFormSuccess] = useState(false);

  // Club bearbeiten
  const [selectedEditTeamId, setSelectedEditTeamId] = useState('');
  const [editTeamName, setEditTeamName] = useState('');
  const [editTeamShort, setEditTeamShort] = useState('');
  const [editTeamColor, setEditTeamColor] = useState('#3B82F6');
  const [editTeamEmoji, setEditTeamEmoji] = useState('🛡️');
  const [editTeamLogoUrl, setEditTeamLogoUrl] = useState('');
  const [editTeamRoster, setEditTeamRoster] = useState<Player[]>([]);
  const [editSuccess, setEditSuccess] = useState(false);

  // Spieler des Monats
  const [pomName, setPomName] = useState('');
  const [pomClub, setPomClub] = useState('');
  const [pomTeamId, setPomTeamId] = useState('');
  const [pomGoals, setPomGoals] = useState(0);
  const [pomAssists, setPomAssists] = useState(0);
  const [pomImage, setPomImage] = useState('');
  const [pomSuccess, setPomSuccess] = useState(false);
  const [pomAutoNote, setPomAutoNote] = useState('');

  // Monatswerte pro Spieler (für automatische Tore/Vorlagen bei Spielerauswahl)
  const pomMonth = useMemo(() => monthPlayerStats(matches), [matches]);
  const pomTeam = useMemo(() => teams.find((t) => t.id === pomTeamId) ?? null, [teams, pomTeamId]);

  // Verein wählen: setzt Team + Vereinsname, Spieler wird zurückgesetzt
  const handleSelectPomTeam = (teamId: string) => {
    setPomTeamId(teamId);
    setPomClub(teams.find((t) => t.id === teamId)?.name ?? '');
    setPomName('');
    setPomAutoNote('');
  };

  // Spieler aus dem Kader wählen: Name + Foto + Monats-Tore/-Vorlagen automatisch
  const handleSelectPomPlayer = (name: string) => {
    setPomName(name);
    const rosterImg = pomTeam?.spielerliste?.find((p) => p.name === name)?.imageUrl;
    if (rosterImg) setPomImage(rosterImg);
    const stat = pomMonth?.byName[`${pomTeamId}::${name}`];
    setPomGoals(stat?.goals ?? 0);
    setPomAssists(stat?.assists ?? 0);
    setPomAutoNote('');
  };

  // Twitch-Livestream (manueller Schalter)
  const [twitchChannel, setTwitchChannel] = useState('');
  const [twitchLive, setTwitchLive] = useState(false);
  const [twitchSuccess, setTwitchSuccess] = useState(false);

  // Social-Media-Links (Instagram / TikTok / YouTube)
  const [socialInstagram, setSocialInstagram] = useState('');
  const [socialTiktok, setSocialTiktok] = useState('');
  const [socialYoutube, setSocialYoutube] = useState('');
  const [socialSuccess, setSocialSuccess] = useState(false);

  // Sonder-Event (Testspieltag)
  const [eventCfg, setEventCfg] = useState<EventConfig | null>(null);
  const [eventSuccess, setEventSuccess] = useState(false);

  // Neue Saison starten
  const [seasonModalOpen, setSeasonModalOpen] = useState(false);
  const [newSeasonLabel, setNewSeasonLabel] = useState('');
  const [isStartingSeason, setIsStartingSeason] = useState(false);

  useEffect(() => {
    apiFetch<{ name: string; club: string; teamId?: string; goals: number; assists: number; image: string }>('/api/player-of-the-month')
      .then((data) => {
        setPomName(data.name || '');
        setPomClub(data.club || '');
        setPomTeamId(data.teamId || '');
        setPomGoals(data.goals || 0);
        setPomAssists(data.assists || 0);
        setPomImage(data.image || '');
      })
      .catch(() => {
        // Noch kein Spieler des Monats gepflegt
      });
  }, []);

  const handleSavePom = async () => {
    if (!pomName.trim()) {
      alert('Bitte einen Spieler-Namen eingeben.');
      return;
    }
    try {
      await apiFetch('/api/player-of-the-month', {
        method: 'POST',
        body: JSON.stringify({
          name: pomName.trim(),
          club: pomClub.trim(),
          teamId: pomTeamId,
          goals: Number(pomGoals),
          assists: Number(pomAssists),
          image: pomImage,
        }),
      });
      setPomSuccess(true);
      setTimeout(() => setPomSuccess(false), 3000);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Fehler beim Speichern.');
    }
  };

  // Auszeichnung komplett entfernen: leert Formular + Datenbank -> Karte verschwindet von der Startseite.
  const handleClearPom = async () => {
    if (!window.confirm('Spieler des Monats wirklich entfernen? Die Karte verschwindet dann von der Startseite.')) return;
    try {
      await apiFetch('/api/player-of-the-month', { method: 'DELETE' });
      setPomName('');
      setPomClub('');
      setPomTeamId('');
      setPomGoals(0);
      setPomAssists(0);
      setPomImage('');
      setPomAutoNote('');
      setPomSuccess(true);
      setTimeout(() => setPomSuccess(false), 3000);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Fehler beim Entfernen.');
    }
  };

  // Spieler des Monats automatisch aus den Monatsdaten vorbefüllen (manuell weiter editierbar)
  const handleAutoPom = () => {
    const res = computeMonthPom(matches, teams);
    if (!res) {
      alert('Keine Tordaten für eine automatische Berechnung gefunden. Trage zuerst Ergebnisse mit Torschützen ein.');
      return;
    }
    setPomName(res.name);
    setPomClub(res.teamName);
    setPomTeamId(res.teamId);
    setPomGoals(res.goals);
    setPomAssists(res.assists);
    if (res.imageUrl) setPomImage(res.imageUrl);
    setPomAutoNote(
      `Automatisch berechnet für ${res.monthLabel}: ${res.name} (${res.goals} Tore, ${res.assists} Vorlagen). Noch speichern nicht vergessen.`
    );
  };

  // Twitch-Konfiguration laden
  useEffect(() => {
    apiFetch<{ channel: string; isLive: boolean }>('/api/twitch')
      .then((data) => {
        setTwitchChannel(data.channel || '');
        setTwitchLive(Boolean(data.isLive));
      })
      .catch(() => {
        /* noch nicht konfiguriert */
      });
  }, []);

  const handleSaveTwitch = async (nextLive?: boolean) => {
    const isLive = typeof nextLive === 'boolean' ? nextLive : twitchLive;
    try {
      const saved = await apiFetch<{ channel: string; isLive: boolean }>('/api/twitch', {
        method: 'POST',
        body: JSON.stringify({ channel: twitchChannel.trim(), isLive }),
      });
      setTwitchChannel(saved.channel || '');
      setTwitchLive(Boolean(saved.isLive));
      setTwitchSuccess(true);
      setTimeout(() => setTwitchSuccess(false), 3000);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Fehler beim Speichern.');
    }
  };

  // Social-Media-Links laden
  useEffect(() => {
    apiFetch<{ instagram: string; tiktok: string; youtube: string }>('/api/twitch?resource=social')
      .then((data) => {
        setSocialInstagram(data.instagram || '');
        setSocialTiktok(data.tiktok || '');
        setSocialYoutube(data.youtube || '');
      })
      .catch(() => {
        /* noch nicht konfiguriert */
      });
  }, []);

  const handleSaveSocial = async () => {
    try {
      const saved = await apiFetch<{ instagram: string; tiktok: string; youtube: string }>('/api/twitch?resource=social', {
        method: 'POST',
        body: JSON.stringify({
          instagram: socialInstagram.trim(),
          tiktok: socialTiktok.trim(),
          youtube: socialYoutube.trim(),
        }),
      });
      setSocialInstagram(saved.instagram || '');
      setSocialTiktok(saved.tiktok || '');
      setSocialYoutube(saved.youtube || '');
      setSocialSuccess(true);
      setTimeout(() => setSocialSuccess(false), 3000);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Fehler beim Speichern.');
    }
  };

  // Sonder-Event laden
  useEffect(() => {
    apiFetch<EventConfig>('/api/twitch?resource=event')
      .then((data) => setEventCfg(data))
      .catch(() => {
        /* noch nichts hinterlegt */
      });
  }, []);

  const patchEvent = (patch: Partial<EventConfig>) => setEventCfg((e) => (e ? { ...e, ...patch } : e));
  const patchEventMatch = (id: string, patch: Partial<EventConfig['matches'][number]>) =>
    setEventCfg((e) => (e ? { ...e, matches: e.matches.map((m) => (m.id === id ? { ...m, ...patch } : m)) } : e));

  const saveEventCfg = async (override?: EventConfig) => {
    const cfg = override ?? eventCfg;
    if (!cfg) return;
    try {
      const saved = await apiFetch<EventConfig>('/api/twitch?resource=event', {
        method: 'POST',
        body: JSON.stringify(cfg),
      });
      setEventCfg(saved);
      setEventSuccess(true);
      setTimeout(() => setEventSuccess(false), 3000);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Fehler beim Speichern.');
    }
  };

  // Schalter an/aus – speichert sofort, damit es direkt live wirkt.
  const toggleEventActive = () => {
    if (!eventCfg) return;
    saveEventCfg({ ...eventCfg, active: !eventCfg.active });
  };

  const clearEventResults = () => {
    if (!eventCfg) return;
    if (!window.confirm('Alle eingetragenen Ergebnisse dieses Events zurücksetzen?')) return;
    setEventCfg({ ...eventCfg, matches: eventCfg.matches.map((m) => ({ ...m, homeScore: null, awayScore: null })) });
  };

  const handleSubmitTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTeamName.trim() || !newTeamShort.trim()) {
      alert('Bitte alle Felder ausfüllen.');
      return;
    }
    if (teams.some((t) => t.shortName.toUpperCase() === newTeamShort.trim().toUpperCase())) {
      alert('Ein Club mit diesem Kürzel existiert bereits!');
      return;
    }

    const ok = await onAddTeam({
      name: newTeamName.trim(),
      shortName: newTeamShort.trim().toUpperCase(),
      logoColor: newTeamColor,
      logoIcon: newTeamEmoji,
      logoUrl: '',
      spielerliste: [],
    });

    if (ok) {
      setNewTeamName('');
      setNewTeamShort('');
      setFormSuccess(true);
      setTimeout(() => setFormSuccess(false), 3000);
    }
  };

  const handleSelectTeamToEdit = (teamId: string) => {
    setSelectedEditTeamId(teamId);
    const team = teams.find((t) => t.id === teamId);
    setEditTeamName(team?.name ?? '');
    setEditTeamShort(team?.shortName ?? '');
    setEditTeamColor(team?.logoColor ?? '#3B82F6');
    setEditTeamEmoji(team?.logoIcon ?? '🛡️');
    setEditTeamLogoUrl(team?.logoUrl ?? '');
    setEditTeamRoster(team?.spielerliste ? [...team.spielerliste] : []);
  };

  const handleSaveTeamEdit = async () => {
    if (!selectedEditTeamId || !editTeamName.trim() || !editTeamShort.trim()) {
      alert('Bitte Name und Kürzel ausfüllen.');
      return;
    }

    const roster = editTeamRoster
      .map((p) => ({ ...p, name: p.name.trim() }))
      .filter((p) => p.name.length > 0);

    const ok = await onEditTeam(selectedEditTeamId, {
      name: editTeamName.trim(),
      shortName: editTeamShort.trim().toUpperCase(),
      logoColor: editTeamColor,
      logoIcon: editTeamEmoji,
      logoUrl: editTeamLogoUrl.trim(),
      spielerliste: roster,
    });

    if (ok) {
      setEditTeamRoster(roster);
      setEditSuccess(true);
      setTimeout(() => setEditSuccess(false), 3000);
    }
  };

  const handleDeleteTeam = async () => {
    const team = teams.find((t) => t.id === selectedEditTeamId);
    if (!team) return;
    if (
      confirm(
        `"${team.name}" wirklich löschen?\n\nAlle Spiele dieses Vereins (inkl. Ergebnisse) werden mitgelöscht und die Tabelle neu berechnet. Das kann nicht rückgängig gemacht werden.`
      )
    ) {
      const ok = await onDeleteTeam(team.id);
      if (ok) handleSelectTeamToEdit('');
    }
  };

  const openSeasonModal = () => {
    setNewSeasonLabel(suggestNextSeasonLabel(currentSeasonLabel));
    setSeasonModalOpen(true);
  };

  const handleStartSeason = async () => {
    if (!newSeasonLabel.trim()) {
      alert('Bitte ein Saison-Label angeben (z.B. "2027/28").');
      return;
    }
    setIsStartingSeason(true);
    const ok = await onStartSeason(newSeasonLabel.trim());
    setIsStartingSeason(false);
    if (ok) setSeasonModalOpen(false);
  };

  const inputClass =
    'w-full bg-[#060E0F] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-brand-accent-light';

  return (
    <>
      {/* Bestätigungsdialog: Neue Saison starten */}
      <AnimatePresence>
        {seasonModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md"
          >
            <motion.div
              initial={{ scale: 0.95, y: 15 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 15 }}
              className="relative w-full max-w-md bg-[#130B24] border-2 border-brand-accent-light/30 rounded-2xl p-6 sm:p-8 shadow-2xl overflow-hidden"
            >
              <div className="absolute top-0 left-0 right-0 h-1 bg-brand-accent-light" />

              <div className="flex items-center gap-3 text-brand-accent-light mb-4">
                <CalendarPlus className="w-7 h-7 shrink-0" />
                <h3 className="font-display font-black text-lg sm:text-xl uppercase tracking-tight">
                  Neue Saison starten
                </h3>
              </div>

              <p className="text-xs text-gray-300 font-sans leading-relaxed mb-4">
                Die aktuelle Saison <strong className="text-white">{currentSeasonLabel}</strong> wird archiviert: Alle
                Ergebnisse und Statistiken bleiben erhalten und sind über den Saison-Umschalter weiter einsehbar. Die
                Vereine und Kader werden übernommen — der Spielplan der neuen Saison startet leer.
              </p>

              <label className="block text-xs font-mono text-gray-400 mb-1.5 uppercase tracking-wider">
                Label der neuen Saison
              </label>
              <input
                type="text"
                placeholder='z.B. "2027/28"'
                value={newSeasonLabel}
                onChange={(e) => setNewSeasonLabel(e.target.value)}
                className={`${inputClass} font-mono mb-6`}
              />

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setSeasonModalOpen(false)}
                  className="flex-1 py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-xs font-bold uppercase text-gray-300 transition-all cursor-pointer"
                >
                  Abbrechen
                </button>
                <button
                  type="button"
                  disabled={isStartingSeason || !newSeasonLabel.trim()}
                  onClick={handleStartSeason}
                  className="flex-1 py-3 bg-brand-accent-light hover:bg-brand-accent disabled:opacity-30 text-white font-bold uppercase rounded-xl text-xs tracking-wider transition-all cursor-pointer flex items-center justify-center space-x-1.5"
                >
                  <Check className="w-4 h-4" />
                  <span>{isStartingSeason ? 'Starte...' : 'Saison starten'}</span>
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Klubs registrieren & bearbeiten (nur Super-Admin) */}
      {isSuperadmin && (
      <AccordionSection
        id="clubs"
        title="Klubs registrieren & bearbeiten"
        subtitle="Neue Vereine anlegen · Kader, Logos, Farben & Wappen pflegen"
        icon={<Shield className="w-5 h-5" />}
      >
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      <div className="lg:col-span-5">
        <div>
          <h3 className="font-display font-bold text-lg uppercase tracking-tight text-white mb-5 flex items-center gap-2">
            <Plus className="w-5 h-5 text-brand-accent-light" />
            Neuen Club registrieren
          </h3>

          <form onSubmit={handleSubmitTeam} className="space-y-4">
            <div>
              <label className="block text-xs font-mono text-gray-400 mb-1.5 uppercase tracking-wider">CLUB-NAME</label>
              <input
                type="text"
                required
                placeholder="z.B. Phönix Leverkusen"
                value={newTeamName}
                onChange={(e) => setNewTeamName(e.target.value)}
                className={inputClass}
              />
            </div>

            <div>
              <label className="block text-xs font-mono text-gray-400 mb-1.5 uppercase tracking-wider">
                ABKÜRZUNG (MAX 3 BUCHSTABEN)
              </label>
              <input
                type="text"
                required
                maxLength={3}
                placeholder="z.B. PHO"
                value={newTeamShort}
                onChange={(e) => setNewTeamShort(e.target.value)}
                className={`${inputClass} uppercase font-mono`}
              />
            </div>

            <div>
              <label className="block text-xs font-mono text-gray-400 mb-2 uppercase tracking-wider">CLUB-AKZENTFARBE</label>
              <div className="flex flex-wrap gap-2">
                {colors.map((color) => (
                  <button
                    key={color.hex}
                    type="button"
                    onClick={() => setNewTeamColor(color.hex)}
                    className={`w-8 h-8 rounded-full border transition-all duration-150 cursor-pointer ${
                      newTeamColor === color.hex ? 'border-white scale-110 shadow-lg' : 'border-transparent opacity-60 hover:opacity-100'
                    }`}
                    style={{ backgroundColor: color.hex }}
                    title={color.name}
                  />
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-mono text-gray-400 mb-2 uppercase tracking-wider">WAPPEN-SYMBOL (EMOJI)</label>
              <div className="flex flex-wrap gap-2">
                {emojis.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => setNewTeamEmoji(emoji)}
                    className={`w-9 h-9 rounded-xl flex items-center justify-center text-lg border transition-all duration-150 cursor-pointer ${
                      newTeamEmoji === emoji
                        ? 'bg-brand-accent/20 border-brand-accent-light text-white scale-105'
                        : 'bg-[#060E0F] border-white/10 hover:bg-white/5 text-gray-300'
                    }`}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>

            <button
              type="submit"
              className="w-full px-6 py-3.5 bg-brand-accent-light hover:bg-brand-accent rounded-full text-xs font-bold uppercase tracking-wider transition-all duration-300 shadow-lg shadow-brand-accent-light/25 cursor-pointer text-white flex items-center justify-center space-x-2 mt-6"
            >
              <Check className="w-4 h-4" />
              <span>Verein eintragen</span>
            </button>

            {formSuccess && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-center text-xs text-emerald-400 uppercase tracking-wider"
              >
                ✓ Club erfolgreich hinzugefügt!
              </motion.div>
            )}
          </form>
        </div>
      </div>

      {/* Club & Kader bearbeiten */}
      <div className="lg:col-span-7">
        <div>
          <h3 className="font-display font-bold text-lg uppercase tracking-tight text-white mb-4 flex items-center gap-2">
            <Shield className="w-5 h-5 text-brand-accent-light" />
            Club & Kader bearbeiten
          </h3>
          <p className="text-xs text-gray-400 font-sans mb-6">
            Wähle einen Club, um Name, Kürzel, Farbe, Wappen, Logo und den Kader (inkl. Spielerfotos) anzupassen.
          </p>

          <div className="space-y-5">
            <div>
              <label className="block text-xs font-mono text-gray-400 mb-1.5 uppercase tracking-wider">CLUB WÄHLEN</label>
              <select
                value={selectedEditTeamId}
                onChange={(e) => handleSelectTeamToEdit(e.target.value)}
                className={`${inputClass} cursor-pointer`}
              >
                <option value="">-- Club auswählen --</option>
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.logoIcon} {t.name} ({t.shortName})
                  </option>
                ))}
              </select>
            </div>

            {selectedEditTeamId && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-mono text-gray-400 mb-1.5 uppercase tracking-wider">CLUB-NAME</label>
                  <input type="text" value={editTeamName} onChange={(e) => setEditTeamName(e.target.value)} className={inputClass} />
                </div>

                <div>
                  <label className="block text-xs font-mono text-gray-400 mb-1.5 uppercase tracking-wider">KÜRZEL</label>
                  <input
                    type="text"
                    maxLength={3}
                    value={editTeamShort}
                    onChange={(e) => setEditTeamShort(e.target.value)}
                    className={`${inputClass} uppercase font-mono`}
                  />
                </div>

                <div>
                  <label className="block text-xs font-mono text-gray-400 mb-2 uppercase tracking-wider">WAPPEN-SYMBOL (EMOJI)</label>
                  <div className="flex flex-wrap gap-1.5">
                    {emojis.map((emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() => setEditTeamEmoji(emoji)}
                        className={`w-8 h-8 rounded-lg flex items-center justify-center text-base border transition-all duration-150 cursor-pointer ${
                          editTeamEmoji === emoji
                            ? 'bg-brand-accent/20 border-brand-accent-light text-white scale-105'
                            : 'bg-[#060E0F] border-white/10 hover:bg-white/5 text-gray-300'
                        }`}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-mono text-gray-400 mb-1.5 uppercase tracking-wider">VEREINSFARBE</label>
                  <div className="flex items-center space-x-3">
                    <input
                      type="color"
                      value={editTeamColor}
                      onChange={(e) => setEditTeamColor(e.target.value)}
                      className="w-10 h-10 bg-transparent border-0 cursor-pointer rounded-lg overflow-hidden shrink-0"
                    />
                    <div className="flex flex-wrap gap-1">
                      {colors.map((color) => (
                        <button
                          key={color.hex}
                          type="button"
                          onClick={() => setEditTeamColor(color.hex)}
                          className={`w-6 h-6 rounded-full border transition-all duration-150 cursor-pointer ${
                            editTeamColor === color.hex ? 'border-white scale-110 shadow' : 'border-transparent opacity-60 hover:opacity-100'
                          }`}
                          style={{ backgroundColor: color.hex }}
                          title={color.name}
                        />
                      ))}
                    </div>
                  </div>
                </div>

                <div className="md:col-span-2">
                  <ImageUploader label="Vereinslogo (Upload)" value={editTeamLogoUrl} onChange={setEditTeamLogoUrl} />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-xs font-mono text-gray-400 mb-1.5 uppercase tracking-wider">
                    SPIELER-KADER (MIT OPTIONALEM FOTO)
                  </label>
                  <RosterEditor roster={editTeamRoster} teamColor={editTeamColor} onChange={setEditTeamRoster} />
                  <p className="text-[10px] text-gray-400 font-sans mt-1.5">
                    Diese Spieler stehen im Spielplan zur Torschützen- und Vorlagen-Zuweisung bereit.
                  </p>
                </div>

                <div className="md:col-span-2 flex flex-wrap items-center justify-between gap-3 mt-2">
                  <button
                    type="button"
                    onClick={handleDeleteTeam}
                    className="px-4 py-2.5 bg-rose-950/40 hover:bg-rose-900/50 border border-rose-500/30 text-rose-300 rounded-full text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>Verein löschen</span>
                  </button>

                  <div className="flex items-center gap-3">
                    {editSuccess && (
                      <motion.span
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="text-xs text-emerald-400 uppercase tracking-wider font-mono"
                      >
                        ✓ Gespeichert!
                      </motion.span>
                    )}
                    <button
                      type="button"
                      onClick={handleSaveTeamEdit}
                      className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 rounded-full text-xs font-bold uppercase tracking-wider transition-all text-white flex items-center gap-1.5 cursor-pointer"
                    >
                      <Check className="w-4 h-4" />
                      <span>Änderungen speichern</span>
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      </div>
      </AccordionSection>
      )}

      {/* Spieler des Monats */}
      <AccordionSection
        id="pom"
        title="Spieler des Monats konfigurieren"
        subtitle="Auszeichnung, Verein, Leistungsdaten & Portraitfoto"
        icon={<Award className="w-5 h-5" />}
        accent="#E9C46A"
      >
        <div>
          <p className="text-xs text-gray-400 font-sans mb-4">
            Bestimme den ausgezeichneten Spieler, seinen Verein, die Leistungsdaten und lade sein Portraitfoto hoch —
            erscheint prominent auf der Startseite.
          </p>

          <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-6">
            <button
              type="button"
              onClick={handleAutoPom}
              className="shrink-0 inline-flex items-center gap-1.5 px-4 py-2 bg-brand-accent-light/15 hover:bg-brand-accent-light/25 border border-brand-accent-light/40 text-brand-accent-light rounded-lg text-xs font-bold uppercase tracking-wider transition-all cursor-pointer"
            >
              <Sparkles className="w-4 h-4" />
              <span>Aus Monatsdaten berechnen</span>
            </button>
            {pomAutoNote && (
              <span className="text-xs text-emerald-400 font-sans">{pomAutoNote}</span>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
            <div>
              <label className="block text-xs font-mono text-gray-400 mb-1.5 uppercase tracking-wider">VEREIN</label>
              <select
                value={pomTeamId}
                onChange={(e) => handleSelectPomTeam(e.target.value)}
                className={`${inputClass} cursor-pointer`}
              >
                <option value="">-- Verein auswählen --</option>
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.logoIcon} {t.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-mono text-gray-400 mb-1.5 uppercase tracking-wider">SPIELER</label>
              {pomTeam && (pomTeam.spielerliste?.length ?? 0) > 0 ? (
                <select
                  value={pomName}
                  onChange={(e) => handleSelectPomPlayer(e.target.value)}
                  className={`${inputClass} cursor-pointer`}
                >
                  <option value="">-- Spieler auswählen --</option>
                  {(pomTeam.spielerliste || []).map((p) => (
                    <option key={p.name} value={p.name}>
                      {p.name}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  value={pomName}
                  onChange={(e) => setPomName(e.target.value)}
                  placeholder={pomTeamId ? 'Kader leer – Name eintippen' : 'Zuerst Verein wählen'}
                  className={inputClass}
                />
              )}
            </div>

            <div>
              <label className="block text-xs font-mono text-gray-400 mb-1.5 uppercase tracking-wider">TORE IM MONAT</label>
              <input type="number" min={0} value={pomGoals} onChange={(e) => setPomGoals(Number(e.target.value))} className={inputClass} />
            </div>

            <div>
              <label className="block text-xs font-mono text-gray-400 mb-1.5 uppercase tracking-wider">VORLAGEN IM MONAT</label>
              <input type="number" min={0} value={pomAssists} onChange={(e) => setPomAssists(Number(e.target.value))} className={inputClass} />
            </div>

            <div className="md:col-span-2">
              <ImageUploader label="Spieler-Portraitfoto — am besten freigestellt (transparenter Hintergrund)" value={pomImage} onChange={setPomImage} />
            </div>

            <div className="md:col-span-2 flex items-center justify-end gap-3 pb-1">
              {pomSuccess && (
                <motion.span
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="text-xs text-emerald-400 uppercase tracking-wider font-mono mr-2"
                >
                  ✓ Erfolgreich aktualisiert!
                </motion.span>
              )}
              <button
                type="button"
                onClick={handleClearPom}
                className="px-4 py-3 bg-transparent hover:bg-red-500/10 border border-red-500/30 hover:border-red-500/50 text-red-300 rounded-full text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
                <span>Auszeichnung entfernen</span>
              </button>
              <button
                type="button"
                onClick={handleSavePom}
                className="px-6 py-3 bg-brand-accent hover:bg-brand-accent/80 border border-brand-accent-light/30 rounded-full text-xs font-bold uppercase tracking-wider transition-all text-white flex items-center gap-1.5 cursor-pointer shadow-lg shadow-brand-accent-light/10"
              >
                <Check className="w-4 h-4" />
                <span>Spieler auszeichnen</span>
              </button>
            </div>
          </div>
        </div>
      </AccordionSection>

      {/* Twitch-Livestream & Social Media */}
      <AccordionSection
        id="twitch"
        title="Twitch & Social Media"
        subtitle="Twitch-Kanal, Live-Banner & Social-Media-Links"
        icon={<Radio className="w-5 h-5" />}
        accent="#9147ff"
      >
        <div>
          <p className="text-xs text-gray-400 font-sans mb-6">
            Trage deinen Twitch-Kanal ein und schalte das Live-Banner an, sobald der Stream läuft. Ist der Schalter aus,
            erscheint auf der Website kein Banner.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
            <div className="md:col-span-2">
              <label className="block text-xs font-mono text-gray-400 mb-1.5 uppercase tracking-wider">TWITCH-KANAL</label>
              <input
                type="text"
                value={twitchChannel}
                onChange={(e) => setTwitchChannel(e.target.value)}
                placeholder="z.B. heroleague"
                className={inputClass}
              />
            </div>

            <div>
              <label className="block text-xs font-mono text-gray-400 mb-1.5 uppercase tracking-wider">LIVE-STATUS</label>
              <button
                type="button"
                onClick={() => handleSaveTwitch(!twitchLive)}
                className={`w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg text-xs font-bold uppercase tracking-wider transition-all cursor-pointer border ${
                  twitchLive
                    ? 'bg-red-500/20 text-red-300 border-red-500/40'
                    : 'bg-[#060E0F]/60 text-gray-400 border-white/10 hover:text-white hover:border-white/20'
                }`}
              >
                <span className="relative flex h-2 w-2">
                  {twitchLive && (
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                  )}
                  <span className={`relative inline-flex rounded-full h-2 w-2 ${twitchLive ? 'bg-red-500' : 'bg-gray-500'}`} />
                </span>
                {twitchLive ? 'LIVE – Banner aktiv' : 'Offline (Banner aus)'}
              </button>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 mt-4">
            {twitchSuccess && (
              <motion.span
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-xs text-emerald-400 uppercase tracking-wider font-mono mr-2"
              >
                ✓ Gespeichert!
              </motion.span>
            )}
            <button
              type="button"
              onClick={() => handleSaveTwitch()}
              className="px-6 py-3 bg-brand-accent hover:bg-brand-accent/80 border border-brand-accent-light/30 rounded-full text-xs font-bold uppercase tracking-wider transition-all text-white flex items-center gap-1.5 cursor-pointer shadow-lg shadow-brand-accent-light/10"
            >
              <Check className="w-4 h-4" />
              <span>Kanal speichern</span>
            </button>
          </div>

          {/* Social-Media-Links – im selben Abschnitt gepflegt */}
          <div className="mt-8 pt-6 border-t border-white/10">
            <div className="flex items-center gap-2 mb-1.5">
              <Share2 className="w-4 h-4 text-brand-accent-light" />
              <h4 className="text-sm font-bold text-white font-sans">Social-Media-Links</h4>
            </div>
            <p className="text-xs text-gray-400 font-sans mb-5">
              Trage die Links zu euren Kanälen ein. Jeder ausgefüllte Link erscheint als anklickbares Symbol oben in der
              Navigation (auf Handy und PC). Leer lassen blendet das jeweilige Symbol aus.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-mono text-gray-400 mb-1.5 uppercase tracking-wider">INSTAGRAM</label>
                <input
                  type="text"
                  value={socialInstagram}
                  onChange={(e) => setSocialInstagram(e.target.value)}
                  placeholder="z.B. instagram.com/heroleague"
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-xs font-mono text-gray-400 mb-1.5 uppercase tracking-wider">TIKTOK</label>
                <input
                  type="text"
                  value={socialTiktok}
                  onChange={(e) => setSocialTiktok(e.target.value)}
                  placeholder="z.B. tiktok.com/@heroleague"
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-xs font-mono text-gray-400 mb-1.5 uppercase tracking-wider">YOUTUBE</label>
                <input
                  type="text"
                  value={socialYoutube}
                  onChange={(e) => setSocialYoutube(e.target.value)}
                  placeholder="z.B. youtube.com/@heroleague"
                  className={inputClass}
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 mt-4">
              {socialSuccess && (
                <motion.span
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="text-xs text-emerald-400 uppercase tracking-wider font-mono mr-2"
                >
                  ✓ Gespeichert!
                </motion.span>
              )}
              <button
                type="button"
                onClick={handleSaveSocial}
                className="px-6 py-3 bg-brand-accent hover:bg-brand-accent/80 border border-brand-accent-light/30 rounded-full text-xs font-bold uppercase tracking-wider transition-all text-white flex items-center gap-1.5 cursor-pointer shadow-lg shadow-brand-accent-light/10"
              >
                <Check className="w-4 h-4" />
                <span>Links speichern</span>
              </button>
            </div>
          </div>
        </div>
      </AccordionSection>

      {/* Testspiel / Sonder-Event */}
      <AccordionSection
        id="event"
        title="Testspiel / Event"
        subtitle="Spontanes Event ein-/ausblenden, Ergebnisse pflegen"
        icon={<Zap className="w-5 h-5" />}
        accent="#E6238E"
      >
        <div>
          {!eventCfg ? (
            <p className="text-xs text-gray-400 font-sans">Lädt…</p>
          ) : (
            <div className="space-y-6">
              <p className="text-xs text-gray-400 font-sans">
                Blende ein spontanes Event (z.B. Testspieltag) auf der Website ein. Ist der Schalter aus, ist die Seite
                komplett normal – kein Banner, kein Menüpunkt.
              </p>

              {/* An/Aus-Schalter */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 rounded-xl border border-[rgba(230,35,142,.3)] bg-[rgba(230,35,142,.06)]">
                <div className="flex-1">
                  <div className="font-sans font-bold text-white text-sm">Event auf der Website anzeigen</div>
                  <div className="text-xs text-gray-400 font-sans">
                    Zeigt Banner auf der Startseite + farbigen Menüpunkt „{eventCfg.title}".
                  </div>
                </div>
                <button
                  type="button"
                  onClick={toggleEventActive}
                  className={`shrink-0 inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all cursor-pointer border ${
                    eventCfg.active
                      ? 'bg-[rgba(230,35,142,.25)] text-[#ff9ad4] border-[rgba(230,35,142,.5)]'
                      : 'bg-[#060E0F]/60 text-gray-400 border-white/10 hover:text-white hover:border-white/20'
                  }`}
                >
                  <span className="relative flex h-2 w-2">
                    {eventCfg.active && (
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#E6238E] opacity-75" />
                    )}
                    <span className={`relative inline-flex rounded-full h-2 w-2 ${eventCfg.active ? 'bg-[#E6238E]' : 'bg-gray-500'}`} />
                  </span>
                  {eventCfg.active ? 'AKTIV – sichtbar' : 'Aus (versteckt)'}
                </button>
              </div>

              {/* Meta-Felder */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-mono text-gray-400 mb-1.5 uppercase tracking-wider">TITEL</label>
                  <input type="text" value={eventCfg.title} onChange={(e) => patchEvent({ title: e.target.value })} className={inputClass} />
                </div>
                <div>
                  <label className="block text-xs font-mono text-gray-400 mb-1.5 uppercase tracking-wider">UNTERTITEL</label>
                  <input type="text" value={eventCfg.tagline} onChange={(e) => patchEvent({ tagline: e.target.value })} className={inputClass} />
                </div>
                <div>
                  <label className="block text-xs font-mono text-gray-400 mb-1.5 uppercase tracking-wider">DATUM (TEXT)</label>
                  <input type="text" value={eventCfg.dateLabel} onChange={(e) => patchEvent({ dateLabel: e.target.value })} placeholder="z.B. Sonntag, 2. August 2026" className={inputClass} />
                </div>
                <div>
                  <label className="block text-xs font-mono text-gray-400 mb-1.5 uppercase tracking-wider">ORT</label>
                  <input type="text" value={eventCfg.location} onChange={(e) => patchEvent({ location: e.target.value })} className={inputClass} />
                </div>
              </div>

              {/* Ergebnisse / Spielplan */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-xs font-mono text-gray-400 uppercase tracking-wider">Spielplan & Ergebnisse</label>
                  <button
                    type="button"
                    onClick={clearEventResults}
                    className="text-[11px] font-sans font-bold uppercase tracking-wider text-gray-400 hover:text-rose-300 transition-colors cursor-pointer"
                  >
                    Ergebnisse leeren
                  </button>
                </div>
                <div className="rounded-xl border border-white/10 divide-y divide-white/[.06]">
                  {[...eventCfg.matches]
                    .sort((a, b) => a.block - b.block || a.field - b.field)
                    .map((m) => (
                      <div key={m.id} className="flex items-center gap-2 px-3 py-2.5 text-sm">
                        <span className="shrink-0 w-24 text-[10px] font-mono uppercase tracking-wider text-gray-500 leading-tight">
                          B{m.block} · Feld {m.field}
                          <br />
                          <span className="text-[#ff7ac4]">{m.start}</span>
                        </span>
                        <input
                          type="text"
                          value={m.home}
                          onChange={(e) => patchEventMatch(m.id, { home: e.target.value })}
                          className="flex-1 min-w-0 bg-[#060E0F]/60 border border-white/10 rounded-md px-2 py-1.5 text-white text-xs focus:outline-none focus:border-[#E6238E] text-right"
                        />
                        <input
                          type="number"
                          min={0}
                          value={m.homeScore ?? ''}
                          onChange={(e) => patchEventMatch(m.id, { homeScore: e.target.value === '' ? null : Math.max(0, Number(e.target.value)) })}
                          className="shrink-0 w-11 bg-[#060E0F]/80 border border-white/10 rounded-md px-1 py-1.5 text-white text-center text-sm focus:outline-none focus:border-[#E6238E]"
                        />
                        <span className="shrink-0 text-gray-600">:</span>
                        <input
                          type="number"
                          min={0}
                          value={m.awayScore ?? ''}
                          onChange={(e) => patchEventMatch(m.id, { awayScore: e.target.value === '' ? null : Math.max(0, Number(e.target.value)) })}
                          className="shrink-0 w-11 bg-[#060E0F]/80 border border-white/10 rounded-md px-1 py-1.5 text-white text-center text-sm focus:outline-none focus:border-[#E6238E]"
                        />
                        <input
                          type="text"
                          value={m.away}
                          onChange={(e) => patchEventMatch(m.id, { away: e.target.value })}
                          className="flex-1 min-w-0 bg-[#060E0F]/60 border border-white/10 rounded-md px-2 py-1.5 text-white text-xs focus:outline-none focus:border-[#E6238E]"
                        />
                      </div>
                    ))}
                </div>
                <p className="mt-2 text-[11px] text-gray-500 font-sans">
                  Ergebnis-Feld leer lassen = noch nicht gespielt. Die Tabelle rechnet sich automatisch aus den Ergebnissen.
                </p>
              </div>

              <div className="flex items-center justify-end gap-3">
                {eventSuccess && (
                  <motion.span
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="text-xs text-emerald-400 uppercase tracking-wider font-mono mr-2"
                  >
                    ✓ Gespeichert!
                  </motion.span>
                )}
                <button
                  type="button"
                  onClick={() => saveEventCfg()}
                  className="px-6 py-3 bg-brand-accent hover:bg-brand-accent/80 border border-brand-accent-light/30 rounded-full text-xs font-bold uppercase tracking-wider transition-all text-white flex items-center gap-1.5 cursor-pointer shadow-lg shadow-brand-accent-light/10"
                >
                  <Check className="w-4 h-4" />
                  <span>Event speichern</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </AccordionSection>

      {/* Saison verwalten (nur Super-Admin) */}
      {isSuperadmin && (
      <AccordionSection
        id="season"
        title="Saison verwalten"
        subtitle="Neue Saison starten – Ergebnisse werden archiviert"
        icon={<CalendarPlus className="w-5 h-5" />}
      >
        <div>
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <p className="text-xs text-gray-400 font-sans leading-relaxed max-w-2xl">
              Aktive Saison: <strong className="text-white font-mono">{currentSeasonLabel || '–'}</strong>. Beim Start
              einer neuen Saison bleiben alle Vereine und Kader erhalten; die bisherigen Ergebnisse werden archiviert
              und sind über den Saison-Umschalter auf der Website weiter einsehbar.
            </p>
            <button
              type="button"
              onClick={openSeasonModal}
              className="shrink-0 px-5 py-2.5 bg-brand-accent-light hover:bg-brand-accent text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-all cursor-pointer flex items-center justify-center space-x-1.5"
            >
              <CalendarPlus className="w-4 h-4" />
              <span>Neue Saison starten</span>
            </button>
          </div>

          {/* Demo-Modus: komplette Zufalls-Kopie zum Vorstellen */}
          <div className="mt-6 pt-6 border-t border-white/10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="max-w-2xl">
              <div className="flex items-center gap-2">
                <span
                  className={`inline-block w-2.5 h-2.5 rounded-full ${demoActive ? 'bg-hl-green animate-pulse' : 'bg-hl-faint'}`}
                />
                <span className="text-sm font-bold text-white font-sans uppercase tracking-wider">
                  Demo-Modus {demoActive ? 'aktiv' : 'aus'}
                </span>
              </div>
              <p className="text-xs text-gray-400 font-sans leading-relaxed mt-2">
                Erstellt eine komplette Kopie (Teams, Kader, eigene Saison) und füllt alles per Zufall —
                Ergebnisse, Torschützen, Statistiken und Tabelle. Ideal zum Vorstellen. Die echte Saison bleibt
                unberührt; beim Deaktivieren wird die Demo restlos entfernt.
              </p>
            </div>
            <button
              type="button"
              disabled={isTogglingDemo}
              onClick={async () => {
                if (!demoActive && !window.confirm('Demo aktivieren? Es wird eine komplette Zufalls-Kopie erstellt. Die echte Saison bleibt unberührt.')) return;
                if (demoActive && !window.confirm('Demo deaktivieren und alle Demo-Daten entfernen? Die echte Saison kommt zurück.')) return;
                setIsTogglingDemo(true);
                try {
                  await onToggleDemo();
                } finally {
                  setIsTogglingDemo(false);
                }
              }}
              className={`shrink-0 px-5 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed ${
                demoActive
                  ? 'bg-[rgba(255,84,66,.15)] border border-[rgba(255,84,66,.35)] text-hl-red-soft hover:bg-[rgba(255,84,66,.25)]'
                  : 'bg-hl-green/90 hover:bg-hl-green text-[#062018]'
              }`}
            >
              {isTogglingDemo
                ? demoActive
                  ? 'Deaktiviere...'
                  : 'Erstelle Demo...'
                : demoActive
                ? 'Demo deaktivieren'
                : 'Demo aktivieren'}
            </button>
          </div>
        </div>
      </AccordionSection>
      )}
    </>
  );
}
