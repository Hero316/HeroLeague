import type {
  ActionCounts,
  CardAttrTarget,
  CardTier,
  PlayerCard,
  Quotas,
  ScoringConfig,
  StatRole,
} from '../types';
import { ACTION_KEYS } from './scoring';

// ===========================================================================
// Rating-Engine — reine Funktionen, ohne Seiteneffekte. Server (api/) und
// Website nutzen exakt diese Rechnung. Eingang: Roh-Zähler + ScoringConfig.
// Ausgang: Rohscore, Note (6–10), Quoten und Kartenwerte.
// ===========================================================================

export function emptyCounts(): ActionCounts {
  return {
    pass_ok: 0,
    pass_fail: 0,
    key_pass: 0,
    assist: 0,
    shot_on: 0,
    shot_miss: 0,
    shot_blocked_off: 0,
    goal: 0,
    goal_header: 0,
    dribble_won: 0,
    dribble_lost: 0,
    duel_won: 0,
    duel_lost: 0,
    interception: 0,
    shot_blocked_def: 0,
    turnover: 0,
    own_goal: 0,
    penalty_goal: 0,
    save: 0,
    save_top: 0,
    gk_goal_against: 0,
    penalty_save: 0,
    gk_position_save: 0,
  };
}

// Beliebige (auch unvollständige) gespeicherte Zähler in ein sauberes,
// vollständiges ActionCounts überführen (nur ganze, nicht-negative Zahlen).
export function normalizeCounts(raw: unknown): ActionCounts {
  const base = emptyCounts();
  if (!raw || typeof raw !== 'object') return base;
  const r = raw as Record<string, unknown>;
  for (const key of ACTION_KEYS) {
    const v = r[key];
    if (typeof v === 'number' && Number.isFinite(v) && v > 0) {
      base[key] = Math.min(999, Math.floor(v));
    }
  }
  return base;
}

// Mehrere Spiel-Zähler eines Spielers zu Saisonsummen addieren.
export function sumCounts(list: ActionCounts[]): ActionCounts {
  const total = emptyCounts();
  for (const c of list) {
    for (const key of ACTION_KEYS) total[key] += c[key] || 0;
  }
  return total;
}

// --- abgeleitete Basiswerte -------------------------------------------------

// Gesamtschüsse = Tore + gehaltene Torschüsse + geblockte Schüsse + Fehlschüsse.
export function gesamtschuesse(c: ActionCounts): number {
  return c.goal + c.shot_on + c.shot_blocked_off + c.shot_miss;
}

export function passversuche(c: ActionCounts): number {
  return c.pass_ok + c.pass_fail;
}

// --- Rohscore & Note --------------------------------------------------------

// Rohscore eines Spielers in EINEM Spiel. `role` steuert den Zu-null-Bonus:
// ein Torwart ohne Gegentor bekommt den CLEAN_SHEET-Bonus.
export function rohscore(c: ActionCounts, cfg: ScoringConfig, role: StatRole = 'field'): number {
  let sum = 0;
  for (const key of ACTION_KEYS) sum += (c[key] || 0) * (cfg.points[key] || 0);
  if (role === 'keeper' && c.gk_goal_against === 0 && isKeeperActive(c)) {
    sum += cfg.cleanSheetBonus;
  }
  return round2(sum);
}

// „War der Torwart in diesem Spiel wirklich im Tor?" – irgendeine Torwart- oder
// Feldaktion reicht, damit ein leerer Datensatz keinen Gratis-Bonus bekommt.
export function isKeeperActive(c: ActionCounts): boolean {
  return c.save > 0 || c.gk_position_save > 0 || c.penalty_save > 0 || passversuche(c) > 0;
}

// Spiele zu null eines Torwarts – EINE Regel für Karte, Goldenen Handschuh und
// Ranglisten: als Torwart getrackt, aktiv im Spiel, kein Gegentor.
export function countCleanSheets(rows: { role: StatRole; counts: ActionCounts }[]): number {
  let n = 0;
  for (const r of rows) if (r.role === 'keeper' && r.counts.gk_goal_against === 0 && isKeeperActive(r.counts)) n++;
  return n;
}

