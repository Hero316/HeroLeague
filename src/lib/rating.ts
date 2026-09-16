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
function isKeeperActive(c: ActionCounts): boolean {
  return c.save > 0 || c.gk_position_save > 0 || c.penalty_save > 0 || passversuche(c) > 0;
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

// Feldspieler-Karte: PAS · SCH · DRI · DEF → GES (gerundeter Schnitt).
// ignoreGamesCap=true → kein „wenig-Spiele-Deckel" (z.B. Testspieltag): rein aus
// den echten Stats, voller Wertebereich bis zur Elite-Kappe.
export function fieldCard(total: ActionCounts, games: number, cfg: ScoringConfig, ignoreGamesCap = false): PlayerCard {
  const g = Math.max(1, games);
  // Cap: Testspiel = 94 (kein Spiele-Deckel), Liga = Spiele-Deckel als Extra-Schutz.
  const cap = ignoreGamesCap ? cfg.card.caps.g8plus : capForGames(games, cfg);
  const p = cfg.card.pas;

  const mm = cfg.card.mengeMax;
  const voll = cfg.card.vollAktionen;

  // PAS = gewichteter Index aus Pass-Index (Quote+Menge), Schlüsselpässen und Vorlagen.
  const passIndex =
    p.indexGewQuote * safeDiv(passRate(total), p.zielPassquote) +
    p.indexGewMenge * mengeRatio(passversuche(total) / g, p.zielPaesseSpiel, mm);
  const keyIndex = mengeRatio(total.key_pass / g, p.zielKeySpiel, mm);
  const assistIndex = mengeRatio(total.assist / g, p.zielAssistsSpiel, mm);
  const pasIndex = p.gewPassindex * passIndex + p.gewKey * keyIndex + p.gewAssist * assistIndex;

  const schIndex = attrIndex(schussQ(total, cfg), gesamtschuesse(total) / g, cfg.card.sch, mm);
  const driIndex = attrIndex(dribRate(total), total.dribble_won / g, cfg.card.dri, mm);
  const defIndex = attrIndex(
    duelRate(total),
    (total.duel_won + total.interception + total.shot_blocked_def) / g,
    cfg.card.def,
    mm
  );

  // Gleiche Rechnung für Liga und Testspiel; Unterschied ist nur der Cap.
  const defVol = total.duel_won + total.duel_lost + total.interception + total.shot_blocked_def;
  const PAS = cardValue(pasIndex, passversuche(total), voll.pas, cap, cfg);
  const SCH = cardValue(schIndex, gesamtschuesse(total), voll.sch, cap, cfg);
  const DRI = cardValue(driIndex, total.dribble_won + total.dribble_lost, voll.dri, cap, cfg);
  const DEF = cardValue(defIndex, defVol, voll.def, cap, cfg);
  const ges = Math.round((PAS + SCH + DRI + DEF) / 4);

  return {
    role: 'field',
    ges,
    tier: cardTier(ges, cfg),
    attrs: [
      { key: 'PAS', label: 'Passspiel', value: PAS },
      { key: 'SCH', label: 'Abschluss', value: SCH },
      { key: 'DRI', label: 'Dribbling', value: DRI },
      { key: 'DEF', label: 'Defensive', value: DEF },
    ],
  };
}

// Torwart-Karte: STL · PAR · PAS · SIC → GK-GES. (Kalibrierung vorläufig.)
export function keeperCard(total: ActionCounts, games: number, cfg: ScoringConfig, ignoreGamesCap = false): PlayerCard {
  const g = Math.max(1, games);
  const cap = ignoreGamesCap ? cfg.card.caps.g8plus : capForGames(games, cfg);
  const gkActions = total.save + total.gk_goal_against;
  const saveRate = gkActions > 0 ? total.save / gkActions : 0;
  const cleanRate = total.gk_goal_against === 0 ? 1 : 0; // grob – Feinschliff später
  const p = cfg.card.pas;

  const mm = cfg.card.mengeMax;
  const voll = cfg.card.vollAktionen;
  const parIndex = attrIndex(saveRate, total.save / g, cfg.card.par, mm);
  const sicIndex = attrIndex(cleanRate, clampMin(cfg.card.sic.zielMenge - total.gk_goal_against / g, 0), cfg.card.sic, mm);
  const stlIndex = attrIndex(saveRate, (total.gk_position_save + total.penalty_save) / g, cfg.card.stl, mm);
  const passIndex =
    p.indexGewQuote * safeDiv(passRate(total), p.zielPassquote) +
    p.indexGewMenge * mengeRatio(passversuche(total) / g, p.zielPaesseSpiel, mm);

  // Gleiche Rechnung für Liga und Testspiel; Unterschied ist nur der Cap.
  const STL = cardValue(stlIndex, total.gk_position_save + total.penalty_save, voll.stl, cap, cfg);
  const PAR = cardValue(parIndex, gkActions, voll.par, cap, cfg);
  const PAS = cardValue(passIndex, passversuche(total), voll.pas, cap, cfg);
  const SIC = cardValue(sicIndex, gkActions, voll.sic, cap, cfg);
  const ges = Math.round((STL + PAR + PAS + SIC) / 4);

  return {
    role: 'keeper',
    ges,
    tier: cardTier(ges, cfg),
    attrs: [
      { key: 'STL', label: 'Stellungsspiel', value: STL },
      { key: 'PAR', label: 'Paraden', value: PAR },
      { key: 'PAS', label: 'Passspiel', value: PAS },
      { key: 'SIC', label: 'Sicherheit', value: SIC },
    ],
  };
}

export function playerCard(total: ActionCounts, games: number, role: StatRole, cfg: ScoringConfig, ignoreGamesCap = false): PlayerCard {
  return role === 'keeper' ? keeperCard(total, games, cfg, ignoreGamesCap) : fieldCard(total, games, cfg, ignoreGamesCap);
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
