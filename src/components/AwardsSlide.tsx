import type { ReactNode } from 'react';
import type { MatchPlayerStat, Partner, PlayerCard, PlayerOfMonth, ScoringConfig, StatRole, Team } from '../types';
import { awardView, fmtNote } from '../lib/awards';
import FifaCard from './FifaCard';
import { SponsorLink } from './ui';

// ===========================================================================
// Startseiten-Folie „Auszeichnungen des Spieltages": links der Spieler, rechts
// der Torwart des Spieltages – spiegelsymmetrisch: die FIFA-Karten stehen
// innen an der Mittellinie, die Spieltagswerte außen, Überschrift und Name sind
// zur Mitte ausgerichtet. Oben groß „präsentiert von" mit dem Sponsor-Logo.
// Am Handy stehen die beiden Karten kleiner nebeneinander, darunter die Note.
// Karte UND Werte = nur dieser Spieltag (bleibt fix, auch wenn später weitere Spieltage dazukommen).
// Ohne Tracking-Daten fällt der Spieler auf die bisherige Foto-Karte zurück.
// Fehlt jemand, steht dort nur die Überschrift mit einer leeren Wartekarte.
// ===========================================================================

interface Props {
  pom: PlayerOfMonth;
  teams: Team[];
  trackingRows: MatchPlayerStat[];
  scoring?: ScoringConfig;
  seasonId?: string;
  sponsor?: Partner;
  onSelectTeam?: (teamId: string, playerName?: string) => void;
  buttons?: ReactNode;
}

const TEAL = '#22DFC9';
const GOLD = '#E9C46A';

interface SideData {
  role: StatRole;
  name: string;
  teamId: string; // gespeicherte Team-ID (auch wenn der Verein nicht mehr in der Saison ist)
  club: string;
  team?: Team;
  image?: string;
}

function findTeam(teams: Team[], teamId?: string, club?: string): Team | undefined {
  return (teamId ? teams.find((t) => t.id === teamId) : undefined) || (club ? teams.find((t) => t.name === club) : undefined);
}

// Klickbar nur mit Ziel – sonst ein schlichtes <div>. (Kein deaktivierter
// <button>: Safari blendet dessen Inhalt grau/halb durchsichtig aus.)
function Tap({ onClick, label, className, children }: { onClick?: () => void; label?: string; className?: string; children: ReactNode }) {
  return onClick ? (
    <button type="button" onClick={onClick} aria-label={label} className={`cursor-pointer ${className ?? ''}`}>
      {children}
    </button>
  ) : (
    <div className={className}>{children}</div>
  );
}

// Wartekarte im FIFA-Look (noch keine Tracking-Werte): Spieler grün, Torwart gold.
const PENDING_ATTRS: Record<StatRole, string[]> = {
  field: ['PAS', 'SCH', 'DRI', 'DEF'],
  keeper: ['STL', 'PAR', 'PAS', 'SIC'],
};
function pendingCard(role: StatRole): PlayerCard {
  return { role, ges: 0, tier: role === 'keeper' ? 'gold' : 'hero', attrs: PENDING_ATTRS[role].map((k) => ({ key: k, label: k, value: 0 })) };
}

// Name nur, wenn er echte Buchstaben/Ziffern enthält (unsichtbare Zeichen o. Ä. = leer).
const INVISIBLE = /[\u115F\u1160\u3164\uFFA0\u200B-\u200F\u2060\uFEFF\u00AD]/g;
const hasName = (n?: string) => !!n && /[\p{L}\p{N}]/u.test(n.replace(INVISIBLE, ''));

