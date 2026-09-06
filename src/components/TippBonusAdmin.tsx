import { useEffect, useMemo, useState } from 'react';
import { Loader2, Check, Save } from 'lucide-react';
import type { Team } from '../types';
import { BONUS_QUESTIONS, fetchBonus, saveBonusSolution } from '../lib/tips';

// Super-Admin: die korrekten Antworten der Saison-Zusatzfragen setzen. Sobald
// gespeichert, bekommen die Teilnehmer automatisch ihre Zusatzpunkte gutgeschrieben.
export default function TippBonusAdmin({ teams }: { teams: Team[] }) {
  const teamsSorted = useMemo(() => [...teams].sort((a, b) => a.name.localeCompare(b.name)), [teams]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    fetchBonus(null)
      .then((b) => setAnswers(b.solution || {}))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const save = async () => {
    setSaving(true);
    setSaved(false);
    setErr('');
    try {
      await saveBonusSolution(answers);
      setSaved(true);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Fehler');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="flex items-center justify-center py-8 text-hl-mute"><Loader2 className="w-5 h-5 animate-spin" /></div>;

  const selectCls = 'w-full bg-brand-dark border border-white/10 rounded-lg px-3 py-2 text-sm text-white font-sans focus:outline-none focus:border-brand-accent-light cursor-pointer';

  return (
    <div>
      <p className="text-[13px] text-hl-mute font-sans mb-4 leading-relaxed">
        Am Saisonende die richtige Antwort je Frage wählen und speichern – die Punkte werden automatisch vergeben und in
        der Tippspiel-Rangliste dazugezählt. Leer lassen = noch nicht entschieden.
      </p>
      <div className="space-y-3">
        {BONUS_QUESTIONS.map((q) => (
          <div key={q.id}>
            <div className="flex items-center justify-between gap-2 mb-1">
              <span className="text-[12px] font-sans font-semibold text-hl-soft">{q.label}</span>
              <span className="text-[10px] font-sans font-black text-brand-accent-light shrink-0">{q.points} Pkt</span>
            </div>
            <select
              value={answers[q.id] ?? ''}
              onChange={(e) => { setAnswers((a) => ({ ...a, [q.id]: e.target.value })); setSaved(false); }}
              className={selectCls}
            >
              <option value="">– noch offen –</option>
              {teamsSorted.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
        ))}
      </div>
      {err && <p className="text-xs text-rose-300 font-sans mt-3">{err}</p>}
      <button
        onClick={save}
        disabled={saving}
        className="mt-4 w-full inline-flex items-center justify-center gap-2 rounded-xl bg-brand-accent-light px-4 py-2.5 text-sm font-sans font-black uppercase tracking-wider text-[#04120d] cursor-pointer active:scale-[0.98] transition-transform disabled:opacity-60"
      >
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
        {saved ? 'Gespeichert' : 'Lösung speichern & Punkte vergeben'}
      </button>
    </div>
  );
}
