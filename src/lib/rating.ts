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

// Elite-Index aus Quote + Menge (Index 1,00 = Elite-Ziel).
// capMenge=true → Menge über dem Ziel gibt keinen Extra-Bonus mehr (das Ziel
// ist „genug"). Dann entscheidet die Quote über die Spitze, statt dass reine
// Masse jeden Wert auf 94 drückt. Genutzt im Testspiel-Modus.
function attrIndex(quote: number, menge: number, t: CardAttrTarget, capMenge = false): number {
  const q = t.zielQuote > 0 ? quote / t.zielQuote : 0;
  let m = t.zielMenge > 0 ? menge / t.zielMenge : 0;
  if (capMenge) m = Math.min(1, m);
  return t.gewQuote * q + t.gewMenge * m;
}

// Reine Mengen-Quote (z.B. Schlüsselpässe/Spiel) — im Testspiel-Modus bei 1
// gedeckelt, damit das Ziel „genug" ist und nicht Masse allein maxt.
function mengeRatio(value: number, ziel: number, capMenge: boolean): number {
  const r = safeDiv(value, ziel);
  return capMenge ? Math.min(1, r) : r;
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

// Index → Kartenwert (basis … cap), gerundet auf eine ganze Zahl.
function attrValue(index: number, cap: number, cfg: ScoringConfig): number {
  const raw = cfg.card.basis + Math.max(0, index) * (cfg.card.elite - cfg.card.basis);
  return Math.round(clamp(raw, cfg.card.basis, cap));
}

// „Volle" Stichprobe je Attribut: ab so vielen Aktionen zählt ein Attribut als
// verlässlich (R = 1). Bewusst so gewählt, dass ein Testspiel-Abend (mehrere
// Spiele) sie erreichen kann, eine Handvoll Aktionen aber nicht.
const VOLL = {
  pas: 30, // Passversuche
  sch: 6, // Gesamtschüsse
  dri: 8, // Dribblings (gewonnen + verloren)
  def: 12, // Defensiv-Aktionen (Zweikämpfe + Interceptions + Blocks)
  par: 8, // Torwart-Aktionen (Paraden + Gegentore)
  sic: 8, // Torwart-Aktionen (Sicherheit)
  stl: 4, // Stellungs-/Elfer-Paraden
} as const;

// Verlässlichkeit aus dem Stichprobenumfang: R = min(1, √(vol / VOLL)).
// √-Kurve = sanft (früher Anstieg, dann abflachend). Bei wenig Aktionen zieht
// der Wert Richtung Basis, statt sofort Elite zu erreichen.
function reliability(vol: number, voll: number): number {
  if (voll <= 0) return 1;
  return Math.min(1, Math.sqrt(Math.max(0, vol) / voll));
}

// Wie attrValue, aber zusätzlich Richtung Basis gedämpft, je nach Stichprobe:
// Wert = basis + R · (roh − basis). Nur im Testspiel-Modus (ohne Spiele-Deckel),
// damit 2–3 starke Aktionen nicht direkt eine 94 ergeben.
function attrValueRel(
  index: number,
  cap: number,
  vol: number,
  voll: number,
  cfg: ScoringConfig
): number {
  const roh = clamp(
    cfg.card.basis + Math.max(0, index) * (cfg.card.elite - cfg.card.basis),
    cfg.card.basis,
    cap
  );
  const R = reliability(vol, voll);
  return Math.round(cfg.card.basis + R * (roh - cfg.card.basis));
}

// Feldspieler-Karte: PAS · SCH · DRI · DEF → GES (gerundeter Schnitt).
// ignoreGamesCap=true → kein „wenig-Spiele-Deckel" (z.B. Testspieltag): rein aus
// den echten Stats, voller Wertebereich bis zur Elite-Kappe.
export function fieldCard(total: ActionCounts, games: number, cfg: ScoringConfig, ignoreGamesCap = false): PlayerCard {
  const g = Math.max(1, games);
  const q = quotas(total, cfg);
  const cap = ignoreGamesCap ? cfg.card.caps.g8plus : capForGames(games, cfg);
  const p = cfg.card.pas;

  // Im Testspiel-Modus: Menge bei 1 deckeln, damit Masse allein nicht maxt.
  const capMenge = ignoreGamesCap;

  // PAS = gewichteter Index aus Pass-Index (Quote+Menge), Schlüsselpässen und Vorlagen.
  const passIndex =
    p.indexGewQuote * safeDiv(passRate(total), p.zielPassquote) +
    p.indexGewMenge * mengeRatio(passversuche(total) / g, p.zielPaesseSpiel, capMenge);
  const keyIndex = mengeRatio(total.key_pass / g, p.zielKeySpiel, capMenge);
  const assistIndex = mengeRatio(total.assist / g, p.zielAssistsSpiel, capMenge);
  const pasIndex = p.gewPassindex * passIndex + p.gewKey * keyIndex + p.gewAssist * assistIndex;

  const schIndex = attrIndex(schussQ(total, cfg), gesamtschuesse(total) / g, cfg.card.sch, capMenge);
  const driIndex = attrIndex(dribRate(total), total.dribble_won / g, cfg.card.dri, capMenge);
  const defIndex = attrIndex(
    duelRate(total),
    (total.duel_won + total.interception + total.shot_blocked_def) / g,
    cfg.card.def,
    capMenge
  );

  let PAS: number, SCH: number, DRI: number, DEF: number;
  if (ignoreGamesCap) {
    // Testspiel: kein Spiele-Deckel, aber Verlässlichkeits-Dämpfung je Attribut.
    const defVol = total.duel_won + total.duel_lost + total.interception + total.shot_blocked_def;
    PAS = attrValueRel(pasIndex, cap, passversuche(total), VOLL.pas, cfg);
    SCH = attrValueRel(schIndex, cap, gesamtschuesse(total), VOLL.sch, cfg);
    DRI = attrValueRel(driIndex, cap, total.dribble_won + total.dribble_lost, VOLL.dri, cfg);
    DEF = attrValueRel(defIndex, cap, defVol, VOLL.def, cfg);
  } else {
    PAS = attrValue(pasIndex, cap, cfg);
    SCH = attrValue(schIndex, cap, cfg);
    DRI = attrValue(driIndex, cap, cfg);
    DEF = attrValue(defIndex, cap, cfg);
  }
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

  const capMenge = ignoreGamesCap;
  const parIndex = attrIndex(saveRate, total.save / g, cfg.card.par, capMenge);
  const sicIndex = attrIndex(cleanRate, clampMin(cfg.card.sic.zielMenge - total.gk_goal_against / g, 0), cfg.card.sic, capMenge);
  const stlIndex = attrIndex(
    saveRate,
    (total.gk_position_save + total.penalty_save) / g,
    cfg.card.stl,
    capMenge
  );
  const passIndex =
    p.indexGewQuote * safeDiv(passRate(total), p.zielPassquote) +
    p.indexGewMenge * mengeRatio(passversuche(total) / g, p.zielPaesseSpiel, capMenge);

  let STL: number, PAR: number, PAS: number, SIC: number;
  if (ignoreGamesCap) {
    STL = attrValueRel(stlIndex, cap, total.gk_position_save + total.penalty_save, VOLL.stl, cfg);
    PAR = attrValueRel(parIndex, cap, gkActions, VOLL.par, cfg);
    PAS = attrValueRel(passIndex, cap, passversuche(total), VOLL.pas, cfg);
    SIC = attrValueRel(sicIndex, cap, gkActions, VOLL.sic, cfg);
  } else {
    STL = attrValue(stlIndex, cap, cfg);
    PAR = attrValue(parIndex, cap, cfg);
    PAS = attrValue(passIndex, cap, cfg);
    SIC = attrValue(sicIndex, cap, cfg);
  }
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
