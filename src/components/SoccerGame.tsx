// „Hero Kicker" – ein kleines 5-gegen-5 Fußballspiel (Top-Down) direkt in der
// Team-App. Es nutzt die ECHTEN Vereine + Kader aus /api/teams: man wählt sein
// Team, den Gegner, die Schwierigkeit und stellt seine 5 aus dem echten Kader
// auf. Gespielt wird im Hochformat (oben ⅔ Feld, unten Steuerung), ~60 Sek.
// Die Bilanz landet danach im Team-Leaderboard (jeder sieht die Scores).
//
// Bewusst ohne fremde Game-Engine: eine schlanke Canvas-Schleife (requestAnime-
// Frame). Erste Version – Steuerung/Schwierigkeit tunen wir iterativ.
import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { motion } from 'motion/react';
import { X, Trophy, ChevronLeft, Loader2, Crown, Zap, Play, Medal } from 'lucide-react';
import { apiFetch } from '../lib/api';
import type { Team, Player } from '../types';
import { fetchGameBoard, reportGameResult, type GameBoardRow, type GameResult } from '../lib/game';
import { ModalPortal } from './ui';

// --- Feld-/Physik-Konstanten (interne Canvas-Auflösung) --------------------
const W = 360;
const H = 560;
const PAD = 16; // Spielfeldrand
const LEFT = PAD, RIGHT = W - PAD, TOP = PAD, BOTTOM = H - PAD;
const CX = W / 2, CY = H / 2;
const GOAL_W = 132; // Torbreite
const PR = 11; // Spieler-Radius
const BR = 6; // Ball-Radius
const PICKUP_R = PR + BR + 3;

const PLAYER_SPEED = 120;
const SPRINT_MUL = 1.5;
const SHOT_SPEED = 340;
const THROUGH_SPEED = 300;

type Side = 'me' | 'ai';

interface GPlayer {
  id: string;
  side: Side;
  gk: boolean;
  name: string;
  num: number;
  x: number; y: number;
  vx: number; vy: number;
  fx: number; fy: number; // Blickrichtung
  hx: number; hy: number; // Formations-Heimatposition
  dec: number; // KI-Entscheidungs-Timer
}

interface GBall {
  x: number; y: number; vx: number; vy: number;
  owner: string | null;
  hold: number; // wie lange der Torwart schon hält
  noPickup: number; // kurze Sperre nach einem Schuss (niemand)
  selfLock: number; // Sperre nur für den Schützen
  lastKicker: string | null;
}

interface Diff { key: string; label: string; aiMul: number; passChance: number; shootRange: number; decEvery: number; }
const DIFFS: Diff[] = [
  { key: 'leicht', label: 'Leicht', aiMul: 0.82, passChance: 0.25, shootRange: 150, decEvery: 0.7 },
  { key: 'mittel', label: 'Mittel', aiMul: 0.97, passChance: 0.42, shootRange: 168, decEvery: 0.55 },
  { key: 'schwer', label: 'Schwer', aiMul: 1.12, passChance: 0.55, shootRange: 188, decEvery: 0.4 },
];

export interface Lineup {
  name: string;
  color: string;
  icon: string;
  players: { name: string; num: number; gk: boolean }[]; // genau 5, einer davon gk
}

interface Input { mx: number; my: number; sprint: boolean; action: null | 'pass' | 'through' | 'shoot'; }

interface GState {
  players: GPlayer[];
  ball: GBall;
  scoreMe: number;
  scoreAi: number;
  diff: Diff;
  flash: { text: string; t: number } | null;
  frozen: number; // kurze Pause nach Tor / Anpfiff
}