// Note eines Spiels: base + factor · Rohscore, begrenzt auf [min, max].
export function matchNote(c: ActionCounts, cfg: ScoringConfig, role: StatRole = 'field'): number {
  const raw = cfg.rating.base + cfg.rating.factor * rohscore(c, cfg, role);
  return round2(clamp(raw, cfg.rating.min, cfg.rating.max));
}

// --- Quoten (Saison) --------------------------------------------------------

export function quotas(c: ActionCounts, cfg: ScoringConfig): Quotas {
  const versuche = passversuche(c);
  const schuesse = gesamtschuesse(c);
  const zk = c.duel_won + c.duel_lost;
  const dribblings = c.dribble_won + c.dribble_lost;
  const gkActions = c.save + c.gk_goal_against;

  // Schussqualität = (Tore + gehaltene Torschüsse + Blockfaktor · Blocks OFF) / Gesamtschüsse.
  const schussqualitaet =
    schuesse > 0 ? (c.goal + c.shot_on + cfg.shotBlockFactor * c.shot_blocked_off) / schuesse : null;

  return {
    passquote: versuche >= cfg.minimums.passes ? c.pass_ok / versuche : null,
    passversuche: versuche,
    schussquote: schuesse >= cfg.minimums.shots ? schussqualitaet : null,
    chancenverwertung: schuesse >= cfg.minimums.shots ? c.goal / schuesse : null,
    gesamtschuesse: schuesse,
    zweikampfquote: zk >= cfg.minimums.duels ? c.duel_won / zk : null,
    dribblingquote: dribblings > 0 ? c.dribble_won / dribblings : null,
    torwartquote: gkActions >= cfg.minimums.gk ? c.save / gkActions : null,
  };
}

// --- Kartenwerte ------------------------------------------------------------

// Elite-Index aus Quote + Menge (Index 1,00 = Elite-Ziel). Die Menge über dem
// Ziel wird bei `mengeMax` gedeckelt (einstellbar): Volumen wird belohnt, ohne
// dass reine Masse allein den Höchstwert erreicht.
function attrIndex(quote: number, menge: number, t: CardAttrTarget, mengeMax: number): number {
  const q = t.zielQuote > 0 ? quote / t.zielQuote : 0;
  let m = t.zielMenge > 0 ? menge / t.zielMenge : 0;
  m = Math.min(mengeMax, m);
  return t.gewQuote * q + t.gewMenge * m;
}

// Reine Mengen-Quote (z.B. Schlüsselpässe/Spiel), bei `mengeMax` gedeckelt.
function mengeRatio(value: number, ziel: number, mengeMax: number): number {
  return Math.min(mengeMax, safeDiv(value, ziel));
}

// Kappen-Obergrenze abhängig von der Spielzahl (schützt vor Ausreißern bei
// kleiner Stichprobe). Ab `fullGames` gilt die volle Elite-Kappe.
export function capForGames(games: number, cfg: ScoringConfig): number {
  const c = cfg.card.caps;
  if (games >= cfg.card.fullGames) return c.g8plus;
  if (games >= 5) return c.g5_7;
  if (games >= 3) return c.g3_4;
  return c.g1_2;
}

// Verlässlichkeit aus dem Stichprobenumfang: R = min(1, √(vol / vollAktionen)).
// √-Kurve = sanft (früher Anstieg, dann abflachend). Bei wenig Aktionen zieht
// der Wert Richtung Basis, statt sofort den Höchstwert zu erreichen.
function reliability(vol: number, voll: number): number {
  if (voll <= 0) return 1;
  return Math.min(1, Math.sqrt(Math.max(0, vol) / voll));
}

// Kartenwert: Wert = basis + R · Index · Spanne, gedeckelt bei `cap`.
// R (Verlässlichkeit) dämpft bei wenig Aktionen; die Spanne bestimmt, wie viel
// „Ziel erreicht" (Index 1,00) einbringt. Alle Werte kommen aus den
// Score-Einstellungen und sind im Tracking Center justierbar.
function cardValue(index: number, vol: number, voll: number, cap: number, cfg: ScoringConfig): number {
  const R = reliability(vol, voll);
  const raw = cfg.card.basis + R * Math.max(0, index) * cfg.card.spanne;
  return Math.round(clamp(raw, cfg.card.basis, cap));
}

