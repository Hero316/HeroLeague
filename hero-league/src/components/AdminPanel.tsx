import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Shield, RotateCcw, Play, Plus, BookOpen, Check, Trash } from 'lucide-react';
import { Team } from '../types';

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
  const [editTeamRoster, setEditTeamRoster] = useState('');
  const [editSuccess, setEditSuccess] = useState(false);

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
      setEditTeamRoster(team.spielerliste ? team.spielerliste.join(', ') : '');
    } else {
      setEditTeamName('');
      setEditTeamShort('');
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
      spielerliste: rosterArray,
    });

    setEditSuccess(true);
    setTimeout(() => setEditSuccess(false), 3000);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
      {/* Left side: Admin Actions Deck */}
      <div className="lg:col-span-7 space-y-6">
        <div className="bg-[#1E1B4B]/40 border border-white/10 rounded-xl p-6 shadow-xl backdrop-blur-sm">
          <h3 className="font-display font-bold text-xl uppercase tracking-tight text-white mb-6 flex items-center gap-2">
            <Shield className="w-5 h-5 text-emerald-400" />
            Liga-Verwaltungskonsole
          </h3>

          <div className="space-y-4">
            {/* Action 1: Simulate Season */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 bg-[#0A0118]/40 border border-white/5 rounded-xl gap-4">
              <div className="space-y-1">
                <h4 className="text-sm font-semibold text-white uppercase tracking-tight">Saison fertig simulieren</h4>
                <p className="text-xs text-gray-400 font-sans leading-relaxed">
                  Generiert realistische Ergebnisse für alle verbleibenden Partien im Spielplan. Perfekt zum schnellen Testen der Tabellensortierung.
                </p>
              </div>
              <button
                onClick={onSimulateRemaining}
                className="w-full sm:w-auto px-6 py-2.5 bg-brand-accent-light hover:bg-brand-accent rounded-full text-xs font-bold uppercase tracking-wider transition-all shadow-lg shadow-brand-accent-light/25 cursor-pointer text-white flex items-center justify-center space-x-1.5 shrink-0"
              >
                <Play className="w-4 h-4" />
                <span>Simulieren</span>
              </button>
            </div>

            {/* Action 2: Reset Season */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 bg-rose-950/10 border border-rose-900/20 rounded-xl gap-4">
              <div className="space-y-1">
                <h4 className="text-sm font-semibold text-rose-300 uppercase tracking-tight">Saison zurücksetzen</h4>
                <p className="text-xs text-gray-400 font-sans leading-relaxed">
                  Löscht alle eingetragenen Tore und setzt den gesamten Spielplan zurück auf "bevorstehend". Alle Vereine starten wieder mit 0 Punkten.
                </p>
              </div>
              <button
                onClick={() => {
                  if (confirm('Bist du sicher, dass du alle Ergebnisse zurücksetzen möchtest? Das kann nicht rückgängig gemacht werden.')) {
                    onResetSaison();
                  }
                }}
                className="w-full sm:w-auto px-6 py-2.5 bg-rose-600/15 hover:bg-rose-600/25 border border-rose-500/30 text-rose-300 text-xs font-bold uppercase rounded-full tracking-wider transition-colors shrink-0 cursor-pointer flex items-center justify-center space-x-1.5"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Zurücksetzen</span>
              </button>
            </div>
          </div>
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
      <div className="lg:col-span-12 mt-6">
        <div className="bg-[#1E1B4B]/40 border border-white/10 rounded-xl p-6 shadow-xl backdrop-blur-sm">
          <h3 className="font-display font-bold text-xl uppercase tracking-tight text-white mb-4 flex items-center gap-2">
            <Shield className="w-5 h-5 text-brand-accent-light" />
            Club & Kader bearbeiten
          </h3>
          <p className="text-xs text-gray-400 font-sans mb-6">
            Wähle einen bestehenden Club aus, um dessen Namen, Kürzel oder die Liste der Spieler (Kader) direkt anzupassen.
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
                    Gib alle Spieler getrennt durch Kommas ein. Diese Spieler stehen anschließend als Torschützen zur Verfügung.
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
                      className="text-xs text-emerald-400 uppercase tracking-wider"
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
    </div>
  );
}
