import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Shield, RotateCcw, Play, Plus, BookOpen, Check, AlertTriangle, HelpCircle, Upload, Award } from 'lucide-react';
import { Team } from '../types';

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
    if (!file.type.startsWith('image/')) {
      alert('Bitte nur Bilddateien hochladen.');
      return;
    }
    setIsUploading(true);
    try {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64 = reader.result as string;
        const response = await fetch('/api/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image: base64, filename: file.name }),
        });
        if (!response.ok) {
          throw new Error('Upload fehlgeschlagen');
        }
        const data = await response.json();
        onChange(data.url);
      };
      reader.readAsDataURL(file);
    } catch (err) {
      console.error(err);
      alert('Fehler beim Bild-Upload.');
    } finally {
      setIsUploading(false);
    }
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
          isDragging ? 'border-brand-accent-light bg-brand-accent/10' : 'border-white/10 hover:border-white/20 bg-[#0A0118]/40'
        }`}
        onClick={() => {
          const input = document.createElement('input');
          input.type = 'file';
          input.accept = 'image/*';
          input.onchange = (e: any) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
          };
          input.click();
        }}
      >
        {isUploading ? (
          <div className="flex flex-col items-center py-2">
            <div className="animate-spin rounded-full h-5 w-5 border-2 border-brand-accent-light border-t-transparent mb-1.5" />
            <span className="text-[10px] text-gray-400 font-mono">Lädt hoch...</span>
          </div>
        ) : value ? (
          <div className="flex items-center gap-3 w-full">
            <img src={value} alt="Preview" className="w-10 h-10 rounded object-contain bg-white/5 border border-white/10 shrink-0" referrerPolicy="no-referrer" />
            <div className="flex-1 min-w-0">
              <span className="text-[10px] text-gray-400 font-mono block truncate">{value}</span>
              <span className="text-[9px] text-brand-accent-light hover:underline block mt-0.5">Anderes Bild wählen</span>
            </div>
          </div>
        ) : (
          <div className="text-center py-1.5 flex flex-col items-center justify-center">
            <Upload className="w-4 h-4 text-brand-accent-light mb-1" />
            <span className="text-brand-accent-light text-[11px] block font-semibold">Bild hochladen</span>
            <span className="text-[9px] text-gray-500 block mt-0.5">Drag & Drop oder Klick</span>
          </div>
        )}
      </div>
    </div>
  );
}

interface AdminPanelProps {
  teams: Team[];
  onAddTeam: (team: Team) => void;
  onResetSaison: () => void;
  onSimulateRemaining: () => void;
  onEditTeam: (teamId: string, updatedData: Partial<Team>) => void;
}

export default function AdminPanel({
  teams,
  onAddTeam,
  onResetSaison,
  onSimulateRemaining,
  onEditTeam,
}: AdminPanelProps) {
  // Add team form state
  const [newTeamName, setNewTeamName] = useState('');
  const [newTeamShort, setNewTeamShort] = useState('');
  const [newTeamColor, setNewTeamColor] = useState('#3B82F6');
  const [newTeamEmoji, setNewTeamEmoji] = useState('🛡️');
  const [formSuccess, setFormSuccess] = useState(false);

  // Edit team form state
  const [selectedEditTeamId, setSelectedEditTeamId] = useState('');
  const [editTeamName, setEditTeamName] = useState('');
  const [editTeamShort, setEditTeamShort] = useState('');
  const [editTeamColor, setEditTeamColor] = useState('#3B82F6');
  const [editTeamLogoUrl, setEditTeamLogoUrl] = useState('');
  const [editTeamRoster, setEditTeamRoster] = useState('');
  const [editSuccess, setEditSuccess] = useState(false);

  // Player of the Month editing state
  const [pomName, setPomName] = useState('');
  const [pomClub, setPomClub] = useState('');
  const [pomGoals, setPomGoals] = useState(0);
  const [pomAssists, setPomAssists] = useState(0);
  const [pomImage, setPomImage] = useState('');
  const [pomSuccess, setPomSuccess] = useState(false);

  useEffect(() => {
    fetch('/api/player-of-the-month')
      .then((res) => {
        if (res.ok) return res.json();
        throw new Error('POM not set yet');
      })
      .then((data) => {
        setPomName(data.name || '');
        setPomClub(data.club || '');
        setPomGoals(data.goals || 0);
        setPomAssists(data.assists || 0);
        setPomImage(data.image || '');
      })
      .catch((err) => console.log('No player of the month configured yet:', err));
  }, []);

  const handleSavePom = async () => {
    if (!pomName.trim()) {
      alert('Bitte geben Sie einen Spieler-Namen ein.');
      return;
    }
    try {
      const response = await fetch('/api/player-of-the-month', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: pomName.trim(),
          club: pomClub.trim(),
          goals: Number(pomGoals),
          assists: Number(pomAssists),
          image: pomImage,
        }),
      });
      if (!response.ok) throw new Error('POM save failed');
      setPomSuccess(true);
      setTimeout(() => setPomSuccess(false), 3000);
    } catch (err) {
      console.error(err);
      alert('Fehler beim Speichern des Spielers des Monats.');
    }
  };

  // High-Security Double Confirmation Modal state
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    action: 'simulate' | 'reset' | null;
  }>({ isOpen: false, action: null });
  const [confirmTextInput, setConfirmTextInput] = useState('');

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

  const handleSubmitTeam = (e: React.FormEvent) => {
    e.preventDefault();

    if (!newTeamName.trim() || !newTeamShort.trim()) {
      alert('Bitte füllen Sie alle Felder aus.');
      return;
    }

    const id = newTeamName.toLowerCase().replace(/\s+/g, '-');
    
    // Check if team already exists
    if (teams.some(t => t.id === id || t.shortName.toUpperCase() === newTeamShort.toUpperCase())) {
      alert('Ein Club mit diesem Namen oder Kürzel existiert bereits!');
      return;
    }

    onAddTeam({
      id,
      name: newTeamName.trim(),
      shortName: newTeamShort.trim().toUpperCase(),
      logoColor: newTeamColor,
      logoIcon: newTeamEmoji,
      logoUrl: '',
      spielerliste: [],
    });

    // Reset form
    setNewTeamName('');
    setNewTeamShort('');
    setFormSuccess(true);
    setTimeout(() => setFormSuccess(false), 3000);
  };

  const handleSelectTeamToEdit = (teamId: string) => {
    setSelectedEditTeamId(teamId);
    const team = teams.find((t) => t.id === teamId);
    if (team) {
      setEditTeamName(team.name);
      setEditTeamShort(team.shortName);
      setEditTeamColor(team.logoColor || '#3B82F6');
      setEditTeamLogoUrl(team.logoUrl || '');
      setEditTeamRoster(team.spielerliste ? team.spielerliste.join(', ') : '');
    } else {
      setEditTeamName('');
      setEditTeamShort('');
      setEditTeamColor('#3B82F6');
      setEditTeamLogoUrl('');
      setEditTeamRoster('');
    }
  };

  const handleSaveTeamEdit = () => {
    if (!selectedEditTeamId || !editTeamName.trim() || !editTeamShort.trim()) {
      alert('Bitte füllen Sie Name und Kürzel aus.');
      return;
    }

    const rosterArray = editTeamRoster
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    onEditTeam(selectedEditTeamId, {
      name: editTeamName.trim(),
      shortName: editTeamShort.trim().toUpperCase(),
      logoColor: editTeamColor,
      logoUrl: editTeamLogoUrl.trim(),
      spielerliste: rosterArray,
    });

    setEditSuccess(true);
    setTimeout(() => setEditSuccess(false), 3000);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 relative">
      {/* High-Security Double Confirmation Modal */}
      <AnimatePresence>
        {confirmModal.isOpen && (
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
              className="relative w-full max-w-md bg-[#130B24] border-2 border-rose-500/30 rounded-2xl p-6 sm:p-8 shadow-2xl overflow-hidden"
            >
              <div className="absolute top-0 left-0 right-0 h-1 bg-rose-600" />
              
              <div className="flex items-center gap-3 text-rose-400 mb-4">
                <AlertTriangle className="w-8 h-8 shrink-0 animate-bounce" />
                <h3 className="font-display font-black text-lg sm:text-xl uppercase tracking-tight">
                  Kritischer Sicherheits-Check
                </h3>
              </div>

              <p className="text-xs text-gray-300 font-sans leading-relaxed mb-4">
                {confirmModal.action === 'simulate' 
                  ? 'Du stehst kurz davor, die gesamte restliche Saison fertig zu simulieren. Dies überschreibt alle noch ungespielten Partien mit zufälligen Spielergebnissen und berechnet neue Torschützen.' 
                  : 'Du stehst kurz davor, die gesamte Saison zurückzusetzen. Dadurch werden alle Ergebnisse gelöscht, die Tabelle genullt und alle Torschützen-Daten permanent entfernt.'}
              </p>

              <div className="bg-rose-500/10 border border-rose-500/20 p-3 rounded-xl mb-4">
                <p className="text-xs font-semibold text-rose-300 font-sans leading-relaxed">
                  Um diese kritische Aktion unwiderruflich auszuführen, gib bitte das Wort <span className="font-mono bg-rose-500/25 px-2 py-0.5 rounded text-white font-black tracking-widest">BESTÄTIGEN</span> in das Feld unten ein:
                </p>
              </div>

              <input
                type="text"
                placeholder="BESTÄTIGEN eingeben..."
                value={confirmTextInput}
                onChange={(e) => setConfirmTextInput(e.target.value)}
                className="w-full bg-[#070114] border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-rose-500 font-mono tracking-wider placeholder:text-gray-600 mb-6 text-center"
              />

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setConfirmModal({ isOpen: false, action: null });
                    setConfirmTextInput('');
                  }}
                  className="flex-1 py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-xs font-bold uppercase text-gray-300 transition-all cursor-pointer"
                >
                  Abbrechen
                </button>
                <button
                  type="button"
                  disabled={confirmTextInput !== 'BESTÄTIGEN'}
                  onClick={() => {
                    if (confirmModal.action === 'simulate') {
                      onSimulateRemaining();
                    } else if (confirmModal.action === 'reset') {
                      onResetSaison();
                    }
                    setConfirmModal({ isOpen: false, action: null });
                    setConfirmTextInput('');
                  }}
                  className="flex-1 py-3 bg-rose-600 hover:bg-rose-500 disabled:opacity-30 disabled:hover:bg-rose-600 text-white font-bold uppercase rounded-xl text-xs tracking-wider transition-all cursor-pointer flex items-center justify-center space-x-1.5"
                >
                  <Check className="w-4 h-4" />
                  <span>Aktion ausführen</span>
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Left side: Admin Documentation & Controls */}
      <div className="lg:col-span-7 space-y-6">
        <div className="bg-[#1E1B4B]/40 border border-white/10 rounded-xl p-6 shadow-xl backdrop-blur-sm">
          <h3 className="font-display font-bold text-xl uppercase tracking-tight text-white mb-4 flex items-center gap-2">
            <Shield className="w-5 h-5 text-brand-accent-light" />
            Liga-Verwaltungskonsole
          </h3>
          <p className="text-xs text-gray-400 font-sans leading-relaxed">
            Willkommen im geschützten Administratorbereich der Hero League. Hier kannst du den Spielbetrieb verwalten, neue Vereine hinzufügen und Teamkader aktualisieren. Kritische administrative Schnellaktionen wurden aus Sicherheitsgründen in die Gefahrenzone am Seitenende verschoben.
          </p>
        </div>

        {/* Documentation / Code Extension Guide */}
        <div className="bg-[#1E1B4B]/40 border border-white/10 rounded-xl p-6 shadow-xl backdrop-blur-sm">
          <h3 className="font-display font-bold text-lg uppercase tracking-tight text-white mb-4 flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-brand-accent-light" />
            Entwickler-Dokumentation
          </h3>
          <div className="space-y-3 text-xs text-gray-300 font-sans leading-relaxed">
            <p>
              Diese Plattform wurde modular entworfen, damit du später problemlos eine **vollwertige Backend-Anbindung** integrieren kannst:
            </p>
            <ul className="list-disc list-inside space-y-1.5 pl-1 text-gray-400 uppercase tracking-wider text-[10px]">
              <li>
                <strong className="text-white">API-Routen proxyen:</strong> In deiner <code className="text-brand-accent-light bg-[#0A0118] px-1 py-0.5 rounded font-mono">server.ts</code> kannst du Express-Routen wie <code className="font-mono text-purple-300">/api/matches</code> schreiben.
              </li>
              <li>
                <strong className="text-white">Automatischer Sync:</strong> Die Tabellen-Logik in <code className="text-white font-mono">Tabelle.tsx</code> ist rein funktional aufgebaut. Sobald du das Match-Array aus einer Datenbank fütterst, kalkuliert sich die Tabelle ohne jegliches manuelle Zutun!
              </li>
              <li>
                <strong className="text-white">Dauerhafte Cloud-Speicherung:</strong> Du kannst die lokalen <code className="font-mono">useState</code> Hooks im App-Zentrum einfach durch Firebase Firestore oder Prisma-Datenbankabfragen ersetzen.
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* Right side: Add Club Form */}
      <div className="lg:col-span-5">
        <div className="bg-[#1E1B4B]/40 border border-white/10 rounded-xl p-6 shadow-xl backdrop-blur-sm">
          <h3 className="font-display font-bold text-xl uppercase tracking-tight text-white mb-6 flex items-center gap-2">
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
                className="w-full bg-[#0A0118] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-brand-accent-light"
              />
            </div>

            <div>
              <label className="block text-xs font-mono text-gray-400 mb-1.5 uppercase tracking-wider">ABKÜRZUNG (MAX 3 BUCHSTABEN)</label>
              <input
                type="text"
                required
                maxLength={3}
                placeholder="z.B. PHO"
                value={newTeamShort}
                onChange={(e) => setNewTeamShort(e.target.value)}
                className="w-full bg-[#0A0118] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-brand-accent-light uppercase font-mono"
              />
            </div>

            {/* Colors */}
            <div>
              <label className="block text-xs font-mono text-gray-400 mb-2 uppercase tracking-wider">CLUB-AKZENTFARBE</label>
              <div className="flex flex-wrap gap-2">
                {colors.map((color) => (
                  <button
                    key={color.hex}
                    type="button"
                    onClick={() => setNewTeamColor(color.hex)}
                    className={`w-8 h-8 rounded-full border transition-all duration-150 cursor-pointer ${
                      newTeamColor === color.hex
                        ? 'border-white scale-110 shadow-lg'
                        : 'border-transparent opacity-60 hover:opacity-100'
                    }`}
                    style={{ backgroundColor: color.hex }}
                    title={color.name}
                  />
                ))}
              </div>
            </div>

            {/* Emojis */}
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
                        : 'bg-[#0A0118] border-white/10 hover:bg-white/5 text-gray-300'
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

      {/* Bottom Section: Edit Existing Teams and Rosters */}
      <div className="lg:col-span-12">
        <div className="bg-[#1E1B4B]/40 border border-white/10 rounded-xl p-6 shadow-xl backdrop-blur-sm">
          <h3 className="font-display font-bold text-xl uppercase tracking-tight text-white mb-4 flex items-center gap-2">
            <Shield className="w-5 h-5 text-brand-accent-light" />
            Club & Kader bearbeiten
          </h3>
          <p className="text-xs text-gray-400 font-sans mb-6">
            Wähle einen bestehenden Club aus, um dessen Namen, Kürzel, Vereinsfarbe, ein hochgeladenes Logo oder die Liste der Spieler (Kader) direkt anzupassen.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
            {/* Team Selector */}
            <div className="md:col-span-4">
              <label className="block text-xs font-mono text-gray-400 mb-1.5 uppercase tracking-wider">CLUB WÄHLEN</label>
              <select
                value={selectedEditTeamId}
                onChange={(e) => handleSelectTeamToEdit(e.target.value)}
                className="w-full bg-[#0A0118] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-brand-accent-light cursor-pointer"
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
              <div className="md:col-span-8 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-mono text-gray-400 mb-1.5 uppercase tracking-wider">CLUB-NAME</label>
                  <input
                    type="text"
                    value={editTeamName}
                    onChange={(e) => setEditTeamName(e.target.value)}
                    className="w-full bg-[#0A0118] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-brand-accent-light"
                  />
                </div>

                <div>
                  <label className="block text-xs font-mono text-gray-400 mb-1.5 uppercase tracking-wider">KÜRZEL</label>
                  <input
                    type="text"
                    maxLength={3}
                    value={editTeamShort}
                    onChange={(e) => setEditTeamShort(e.target.value)}
                    className="w-full bg-[#0A0118] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-brand-accent-light uppercase font-mono"
                  />
                </div>

                {/* Team Logo Image Uploader */}
                <div>
                  <ImageUploader
                    label="Vereinslogo (Upload)"
                    value={editTeamLogoUrl}
                    onChange={(url) => setEditTeamLogoUrl(url)}
                  />
                </div>

                <div>
                  <label className="block text-xs font-mono text-gray-400 mb-1.5 uppercase tracking-wider">INDIVIDUELLE VEREINSFARBE</label>
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
                            editTeamColor === color.hex
                              ? 'border-white scale-110 shadow'
                              : 'border-transparent opacity-60 hover:opacity-100'
                          }`}
                          style={{ backgroundColor: color.hex }}
                          title={color.name}
                        />
                      ))}
                    </div>
                  </div>
                </div>

                <div className="md:col-span-2">
                  <label className="block text-xs font-mono text-gray-400 mb-1.5 uppercase tracking-wider">
                    SPIELER-KADER (MIT KOMMA TRENNEN)
                  </label>
                  <textarea
                    rows={3}
                    value={editTeamRoster}
                    onChange={(e) => setEditTeamRoster(e.target.value)}
                    placeholder="z.B. Florian Wirtz, Granit Xhaka, Victor Boniface"
                    className="w-full bg-[#0A0118] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-brand-accent-light font-sans"
                  />
                  <p className="text-[10px] text-gray-400 font-sans mt-1">
                    Gib alle Spieler getrennt durch Kommas ein. Diese Spieler stehen anschließend im Spielplan zur Torschützen-Zuweisung bereit.
                  </p>
                </div>

                <div className="md:col-span-2 flex flex-col items-end gap-2 mt-2">
                  <button
                    type="button"
                    onClick={handleSaveTeamEdit}
                    className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 rounded-full text-xs font-bold uppercase tracking-wider transition-all text-white flex items-center gap-1.5 cursor-pointer"
                  >
                    <Check className="w-4 h-4" />
                    <span>Änderungen speichern</span>
                  </button>

                  {editSuccess && (
                    <motion.span
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="text-xs text-emerald-400 uppercase tracking-wider font-mono"
                    >
                      ✓ Club-Daten gespeichert!
                    </motion.span>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Player of the Month configuration card */}
      <div className="lg:col-span-12 mt-4">
        <div className="bg-[#1E1B4B]/40 border border-white/10 rounded-xl p-6 shadow-xl backdrop-blur-sm">
          <h3 className="font-display font-bold text-xl uppercase tracking-tight text-white mb-4 flex items-center gap-2">
            <Award className="w-5 h-5 text-yellow-400" />
            Spieler des Monats konfigurieren
          </h3>
          <p className="text-xs text-gray-400 font-sans mb-6">
            Pflegetool für den "Spieler des Monats". Bestimme den ausgezeichneten Spieler, seinen Verein, die Leistungsdaten und lade sein Portraitfoto direkt hoch.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
            <div>
              <label className="block text-xs font-mono text-gray-400 mb-1.5 uppercase tracking-wider">SPIELER-NAME</label>
              <input
                type="text"
                value={pomName}
                onChange={(e) => setPomName(e.target.value)}
                placeholder="z.B. Florian Wirtz"
                className="w-full bg-[#0A0118] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-brand-accent-light"
              />
            </div>

            <div>
              <label className="block text-xs font-mono text-gray-400 mb-1.5 uppercase tracking-wider">VEREIN</label>
              <input
                type="text"
                value={pomClub}
                onChange={(e) => setPomClub(e.target.value)}
                placeholder="z.B. Bayer Leverkusen"
                className="w-full bg-[#0A0118] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-brand-accent-light"
              />
            </div>

            <div>
              <label className="block text-xs font-mono text-gray-400 mb-1.5 uppercase tracking-wider">TORE IN DIESEM MONAT</label>
              <input
                type="number"
                min={0}
                value={pomGoals}
                onChange={(e) => setPomGoals(Number(e.target.value))}
                className="w-full bg-[#0A0118] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-brand-accent-light"
              />
            </div>

            <div>
              <label className="block text-xs font-mono text-gray-400 mb-1.5 uppercase tracking-wider">VORLAGEN IN DIESEM MONAT</label>
              <input
                type="number"
                min={0}
                value={pomAssists}
                onChange={(e) => setPomAssists(Number(e.target.value))}
                className="w-full bg-[#0A0118] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-brand-accent-light"
              />
            </div>

            <div className="md:col-span-2">
              <ImageUploader
                label="Spieler-Portraitfoto (Upload)"
                value={pomImage}
                onChange={(url) => setPomImage(url)}
              />
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
                onClick={handleSavePom}
                className="px-6 py-3 bg-brand-accent hover:bg-brand-accent/80 border border-brand-accent-light/30 rounded-full text-xs font-bold uppercase tracking-wider transition-all text-white flex items-center gap-1.5 cursor-pointer shadow-lg shadow-brand-accent-light/10"
              >
                <Check className="w-4 h-4" />
                <span>Spieler auszeichnen</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Deep Segregated Danger Zone Section */}
      <div className="lg:col-span-12 mt-4">
        <div className="border border-red-500/20 bg-red-950/5 rounded-xl p-6 shadow-xl backdrop-blur-sm">
          <h3 className="font-display font-bold text-lg uppercase tracking-tight text-red-400 mb-2 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-red-500" />
            ⚠️ Gefahrenzone (Kritische Liga-Aktionen)
          </h3>
          <p className="text-xs text-gray-400 font-sans mb-6">
            Diese Aktionen verändern die Spieldaten der gesamten Saison gravierend. Jede Aktion erfordert eine doppelte Bestätigung.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Action 1: Simulate Season */}
            <div className="p-4 bg-black/40 border border-white/5 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <h4 className="text-xs font-bold text-white uppercase tracking-wider">Saison fertig simulieren</h4>
                <p className="text-[11px] text-gray-400 font-sans leading-relaxed">
                  Generiert realistische Ergebnisse für alle verbleibenden Partien im Spielplan samt Torschützen.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setConfirmModal({ isOpen: true, action: 'simulate' })}
                className="w-full sm:w-auto px-5 py-2.5 bg-brand-accent-light hover:bg-brand-accent text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-all cursor-pointer flex items-center justify-center space-x-1.5 shrink-0"
              >
                <Play className="w-4 h-4" />
                <span>Simulieren</span>
              </button>
            </div>

            {/* Action 2: Reset Season */}
            <div className="p-4 bg-red-950/10 border border-red-500/10 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <h4 className="text-xs font-bold text-red-400 uppercase tracking-wider">Saison zurücksetzen</h4>
                <p className="text-[11px] text-gray-400 font-sans leading-relaxed">
                  Löscht alle Ergebnisse, die Tabelle wird genullt und alle Torschützen-Statistiken werden gelöscht.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setConfirmModal({ isOpen: true, action: 'reset' })}
                className="w-full sm:w-auto px-5 py-2.5 bg-rose-950/40 hover:bg-rose-900/50 border border-rose-500/30 text-rose-300 text-xs font-bold uppercase rounded-xl tracking-wider transition-all cursor-pointer flex items-center justify-center space-x-1.5 shrink-0"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Zurücksetzen</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