// --- Erklärung der Karte ----------------------------------------------------
// Die Karte wird NICHT zweimal gerechnet: `fieldCardExplain`/`keeperCardExplain`
// bauen die komplette Herleitung (jede Quote, jede Menge, jedes Ziel, die
// Verlässlichkeit), und die Karte selbst ist nur die Summe daraus. So zeigt die
// Info-Ansicht auf der Spielerseite garantiert genau das, was auf der Karte steht.

export interface ExplainPart {
  label: string; // z.B. „Passquote"
  value: number; // der Wert des Spielers
  ziel: number; // Elite-Ziel (Index 1,00)
  kind: 'percent' | 'perGame' | 'number';
  weight: number; // Gewicht im Index
  ratio: number; // value/ziel (Menge gedeckelt, bei invert umgedreht)
  invert?: boolean; // „je weniger, desto besser" (Gegentore)
}
export interface ExplainAttr {
  key: string;
  label: string;
  what: string; // ein Satz: was dieser Wert misst
  value: number;
  parts: ExplainPart[];
  index: number; // Σ Gewicht · Verhältnis
  vol: number; // Stichprobe (Aktionen)
  voll: number; // ab so vielen Aktionen volle Verlässlichkeit
  volLabel: string; // z.B. „Pässe"
  r: number; // Verlässlichkeit 0..1
  raw: number; // vor dem Deckel
}
export interface CardExplain {
  role: StatRole;
  games: number;
  basis: number;
  spanne: number;
  cap: number;
  capNote: string;
  attrs: ExplainAttr[];
  ges: number;
  tier: CardTier;
}

function attrExplain(
  key: string,
  label: string,
  what: string,
  parts: ExplainPart[],
  vol: number,
  voll: number,
  volLabel: string,
  cap: number,
  cfg: ScoringConfig
): ExplainAttr {
  const index = parts.reduce((sum, p) => sum + p.weight * p.ratio, 0);
  const r = reliability(vol, voll);
  const raw = cfg.card.basis + r * Math.max(0, index) * cfg.card.spanne;
  return { key, label, what, value: cardValue(index, vol, voll, cap, cfg), parts, index, vol, voll, volLabel, r, raw };
}

function capNoteFor(games: number, cfg: ScoringConfig, ignoreGamesCap: boolean): string {
  if (ignoreGamesCap) return 'Testspiel: kein Spiele-Deckel';
  if (games >= cfg.card.fullGames) return `ab ${cfg.card.fullGames} Spielen: volle Kappe`;
  if (games >= 5) return 'bei 5–7 Spielen';
  if (games >= 3) return 'bei 3–4 Spielen';
  return 'bei 1–2 Spielen';
}

function cardFromExplain(e: CardExplain, labels: Record<string, string>): PlayerCard {
  return {
    role: e.role,
    ges: e.ges,
    tier: e.tier,
    attrs: e.attrs.map((a) => ({ key: a.key, label: labels[a.key] ?? a.label, value: a.value })),
  };
}

const pct = (a: number, b: number) => (b > 0 ? a / b : 0);