// --- kleine Mathe-/Farb-Helfer ---------------------------------------------
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const dist = (ax: number, ay: number, bx: number, by: number) => Math.hypot(ax - bx, ay - by);
function norm(dx: number, dy: number): [number, number] {
  const m = Math.hypot(dx, dy) || 1;
  return [dx / m, dy / m];
}
function hexToRgb(hex: string): [number, number, number] {
  let h = (hex || '#3B82F6').replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function mix(hex: string, target: number, amt: number): string {
  const [r, g, b] = hexToRgb(hex);
  const m = (c: number) => Math.round(c + (target - c) * amt);
  return `rgb(${m(r)},${m(g)},${m(b)})`;
}
// Helle Farbe → dunkler Text, sonst weiß (für die Trikotnummer).
function textOn(hex: string): string {
  const [r, g, b] = hexToRgb(hex);
  return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? '#0b1a17' : '#ffffff';
}

// Formation für 5 Spieler (GK + 2 hinten + 2 vorne), als Feldanteile.
// fy: 0 = eigenes Tor, 1 = gegnerisches Tor.
const FORM: { fx: number; fy: number }[] = [
  { fx: 0.5, fy: 0.08 }, // GK
  { fx: 0.28, fy: 0.32 },
  { fx: 0.72, fy: 0.32 },
  { fx: 0.34, fy: 0.62 },
  { fx: 0.66, fy: 0.62 },
];

function homeFor(side: Side, idx: number): { x: number; y: number } {
  const f = FORM[idx];
  const x = LEFT + f.fx * (RIGHT - LEFT);
  // me greift nach oben an (eigenes Tor unten), ai nach unten.
  const y = side === 'me' ? BOTTOM - f.fy * (BOTTOM - TOP) : TOP + f.fy * (BOTTOM - TOP);
  return { x, y };
}

function buildState(mine: Lineup, ai: Lineup, diff: Diff): GState {
  const players: GPlayer[] = [];
  const make = (lu: Lineup, side: Side) => {
    // GK zuerst einsortieren, damit er den Formationsplatz 0 bekommt.
    const ordered = [...lu.players].sort((a, b) => Number(b.gk) - Number(a.gk));
    ordered.forEach((p, i) => {
      const home = homeFor(side, i);
      players.push({
        id: `${side}-${i}`,
        side,
        gk: i === 0, // der erste (GK) steht im Tor
        name: p.name,
        num: p.num,
        x: home.x, y: home.y, vx: 0, vy: 0,
        fx: 0, fy: side === 'me' ? -1 : 1,
        hx: home.x, hy: home.y,
        dec: Math.random() * diff.decEvery,
      });
    });
  };
  make(mine, 'me');
  make(ai, 'ai');
  const ball: GBall = { x: CX, y: CY, vx: 0, vy: 0, owner: null, hold: 0, noPickup: 0, selfLock: 0, lastKicker: null };
  return { players, ball, scoreMe: 0, scoreAi: 0, diff, flash: null, frozen: 0.3 };
}

function resetKickoff(s: GState, towards: Side) {
  for (const p of s.players) {
    const idx = Number(p.id.split('-')[1]);
    const home = homeFor(p.side, idx);
    p.x = home.x; p.y = home.y; p.vx = 0; p.vy = 0;
    p.fx = 0; p.fy = p.side === 'me' ? -1 : 1;
  }
  s.ball = { x: CX, y: CY, vx: 0, vy: 0, owner: null, hold: 0, noPickup: 0, selfLock: 0, lastKicker: null };
  s.frozen = 0.8;
  void towards;
}

const byId = (s: GState, id: string | null) => (id ? s.players.find((p) => p.id === id) || null : null);

function pickActive(s: GState, side: Side): GPlayer {
  const outs = s.players.filter((p) => p.side === side && !p.gk);
  const o = byId(s, s.ball.owner);
  if (o && o.side === side && !o.gk) return o;
  let best = outs[0], bd = Infinity;
  for (const p of outs) {
    const d = dist(p.x, p.y, s.ball.x, s.ball.y);
    if (d < bd) { bd = d; best = p; }
  }
  return best;
}

// Kick ausführen (Pass / Steilpass / Schuss) – für Mensch und KI gleich.
function doAction(s: GState, o: GPlayer, type: 'pass' | 'through' | 'shoot') {
  const b = s.ball;
  const attack = o.side === 'me' ? -1 : 1; // y-Richtung zum gegnerischen Tor
  const oppGoalY = o.side === 'me' ? TOP : BOTTOM;
  let tx = CX, ty = oppGoalY, speed = SHOT_SPEED, spread = 0;

  if (type === 'shoot') {
    tx = CX + (Math.random() - 0.5) * (GOAL_W * 0.55);
    ty = oppGoalY;
    speed = SHOT_SPEED;
    spread = 0.05;
  } else {
    // Mitspieler suchen (Steil = möglichst weit vorne, Pass = am nächsten/anspielbar)
    const mates = s.players.filter((p) => p.side === o.side && p.id !== o.id && !p.gk);
    let target: GPlayer | null = null;
    if (type === 'through') {
      // am weitesten vorne (in Angriffsrichtung). attack: me=-1 (hoch), ai=+1 (runter).
      // „vorne" = Projektion auf die Angriffsrichtung: (m.y - o.y) * attack.
      let bestY = -Infinity;
      for (const m of mates) {
        const adv = (m.y - o.y) * attack; // positiv = weiter vorne (Richtung gegn. Tor)
        if (adv > bestY) { bestY = adv; target = m; }
      }
    } else {
      // bester normaler Pass: nah + eher nach vorne
      let bestScore = Infinity;
      for (const m of mates) {
        const d = dist(o.x, o.y, m.x, m.y);
        const forward = (m.y - o.y) * attack; // vorne = positiv
        const score = d - forward * 0.5;
        if (score < bestScore) { bestScore = score; target = m; }
      }
    }
    if (target) {
      const lead = type === 'through' ? 70 : 14;
      tx = target.x + target.vx * 0.2;
      ty = target.y + attack * lead;
      speed = type === 'through' ? THROUGH_SPEED : clamp(dist(o.x, o.y, target.x, target.y) * 2.1, 175, 300);
    } else {
      // kein Mitspieler → einfach nach vorne dreschen
      tx = o.x; ty = oppGoalY; speed = THROUGH_SPEED;
    }
    // Sicherheits-Guard: Pass/Abschlag niemals Richtung eigenes Tor (verhindert
    // „Eigentore" durch verunglückte Rückpässe/Torwart-Abschläge).
    if (o.side === 'me') ty = Math.min(ty, o.y + 6);
    else ty = Math.max(ty, o.y - 6);
  }

  let [ux, uy] = norm(tx - o.x, ty - o.y);
  if (spread) { ux += (Math.random() - 0.5) * spread; uy += (Math.random() - 0.5) * spread; [ux, uy] = norm(ux, uy); }
  b.owner = null;
  b.vx = ux * speed; b.vy = uy * speed;
  b.lastKicker = o.id; b.noPickup = 0.1; b.selfLock = 0.45; b.hold = 0;
}

function stepVel(p: GPlayer, dvx: number, dvy: number, dt: number) {
  // sanftes Annähern an die Wunschgeschwindigkeit (arcade, aber nicht ruckartig)
  const k = clamp(16 * dt, 0, 1);
  p.vx += (dvx - p.vx) * k;
  p.vy += (dvy - p.vy) * k;
}

function moveToward(p: GPlayer, tx: number, ty: number, speed: number, dt: number) {
  const d = dist(p.x, p.y, tx, ty);
  if (d < 3) { stepVel(p, 0, 0, dt); return; }
  const [ux, uy] = norm(tx - p.x, ty - p.y);
  stepVel(p, ux * speed, uy * speed, dt);
}

function supportAI(s: GState, p: GPlayer, dt: number) {
  const attack = p.side === 'me' ? -1 : 1;
  const possess = !!byId(s, s.ball.owner) && byId(s, s.ball.owner)!.side === p.side;
  const tx = clamp(p.hx + (s.ball.x - CX) * 0.28, LEFT + PR, RIGHT - PR);
  const ty = clamp(p.hy + (possess ? attack * 55 : (s.ball.y - p.hy) * 0.18), TOP + PR, BOTTOM - PR);
  const speed = (p.side === 'ai' ? PLAYER_SPEED * s.diff.aiMul : PLAYER_SPEED) * 0.92;
  moveToward(p, tx, ty, speed, dt);
}

function aiControl(s: GState, p: GPlayer, dt: number) {
  const b = s.ball;
  const aiSpeed = PLAYER_SPEED * s.diff.aiMul;
  const myGoalY = BOTTOM; // ai greift nach unten an (Mensch verteidigt unten)
  if (b.owner === p.id) {
    p.dec -= dt;
    const dGoal = dist(p.x, p.y, CX, myGoalY);
    const central = Math.abs(p.x - CX) < GOAL_W / 2 + 34;
    if (p.dec <= 0) {
      p.dec = s.diff.decEvery;
      if (dGoal < s.diff.shootRange && central) { doAction(s, p, 'shoot'); return; }
      // Gegner (Mensch) nah? dann abspielen
      const nearestOpp = nearest(s, p, 'me');
      const pressed = nearestOpp && dist(p.x, p.y, nearestOpp.x, nearestOpp.y) < 42;
      if (pressed && Math.random() < s.diff.passChance) {
        doAction(s, p, Math.random() < 0.4 ? 'through' : 'pass');
        return;
      }
    }
    // Richtung Tor dribbeln, dem nächsten Gegner leicht ausweichen
    let [ux, uy] = norm(CX - p.x, myGoalY - p.y);
    const opp = nearest(s, p, 'me');
    if (opp && dist(p.x, p.y, opp.x, opp.y) < 55) {
      const away = norm(p.x - opp.x, p.y - opp.y);
      ux += away[0] * 0.9; uy += away[1] * 0.9;
      [ux, uy] = norm(ux, uy);
    }
    stepVel(p, ux * aiSpeed, uy * aiSpeed, dt);
  } else {
    // Pressing: zum Abfangpunkt laufen
    const ix = b.x + b.vx * 0.12;
    const iy = b.y + b.vy * 0.12;
    moveToward(p, ix, iy, aiSpeed, dt);
  }
}

function nearest(s: GState, from: GPlayer, side: Side): GPlayer | null {
  let best: GPlayer | null = null, bd = Infinity;
  for (const p of s.players) {
    if (p.side !== side || p.gk) continue;
    const d = dist(p.x, p.y, from.x, from.y);
    if (d < bd) { bd = d; best = p; }
  }
  return best;
}

function gkBehavior(s: GState, p: GPlayer, dt: number) {
  const b = s.ball;
  const lineY = p.side === 'me' ? BOTTOM - 8 : TOP + 8;
  const gx = clamp(b.x, CX - GOAL_W / 2 + 8, CX + GOAL_W / 2 - 8);
  const towardOwnGoal = p.side === 'me' ? b.y > CY : b.y < CY;
  const close = dist(p.x, p.y, b.x, b.y) < 62 && towardOwnGoal && !b.owner;
  const speed = PLAYER_SPEED * (p.side === 'ai' ? s.diff.aiMul : 1) * (close ? 1.15 : 0.95);
  if (close) moveToward(p, b.x, b.y, speed, dt);
  else moveToward(p, gx, lineY, speed, dt);
}

// Ball + Besitz + Tore.
function updateBall(s: GState, input: Input, meActive: GPlayer, dt: number) {
  const b = s.ball;
  b.noPickup = Math.max(0, b.noPickup - dt);
  b.selfLock = Math.max(0, b.selfLock - dt);

  if (b.owner) {
    const o = byId(s, b.owner)!;
    const lead = o.gk ? BR + 2 : PR + BR - 1;
    b.x = o.x + o.fx * lead;
    b.y = o.y + o.fy * lead;
    b.vx = 0; b.vy = 0;
    // Torwart klärt automatisch nach kurzem Halten (beide Seiten).
    if (o.gk) {
      b.hold += dt;
      if (b.hold > 0.45) { doAction(s, o, 'through'); return; }
    } else {
      b.hold = 0;
    }
    // Mensch-Aktion
    if (o.id === meActive.id && input.action) {
      doAction(s, o, input.action);
      return;
    }
    return;
  }

  // freier Ball: Physik
  b.x += b.vx * dt;
  b.y += b.vy * dt;
  const damp = Math.max(0, 1 - 0.9 * dt);
  b.vx *= damp; b.vy *= damp;
  if (Math.hypot(b.vx, b.vy) < 4) { b.vx = 0; b.vy = 0; }

  // Tore + Banden
  const inMouth = Math.abs(b.x - CX) < GOAL_W / 2;
  if (b.y - BR < TOP) {
    if (inMouth) { goal(s, 'me'); return; }
    b.y = TOP + BR; b.vy = Math.abs(b.vy) * 0.55;
  }
  if (b.y + BR > BOTTOM) {
    if (inMouth) { goal(s, 'ai'); return; }
    b.y = BOTTOM - BR; b.vy = -Math.abs(b.vy) * 0.55;
  }
  if (b.x - BR < LEFT) { b.x = LEFT + BR; b.vx = Math.abs(b.vx) * 0.55; }
  if (b.x + BR > RIGHT) { b.x = RIGHT - BR; b.vx = -Math.abs(b.vx) * 0.55; }

  // Aufnahme
  if (b.noPickup <= 0) {
    let best: GPlayer | null = null, bd = Infinity;
    for (const p of s.players) {
      const r = p.gk ? PR + BR + 7 : PICKUP_R;
      const d = dist(p.x, p.y, b.x, b.y);
      if (d < r && d < bd) {
        if (p.id === b.lastKicker && b.selfLock > 0) continue;
        bd = d; best = p;
      }
    }
    if (best) { b.owner = best.id; b.vx = 0; b.vy = 0; b.hold = 0; }
  }
}

function goal(s: GState, scorer: Side) {
  if (scorer === 'me') s.scoreMe++; else s.scoreAi++;
  s.flash = { text: scorer === 'me' ? 'TOR! ⚽' : 'GEGENTOR', t: 1.3 };
  resetKickoff(s, scorer === 'me' ? 'ai' : 'me');
}

function step(s: GState, input: Input, dt: number) {
  if (s.flash) { s.flash.t -= dt; if (s.flash.t <= 0) s.flash = null; }
  // Kurze „Bereit?"-Pause bei Anpfiff / nach Toren: alles steht still.
  if (s.frozen > 0) { s.frozen -= dt; return pickActive(s, 'me').id; }

  const meActive = pickActive(s, 'me');
  const aiActive = pickActive(s, 'ai');

  for (const p of s.players) {
    if (p.gk) { gkBehavior(s, p, dt); continue; }
    if (p.side === 'me') {
      if (p.id === meActive.id) {
        const mag = Math.hypot(input.mx, input.my);
        const sp = PLAYER_SPEED * (input.sprint ? SPRINT_MUL : 1);
        if (mag > 0.08) stepVel(p, input.mx * sp, input.my * sp, dt);
        else stepVel(p, 0, 0, dt);
      } else supportAI(s, p, dt);
    } else {
      if (p.id === aiActive.id) aiControl(s, p, dt);
      else supportAI(s, p, dt);
    }
  }

  for (const p of s.players) {
    p.x = clamp(p.x + p.vx * dt, LEFT + PR, RIGHT - PR);
    p.y = clamp(p.y + p.vy * dt, TOP + PR, BOTTOM - PR);
    const m = Math.hypot(p.vx, p.vy);
    if (m > 6) { p.fx = p.vx / m; p.fy = p.vy / m; }
  }

  updateBall(s, input, meActive, dt);
  return meActive.id;
}

// --- Zeichnen ---------------------------------------------------------------
function draw(ctx: CanvasRenderingContext2D, s: GState, mine: Lineup, ai: Lineup, activeId: string) {
  // Rasen
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#166c3b');
  g.addColorStop(1, '#0f5c31');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  // Streifen
  ctx.fillStyle = 'rgba(255,255,255,0.04)';
  for (let i = 0; i < 8; i++) if (i % 2 === 0) ctx.fillRect(0, TOP + (i * (BOTTOM - TOP)) / 8, W, (BOTTOM - TOP) / 8);

  // Orientierung: untere Hälfte = dein Team, obere = Gegner (dezente Tönung).
  ctx.globalAlpha = 0.12;
  ctx.fillStyle = mine.color; ctx.fillRect(LEFT, CY, RIGHT - LEFT, BOTTOM - CY);
  ctx.fillStyle = ai.color; ctx.fillRect(LEFT, TOP, RIGHT - LEFT, CY - TOP);
  ctx.globalAlpha = 1;

  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = 2;
  ctx.strokeRect(LEFT, TOP, RIGHT - LEFT, BOTTOM - TOP);
  // Mittellinie + Kreis
  ctx.beginPath(); ctx.moveTo(LEFT, CY); ctx.lineTo(RIGHT, CY); ctx.stroke();
  ctx.beginPath(); ctx.arc(CX, CY, 42, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.arc(CX, CY, 3, 0, Math.PI * 2); ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fill();
  // Strafräume
  const boxW = GOAL_W + 44, boxH = 54;
  ctx.strokeRect(CX - boxW / 2, TOP, boxW, boxH);
  ctx.strokeRect(CX - boxW / 2, BOTTOM - boxH, boxW, boxH);
  // Tore – in der Farbe des VERTEIDIGENDEN Teams (unten = dein Tor, oben = Gegner).
  ctx.lineWidth = 5; ctx.lineCap = 'round';
  ctx.strokeStyle = ai.color;
  ctx.beginPath(); ctx.moveTo(CX - GOAL_W / 2, TOP); ctx.lineTo(CX + GOAL_W / 2, TOP); ctx.stroke();
  ctx.strokeStyle = mine.color;
  ctx.beginPath(); ctx.moveTo(CX - GOAL_W / 2, BOTTOM); ctx.lineTo(CX + GOAL_W / 2, BOTTOM); ctx.stroke();
  ctx.lineCap = 'butt';

  // Seiten-Beschriftung + Angriffsrichtung (klare Orientierung).
  ctx.textAlign = 'center';
  ctx.font = 'bold 12px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.textBaseline = 'top';
  ctx.fillText(`▲ DU · ${mine.name}`.slice(0, 22), CX, BOTTOM - 15);
  ctx.textBaseline = 'bottom';
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.fillText(`▼ ${ai.name}`.slice(0, 22), CX, TOP + 15);

  // Spieler
  for (const p of s.players) {
    const lu = p.side === 'me' ? mine : ai;
    const base = p.gk ? mix(lu.color, 0, 0.45) : lu.color;
    // Schatten
    ctx.beginPath(); ctx.ellipse(p.x, p.y + PR * 0.7, PR * 0.9, PR * 0.45, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.fill();
    // aktiver Spieler: gelber Ring
    if (p.id === activeId) {
      ctx.beginPath(); ctx.arc(p.x, p.y, PR + 4, 0, Math.PI * 2);
      ctx.strokeStyle = '#facc15'; ctx.lineWidth = 3; ctx.stroke();
    }
    ctx.beginPath(); ctx.arc(p.x, p.y, PR, 0, Math.PI * 2);
    ctx.fillStyle = base; ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.stroke();
    // Nummer
    ctx.fillStyle = textOn(base);
    ctx.font = 'bold 11px system-ui, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(String(p.num), p.x, p.y + 0.5);
  }

  // Ball
  ctx.beginPath(); ctx.ellipse(s.ball.x, s.ball.y + BR * 0.8, BR, BR * 0.5, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fill();
  ctx.beginPath(); ctx.arc(s.ball.x, s.ball.y, BR, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff'; ctx.fill();
  ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.stroke();
}

// --- Match-Ansicht (Canvas + Steuerung) ------------------------------------
function MatchView({
  mine, ai, diff, seconds, onFinish, onExit,
}: {
  mine: Lineup; ai: Lineup; diff: Diff; seconds: number;
  onFinish: (gf: number, ga: number, result: GameResult) => void;
  onExit: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef<GState>(buildState(mine, ai, diff));
  const inputRef = useRef<Input>({ mx: 0, my: 0, sprint: false, action: null });
  const [hud, setHud] = useState({ me: 0, ai: 0, time: seconds });
  const [countdown, setCountdown] = useState(3);
  const finishedRef = useRef(false);

  // Joystick
  const joyRef = useRef<HTMLDivElement>(null);
  const joyId = useRef<number | null>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });

  const setAction = (a: 'pass' | 'through' | 'shoot') => { inputRef.current.action = a; };

  const onJoyDown = (e: React.PointerEvent) => {
    joyId.current = e.pointerId;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    updateJoy(e);
  };
  const updateJoy = (e: React.PointerEvent) => {
    const el = joyRef.current; if (!el) return;
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const rad = r.width / 2;
    let dx = e.clientX - cx, dy = e.clientY - cy;
    const m = Math.hypot(dx, dy);
    if (m > rad) { dx = (dx / m) * rad; dy = (dy / m) * rad; }
    setKnob({ x: dx, y: dy });
    inputRef.current.mx = dx / rad;
    inputRef.current.my = dy / rad;
  };
  const onJoyMove = (e: React.PointerEvent) => { if (joyId.current === e.pointerId) updateJoy(e); };
  const onJoyUp = (e: React.PointerEvent) => {
    if (joyId.current !== e.pointerId) return;
    joyId.current = null;
    setKnob({ x: 0, y: 0 });
    inputRef.current.mx = 0; inputRef.current.my = 0;
  };

  // Countdown vor dem Anpfiff
  useEffect(() => {
    if (countdown <= 0) return;
    const t = setTimeout(() => setCountdown((c) => c - 1), 700);
    return () => clearTimeout(t);
  }, [countdown]);

  // Spielschleife
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    let timeLeft = seconds;
    let started = false;

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.04, (now - last) / 1000);
      last = now;
      const s = stateRef.current;

      // Erst nach dem Countdown die Uhr starten
      if (countdown <= 0) started = true;
      if (started && s.frozen <= 0) {
        timeLeft -= dt;
        if (timeLeft <= 0 && !finishedRef.current) {
          finishedRef.current = true;
          timeLeft = 0;
          const result: GameResult = s.scoreMe > s.scoreAi ? 'win' : s.scoreMe < s.scoreAi ? 'loss' : 'draw';
          cancelAnimationFrame(raf);
          onFinish(s.scoreMe, s.scoreAi, result);
          return;
        }
      }

      const activeId = countdown <= 0 ? step(s, inputRef.current, dt) : pickActive(s, 'me').id;
      inputRef.current.action = null;

      // HUD ~10x/s aktualisieren
      acc += dt;
      if (acc > 0.1) {
        acc = 0;
        setHud({ me: s.scoreMe, ai: s.scoreAi, time: Math.ceil(timeLeft) });
      }

      const ctx = canvasRef.current?.getContext('2d');
      if (ctx) draw(ctx, s, mine, ai, activeId);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countdown]);

  const btn = 'select-none active:scale-95 transition-transform flex flex-col items-center justify-center rounded-2xl font-display font-black uppercase tracking-tight text-white shadow-lg touch-none';

  return (
    <div className="absolute inset-0 flex flex-col bg-[#08110f]" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
      {/* HUD */}
      <div className="flex items-center justify-between px-3 py-2 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-3 h-3 rounded-full shrink-0" style={{ background: mine.color }} />
          <span className="text-white font-display font-black uppercase tracking-tight text-sm truncate">{mine.icon} {mine.name}</span>
        </div>
        <div className="flex items-center gap-2 px-3 py-1 rounded-xl bg-white/10 shrink-0">
          <span className="text-white font-mono font-bold text-lg tabular-nums">{hud.me}</span>
          <span className="text-hl-mute text-xs">:</span>
          <span className="text-white font-mono font-bold text-lg tabular-nums">{hud.ai}</span>
        </div>
        <div className="flex items-center gap-2 min-w-0 justify-end">
          <span className="text-white font-display font-black uppercase tracking-tight text-sm truncate">{ai.name} {ai.icon}</span>
          <span className="w-3 h-3 rounded-full shrink-0" style={{ background: ai.color }} />
        </div>
      </div>
      <div className="text-center text-brand-accent-light font-mono font-bold text-sm tabular-nums shrink-0">{hud.time}s</div>

      {/* Feld */}
      <div className="flex-1 min-h-0 flex items-center justify-center px-2 py-1 relative">
        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          className="max-h-full max-w-full rounded-xl shadow-2xl"
          style={{ aspectRatio: `${W} / ${H}`, height: '100%', width: 'auto', touchAction: 'none' }}
        />
        {countdown > 0 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <motion.span
              key={countdown}
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="text-6xl font-display font-black text-white drop-shadow-[0_0_20px_rgba(34,223,201,.7)]"
            >
              {countdown}
            </motion.span>
          </div>
        )}
        {stateRef.current.flash && countdown <= 0 && (
          <div className="absolute inset-x-0 top-1/3 flex items-center justify-center pointer-events-none">
            <motion.span
              key={stateRef.current.flash.text + hud.me + hud.ai}
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="text-4xl font-display font-black text-white drop-shadow-[0_0_18px_rgba(0,0,0,.8)]"
            >
              {stateRef.current.flash.text}
            </motion.span>
          </div>
        )}
        <button
          onClick={onExit}
          className="absolute top-1 right-2 p-2 rounded-full bg-black/40 text-white/80 hover:text-white cursor-pointer"
          title="Spiel beenden"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Steuerung (unteres Drittel) */}
      <div className="shrink-0 flex items-stretch justify-between gap-3 px-4 pt-2" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 0.75rem)' }}>
        {/* Joystick */}
        <div
          ref={joyRef}
          onPointerDown={onJoyDown}
          onPointerMove={onJoyMove}
          onPointerUp={onJoyUp}
          onPointerCancel={onJoyUp}
          className="relative w-36 h-36 rounded-full bg-white/5 border border-white/10 touch-none shrink-0"
          style={{ touchAction: 'none' }}
        >
          <div
            className="absolute w-16 h-16 rounded-full bg-white/20 border border-white/30 left-1/2 top-1/2"
            style={{ transform: `translate(calc(-50% + ${knob.x}px), calc(-50% + ${knob.y}px))` }}
          />
          <span className="absolute inset-0 flex items-center justify-center text-[10px] font-mono uppercase text-white/30 pointer-events-none">Bewegen</span>
        </div>

        {/* Aktionsknöpfe */}
        <div className="grid grid-cols-2 gap-2 flex-1 max-w-[240px]">
          <button
            className={`${btn} bg-gradient-to-br from-amber-400 to-orange-500 text-[13px]`}
            onPointerDown={(e) => { e.preventDefault(); inputRef.current.sprint = true; }}
            onPointerUp={() => { inputRef.current.sprint = false; }}
            onPointerLeave={() => { inputRef.current.sprint = false; }}
            onPointerCancel={() => { inputRef.current.sprint = false; }}
          >
            <Zap className="w-5 h-5" /> Sprint
          </button>
          <button className={`${btn} bg-gradient-to-br from-rose-500 to-red-600 text-[13px]`} onPointerDown={(e) => { e.preventDefault(); setAction('shoot'); }}>
            ⚽ Schuss
          </button>
          <button className={`${btn} bg-gradient-to-br from-sky-500 to-blue-600 text-[13px]`} onPointerDown={(e) => { e.preventDefault(); setAction('pass'); }}>
            Pass
          </button>
          <button className={`${btn} bg-gradient-to-br from-violet-500 to-fuchsia-600 text-[13px]`} onPointerDown={(e) => { e.preventDefault(); setAction('through'); }}>
            Steil
          </button>
        </div>
      </div>
    </div>
  );
}

