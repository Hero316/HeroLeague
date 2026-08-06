import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Shield, Plus, Check, Upload, Award, Trash2, CalendarPlus, Camera, X, Radio, Sparkles, Share2, Zap, Image as ImageIcon, Timer, Megaphone, Handshake, ChevronUp, ChevronDown, Star, Landmark } from 'lucide-react';
import { Player, Team, Match, EventConfig, EventArchive, NewsItem, Partner } from '../types';
import { apiFetch, uploadImage } from '../lib/api';
import PlayerAvatar from './PlayerAvatar';
import { AccordionSection } from './ui';

// Teamnamen tolerant vergleichen (für den Abgleich Event-Team <-> echter Verein).
const normTeamName = (s: string) => s.toLowerCase().replace(/\./g, '').replace(/\s+/g, ' ').trim();

function ImageUploader({
  label,
  value,
  onChange,
  maxDimension,
}: {
  label: string;
  value: string;
  onChange: (url: string) => void;
  maxDimension?: number;
}) {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  const handleFile = async (file: File) => {
    setIsUploading(true);
    try {
      onChange(await uploadImage(file, maxDimension ? { maxDimension } : undefined));
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
            <img src={value} alt="Vorschau" loading="lazy" decoding="async" className="w-10 h-10 rounded object-contain bg-white/5 border border-white/10 shrink-0" referrerPolicy="no-referrer" />
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
            type="number"
            min={0}
            max={999}
            inputMode="numeric"
            value={player.number ?? ''}
            placeholder="#"
            title="Trikotnummer"
            onChange={(e) => {
              const raw = e.target.value.trim();
              const n = raw === '' ? undefined : Math.max(0, Math.min(999, parseInt(raw, 10) || 0));
              updatePlayer(index, { number: n });
            }}
            className="w-12 shrink-0 bg-transparent border-b border-white/10 focus:border-brand-accent-light px-1 py-1 text-sm text-center font-mono text-brand-accent-light focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          />
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
  nextSeasonLabel: string;
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

export default function AdminPanel({
  teams,
  matches,
  currentSeasonLabel,
  nextSeasonLabel,
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

  // Partner / Sponsoren-Logos (Sektion unten auf jeder Seite) – nur Super-Admin
  const [partners, setPartners] = useState<Partner[]>([]);
  const [partnersSuccess, setPartnersSuccess] = useState(false);
  const [partnersSaving, setPartnersSaving] = useState(false);

  // Eigene Hero-Hintergrundbilder (Startseite)
  const [heroImages, setHeroImages] = useState({ match: '', pom: '', table: '' });
  const [heroSuccess, setHeroSuccess] = useState(false);

  // Countdown (Startseite)
  const [countdownActive, setCountdownActive] = useState(false);
  const [countdownTarget, setCountdownTarget] = useState('2026-10-04T19:00');
  const [countdownTitle, setCountdownTitle] = useState('Till Season begins');
  const [countdownSuccess, setCountdownSuccess] = useState(false);

  // News-Laufband (Ticker unter der Navigation)
  const [news, setNews] = useState<NewsItem[]>([]);
  const [newsSuccess, setNewsSuccess] = useState(false);
  const [newsSaving, setNewsSaving] = useState(false);

  // Sonder-Events (Testspiel-Archiv)
  const [eventArchive, setEventArchive] = useState<EventArchive | null>(null);
  const [selectedEventId, setSelectedEventId] = useState<string>('');
  const [eventSuccess, setEventSuccess] = useState(false);
  const [openEventMatch, setOpenEventMatch] = useState<string | null>(null);

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

  // Partner laden (nur relevant für Super-Admin, schadet sonst aber nicht).
  // Altdaten mit `main:true` (statt `tier`) werden auf die neue Stufe migriert.
  useEffect(() => {
    if (!isSuperadmin) return;
    apiFetch<{ items: Partner[] }>('/api/twitch?resource=partners')
      .then((data) => {
        const items = (Array.isArray(data.items) ? data.items : []).map((p) => ({
          ...p,
          tier: p.tier ?? ((p as unknown as { main?: boolean }).main ? 'main' : 'normal'),
          label: p.label ?? '',
        }));
        setPartners(items);
      })
      .catch(() => {
        /* noch nicht konfiguriert */
      });
  }, [isSuperadmin]);

  const addPartner = () => {
    setPartners((prev) => [
      ...prev,
      { id: `p-${Date.now()}`, name: '', logoUrl: '', linkUrl: '', tier: 'normal', label: '' },
    ]);
  };

  const updatePartner = (id: string, patch: Partial<Partner>) => {
    setPartners((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  };

  const removePartner = (id: string) => {
    setPartners((prev) => prev.filter((p) => p.id !== id));
  };

  // Reihenfolge per Hoch/Runter tauschen (bestimmt die Anzeige-Reihenfolge)
  const movePartner = (index: number, dir: -1 | 1) => {
    setPartners((prev) => {
      const next = [...prev];
      const target = index + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const handleSavePartners = async () => {
    setPartnersSaving(true);
    try {
      const saved = await apiFetch<{ items: Partner[] }>('/api/twitch?resource=partners', {
        method: 'POST',
        body: JSON.stringify({ items: partners }),
      });
      setPartners(Array.isArray(saved.items) ? saved.items : []);
      setPartnersSuccess(true);
      setTimeout(() => setPartnersSuccess(false), 3000);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Fehler beim Speichern.');
    } finally {
      setPartnersSaving(false);
    }
  };

  // Hero-Hintergrundbilder laden
  useEffect(() => {
    apiFetch<{ match: string; pom: string; table: string }>('/api/twitch?resource=hero')
      .then((data) => setHeroImages({ match: data.match || '', pom: data.pom || '', table: data.table || '' }))
      .catch(() => {
        /* noch nicht konfiguriert */
      });
  }, []);

  const handleSaveHero = async () => {
    try {
      const saved = await apiFetch<{ match: string; pom: string; table: string }>('/api/twitch?resource=hero', {
        method: 'POST',
        body: JSON.stringify(heroImages),
      });
      setHeroImages({ match: saved.match || '', pom: saved.pom || '', table: saved.table || '' });
      setHeroSuccess(true);
      setTimeout(() => setHeroSuccess(false), 3000);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Fehler beim Speichern.');
    }
  };

  // Countdown laden
  useEffect(() => {
    apiFetch<{ active: boolean; target: string; title: string }>('/api/twitch?resource=countdown')
      .then((data) => {
        setCountdownActive(!!data.active);
        setCountdownTarget(data.target || '2026-10-04T19:00');
        setCountdownTitle(typeof data.title === 'string' ? data.title : 'Till Season begins');
      })
      .catch(() => {
        /* noch nicht konfiguriert */
      });
  }, []);

  // Countdown speichern (optional mit überschriebenem active-Wert für den Schalter)
  const saveCountdown = async (nextActive = countdownActive) => {
    try {
      const saved = await apiFetch<{ active: boolean; target: string; title: string }>('/api/twitch?resource=countdown', {
        method: 'POST',
        body: JSON.stringify({ active: nextActive, target: countdownTarget.trim(), title: countdownTitle.trim() }),
      });
      setCountdownActive(!!saved.active);
      setCountdownTarget(saved.target || '2026-10-04T19:00');
      setCountdownTitle(typeof saved.title === 'string' ? saved.title : '');
      setCountdownSuccess(true);
      setTimeout(() => setCountdownSuccess(false), 3000);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Fehler beim Speichern.');
    }
  };

  // News-Laufband laden
  useEffect(() => {
    apiFetch<{ items: NewsItem[] }>('/api/twitch?resource=news')
      .then((data) => setNews(Array.isArray(data?.items) ? data.items : []))
      .catch(() => {
        /* noch keine News gepflegt */
      });
  }, []);

  // Ein leeres News-Feld anhängen
  const addNews = () =>
    setNews((list) => [...list, { id: `news-${Date.now()}-${list.length}`, text: '' }]);

  // Text eines News-Eintrags ändern
  const updateNews = (id: string, text: string) =>
    setNews((list) => list.map((n) => (n.id === id ? { ...n, text } : n)));

  // Einen News-Eintrag entfernen
  const removeNews = (id: string) => setNews((list) => list.filter((n) => n.id !== id));

  // News speichern (leere Einträge werden serverseitig verworfen)
  const saveNews = async () => {
    setNewsSaving(true);
    try {
      const saved = await apiFetch<{ items: NewsItem[] }>('/api/twitch?resource=news', {
        method: 'POST',
        body: JSON.stringify({ items: news }),
      });
      setNews(Array.isArray(saved?.items) ? saved.items : []);
      setNewsSuccess(true);
      setTimeout(() => setNewsSuccess(false), 3000);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Fehler beim Speichern.');
    } finally {
      setNewsSaving(false);
    }
  };

  // Sonder-Event-Archiv laden
  useEffect(() => {
    apiFetch<EventArchive>('/api/twitch?resource=event')
      .then((data) => {
        setEventArchive(data);
        setSelectedEventId(data.activeId ?? data.events?.[0]?.id ?? '');
      })
      .catch(() => {
        /* noch nichts hinterlegt */
      });
  }, []);

  type EMatch = EventConfig['matches'][number];
  const selectedEvent = eventArchive?.events?.find((e) => e.id === selectedEventId) ?? null;

  const updateArchive = (updater: (a: EventArchive) => EventArchive) =>
    setEventArchive((a) => (a ? updater(a) : a));

  // Änderungen betreffen immer das aktuell ausgewählte Event.
  const patchEvent = (patch: Partial<EventConfig>) =>
    updateArchive((a) => ({ ...a, events: a.events.map((e) => (e.id === selectedEventId ? { ...e, ...patch } : e)) }));
  const updateEventMatch = (id: string, updater: (m: EMatch) => EMatch) =>
    updateArchive((a) => ({
      ...a,
      events: a.events.map((e) =>
        e.id === selectedEventId ? { ...e, matches: e.matches.map((m) => (m.id === id ? updater(m) : m)) } : e
      ),
    }));

  // Bester Spieler / Torwart je Team (max. einer pro Team)
  const setAward = (id: string, key: 'bestPlayers' | 'goalkeepers', team: string, player: string) =>
    updateEventMatch(id, (m) => {
      const others = (m[key] ?? []).filter((a) => a.team !== team);
      return { ...m, [key]: player.trim() ? [...others, { player: player.trim(), team }] : others };
    });
  const getAward = (m: EMatch, key: 'bestPlayers' | 'goalkeepers', team: string) =>
    (m[key] ?? []).find((a) => a.team === team)?.player ?? '';

  // Abwesende Kaderspieler je Team an-/abwählen
  const toggleAbsent = (id: string, team: string, player: string) =>
    updateEventMatch(id, (m) => {
      const list = m.absentees ?? [];
      const exists = list.some((a) => a.team === team && a.player === player);
      return { ...m, absentees: exists ? list.filter((a) => !(a.team === team && a.player === player)) : [...list, { player, team }] };
    });
  const isAbsent = (m: EMatch, team: string, player: string) =>
    (m.absentees ?? []).some((a) => a.team === team && a.player === player);

  // Kader (echte Spieler) eines Event-Team-Namens holen
  const rosterOf = (teamName: string) =>
    teams.find((t) => normTeamName(t.name) === normTeamName(teamName))?.spielerliste ?? [];

  // Spieler-Auswahl streng aus dem Kader EINES Teams (wie im Original). Ohne
  // hinterlegten Kader Freitext. `exclude` blendet z.B. den Torschützen bei der
  // Vorlage aus. Ein bereits gespeicherter, nicht (mehr) im Kader stehender Name
  // bleibt als Option erhalten, damit nichts verloren geht.
  const evFieldClass =
    'w-full bg-[#060E0F]/60 border border-white/10 rounded-md px-2 py-1.5 text-white text-xs focus:outline-none focus:border-[#E6238E]';
  const rosterField = (
    teamName: string,
    value: string,
    onChange: (v: string) => void,
    placeholder: string,
    exclude?: string
  ) => {
    const roster = rosterOf(teamName);
    if (roster.length === 0) {
      return (
        <input
          type="text"
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          className={evFieldClass}
        />
      );
    }
    const names = roster.map((p) => p.name).filter((n) => n && n !== exclude);
    const missing = Boolean(value) && !names.includes(value) && value !== exclude;
    return (
      <select value={value} onChange={(e) => onChange(e.target.value)} className={`${evFieldClass} cursor-pointer`}>
        <option value="">— {placeholder} —</option>
        {missing && <option value={value}>{value} (nicht im Kader)</option>}
        {names.map((n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
      </select>
    );
  };

  const saveEventArchive = async (override?: EventArchive) => {
    const archive = override ?? eventArchive;
    if (!archive) return;
    try {
      const saved = await apiFetch<EventArchive>('/api/twitch?resource=event', {
        method: 'POST',
        body: JSON.stringify(archive),
      });
      setEventArchive(saved);
      setEventSuccess(true);
      setTimeout(() => setEventSuccess(false), 3000);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Fehler beim Speichern.');
    }
  };

  // Ausgewähltes Event sichtbar schalten (oder alle verstecken) – speichert sofort.
  const setActiveEvent = (id: string | null) => {
    if (!eventArchive) return;
    saveEventArchive({ ...eventArchive, activeId: id });
  };

  // Neues Testspiel anlegen (leer) und direkt auswählen.
  const addNewEvent = () => {
    if (!eventArchive) return;
    const n = eventArchive.events.length + 1;
    const fresh: EventConfig = {
      id: `testspiel-${Date.now()}`,
      label: `Testspiel ${n}`,
      title: 'Testspieltag',
      tagline: '',
      dateLabel: '',
      location: '',
      teams: [],
      matches: [],
    };
    setEventArchive({ ...eventArchive, events: [...eventArchive.events, fresh] });
    setSelectedEventId(fresh.id);
  };

  const deleteSelectedEvent = () => {
    if (!eventArchive || !selectedEvent) return;
    if (!window.confirm(`„${selectedEvent.label}" mit allen Daten wirklich löschen?`)) return;
    const events = eventArchive.events.filter((e) => e.id !== selectedEventId);
    const activeId = eventArchive.activeId === selectedEventId ? null : eventArchive.activeId;
    const next = { activeId, events };
    setSelectedEventId(events[0]?.id ?? '');
    saveEventArchive(next);
  };

  const clearEventResults = () => {
    if (!selectedEvent) return;
    if (!window.confirm('Alle eingetragenen Ergebnisse dieses Events zurücksetzen?')) return;
    patchEvent({
      matches: selectedEvent.matches.map((m) => ({ ...m, homeScore: null, awayScore: null, scorers: [], bestPlayers: [], goalkeepers: [], status: 'geplant', liveStartedAt: null })),
    });
  };

  // --- Verwalten-Popup (wie bei den echten Spielen) ---
  const managedMatch = selectedEvent?.matches.find((m) => m.id === openEventMatch) ?? null;

  // Änderung am Spiel updaten UND sofort speichern (persistiert direkt, kein Datenverlust).
  const updateAndSaveMatch = (id: string, updater: (m: EMatch) => EMatch) => {
    if (!eventArchive) return;
    const next: EventArchive = {
      ...eventArchive,
      events: eventArchive.events.map((e) =>
        e.id === selectedEventId ? { ...e, matches: e.matches.map((m) => (m.id === id ? updater(m) : m)) } : e
      ),
    };
    setEventArchive(next);
    saveEventArchive(next);
  };

  // Ergebnis setzen: passt die Anzahl der Torschützen-Felder automatisch an.
  const setEventScore = (id: string, side: 'home' | 'away', val: string) =>
    updateEventMatch(id, (m) => {
      const n = val === '' ? null : Math.max(0, Math.floor(Number(val)) || 0);
      const team = side === 'home' ? m.home : m.away;
      let scorers = m.scorers ?? [];
      if (n !== null) {
        const mine = scorers.filter((s) => s.team === team).slice(0, n);
        const others = scorers.filter((s) => s.team !== team);
        scorers = [...others, ...mine];
      }
      return side === 'home' ? { ...m, homeScore: n, scorers } : { ...m, awayScore: n, scorers };
    });

  const teamScorers = (m: EMatch, team: string) => (m.scorers ?? []).filter((s) => s.team === team);
  const scorerAt = (m: EMatch, team: string, index: number) => teamScorers(m, team)[index] ?? { player: '', team, assist: '' };
  const setScorerAt = (id: string, team: string, index: number, patch: Partial<{ player: string; assist: string }>) =>
    updateEventMatch(id, (m) => {
      const mine = (m.scorers ?? []).filter((s) => s.team === team);
      const others = (m.scorers ?? []).filter((s) => s.team !== team);
      const copy = [...mine];
      while (copy.length <= index) copy.push({ player: '', team, assist: '' });
      copy[index] = { ...copy[index], ...patch, team };
      return { ...m, scorers: [...others, ...copy] };
    });

  // Status setzen und sofort speichern (Live/Beendet bleibt auch nach Neuladen erhalten).
  const setMatchStatusSaved = (id: string, status: 'geplant' | 'live' | 'beendet') =>
    updateAndSaveMatch(id, (m) => ({
      ...m,
      status,
      liveStartedAt: status === 'live' ? m.liveStartedAt ?? new Date().toISOString() : status === 'geplant' ? null : m.liveStartedAt ?? null,
    }));

  // Spiel komplett zurücksetzen (Ergebnis, Torschützen, Status) – speichert sofort.
  const resetEventMatch = (id: string) => {
    if (!window.confirm('Dieses Spiel zurücksetzen? Ergebnis, Torschützen, Vorlagen, Torwart, Abwesende und Status werden gelöscht.')) return;
    updateAndSaveMatch(id, (m) => ({
      ...m,
      homeScore: null,
      awayScore: null,
      status: 'geplant',
      liveStartedAt: null,
      scorers: [],
      bestPlayers: [],
      goalkeepers: [],
      absentees: [],
    }));
  };

  // Popup schließen und dabei alles sichern.
  const closeManage = async () => {
    await saveEventArchive();
    setOpenEventMatch(null);
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
    // Name der neuen Saison wird automatisch vergeben (SEASON ONE/TWO …).
    setNewSeasonLabel(nextSeasonLabel);
    setSeasonModalOpen(true);
  };

  const handleStartSeason = async () => {
    if (!newSeasonLabel.trim()) {
      alert('Kein Saison-Name vorhanden.');
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
                Name der neuen Saison
              </label>
              <div className="mb-6 px-4 py-3 rounded-xl bg-white/5 border border-white/10 font-display font-black text-lg uppercase tracking-wide text-white">
                {newSeasonLabel || nextSeasonLabel}
              </div>

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
        category="spiele"
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
        category="startseite"
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

      {/* Startseite: eigene Hero-Hintergrundbilder */}
      <AccordionSection
        id="hero"
        category="startseite"
        title="Startseite · Hero-Bilder & Countdown"
        subtitle="Hintergrundbilder der drei Slides + Countdown bis zum Anstoß"
        icon={<ImageIcon className="w-5 h-5" />}
        accent="#22DFC9"
      >
        <div>
          <p className="text-xs text-gray-400 font-sans mb-6">
            Lade für jeden der drei Hero-Slides ein eigenes Hintergrundbild hoch. Wird ein Bild entfernt, greift wieder
            das eingebaute Standard-Design. Tipp: Querformat, mindestens ~1600px breit — die Motive werden links
            abgedunkelt, damit Titel &amp; Karte gut lesbar bleiben.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <ImageUploader
              label="Slide 1 · Spieltag"
              value={heroImages.match}
              onChange={(url) => setHeroImages((h) => ({ ...h, match: url }))}
              maxDimension={1920}
            />
            <ImageUploader
              label="Slide 2 · Spieler des Monats"
              value={heroImages.pom}
              onChange={(url) => setHeroImages((h) => ({ ...h, pom: url }))}
              maxDimension={1920}
            />
            <ImageUploader
              label="Slide 3 · Tabellenführer"
              value={heroImages.table}
              onChange={(url) => setHeroImages((h) => ({ ...h, table: url }))}
              maxDimension={1920}
            />
          </div>

          <div className="flex items-center justify-end gap-3 mt-5">
            {heroSuccess && (
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
              onClick={handleSaveHero}
              className="px-6 py-3 bg-brand-accent hover:bg-brand-accent/80 border border-brand-accent-light/30 rounded-full text-xs font-bold uppercase tracking-wider transition-all text-white flex items-center gap-1.5 cursor-pointer shadow-lg shadow-brand-accent-light/10"
            >
              <Check className="w-4 h-4" />
              <span>Hero-Bilder speichern</span>
            </button>
          </div>

          {/* Countdown-Steuerung – im selben Startseiten-Abschnitt */}
          <div className="mt-8 pt-6 border-t border-white/10">
            <div className="flex items-center gap-2 mb-1.5">
              <Timer className="w-4 h-4 text-brand-accent-light" />
              <h4 className="text-sm font-bold text-white font-sans">Countdown bis zum Anstoß</h4>
            </div>
            <p className="text-xs text-gray-400 font-sans mb-5">
              Zeigt oben auf der Startseite einen großen Countdown (Tage · Stunden · Minuten · Sekunden) bis zum
              eingestellten Zeitpunkt. Läuft er ab, glüht er <span className="text-hl-red-soft font-semibold">rot</span> und
              bleibt stehen, bis du ihn ausschaltest. Aus = die Startseite ist ganz normal. Der Countdown rechnet immer
              live gegen den Zeitpunkt – beliebig oft an-/ausschaltbar.
            </p>

            {/* An/Aus-Schalter – speichert sofort */}
            <div className="flex items-center justify-between gap-4 mb-5 p-4 rounded-xl bg-white/[.03] border border-white/10">
              <div className="min-w-0">
                <div className="text-sm font-bold text-white font-sans">Countdown anzeigen</div>
                <div className="text-xs text-gray-400 font-sans">Groß oben auf der Startseite</div>
              </div>
              <button
                type="button"
                onClick={() => saveCountdown(!countdownActive)}
                aria-pressed={countdownActive}
                className={`relative w-12 h-[26px] rounded-full transition-colors shrink-0 cursor-pointer ${
                  countdownActive ? 'bg-brand-accent-light' : 'bg-white/15'
                }`}
              >
                <span
                  className={`absolute top-[3px] w-5 h-5 rounded-full bg-white shadow transition-all ${
                    countdownActive ? 'left-[25px]' : 'left-[3px]'
                  }`}
                />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-mono text-gray-400 mb-1.5 uppercase tracking-wider">
                  Anstoß / Zielzeitpunkt
                </label>
                <input
                  type="datetime-local"
                  value={countdownTarget}
                  onChange={(e) => setCountdownTarget(e.target.value)}
                  className={`${inputClass} font-mono`}
                />
              </div>
              <div>
                <label className="block text-xs font-mono text-gray-400 mb-1.5 uppercase tracking-wider">
                  Text dahinter (dezent)
                </label>
                <input
                  type="text"
                  value={countdownTitle}
                  onChange={(e) => setCountdownTitle(e.target.value)}
                  placeholder="z.B. Till Season begins"
                  className={inputClass}
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 mt-5">
              {countdownSuccess && (
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
                onClick={() => saveCountdown()}
                className="px-6 py-3 bg-brand-accent hover:bg-brand-accent/80 border border-brand-accent-light/30 rounded-full text-xs font-bold uppercase tracking-wider transition-all text-white flex items-center gap-1.5 cursor-pointer shadow-lg shadow-brand-accent-light/10"
              >
                <Check className="w-4 h-4" />
                <span>Countdown speichern</span>
              </button>
            </div>
          </div>
        </div>
      </AccordionSection>

      {/* News-Laufband (Ticker unter der Navigation) */}
      <AccordionSection
        id="news"
        category="startseite"
        title="News-Laufband (Ticker)"
        subtitle="Eigene Kurz-Nachrichten für das Laufband oben auf der Seite"
        icon={<Megaphone className="w-5 h-5" />}
        accent="#F4A261"
      >
        <div>
          <p className="text-xs text-gray-400 font-sans mb-6">
            Hier pflegst du eigene Nachrichten fürs <strong className="text-white">Laufband</strong> (der Ticker direkt
            unter dem Menü). Jede Nachricht bekommt ein eigenes Feld — mit <strong className="text-white">„Nachricht
            hinzufügen"</strong> legst du Stück für Stück weitere an. Beim Speichern hängt die Website sie automatisch
            hinten an die laufenden Einträge (Ergebnisse, Anstöße, Top-Torschütze) an. Leere Felder werden verworfen; ist
            keine Nachricht übrig, läuft der Ticker wieder ganz normal.
          </p>

          <div className="space-y-3">
            {news.length === 0 && (
              <div className="text-xs text-gray-500 font-sans italic px-4 py-6 rounded-xl bg-white/[.02] border border-dashed border-white/10 text-center">
                Noch keine Nachricht. Mit „Nachricht hinzufügen" die erste anlegen.
              </div>
            )}

            {news.map((item, index) => (
              <div key={item.id} className="flex items-start gap-2">
                <span className="mt-2.5 shrink-0 w-6 h-6 rounded-full bg-white/5 border border-white/10 text-[11px] font-mono text-gray-400 flex items-center justify-center">
                  {index + 1}
                </span>
                <textarea
                  value={item.text}
                  onChange={(e) => updateNews(item.id, e.target.value)}
                  placeholder="z.B. Spielverlegung: Spieltag 5 startet erst um 20:00 Uhr"
                  rows={2}
                  maxLength={280}
                  className={`${inputClass} resize-y min-h-[52px]`}
                />
                <button
                  type="button"
                  onClick={() => removeNews(item.id)}
                  title="Nachricht entfernen"
                  aria-label="Nachricht entfernen"
                  className="mt-1.5 shrink-0 p-2 text-gray-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={addNews}
            className="mt-4 inline-flex items-center gap-1.5 px-4 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-full text-xs font-bold uppercase tracking-wider text-gray-200 transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Nachricht hinzufügen</span>
          </button>

          <div className="flex items-center justify-end gap-3 mt-5">
            {newsSuccess && (
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
              onClick={saveNews}
              disabled={newsSaving}
              className="px-6 py-3 bg-brand-accent hover:bg-brand-accent/80 disabled:opacity-40 border border-brand-accent-light/30 rounded-full text-xs font-bold uppercase tracking-wider transition-all text-white flex items-center gap-1.5 cursor-pointer shadow-lg shadow-brand-accent-light/10"
            >
              <Check className="w-4 h-4" />
              <span>{newsSaving ? 'Speichert…' : 'News speichern'}</span>
            </button>
          </div>
        </div>
      </AccordionSection>

      {/* Twitch-Livestream & Social Media */}
      <AccordionSection
        id="twitch"
        category="kanaele"
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

      {/* Partner / Sponsoren-Logos – nur Super-Admin */}
      {isSuperadmin && (
        <AccordionSection
          id="partners"
          category="startseite"
          title="Partner & Sponsoren"
          subtitle="Logo-Leiste ganz unten auf jeder Seite"
          icon={<Handshake className="w-5 h-5" />}
          accent="#E6238E"
        >
          <div>
            <p className="text-xs text-gray-400 font-sans mb-2">
              Diese Logos erscheinen ganz unten auf jeder öffentlichen Seite. Sie werden automatisch{' '}
              <strong className="text-gray-200">schwarz-weiß</strong> dargestellt und bekommen{' '}
              <strong className="text-gray-200">beim Hovern mit der Maus ihre Farbe</strong>.
            </p>
            <p className="text-xs text-gray-500 font-sans mb-6">
              Logo bitte <strong className="text-gray-300">farbig</strong> und mit{' '}
              <strong className="text-gray-300">transparentem Hintergrund</strong> (PNG/WebP) hochladen — kein zweites
              Schwarz-Weiß-Bild nötig. Über die <strong className="text-gray-300">Anzeige-Stufe</strong> bestimmst du die
              Größe: <strong className="text-gray-300">Hauptpartner</strong> und{' '}
              <strong className="text-gray-300">Bankpartner</strong> erscheinen groß nebeneinander ganz oben — jeweils mit
              eigener Überschrift darüber (z. B. „Offizieller Bankpartner"). <strong className="text-gray-300">Normal</strong>{' '}
              landet im kleinen Raster darunter. Reihenfolge über die Pfeile.
            </p>

            <div className="space-y-4">
              {partners.length === 0 && (
                <p className="text-xs text-gray-500 font-mono italic">Noch keine Partner angelegt.</p>
              )}
              {partners.map((p, index) => (
                <div key={p.id} className="rounded-xl border border-white/10 bg-[#060E0F]/40 p-4">
                  <div className="flex items-start gap-4">
                    <div className="flex flex-col gap-1 pt-1">
                      <button
                        type="button"
                        onClick={() => movePartner(index, -1)}
                        disabled={index === 0}
                        title="Nach oben"
                        aria-label="Nach oben"
                        className="p-1 rounded-md text-gray-400 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
                      >
                        <ChevronUp className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => movePartner(index, 1)}
                        disabled={index === partners.length - 1}
                        title="Nach unten"
                        aria-label="Nach unten"
                        className="p-1 rounded-md text-gray-400 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
                      >
                        <ChevronDown className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="flex-1 min-w-0 grid grid-cols-1 md:grid-cols-2 gap-4">
                      <ImageUploader
                        label="Logo (farbig, transparent)"
                        value={p.logoUrl}
                        onChange={(url) => updatePartner(p.id, { logoUrl: url })}
                      />
                      <div className="space-y-3">
                        <div>
                          <label className="block text-xs font-mono text-gray-400 mb-1.5 uppercase tracking-wider">
                            Name (intern / Alt-Text)
                          </label>
                          <input
                            type="text"
                            value={p.name}
                            onChange={(e) => updatePartner(p.id, { name: e.target.value })}
                            placeholder="z.B. Coca-Cola"
                            className={inputClass}
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-mono text-gray-400 mb-1.5 uppercase tracking-wider">
                            Link (optional)
                          </label>
                          <input
                            type="text"
                            value={p.linkUrl}
                            onChange={(e) => updatePartner(p.id, { linkUrl: e.target.value })}
                            placeholder="z.B. coca-cola.de"
                            className={inputClass}
                          />
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => removePartner(p.id)}
                      title="Partner entfernen"
                      aria-label="Partner entfernen"
                      className="shrink-0 p-2 rounded-md text-gray-400 hover:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="mt-4 pt-3 border-t border-white/5 space-y-3">
                    <div>
                      <label className="block text-xs font-mono text-gray-400 mb-1.5 uppercase tracking-wider">
                        Anzeige-Stufe
                      </label>
                      <div className="inline-flex flex-wrap gap-2">
                        {([
                          { key: 'normal', label: 'Normal (klein)', icon: null },
                          { key: 'main', label: 'Hauptpartner', icon: <Star className="w-3.5 h-3.5" /> },
                          { key: 'bank', label: 'Bankpartner', icon: <Landmark className="w-3.5 h-3.5" /> },
                        ] as const).map((opt) => {
                          const active = (p.tier ?? 'normal') === opt.key;
                          return (
                            <button
                              key={opt.key}
                              type="button"
                              onClick={() =>
                                opt.key === 'bank'
                                  ? updatePartner(p.id, { tier: 'bank', label: p.label || 'Offizieller Bankpartner' })
                                  : updatePartner(p.id, { tier: opt.key })
                              }
                              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all cursor-pointer border ${
                                active
                                  ? 'bg-[#E6238E]/20 text-[#F49CC9] border-[#E6238E]/40'
                                  : 'bg-[#060E0F]/60 text-gray-400 border-white/10 hover:text-white hover:border-white/20'
                              }`}
                            >
                              {opt.icon}
                              {opt.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    {(p.tier === 'main' || p.tier === 'bank') && (
                      <div>
                        <label className="block text-xs font-mono text-gray-400 mb-1.5 uppercase tracking-wider">
                          Überschrift (über dem Logo)
                        </label>
                        <input
                          type="text"
                          value={p.label}
                          onChange={(e) => updatePartner(p.id, { label: e.target.value })}
                          placeholder={p.tier === 'bank' ? 'z.B. Offizieller Bankpartner' : 'z.B. Hauptpartner'}
                          className={inputClass}
                        />
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={addPartner}
              className="mt-4 inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider text-brand-accent-light border border-brand-accent-light/30 bg-brand-accent/10 hover:bg-brand-accent/20 transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              Partner hinzufügen
            </button>

            <div className="flex items-center justify-end gap-3 mt-6">
              {partnersSuccess && (
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
                onClick={handleSavePartners}
                disabled={partnersSaving}
                className="px-6 py-3 bg-brand-accent hover:bg-brand-accent/80 border border-brand-accent-light/30 rounded-full text-xs font-bold uppercase tracking-wider transition-all text-white flex items-center gap-1.5 cursor-pointer shadow-lg shadow-brand-accent-light/10 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Check className="w-4 h-4" />
                <span>{partnersSaving ? 'Speichert…' : 'Partner speichern'}</span>
              </button>
            </div>
          </div>
        </AccordionSection>
      )}

      {/* Testspiel / Sonder-Event */}
      <AccordionSection
        id="event"
        category="kanaele"
        title="Testspiel / Event"
        subtitle="Spontanes Event ein-/ausblenden, Ergebnisse pflegen"
        icon={<Zap className="w-5 h-5" />}
        accent="#E6238E"
      >
        <div>
          {!eventArchive ? (
            <p className="text-xs text-gray-400 font-sans">Lädt…</p>
          ) : (
            <div className="space-y-6">
              <p className="text-xs text-gray-400 font-sans">
                Lege beliebig viele Testspiele an – vergangene bleiben gespeichert (wie Saisons). Es ist immer höchstens
                eins auf der Website sichtbar. Steht nichts auf „aktiv", ist die Seite komplett normal.
              </p>

              {/* Event-Auswahl + neues Event */}
              <div className="flex flex-col sm:flex-row sm:items-end gap-3">
                <div className="flex-1">
                  <label className="block text-xs font-mono text-gray-400 mb-1.5 uppercase tracking-wider">Testspiel wählen</label>
                  <select
                    value={selectedEventId}
                    onChange={(e) => {
                      setSelectedEventId(e.target.value);
                      setOpenEventMatch(null);
                    }}
                    className={`${inputClass} cursor-pointer`}
                  >
                    {eventArchive.events.length === 0 && <option value="">— noch keins —</option>}
                    {eventArchive.events.map((ev) => (
                      <option key={ev.id} value={ev.id}>
                        {ev.label}
                        {eventArchive.activeId === ev.id ? ' — aktiv' : ''}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  type="button"
                  onClick={addNewEvent}
                  className="shrink-0 inline-flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider border border-white/15 text-gray-200 hover:border-white/30 hover:text-white transition-all cursor-pointer"
                >
                  <Plus className="w-4 h-4" /> Neues Testspiel
                </button>
              </div>

              {/* Sichtbarkeit */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 rounded-xl border border-[rgba(230,35,142,.3)] bg-[rgba(230,35,142,.06)]">
                <div className="flex-1">
                  <div className="font-sans font-bold text-white text-sm">Auf der Website anzeigen</div>
                  <div className="text-xs text-gray-400 font-sans">Es kann immer nur ein Testspiel gleichzeitig sichtbar sein.</div>
                </div>
                {selectedEvent && eventArchive.activeId === selectedEvent.id ? (
                  <button
                    type="button"
                    onClick={() => setActiveEvent(null)}
                    className="shrink-0 inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider border bg-[rgba(230,35,142,.25)] text-[#ff9ad4] border-[rgba(230,35,142,.5)] cursor-pointer"
                  >
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#E6238E] opacity-75" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-[#E6238E]" />
                    </span>
                    AKTIV – ausblenden
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => selectedEvent && setActiveEvent(selectedEvent.id)}
                    disabled={!selectedEvent}
                    className="shrink-0 inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider border bg-[#060E0F]/60 text-gray-300 border-white/10 hover:text-white hover:border-[rgba(230,35,142,.5)] transition-all cursor-pointer disabled:opacity-40"
                  >
                    Dieses Testspiel aktivieren
                  </button>
                )}
              </div>

              {selectedEvent ? (
                <>
                  {/* Meta-Felder */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-mono text-gray-400 mb-1.5 uppercase tracking-wider">NAME (VERWALTUNG)</label>
                      <input type="text" value={selectedEvent.label} onChange={(e) => patchEvent({ label: e.target.value })} placeholder="z.B. Testspiel 1" className={inputClass} />
                    </div>
                    <div>
                      <label className="block text-xs font-mono text-gray-400 mb-1.5 uppercase tracking-wider">TITEL (ANZEIGE)</label>
                      <input type="text" value={selectedEvent.title} onChange={(e) => patchEvent({ title: e.target.value })} className={inputClass} />
                    </div>
                    <div>
                      <label className="block text-xs font-mono text-gray-400 mb-1.5 uppercase tracking-wider">UNTERTITEL</label>
                      <input type="text" value={selectedEvent.tagline} onChange={(e) => patchEvent({ tagline: e.target.value })} className={inputClass} />
                    </div>
                    <div>
                      <label className="block text-xs font-mono text-gray-400 mb-1.5 uppercase tracking-wider">DATUM (TEXT)</label>
                      <input type="text" value={selectedEvent.dateLabel} onChange={(e) => patchEvent({ dateLabel: e.target.value })} placeholder="z.B. Sonntag, 2. August 2026" className={inputClass} />
                    </div>
                    <div>
                      <label className="block text-xs font-mono text-gray-400 mb-1.5 uppercase tracking-wider">ORT</label>
                      <input type="text" value={selectedEvent.location} onChange={(e) => patchEvent({ location: e.target.value })} className={inputClass} />
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
                  {selectedEvent.matches.length === 0 && (
                    <p className="px-3 py-4 text-[11px] text-gray-500 font-sans">
                      Noch keine Spiele hinterlegt. Schick mir den Spielplan (PDF/Excel), dann fülle ich die Paarungen ein.
                    </p>
                  )}
                  {[...selectedEvent.matches]
                    .sort((a, b) => a.block - b.block || a.field - b.field)
                    .map((m) => {
                      return (
                        <div key={m.id} className="flex items-center gap-3 px-3 py-2.5 text-sm">
                          <span className="shrink-0 w-16 text-[10px] font-mono uppercase tracking-wider leading-tight text-gray-500">
                            B{m.block} · F{m.field}
                            <br />
                            {m.status === 'live' ? (
                              <span className="text-red-400 animate-pulse">● LIVE</span>
                            ) : m.status === 'beendet' ? (
                              <span className="text-emerald-400">Ende</span>
                            ) : (
                              <span className="text-[#ff7ac4]">{m.start}</span>
                            )}
                          </span>
                          <div className="flex-1 min-w-0 flex items-center gap-2">
                            <span className="flex-1 text-right font-sans font-semibold text-white truncate">{m.home}</span>
                            <span className="shrink-0 px-2 font-display font-black text-white tabular-nums">
                              {m.homeScore !== null && m.awayScore !== null ? `${m.homeScore}:${m.awayScore}` : '–:–'}
                            </span>
                            <span className="flex-1 text-left font-sans font-semibold text-white truncate">{m.away}</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => setOpenEventMatch(m.id)}
                            className="shrink-0 px-3 py-1.5 rounded-md border border-[#E6238E]/40 text-[#ff9ad4] bg-[rgba(230,35,142,.1)] hover:bg-[rgba(230,35,142,.2)] text-[10px] font-bold uppercase tracking-wider transition-colors cursor-pointer"
                          >
                            Verwalten
                          </button>
                        </div>
                      );
                    })}
                </div>
                <p className="mt-2 text-[11px] text-gray-500 font-sans">
                  „Verwalten" öffnet das Spiel – dort Ergebnis, Torschützen, Torwart, bester Spieler, Abwesende und
                  Live/Beendet eintragen. Änderungen werden beim Speichern/Schließen sofort gesichert.
                </p>
              </div>

              <div className="flex items-center justify-between gap-3 flex-wrap">
                <button
                  type="button"
                  onClick={deleteSelectedEvent}
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-full border border-red-500/30 text-red-300 hover:bg-red-500/10 hover:border-red-500/50 text-xs font-bold uppercase tracking-wider transition-all cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                  Testspiel löschen
                </button>
                <div className="flex items-center gap-3">
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
                    onClick={() => saveEventArchive()}
                    className="px-6 py-3 bg-brand-accent hover:bg-brand-accent/80 border border-brand-accent-light/30 rounded-full text-xs font-bold uppercase tracking-wider transition-all text-white flex items-center gap-1.5 cursor-pointer shadow-lg shadow-brand-accent-light/10"
                  >
                    <Check className="w-4 h-4" />
                    <span>Speichern</span>
                  </button>
                </div>
              </div>
                </>
              ) : (
                <p className="text-xs text-gray-400 font-sans">Kein Testspiel ausgewählt – lege oben ein neues an.</p>
              )}
            </div>
          )}
        </div>

        {/* Verwalten-Popup (wie bei echten Spielen) */}
        {managedMatch && (
          <div
            className="fixed inset-0 z-[100] flex items-start sm:items-center justify-center p-3 sm:p-4 bg-black/70 backdrop-blur-sm overflow-y-auto"
            onClick={closeManage}
          >
            <div
              className="relative w-full max-w-lg my-6 rounded-2xl border border-[rgba(230,35,142,.4)] bg-[#0b0f0e] p-5 space-y-5 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[10px] font-mono uppercase tracking-wider text-gray-500">
                    Block {managedMatch.block} · Feld {managedMatch.field} · {managedMatch.start}
                  </div>
                  <h4 className="font-display font-black text-white text-lg leading-tight truncate">
                    {managedMatch.home} <span className="text-gray-600">vs</span> {managedMatch.away}
                  </h4>
                </div>
                <button type="button" onClick={closeManage} className="shrink-0 p-2 text-gray-400 hover:text-white cursor-pointer" title="Speichern & schließen">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Status */}
              <div className="inline-flex rounded-lg border border-white/10 overflow-hidden">
                {(['geplant', 'live', 'beendet'] as const).map((val) => {
                  const cur = (managedMatch.status ?? 'geplant') === val;
                  const lbl = val === 'geplant' ? 'Geplant' : val === 'live' ? 'LIVE' : 'Beendet';
                  return (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setMatchStatusSaved(managedMatch.id, val)}
                      className={`px-4 py-2 text-[11px] font-bold uppercase tracking-wider transition-colors cursor-pointer ${
                        cur
                          ? val === 'live'
                            ? 'bg-red-500/25 text-red-300'
                            : val === 'beendet'
                              ? 'bg-emerald-500/20 text-emerald-300'
                              : 'bg-white/10 text-white'
                          : 'text-gray-400 hover:text-white'
                      }`}
                    >
                      {val === 'live' && cur && <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-400 mr-1 align-middle animate-pulse" />}
                      {lbl}
                    </button>
                  );
                })}
              </div>

              {/* Ergebnis */}
              <div>
                <span className="block text-[10px] font-mono uppercase tracking-wider text-gray-400 mb-1.5">Ergebnis</span>
                <div className="flex items-center gap-2">
                  <span className="flex-1 text-right text-sm font-sans font-semibold text-white truncate">{managedMatch.home}</span>
                  <input
                    type="number"
                    min={0}
                    value={managedMatch.homeScore ?? ''}
                    onChange={(e) => setEventScore(managedMatch.id, 'home', e.target.value)}
                    className="w-12 bg-[#060E0F]/80 border border-white/10 rounded-md px-1 py-2 text-white text-center text-lg font-display font-black focus:outline-none focus:border-[#E6238E]"
                  />
                  <span className="text-gray-600">:</span>
                  <input
                    type="number"
                    min={0}
                    value={managedMatch.awayScore ?? ''}
                    onChange={(e) => setEventScore(managedMatch.id, 'away', e.target.value)}
                    className="w-12 bg-[#060E0F]/80 border border-white/10 rounded-md px-1 py-2 text-white text-center text-lg font-display font-black focus:outline-none focus:border-[#E6238E]"
                  />
                  <span className="flex-1 text-left text-sm font-sans font-semibold text-white truncate">{managedMatch.away}</span>
                </div>
              </div>

              {/* Torschützen – Felder entstehen automatisch aus dem Ergebnis */}
              {([
                ['home', managedMatch.home, managedMatch.homeScore] as const,
                ['away', managedMatch.away, managedMatch.awayScore] as const,
              ]).map(([side, team, score]) => {
                const count = score ?? 0;
                if (count === 0) return null;
                return (
                  <div key={side}>
                    <span className="block text-[10px] font-mono uppercase tracking-wider text-gray-400 mb-1.5">Tore · {team}</span>
                    <div className="space-y-1.5">
                      {Array.from({ length: count }).map((_, i) => {
                        const s = scorerAt(managedMatch, team, i);
                        return (
                          <div key={i} className="grid grid-cols-[auto_minmax(0,1fr)_minmax(0,1fr)] gap-1.5 items-center">
                            <span className="text-xs w-4 text-center">⚽</span>
                            {rosterField(team, s.player, (v) => setScorerAt(managedMatch.id, team, i, { player: v }), 'Torschütze')}
                            {rosterField(team, s.assist ?? '', (v) => setScorerAt(managedMatch.id, team, i, { assist: v }), 'Vorlage', s.player)}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}

              {/* Bester Spieler & Torwart */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <span className="block text-[10px] font-mono uppercase tracking-wider text-gray-400 mb-1.5">Bester Spieler</span>
                  <div className="space-y-1.5">
                    {[managedMatch.home, managedMatch.away].map((team) => (
                      <div key={team}>
                        <span className="block text-[9px] font-sans text-gray-500 mb-0.5 truncate">{team}</span>
                        {rosterField(team, getAward(managedMatch, 'bestPlayers', team), (v) => setAward(managedMatch.id, 'bestPlayers', team, v), 'kein')}
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <span className="block text-[10px] font-mono uppercase tracking-wider text-gray-400 mb-1.5">Torwart (für „zu null")</span>
                  <div className="space-y-1.5">
                    {[managedMatch.home, managedMatch.away].map((team) => (
                      <div key={team}>
                        <span className="block text-[9px] font-sans text-gray-500 mb-0.5 truncate">{team}</span>
                        {rosterField(team, getAward(managedMatch, 'goalkeepers', team), (v) => setAward(managedMatch.id, 'goalkeepers', team, v), 'kein')}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Abwesende Spieler */}
              <div>
                <span className="block text-[10px] font-mono uppercase tracking-wider text-gray-400 mb-1.5">Abwesende Spieler</span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {[managedMatch.home, managedMatch.away].map((team) => {
                    const roster = rosterOf(team);
                    return (
                      <div key={team} className="rounded-lg border border-white/10 p-2.5">
                        <div className="text-[11px] font-sans font-bold text-gray-300 mb-1.5 truncate">{team}</div>
                        {roster.length === 0 ? (
                          <p className="text-[10px] text-gray-600 font-sans">Kein Kader hinterlegt.</p>
                        ) : (
                          <div className="flex flex-wrap gap-1.5">
                            {roster.map((p) => {
                              const absent = isAbsent(managedMatch, team, p.name);
                              return (
                                <button
                                  key={p.name}
                                  type="button"
                                  onClick={() => toggleAbsent(managedMatch.id, team, p.name)}
                                  className={`px-2 py-1 rounded-md text-[11px] font-sans border transition-colors cursor-pointer ${
                                    absent
                                      ? 'bg-rose-500/15 border-rose-500/40 text-rose-300 line-through'
                                      : 'bg-[#060E0F]/60 border-white/10 text-gray-300 hover:text-white hover:border-white/25'
                                  }`}
                                >
                                  {p.name}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center justify-between gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => resetEventMatch(managedMatch.id)}
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-full border border-white/15 text-gray-300 hover:text-rose-300 hover:border-rose-500/40 text-[11px] font-bold uppercase tracking-wider transition-all cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Zurücksetzen
                </button>
                <button
                  type="button"
                  onClick={closeManage}
                  className="px-6 py-3 bg-brand-accent hover:bg-brand-accent/80 border border-brand-accent-light/30 rounded-full text-xs font-bold uppercase tracking-wider transition-all text-white flex items-center gap-1.5 cursor-pointer shadow-lg shadow-brand-accent-light/10"
                >
                  <Check className="w-4 h-4" />
                  <span>Speichern &amp; schließen</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </AccordionSection>

      {/* Saison verwalten (nur Super-Admin) */}
      {isSuperadmin && (
      <AccordionSection
        id="season"
        category="spiele"
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