// Feldspieler-Karte: PAS · SCH · DRI · DEF → GES (gerundeter Schnitt).
// ignoreGamesCap=true → kein „wenig-Spiele-Deckel" (z.B. Testspieltag): rein aus
// den echten Stats, voller Wertebereich bis zur Elite-Kappe.
export function fieldCardExplain(total: ActionCounts, games: number, cfg: ScoringConfig, ignoreGamesCap = false): CardExplain {
  const g = Math.max(1, games);
  // Cap: Testspiel = 94 (kein Spiele-Deckel), Liga = Spiele-Deckel als Extra-Schutz.
  const cap = ignoreGamesCap ? cfg.card.caps.g8plus : capForGames(games, cfg);
  const p = cfg.card.pas;
  const mm = cfg.card.mengeMax;
  const voll = cfg.card.vollAktionen;
  const c = cfg.card;

  // PAS = gewichteter Index aus Pass-Index (Quote+Menge), Schlüsselpässen und Vorlagen.
  const passes = passversuche(total);
  const PAS = attrExplain(
    'PAS',
    'Passspiel',
    'Wie sicher und wie viel du passt – plus Schlüsselpässe und Vorlagen.',
    [
      { label: 'Passquote', value: passRate(total), ziel: p.zielPassquote, kind: 'percent', weight: p.gewPassindex * p.indexGewQuote, ratio: safeDiv(passRate(total), p.zielPassquote) },
      { label: 'Pässe pro Spiel', value: passes / g, ziel: p.zielPaesseSpiel, kind: 'perGame', weight: p.gewPassindex * p.indexGewMenge, ratio: mengeRatio(passes / g, p.zielPaesseSpiel, mm) },
      { label: 'Schlüsselpässe pro Spiel', value: total.key_pass / g, ziel: p.zielKeySpiel, kind: 'perGame', weight: p.gewKey, ratio: mengeRatio(total.key_pass / g, p.zielKeySpiel, mm) },
      { label: 'Vorlagen pro Spiel', value: total.assist / g, ziel: p.zielAssistsSpiel, kind: 'perGame', weight: p.gewAssist, ratio: mengeRatio(total.assist / g, p.zielAssistsSpiel, mm) },
    ],
    passes, voll.pas, 'Pässe', cap, cfg
  );

  const shots = gesamtschuesse(total);
  const SCH = attrExplain(
    'SCH',
    'Abschluss',
    'Schussqualität (Tore + gehaltene Schüsse + halbe Blocks ÷ alle Schüsse) und wie oft du abschließt.',
    [
      { label: 'Schussqualität', value: schussQ(total, cfg), ziel: c.sch.zielQuote, kind: 'percent', weight: c.sch.gewQuote, ratio: safeDiv(schussQ(total, cfg), c.sch.zielQuote) },
      { label: 'Schüsse pro Spiel', value: shots / g, ziel: c.sch.zielMenge, kind: 'perGame', weight: c.sch.gewMenge, ratio: mengeRatio(shots / g, c.sch.zielMenge, mm) },
    ],
    shots, voll.sch, 'Schüsse', cap, cfg
  );

  const dribs = total.dribble_won + total.dribble_lost;
  const DRI = attrExplain(
    'DRI',
    'Dribbling',
    'Wie viele Dribblings du gewinnst und wie oft du ins Eins-gegen-eins gehst.',
    [
      { label: 'Dribblingquote', value: dribRate(total), ziel: c.dri.zielQuote, kind: 'percent', weight: c.dri.gewQuote, ratio: safeDiv(dribRate(total), c.dri.zielQuote) },
      { label: 'Gewonnene Dribblings pro Spiel', value: total.dribble_won / g, ziel: c.dri.zielMenge, kind: 'perGame', weight: c.dri.gewMenge, ratio: mengeRatio(total.dribble_won / g, c.dri.zielMenge, mm) },
    ],
    dribs, voll.dri, 'Dribblings', cap, cfg
  );

  const defVol = total.duel_won + total.duel_lost + total.interception + total.shot_blocked_def;
  const defActions = (total.duel_won + total.interception + total.shot_blocked_def) / g;
  const DEF = attrExplain(
    'DEF',
    'Defensive',
    'Zweikampfquote und wie viel du defensiv wegholst: Zweikämpfe, Interceptions, Blocks.',
    [
      { label: 'Zweikampfquote', value: duelRate(total), ziel: c.def.zielQuote, kind: 'percent', weight: c.def.gewQuote, ratio: safeDiv(duelRate(total), c.def.zielQuote) },
      { label: 'Defensivaktionen pro Spiel', value: defActions, ziel: c.def.zielMenge, kind: 'perGame', weight: c.def.gewMenge, ratio: mengeRatio(defActions, c.def.zielMenge, mm) },
    ],
    defVol, voll.def, 'Defensivaktionen', cap, cfg
  );

  const attrs = [PAS, SCH, DRI, DEF];
  const ges = Math.round(attrs.reduce((sum, a) => sum + a.value, 0) / 4);
  return { role: 'field', games, basis: c.basis, spanne: c.spanne, cap, capNote: capNoteFor(games, cfg, ignoreGamesCap), attrs, ges, tier: cardTier(ges, cfg) };
}

export function fieldCard(total: ActionCounts, games: number, cfg: ScoringConfig, ignoreGamesCap = false): PlayerCard {
  return cardFromExplain(fieldCardExplain(total, games, cfg, ignoreGamesCap), { PAS: 'Passspiel', SCH: 'Abschluss', DRI: 'Dribbling', DEF: 'Defensive' });
}