function AwardSide({
  side,
  data,
  pom,
  props,
}: {
  side: 'left' | 'right';
  data: SideData;
  pom: PlayerOfMonth;
  props: Props;
}) {
  const isP = data.role === 'field';
  const accent = isP ? TEAL : GOLD;
  const { trackingRows, scoring, seasonId, onSelectTeam } = props;
  const view =
    scoring && seasonId && data.teamId
      ? awardView(trackingRows, seasonId, scoring, data.teamId, data.name, data.role, pom.matchday)
      : { card: null, note: null, stats: [] };
  // Foto: im Backend hinterlegt, sonst aus dem Kader.
  const image = data.image || data.team?.spielerliste?.find((p) => p.name === data.name)?.imageUrl;
  const parts = data.name.trim().split(/\s+/);
  const first = parts.length > 1 ? parts.slice(0, -1).join(' ') : '';
  const last = parts[parts.length - 1] ?? data.name;
  const open = data.team && onSelectTeam ? () => onSelectTeam(data.team!.id, data.name) : undefined;

  // Werte: Note + Spieltagswerte (ohne Tracking beim Spieler: Tore/Vorlagen aus dem Backend).
  const stats: { value: string; label: string; accent?: boolean }[] = [];
  if (view.note !== null) stats.push({ value: fmtNote(view.note), label: 'Spieltagsnote', accent: true });
  if (view.stats.length) stats.push(...view.stats);
  else if (isP && !view.card && ((pom.goals ?? 0) > 0 || (pom.assists ?? 0) > 0)) {
    // Ohne Tracking: Tore/Vorlagen aus dem Backend.
    stats.push({ value: String(pom.goals ?? 0), label: 'Tore' }, { value: String(pom.assists ?? 0), label: 'Vorlagen' });
  }

  // Ausrichtung zur Mitte: links rechtsbündig, rechts linksbündig (nur PC).
  const align = side === 'left' ? 'lg:justify-items-end lg:text-right' : 'lg:justify-items-start lg:text-left';

  const cardEl = (
    <Tap
      onClick={open}
      label={`${data.name} – Spielerseite öffnen`}
      className={`shrink-0 w-[150px] sm:w-[220px] xl:w-[240px] ${open ? 'transition-transform duration-200 hover:-translate-y-1' : ''}`}
    >
      {view.card ? (
        <FifaCard card={view.card} name={data.name} imageUrl={image} team={data.team} />
      ) : (
        <FifaCard card={pendingCard(data.role)} name={data.name} imageUrl={image} team={data.team} pending label={isP ? 'Spieler' : 'Torwart'} />
      )}
    </Tap>
  );

  const statsEl = stats.length > 0 && (
    <div className={`hidden lg:grid grid-cols-1 gap-y-5 pb-3 ${side === 'left' ? 'justify-items-end text-right' : 'justify-items-start text-left'}`}>
      {stats.map((s) => (
        <div key={s.label} className="flex flex-col">
          <span className="font-display font-black tabular-nums leading-none text-4xl" style={{ color: s.accent ? accent : '#fff' }}>
            {s.value}
          </span>
          <span className="mt-1 font-sans font-bold uppercase tracking-[1.5px] text-[11px] text-white/55">{s.label}</span>
        </div>
      ))}
    </div>
  );

  return (
    // Drei gemeinsame Zeilen (Überschrift · Name · Karte) über beide Spalten
    // (subgrid) → Karten stehen links und rechts immer auf gleicher Höhe.
    <div className={`row-span-3 grid grid-rows-subgrid justify-items-center text-center min-w-0 ${align}`}>
      <h2
        className="font-display font-black uppercase leading-[.9] tracking-tight text-[17px] sm:text-[28px] xl:text-[34px]"
        style={{ color: accent, textShadow: `0 0 30px ${accent}55` }}
      >
        {isP ? 'Spieler' : 'Torwart'} des
        <br />
        Spieltages
      </h2>
      <div className="mt-3 sm:mt-4 min-w-0 max-w-full">
      <Tap onClick={open}>
        <div className="font-display font-extrabold uppercase leading-[.95] text-white text-base sm:text-2xl xl:text-[26px] break-words">
          {first && (
            <>
              {first}
              <br />
            </>
          )}
          {last}
        </div>
      </Tap>
      {(data.team?.name || data.club) && (
        <div className="mt-1 font-sans font-bold uppercase tracking-[1.5px] text-[10px] sm:text-xs text-white/55 truncate max-w-full">{data.team?.name || data.club}</div>
      )}
      </div>
      <div className="mt-4 sm:mt-5 flex flex-col lg:flex-row items-center lg:items-end gap-4 sm:gap-8">
        {side === 'left' ? (
          <>
            {statsEl}
            {cardEl}
          </>
        ) : (
          <>
            {cardEl}
            {statsEl}
          </>
        )}
        {stats.length > 0 && (
          <div className="lg:hidden inline-flex items-center gap-1.5 rounded-full px-3 py-1 border" style={{ borderColor: `${accent}66`, background: `${accent}14` }}>
            <span className="font-display font-black text-white text-base tabular-nums">{stats[0].value}</span>
            <span className="font-sans font-bold uppercase tracking-[1px] text-[9px] text-white/60">{view.note !== null ? 'Note' : stats[0].label}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// Leerer Platz (noch niemand gekürt): nur Überschrift + Wartekarte – links wie rechts gleich.
function PlaceholderSide({ role, side }: { role: StatRole; side: 'left' | 'right' }) {
  const accent = role === 'field' ? TEAL : GOLD;
  return (
    <div className={`row-span-3 grid grid-rows-subgrid justify-items-center text-center min-w-0 ${side === 'left' ? 'lg:justify-items-end lg:text-right' : 'lg:justify-items-start lg:text-left'}`}>
      <h2
        className="font-display font-black uppercase leading-[.9] tracking-tight text-[17px] sm:text-[28px] xl:text-[34px]"
        style={{ color: accent, textShadow: `0 0 30px ${accent}55` }}
      >
        {role === 'field' ? 'Spieler' : 'Torwart'} des
        <br />
        Spieltages
      </h2>
      {/* leere Namenszeile – hält die Karte auf einer Höhe mit der Gegenseite */}
      <div aria-hidden="true" />
      <div className="mt-4 sm:mt-5 shrink-0 w-[150px] sm:w-[220px] xl:w-[240px]">
        <FifaCard card={pendingCard(role)} name="" pending mark="" label={role === 'field' ? 'Spieler' : 'Torwart'} />
      </div>
    </div>
  );
}

export default function AwardsSlide(props: Props) {
  const { pom, teams, sponsor, buttons } = props;
  const pTeam = findTeam(teams, pom.teamId, pom.club);
  const player: SideData = { role: 'field', name: pom.name, teamId: pTeam?.id || pom.teamId || '', club: pom.club, team: pTeam, image: pom.image };
  const keeper: SideData | null = hasName(pom.keeper?.name)
    ? (() => {
        const kTeam = findTeam(teams, pom.keeper!.teamId, pom.keeper!.club);
        return { role: 'keeper' as const, name: pom.keeper!.name, teamId: kTeam?.id || pom.keeper!.teamId || '', club: pom.keeper!.club, team: kTeam, image: pom.keeper!.image };
      })()
    : null;

  return (
    <div className="relative w-full max-w-[1320px] mx-auto px-4 sm:px-10 pt-8 pb-24 sm:pt-8 sm:pb-24">
      {/* Kopf: „präsentiert von" + Sponsor-Logo (klickbar) untereinander */}
      {sponsor && (sponsor.logoUrl || sponsor.name) && (
        <div className="flex flex-col items-center text-center gap-2.5 sm:gap-3">
          <span className="font-sans font-bold text-[10px] sm:text-xs tracking-[3px] uppercase text-white/70">präsentiert von</span>
          <SponsorLink
            sponsorId={sponsor.id}
            sponsorName={sponsor.name}
            placement="spieler-des-spieltages"
            href={sponsor.linkUrl}
            title={sponsor.name}
            className="inline-flex items-center rounded-2xl bg-white px-4 py-2.5 sm:px-5 sm:py-3 shadow-[0_14px_40px_-14px_rgba(0,0,0,.8)] transition-transform duration-200 hover:scale-[1.03]"
          >
            {sponsor.logoUrl ? (
              <img src={sponsor.logoUrl} alt={sponsor.name || 'Sponsor'} loading="lazy" decoding="async" referrerPolicy="no-referrer" className="h-8 sm:h-11 w-auto max-w-[260px] object-contain" />
            ) : (
              <span className="font-display font-black text-lg text-[#0b1718]">{sponsor.name}</span>
            )}
          </SponsorLink>
        </div>
      )}

      {/* Die beiden Auszeichnungen – spiegelsymmetrisch zur Mittellinie */}
      <div className="relative mt-8 sm:mt-10 grid grid-cols-2 grid-rows-[auto_auto_auto] gap-x-3 sm:gap-x-10 lg:gap-x-14 items-start">
        <div className="hidden lg:block absolute left-1/2 -translate-x-1/2 top-4 bottom-4 w-px bg-gradient-to-b from-transparent via-white/15 to-transparent" />
        {hasName(player.name) ? <AwardSide side="left" data={player} pom={pom} props={props} /> : <PlaceholderSide role="field" side="left" />}
        {keeper ? <AwardSide side="right" data={keeper} pom={pom} props={props} /> : <PlaceholderSide role="keeper" side="right" />}
      </div>

      {buttons && <div className="mt-8 sm:mt-9 flex gap-3 justify-center flex-wrap">{buttons}</div>}
    </div>
  );
}
