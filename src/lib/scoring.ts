import type { ActionKey, ScoringConfig } from '../types';

// ===========================================================================
// Standard-Score-Einstellungen — 1:1 aus der „Score-Einstellungen"-Tabelle.
// Alle Werte sind bewusst Testwerte und im Admin frei justierbar. Weil nur die
// Roh-Zähler gespeichert werden, wirkt jede Änderung hier sofort rückwirkend auf
// ALLE Noten, Quoten und Kartenwerte – ohne dass etwas neu getrackt werden muss.
// ===========================================================================

export const DEFAULT_SCORING: ScoringConfig = {
  points: {
    goal: 5.0,
    assist: 3.0,
    shot_on: 0.5,
    shot_miss: -0.5,
    pass_ok: 0.1,
    pass_fail: -0.35,
    key_pass: 0.75,
    dribble_won: 0.4,
    dribble_lost: -0.4,
    duel_won: 0.4,
    duel_lost: -0.3,
    interception: 0.75,
    turnover: -0.75,
    own_goal: -5.0,
    penalty_goal: 0.0,
    save: 0.6,
    gk_goal_against: -0.5,
    penalty_save: 2.0,
    shot_blocked_off: -0.15,
    shot_blocked_def: 1.0,
    gk_position_save: 0.25,
  },
  cleanSheetBonus: 2.0,
  rating: { base: 6.0, factor: 0.2, min: 1.0, max: 10.0 },
  shotBlockFactor: 0.5,
  minimums: { apps: 5, passes: 25, shots: 10, duels: 15, gk: 5 },
  card: {
    basis: 40,
    elite: 94,
    totsStart: 95,
    fullGames: 8,
    caps: { g1_2: 85, g3_4: 89, g5_7: 92, g8plus: 94 },
    pas: {
      zielPassquote: 0.92,
      zielPaesseSpiel: 12,
      zielKeySpiel: 1.2,
      zielAssistsSpiel: 0.35,
      gewPassindex: 0.6,
      gewKey: 0.25,
      gewAssist: 0.15,
      indexGewQuote: 0.7,
      indexGewMenge: 0.3,
    },
    sch: { zielQuote: 0.55, zielMenge: 4, gewQuote: 0.7, gewMenge: 0.3 },
    dri: { zielQuote: 0.67, zielMenge: 3, gewQuote: 0.7, gewMenge: 0.3 },
    def: { zielQuote: 0.72, zielMenge: 4, gewQuote: 0.7, gewMenge: 0.3 },
    par: { zielQuote: 0.7, zielMenge: 4, gewQuote: 0.7, gewMenge: 0.3 },
    sic: { zielQuote: 0.5, zielMenge: 1.5, gewQuote: 0.6, gewMenge: 0.4 },
    stl: { zielQuote: 0.6, zielMenge: 1, gewQuote: 0.5, gewMenge: 0.5 },
  },
  tiers: { silber: 65, gold: 80, hero: 90, tots: 95 },
};

// Tief zusammenführen: gespeicherte (Teil-)Config über die Defaults legen, damit
// neue Felder immer einen Wert haben (robust gegen alte gespeicherte Stände).
export function mergeScoring(saved: unknown): ScoringConfig {
  const s = (saved ?? {}) as Partial<ScoringConfig>;
  const d = DEFAULT_SCORING;
  return {
    points: { ...d.points, ...(s.points ?? {}) },
    cleanSheetBonus: num(s.cleanSheetBonus, d.cleanSheetBonus),
    rating: { ...d.rating, ...(s.rating ?? {}) },
    shotBlockFactor: num(s.shotBlockFactor, d.shotBlockFactor),
    minimums: { ...d.minimums, ...(s.minimums ?? {}) },
    card: {
      ...d.card,
      ...(s.card ?? {}),
      caps: { ...d.card.caps, ...(s.card?.caps ?? {}) },
      pas: { ...d.card.pas, ...(s.card?.pas ?? {}) },
      sch: { ...d.card.sch, ...(s.card?.sch ?? {}) },
      dri: { ...d.card.dri, ...(s.card?.dri ?? {}) },
      def: { ...d.card.def, ...(s.card?.def ?? {}) },
      par: { ...d.card.par, ...(s.card?.par ?? {}) },
      sic: { ...d.card.sic, ...(s.card?.sic ?? {}) },
      stl: { ...d.card.stl, ...(s.card?.stl ?? {}) },
    },
    tiers: { ...d.tiers, ...(s.tiers ?? {}) },
  };
}