// Torwart-Karte: PAR · SIC · STL · PAS → GK-GES.
// Jeder Wert misst etwas EIGENES, damit nicht zwei Werte dieselbe Zahl zeigen:
//   PAR  Paraden        Paradenquote × Paraden pro Spiel (Glanzparaden zählen
//                       in der Menge doppelt – die Karte soll sie sehen).
//   SIC  Sicherheit     Zu-null-Quote (Anteil Spiele ohne Gegentor) × wie weit
//                       die Gegentore pro Spiel unter dem Ziel liegen.
//   STL  Stellungsspiel Abwehrquote INKLUSIVE Standparaden (alles, was aufs Tor
//                       kam – wie viel blieb draußen?) × proaktive Aktionen pro
//                       Spiel (Standparaden + Interceptions + gehaltene Elfmeter).
//                       Gutes Stellungsspiel macht aus Glanzparaden Standparaden.
//   PAS  Passspiel      exakt dieselbe Rechnung wie beim Feldspieler.
// `cleanSheets` kommt von außen (pro Spiel gezählt), weil die Summen-Zähler
// nicht wissen, in welchem Spiel welches Gegentor fiel.
export function keeperCardExplain(
  total: ActionCounts,
  games: number,
  cfg: ScoringConfig,
  ignoreGamesCap = false,
  cleanSheets = 0
): CardExplain {
  const g = Math.max(1, games);
  const cap = ignoreGamesCap ? cfg.card.caps.g8plus : capForGames(games, cfg);
  const p = cfg.card.pas;
  const mm = cfg.card.mengeMax;
  const voll = cfg.card.vollAktionen;
  const c = cfg.card;

  // PAR – Reflexe: Quote der echten Torschüsse, Menge mit Glanz-Bonus.
  const gkActions = total.save + total.gk_goal_against;
  const saveRate = pct(total.save, gkActions);
  const savesPerGame = (total.save + total.save_top) / g;
  const PAR = attrExplain(
    'PAR',
    'Paraden',
    'Paradenquote und wie viel du hältst – Glanzparaden zählen doppelt.',
    [
      { label: 'Paradenquote', value: saveRate, ziel: c.par.zielQuote, kind: 'percent', weight: c.par.gewQuote, ratio: safeDiv(saveRate, c.par.zielQuote) },
      { label: 'Paraden pro Spiel (Glanz ×2)', value: savesPerGame, ziel: c.par.zielMenge, kind: 'perGame', weight: c.par.gewMenge, ratio: mengeRatio(savesPerGame, c.par.zielMenge, mm) },
    ],
    gkActions, voll.par, 'Torschüsse', cap, cfg
  );

  // SIC – Ergebnis: Anteil Spiele zu null + wenig kassiert.
  const cleanRate = games > 0 ? Math.min(1, cleanSheets / games) : 0;
  const concededPerGame = total.gk_goal_against / g;
  const SIC = attrExplain(
    'SIC',
    'Sicherheit',
    'Wie oft du zu null spielst und wie wenig du kassierst.',
    [
      { label: 'Spiele zu null', value: cleanRate, ziel: c.sic.zielQuote, kind: 'percent', weight: c.sic.gewQuote, ratio: safeDiv(cleanRate, c.sic.zielQuote) },
      { label: 'Gegentore pro Spiel', value: concededPerGame, ziel: c.sic.zielMenge, kind: 'perGame', weight: c.sic.gewMenge, ratio: Math.min(mm, safeDiv(clampMin(c.sic.zielMenge - concededPerGame, 0), c.sic.zielMenge)), invert: true },
    ],
    gkActions, voll.sic, 'Torschüsse', cap, cfg
  );

  // STL – Stellungsspiel: Abwehrquote inkl. Standparaden + proaktive Aktionen.
  const handled = total.save + total.gk_position_save;
  const holdRate = pct(handled, handled + total.gk_goal_against);
  const proactive = total.gk_position_save + total.interception + total.penalty_save;
  const STL = attrExplain(
    'STL',
    'Stellungsspiel',
    'Alles, was aufs Tor kam – auch die ruhigen Bälle: wie viel blieb draußen? Plus Standparaden, Interceptions, Elfmeter.',
    [
      { label: 'Abwehrquote inkl. Standparaden', value: holdRate, ziel: c.stl.zielQuote, kind: 'percent', weight: c.stl.gewQuote, ratio: safeDiv(holdRate, c.stl.zielQuote) },
      { label: 'Standparaden + Interceptions + Elfmeter pro Spiel', value: proactive / g, ziel: c.stl.zielMenge, kind: 'perGame', weight: c.stl.gewMenge, ratio: mengeRatio(proactive / g, c.stl.zielMenge, mm) },
    ],
    proactive, voll.stl, 'Aktionen', cap, cfg
  );

  const passes = passversuche(total);
  const PAS = attrExplain(
    'PAS',
    'Passspiel',
    'Wie sicher und wie viel du passt – dieselbe Rechnung wie beim Feldspieler.',
    [
      { label: 'Passquote', value: passRate(total), ziel: p.zielPassquote, kind: 'percent', weight: p.indexGewQuote, ratio: safeDiv(passRate(total), p.zielPassquote) },
      { label: 'Pässe pro Spiel', value: passes / g, ziel: p.zielPaesseSpiel, kind: 'perGame', weight: p.indexGewMenge, ratio: mengeRatio(passes / g, p.zielPaesseSpiel, mm) },
    ],
    passes, voll.pas, 'Pässe', cap, cfg
  );

  const attrs = [STL, PAR, PAS, SIC];
  const ges = Math.round(attrs.reduce((sum, a) => sum + a.value, 0) / 4);
  return { role: 'keeper', games, basis: c.basis, spanne: c.spanne, cap, capNote: capNoteFor(games, cfg, ignoreGamesCap), attrs, ges, tier: cardTier(ges, cfg) };
}