// --- Aufstellung wählen -----------------------------------------------------
function TeamPick({ teams, value, onPick, label }: { teams: Team[]; value: string; onPick: (id: string) => void; label: string }) {
  return (
    <div>
      <label className="block text-[10px] font-mono text-hl-dim uppercase mb-1.5">{label}</label>
      <div className="grid grid-cols-2 gap-1.5">
        {teams.map((t) => {
          const on = t.id === value;
          return (
            <button
              key={t.id}
              onClick={() => onPick(t.id)}
              className={`flex items-center gap-2 px-2.5 py-2 rounded-xl border text-left transition-colors cursor-pointer ${
                on ? 'border-brand-accent-light bg-brand-accent-light/15' : 'border-white/10 bg-white/5 hover:border-white/25'
              }`}
            >
              <span className="w-7 h-7 rounded-lg flex items-center justify-center text-sm shrink-0" style={{ background: t.logoColor }}>{t.logoIcon}</span>
              <span className="min-w-0">
                <span className="block text-[13px] font-sans font-bold text-white truncate">{t.name}</span>
                <span className="block text-[10px] font-mono text-hl-mute">{(t.spielerliste ?? []).length} Spieler</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function padPlayers(list: Player[]): Player[] {
  const out = [...list];
  let i = out.length + 1;
  while (out.length < 5) { out.push({ name: `Spieler ${i}`, number: i }); i++; }
  return out;
}

function toLineup(team: Team, chosen: Player[]): Lineup {
  const players = chosen.map((p, i) => ({ name: p.name, num: p.number ?? i + 1, gk: !!p.goalkeeper }));
  // genau einen Torwart sicherstellen
  if (!players.some((p) => p.gk)) players[0].gk = true;
  else {
    let seen = false;
    for (const p of players) { if (p.gk && seen) p.gk = false; if (p.gk) seen = true; }
  }
  return { name: team.name, color: team.logoColor || '#3B82F6', icon: team.logoIcon || '⚽', players };
}

function autoLineup(team: Team): Player[] {
  const list = padPlayers(team.spielerliste ?? []);
  const gk = list.find((p) => p.goalkeeper);
  const rest = list.filter((p) => p !== gk);
  const start = gk ? [gk, ...rest] : list;
  return start.slice(0, 5);
}

function SetupView({ teams, onStart, onClose }: { teams: Team[]; onStart: (mine: Lineup, ai: Lineup, diff: Diff) => void; onClose: () => void }) {
  const [myTeamId, setMyTeamId] = useState(teams[0]?.id ?? '');
  const [aiTeamId, setAiTeamId] = useState(teams[1]?.id ?? teams[0]?.id ?? '');
  const [diffKey, setDiffKey] = useState('mittel');
  const myTeam = teams.find((t) => t.id === myTeamId);
  const aiTeam = teams.find((t) => t.id === aiTeamId);
  const kader = useMemo(() => padPlayers(myTeam?.spielerliste ?? []), [myTeam]);
  const [selected, setSelected] = useState<string[]>([]);

  // Bei Team-Wechsel automatisch die ersten 5 vorwählen.
  useEffect(() => {
    if (!myTeam) return;
    setSelected(autoLineup(myTeam).map((p) => p.name));
  }, [myTeamId]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (name: string) => {
    setSelected((prev) => {
      if (prev.includes(name)) return prev.filter((n) => n !== name);
      if (prev.length >= 5) return prev;
      return [...prev, name];
    });
  };

  const ready = !!myTeam && !!aiTeam && selected.length === 5;
  const start = () => {
    if (!ready || !myTeam || !aiTeam) return;
    const chosen = kader.filter((p) => selected.includes(p.name)).slice(0, 5);
    const diff = DIFFS.find((d) => d.key === diffKey) ?? DIFFS[1];
    onStart(toLineup(myTeam, chosen), toLineup(aiTeam, autoLineup(aiTeam)), diff);
  };

  return (
    <div className="absolute inset-0 flex flex-col hl-surf" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 shrink-0">
        <button onClick={onClose} className="flex items-center gap-1 text-hl-soft hover:text-white cursor-pointer">
          <ChevronLeft className="w-5 h-5" /> <span className="text-sm font-semibold">Zurück</span>
        </button>
        <span className="font-display font-black text-white uppercase tracking-tight">Aufstellung</span>
        <span className="w-16" />
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        <TeamPick teams={teams} value={myTeamId} onPick={setMyTeamId} label="Dein Team" />

        {/* Kader */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-[10px] font-mono text-hl-dim uppercase">Deine 5 · Torwart = 🧤</label>
            <span className={`text-[11px] font-mono ${selected.length === 5 ? 'text-brand-accent-light' : 'text-hl-mute'}`}>{selected.length}/5</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {kader.map((p) => {
              const on = selected.includes(p.name);
              const isGk = !!p.goalkeeper;
              return (
                <button
                  key={p.name}
                  onClick={() => toggle(p.name)}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-sans font-semibold border transition-colors cursor-pointer flex items-center gap-1.5 ${
                    on ? 'bg-brand-accent-light/20 border-brand-accent-light/50 text-brand-accent-light' : 'bg-white/5 border-white/10 text-hl-mute hover:text-white'
                  }`}
                >
                  {on && <span className="text-[10px] font-mono opacity-70">✓</span>}
                  <span className="opacity-60 font-mono">{p.number ?? '–'}</span>
                  {p.name}
                  {isGk && <span title="Torwart">🧤</span>}
                </button>
              );
            })}
          </div>
        </div>

        <TeamPick teams={teams} value={aiTeamId} onPick={setAiTeamId} label="Gegner" />

        {/* Schwierigkeit */}
        <div>
          <label className="block text-[10px] font-mono text-hl-dim uppercase mb-1.5">Schwierigkeit</label>
          <div className="flex gap-1.5 hl-surf-soft border border-white/10 rounded-xl p-1">
            {DIFFS.map((d) => (
              <button
                key={d.key}
                onClick={() => setDiffKey(d.key)}
                className={`flex-1 px-3 py-2 rounded-lg text-xs font-sans font-semibold transition-colors cursor-pointer ${
                  diffKey === d.key ? 'bg-brand-accent-light text-white' : 'text-hl-mute hover:text-white'
                }`}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="shrink-0 p-4 border-t border-white/10" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 1rem)' }}>
        <button
          onClick={start}
          disabled={!ready}
          className="w-full py-3.5 rounded-2xl font-display font-black uppercase tracking-tight text-white bg-gradient-to-br from-brand-accent-light to-brand-accent shadow-lg disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center gap-2"
        >
          <Play className="w-5 h-5" /> Anpfiff
        </button>
      </div>
    </div>
  );
}

// --- Leaderboard / Start-Ansicht -------------------------------------------
function HomeView({
  board, loading, currentUserId, lastResult, onPlay, onClose,
}: {
  board: GameBoardRow[]; loading: boolean; currentUserId: string;
  lastResult: null | { gf: number; ga: number; result: GameResult };
  onPlay: () => void; onClose: () => void;
}) {
  const medal = (i: number) => (i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`);
  return (
    <div className="absolute inset-0 flex flex-col hl-surf" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 shrink-0">
        <span className="font-display font-black text-white uppercase tracking-tight flex items-center gap-2">
          <span className="text-xl">⚽</span> Hero Kicker
        </span>
        <button onClick={onClose} className="p-1 text-hl-mute hover:text-white cursor-pointer"><X className="w-5 h-5" /></button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {lastResult && (
          <div className={`rounded-2xl p-4 text-center border ${
            lastResult.result === 'win' ? 'bg-emerald-500/15 border-emerald-500/40' : lastResult.result === 'loss' ? 'bg-rose-500/15 border-rose-500/40' : 'bg-white/5 border-white/15'
          }`}>
            <div className="text-3xl font-display font-black text-white">{lastResult.gf} : {lastResult.ga}</div>
            <div className="text-sm font-semibold mt-1 text-white/80">
              {lastResult.result === 'win' ? '🎉 Sieg!' : lastResult.result === 'loss' ? 'Knappe Sache – nächstes Mal!' : 'Unentschieden'}
            </div>
          </div>
        )}

        <button
          onClick={onPlay}
          className="w-full py-4 rounded-2xl font-display font-black uppercase tracking-tight text-white bg-gradient-to-br from-brand-accent-light to-brand-accent shadow-lg cursor-pointer flex items-center justify-center gap-2 text-lg"
        >
          <Play className="w-6 h-6" /> {board.length ? 'Neues Spiel' : 'Erstes Spiel'}
        </button>

        <div>
          <div className="flex items-center gap-2 mb-2 text-hl-soft">
            <Trophy className="w-4 h-4 text-amber-400" />
            <span className="font-display font-bold uppercase tracking-tight text-sm">Bestenliste</span>
          </div>
          {loading ? (
            <div className="flex justify-center py-8 text-hl-mute"><Loader2 className="w-5 h-5 animate-spin" /></div>
          ) : board.length === 0 ? (
            <div className="text-center py-8 text-hl-mute text-sm">
              <Medal className="w-8 h-8 mx-auto mb-2 opacity-40" />
              Noch keine Spiele. Sei der Erste!
            </div>
          ) : (
            <div className="space-y-1.5">
              {board.map((r, i) => {
                const me = r.userId === currentUserId;
                return (
                  <div
                    key={r.userId}
                    className={`flex items-center gap-3 px-3 py-2 rounded-xl border ${
                      me ? 'bg-brand-accent-light/15 border-brand-accent-light/40' : 'bg-white/5 border-white/10'
                    }`}
                  >
                    <span className="w-7 text-center font-display font-black text-sm text-white/70 shrink-0">{medal(i)}</span>
                    <div className="min-w-0 flex-1">
                      <div className="text-[14px] font-sans font-bold text-white truncate flex items-center gap-1.5">
                        {i === 0 && <Crown className="w-3.5 h-3.5 text-amber-400 shrink-0" />}
                        {r.name}{me && <span className="text-[10px] font-mono text-brand-accent-light">(du)</span>}
                      </div>
                      <div className="text-[10px] font-mono text-hl-mute">
                        {r.wins}S · {r.draws}U · {r.losses}N · {r.gf}:{r.ga} Tore
                      </div>
                    </div>
                    <span className="font-mono font-bold text-brand-accent-light shrink-0">{r.points}<span className="text-[10px] text-hl-mute ml-0.5">Pkt</span></span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// --- Hauptkomponente --------------------------------------------------------
type Screen = 'home' | 'setup' | 'match';

export default function SoccerGame({ currentUserId, onClose }: { currentUserId: string; onClose: () => void }) {
  const [teams, setTeams] = useState<Team[]>([]);
  const [board, setBoard] = useState<GameBoardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [screen, setScreen] = useState<Screen>('home');
  const [match, setMatch] = useState<{ mine: Lineup; ai: Lineup; diff: Diff } | null>(null);
  const [lastResult, setLastResult] = useState<null | { gf: number; ga: number; result: GameResult }>(null);

  useEffect(() => {
    Promise.all([
      apiFetch<Team[]>('/api/teams').catch(() => [] as Team[]),
      fetchGameBoard().catch(() => [] as GameBoardRow[]),
    ]).then(([ts, b]) => {
      setTeams(ts.filter((t) => t && t.id));
      setBoard(b);
      setLoading(false);
    });
  }, []);

  const finish = useCallback((gf: number, ga: number, result: GameResult) => {
    setLastResult({ gf, ga, result });
    setScreen('home');
    reportGameResult(result, gf, ga)
      .then((r) => setBoard(r.board))
      .catch(() => { /* offline: Bilanz bleibt lokal ungespeichert */ });
  }, []);

  return (
    <ModalPortal>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[90] bg-[#08110f]"
      >
        {loading && screen === 'home' ? (
          <div className="absolute inset-0 flex items-center justify-center text-hl-mute"><Loader2 className="w-6 h-6 animate-spin" /></div>
        ) : screen === 'home' ? (
          <HomeView
            board={board}
            loading={loading}
            currentUserId={currentUserId}
            lastResult={lastResult}
            onPlay={() => (teams.length ? setScreen('setup') : onClose())}
            onClose={onClose}
          />
        ) : screen === 'setup' ? (
          <SetupView
            teams={teams}
            onClose={() => setScreen('home')}
            onStart={(mine, ai, diff) => { setMatch({ mine, ai, diff }); setScreen('match'); }}
          />
        ) : match ? (
          <MatchView
            mine={match.mine}
            ai={match.ai}
            diff={match.diff}
            seconds={60}
            onFinish={finish}
            onExit={() => setScreen('home')}
          />
        ) : null}
      </motion.div>
    </ModalPortal>
  );
}
