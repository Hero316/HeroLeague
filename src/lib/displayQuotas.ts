import type { ActionCounts } from '../types';

// ===========================================================================
// Quoten für die ANZEIGE (Spielerprofil, Steckbrief): immer „X von Y", damit
// jeder sieht, woraus die Prozentzahl entsteht. Bewusst einfache Brüche:
//  • Passquote      = angekommene ÷ alle Pässe
//  • Schussquote    = Schüsse aufs Tor (inkl. Tore) ÷ alle Schüsse
//  • Zweikampfquote = gewonnene ÷ alle Zweikämpfe
//  • Dribblingquote = erfolgreiche ÷ alle Dribblings
//  • Paradenquote   = Paraden ÷ (Paraden + Gegentore)
// (Die FIFA-Karte rechnet intern mit eigenen Gewichten – das hier ist nur die
// klare Anzeige.)
// ===========================================================================

export interface ShownQuota {
  key: string;
  label: string; // z. B. „Schussquote"
  value: string; // „73%" oder „–"
  made: number;
  total: number;
  detail: string; // z. B. „11 von 16 Schüssen aufs Tor"
}

const pct = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 100)}%` : '–');
const q = (key: string, label: string, made: number, total: number, unit: string, verb: string, none: string): ShownQuota => ({
  key,
  label,
  value: pct(made, total),
  made,
  total,
  detail: total > 0 ? `${made} von ${total} ${unit} ${verb}` : none,
});

export function fieldQuotas(t: ActionCounts): ShownQuota[] {
  const shots = t.goal + t.shot_on + t.shot_miss + t.shot_blocked_off;
  return [
    q('pass', 'Passquote', t.pass_ok, t.pass_ok + t.pass_fail, 'Pässen', 'angekommen', 'noch keine Pässe'),
    q('shot', 'Schussquote', t.goal + t.shot_on, shots, 'Schüssen', 'aufs Tor', 'noch keine Schüsse'),
    q('duel', 'Zweikampfquote', t.duel_won, t.duel_won + t.duel_lost, 'Zweikämpfen', 'gewonnen', 'noch keine Zweikämpfe'),
    q('drib', 'Dribblingquote', t.dribble_won, t.dribble_won + t.dribble_lost, 'Dribblings', 'erfolgreich', 'noch keine Dribblings'),
  ];
}

export function keeperQuotas(t: ActionCounts, games: number, cleanSheets: number): ShownQuota[] {
  const ga = t.gk_goal_against;
  return [
    q('save', 'Paradenquote', t.save, t.save + ga, 'Torschüssen', 'gehalten', 'noch keine Torschüsse'),
    q('pass', 'Passquote', t.pass_ok, t.pass_ok + t.pass_fail, 'Pässen', 'angekommen', 'noch keine Pässe'),
    {
      key: 'ga',
      label: 'Gegentore pro Spiel',
      value: games > 0 ? (ga / games).toFixed(1).replace('.', ',') : '–',
      made: ga,
      total: games,
      detail: `${ga} ${ga === 1 ? 'Gegentor' : 'Gegentore'} in ${games} ${games === 1 ? 'Spiel' : 'Spielen'}`,
    },
    q('clean', 'Zu-null-Quote', cleanSheets, games, 'Spielen', 'zu null', 'noch keine Spiele'),
  ];
}