export function keeperCard(
  total: ActionCounts,
  games: number,
  cfg: ScoringConfig,
  ignoreGamesCap = false,
  cleanSheets = 0
): PlayerCard {
  return cardFromExplain(keeperCardExplain(total, games, cfg, ignoreGamesCap, cleanSheets), { STL: 'Stellungsspiel', PAR: 'Paraden', PAS: 'Passspiel', SIC: 'Sicherheit' });
}

export function cardExplain(
  total: ActionCounts,
  games: number,
  role: StatRole,
  cfg: ScoringConfig,
  ignoreGamesCap = false,
  cleanSheets = 0
): CardExplain {
  return role === 'keeper' ? keeperCardExplain(total, games, cfg, ignoreGamesCap, cleanSheets) : fieldCardExplain(total, games, cfg, ignoreGamesCap);
}

export function playerCard(
  total: ActionCounts,
  games: number,
  role: StatRole,
  cfg: ScoringConfig,
  ignoreGamesCap = false,
  cleanSheets = 0
): PlayerCard {
  return role === 'keeper' ? keeperCard(total, games, cfg, ignoreGamesCap, cleanSheets) : fieldCard(total, games, cfg, ignoreGamesCap);
}

// Kartenstufe aus dem Gesamtwert.
export function cardTier(ges: number, cfg: ScoringConfig): CardTier {
  if (ges >= cfg.tiers.tots) return 'tots';
  if (ges >= cfg.tiers.hero) return 'hero';
  if (ges >= cfg.tiers.gold) return 'gold';
  if (ges >= cfg.tiers.silber) return 'silber';
  return 'bronze';
}

// --- kleine Helfer ----------------------------------------------------------

function passRate(c: ActionCounts): number {
  const v = passversuche(c);
  return v > 0 ? c.pass_ok / v : 0;
}
function schussQ(c: ActionCounts, cfg: ScoringConfig): number {
  const s = gesamtschuesse(c);
  return s > 0 ? (c.goal + c.shot_on + cfg.shotBlockFactor * c.shot_blocked_off) / s : 0;
}
function dribRate(c: ActionCounts): number {
  const d = c.dribble_won + c.dribble_lost;
  return d > 0 ? c.dribble_won / d : 0;
}
function duelRate(c: ActionCounts): number {
  const d = c.duel_won + c.duel_lost;
  return d > 0 ? c.duel_won / d : 0;
}
function safeDiv(a: number, b: number): number {
  return b > 0 ? a / b : 0;
}
function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}
function clampMin(v: number, min: number): number {
  return Math.max(min, v);
}
function round2(v: number): number {
  return Math.round(v * 100) / 100;
}
