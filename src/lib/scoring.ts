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
  tiers: { silber: 65, gold: 75, hero: 90, tots: 95 },
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
    tiers: {
      silber: num(s.tiers?.silber, d.tiers.silber),
      gold: num(s.tiers?.gold, d.tiers.gold),
      hero: num(s.tiers?.hero, d.tiers.hero),
      tots: num(s.tiers?.tots, d.tiers.tots),
    },
  };
}

function num(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

// --- Aktions-Metadaten (für das Erfassungs-Raster und die Einstellungen) -----

export type ActionGroup = 'Pass' | 'Schuss' | 'Dribbling' | 'Defensive' | 'Sonstiges' | 'Torwart';
export type ActionTone = 'positive' | 'negative' | 'special' | 'neutral' | 'goal';

export interface ActionMeta {
  key: ActionKey;
  label: string; // volle Bezeichnung
  short: string; // Kürzel
  icon: string; // Symbol auf der Taste
  group: ActionGroup;
  tone: ActionTone; // Farbwelt der Taste
  sign: 1 | 0 | -1; // positiv / neutral / negativ
  keeperOnly?: boolean; // nur für Torwart relevant
}

// Reihenfolge & Gruppen wie im HERO Match Tracker.
export const ACTION_META: ActionMeta[] = [
  { key: 'pass_ok', label: 'Pass erfolgreich', short: 'Pass ✓', icon: '✓', group: 'Pass', tone: 'positive', sign: 1 },
  { key: 'pass_fail', label: 'Fehlpass', short: 'Fehlpass', icon: '✕', group: 'Pass', tone: 'negative', sign: -1 },
  { key: 'key_pass', label: 'Schlüsselpass', short: 'Schl.', icon: '🔑', group: 'Pass', tone: 'special', sign: 1 },
  { key: 'assist', label: 'Assist', short: 'Vorlage', icon: '🅰', group: 'Pass', tone: 'special', sign: 1 },
  { key: 'shot_on', label: 'Torschuss', short: 'TS', icon: '🎯', group: 'Schuss', tone: 'positive', sign: 1 },
  { key: 'shot_miss', label: 'Fehlschuss', short: 'Fehl.', icon: '↗', group: 'Schuss', tone: 'negative', sign: -1 },
  { key: 'shot_blocked_off', label: 'Schuss geblockt', short: 'Block', icon: '🧱', group: 'Schuss', tone: 'neutral', sign: -1 },
  { key: 'goal', label: 'Tor', short: 'Tor', icon: '⚽', group: 'Schuss', tone: 'goal', sign: 1 },
  { key: 'dribble_won', label: 'Dribbling +', short: 'Drib ✓', icon: '✦', group: 'Dribbling', tone: 'positive', sign: 1 },
  { key: 'dribble_lost', label: 'Dribbling −', short: 'Drib ✕', icon: '✕', group: 'Dribbling', tone: 'negative', sign: -1 },
  { key: 'duel_won', label: 'Zweikampf +', short: 'ZK ✓', icon: '🛡', group: 'Defensive', tone: 'positive', sign: 1 },
  { key: 'duel_lost', label: 'Zweikampf −', short: 'ZK ✕', icon: '⚔', group: 'Defensive', tone: 'negative', sign: -1 },
  { key: 'interception', label: 'Interception', short: 'Abg.', icon: '✂', group: 'Defensive', tone: 'positive', sign: 1 },
  { key: 'shot_blocked_def', label: 'Schuss geblockt', short: 'Block D', icon: '▣', group: 'Defensive', tone: 'positive', sign: 1 },
  { key: 'turnover', label: 'Ballverlust', short: 'Ballv.', icon: '⚠', group: 'Sonstiges', tone: 'negative', sign: -1 },
  { key: 'own_goal', label: 'Eigentor', short: 'ET', icon: '🙈', group: 'Sonstiges', tone: 'negative', sign: -1 },
  { key: 'penalty_goal', label: 'Strafstoßtor', short: 'Elfm.', icon: 'P', group: 'Sonstiges', tone: 'special', sign: 0 },
  { key: 'save', label: 'Parade', short: 'Parade', icon: '🧤', group: 'Torwart', tone: 'positive', sign: 1, keeperOnly: true },
  { key: 'gk_goal_against', label: 'Gegentor', short: 'Gegent.', icon: '🥅', group: 'Torwart', tone: 'negative', sign: -1, keeperOnly: true },
  { key: 'gk_position_save', label: 'Standparade', short: 'Standp.', icon: '🧍', group: 'Torwart', tone: 'positive', sign: 1, keeperOnly: true },
  { key: 'penalty_save', label: 'Gehaltener Elfm.', short: 'Elfm. ✓', icon: '✋', group: 'Torwart', tone: 'special', sign: 1, keeperOnly: true },
];

// Alle Aktions-Schlüssel in der Metadaten-Reihenfolge.
export const ACTION_KEYS: ActionKey[] = ACTION_META.map((a) => a.key);

// Sichtbare Gruppen je Rolle (wie im HERO Match Tracker).
export const FIELD_GROUPS: ActionGroup[] = ['Pass', 'Schuss', 'Dribbling', 'Defensive', 'Sonstiges'];
export const KEEPER_GROUPS: ActionGroup[] = ['Pass', 'Torwart'];
export const KEEPER_PASS_KEYS: ActionKey[] = ['pass_ok', 'pass_fail'];