function num(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

// --- Aktions-Metadaten (für das Erfassungs-Raster und die Einstellungen) -----

export type ActionGroup =
  | 'Passspiel'
  | 'Abschluss'
  | 'Angriff'
  | 'Dribbling'
  | 'Defensive'
  | 'Ballbesitz'
  | 'Torwart'
  | 'Sonderwert';

export interface ActionMeta {
  key: ActionKey;
  label: string; // volle Bezeichnung
  short: string; // Kürzel für die Rasterspalte
  group: ActionGroup;
  sign: 1 | 0 | -1; // positiv / neutral / negativ (für die Einfärbung)
  keeperOnly?: boolean; // nur für Torwart-Zeilen relevant
}

// Reihenfolge = Reihenfolge im Tracking-Raster (wie im Excel-Blatt).
export const ACTION_META: ActionMeta[] = [
  { key: 'pass_ok', label: 'Pass erfolgreich', short: 'Pass ✓', group: 'Passspiel', sign: 1 },
  { key: 'pass_fail', label: 'Fehlpass', short: 'Pass ✕', group: 'Passspiel', sign: -1 },
  { key: 'key_pass', label: 'Schlüsselpass', short: 'Schl.', group: 'Passspiel', sign: 1 },
  { key: 'assist', label: 'Vorlage', short: 'Vorl.', group: 'Angriff', sign: 1 },
  { key: 'shot_on', label: 'Torschuss gehalten', short: 'TS', group: 'Abschluss', sign: 1 },
  { key: 'shot_miss', label: 'Fehlschuss', short: 'Fehl.', group: 'Abschluss', sign: -1 },
  { key: 'shot_blocked_off', label: 'Schuss geblockt (Ang.)', short: 'Block A', group: 'Abschluss', sign: -1 },
  { key: 'goal', label: 'Tor', short: 'Tor', group: 'Angriff', sign: 1 },
  { key: 'dribble_won', label: 'Dribbling gewonnen', short: 'Drib ✓', group: 'Dribbling', sign: 1 },
  { key: 'dribble_lost', label: 'Dribbling verloren', short: 'Drib ✕', group: 'Dribbling', sign: -1 },
  { key: 'duel_won', label: 'Zweikampf gewonnen', short: 'ZK ✓', group: 'Defensive', sign: 1 },
  { key: 'duel_lost', label: 'Zweikampf verloren', short: 'ZK ✕', group: 'Defensive', sign: -1 },
  { key: 'interception', label: 'Interception', short: 'Abg.', group: 'Defensive', sign: 1 },
  { key: 'shot_blocked_def', label: 'Schuss geblockt (Abw.)', short: 'Block D', group: 'Defensive', sign: 1 },
  { key: 'turnover', label: 'Ballverlust', short: 'Ballv.', group: 'Ballbesitz', sign: -1 },
  { key: 'save', label: 'Parade', short: 'Parade', group: 'Torwart', sign: 1, keeperOnly: true },
  { key: 'gk_goal_against', label: 'Gegentor', short: 'Gegent.', group: 'Torwart', sign: -1, keeperOnly: true },
  { key: 'gk_position_save', label: 'Standparade', short: 'Standp.', group: 'Torwart', sign: 1, keeperOnly: true },
  { key: 'penalty_save', label: 'Gehaltener Strafstoß', short: 'Elfm. ✓', group: 'Torwart', sign: 1, keeperOnly: true },
  { key: 'penalty_goal', label: 'Strafstoßtor', short: 'Elfm.', group: 'Sonderwert', sign: 0 },
  { key: 'own_goal', label: 'Eigentor', short: 'ET', group: 'Sonderwert', sign: -1 },
];

// Alle Aktions-Schlüssel in der Metadaten-Reihenfolge.
export const ACTION_KEYS: ActionKey[] = ACTION_META.map((a) => a.key);
