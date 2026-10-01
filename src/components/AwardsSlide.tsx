import type { ReactNode } from 'react';
import type { MatchPlayerStat, Partner, PlayerOfMonth, ScoringConfig, StatRole, Team } from '../types';
import { awardView, fmtNote } from '../lib/awards';
import FifaCard from './FifaCard';
import { SponsorLink } from './ui';

// ===========================================================================
// Startseiten-Folie „Auszeichnungen des Spieltages": links der Spieler, rechts
// der Torwart des Spieltages – spiegelsymmetrisch: die FIFA-Karten stehen
// innen an der Mittellinie, die Spieltagswerte außen, Überschrift und Name sind
// zur Mitte ausgerichtet. Oben groß „präsentiert von" mit dem Sponsor-Logo.
// Am Handy stehen die beiden Karten kleiner nebeneinander, darunter die Note.
// Karte = Saison-FIFA-Karte aus dem Tracking; Werte = dieser Spieltag.
// Ohne Tracking-Daten fällt der Spieler auf die bisherige Foto-Karte zurück.
// Fehlt der Torwart, steht rechts eine Musterkarte „Hier könntest du stehen".
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
  team?: Team;
  image?: string;
}

function findTeam(teams: Team[], teamId?: string, club?: string): Team | undefined {
  return (teamId ? teams.find((t) => t.id === teamId) : undefined) || (club ? teams.find((t) => t.name === club) : undefined);
}

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
    scoring && seasonId && data.team
      ? awardView(trackingRows, seasonId, scoring, data.team.id, data.name, data.role, pom.matchday)
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
  else if (isP && !view.card) {
    // Ohne Tracking: Tore/Vorlagen aus dem Backend.
    stats.push({ value: String(pom.goals ?? 0), label: 'Tore' }, { value: String(pom.assists ?? 0), label: 'Vorlagen' });
  }

  // Ausrichtung zur Mitte: links rechtsbündig, rechts linksbündig (nur PC).
  const align = side === 'left' ? 'lg:items-end lg:text-right' : 'lg:items-start lg:text-left';

  const cardEl = (
    <button
      type="button"
      onClick={open}
      disabled={!open}
      aria-label={`${data.name} – Spielerseite öffnen`}
      className={`shrink-0 w-[150px] sm:w-[220px] xl:w-[240px] ${open ? 'cursor-pointer transition-transform duration-200 hover:-translate-y-1' : 'cursor-default'}`}
    >
      {view.card ? (
        <FifaCard card={view.card} name={data.name} imageUrl={image} team={data.team} />
      ) : (
        // Ohne Tracking: schlichte Foto-Kachel im Karten-Format (Teal/Gold).
        <div className="relative rounded-3xl overflow-hidden border-[1.5px]" style={{ aspectRatio: '0.7', borderColor: accent, background: `linear-gradient(165deg, ${accent}cc, ${accent}33 50%, #050607)` }}>
          {image ? (
            <img src={image} alt={data.name} className="absolute inset-0 w-full h-full object-cover" style={{ objectPosition: 'center 15%' }} />
          ) : (
            <span className="absolute inset-0 grid place-items-center font-display font-black text-7xl text-white/20">{last.charAt(0)}</span>
          )}
        </div>
      )}
    </button>
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
    <div className={`flex flex-col items-center text-center min-w-0 ${align}`}>
      <h2
        className="font-display font-black uppercase leading-[.9] tracking-tight text-[17px] sm:text-[28px] xl:text-[34px]"
        style={{ color: accent, textShadow: `0 0 30px ${accent}55` }}
      >
        {isP ? 'Spieler' : 'Torwart'} des
        <br />
        Spieltages
      </h2>
      <button type="button" onClick={open} disabled={!open} className={`mt-3 sm:mt-4 ${open ? 'cursor-pointer' : 'cursor-default'}`}>
        <div className="font-display font-extrabold uppercase leading-[.95] text-white text-base sm:text-2xl xl:text-[26px] break-words">
          {first && (
            <>
              {first}
              <br />
            </>
          )}
          {last}
        </div>
      </button>
      {data.team && <div className="mt-1 font-sans font-bold uppercase tracking-[1.5px] text-[10px] sm:text-xs text-white/55 truncate max-w-full">{data.team.name}</div>}
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

// Musterkarte, solange (noch) kein Torwart gekürt ist – hält die Folie symmetrisch.
function PlaceholderSide({ role }: { role: StatRole }) {
  const accent = role === 'field' ? TEAL : GOLD;
  return (
    <div className="flex flex-col items-center text-center min-w-0 lg:items-start lg:text-left">
      <h2
        className="font-display font-black uppercase leading-[.9] tracking-tight text-[17px] sm:text-[28px] xl:text-[34px]"
        style={{ color: accent, textShadow: `0 0 30px ${accent}55` }}
      >
        {role === 'field' ? 'Spieler' : 'Torwart'} des
        <br />
        Spieltages
      </h2>
      <div className="mt-3 sm:mt-4 font-display font-extrabold uppercase leading-[.95] text-white/80 text-base sm:text-2xl xl:text-[26px]">
        Hier könntest
        <br />
        du stehen
      </div>
      <div className="mt-1 font-sans font-bold uppercase tracking-[1.5px] text-[10px] sm:text-xs text-white/45">Wird noch gekürt</div>
      <div className="mt-4 sm:mt-5 shrink-0 w-[150px] sm:w-[220px] xl:w-[240px]">
        <div
          className="relative rounded-3xl overflow-hidden border-[1.5px] border-dashed grid place-items-center"
          style={{ aspectRatio: '0.7', borderColor: `${accent}88`, background: `linear-gradient(165deg, ${accent}22, #050607 70%)` }}
        >
          <svg viewBox="0 0 100 120" className="w-[55%] opacity-25" aria-hidden="true">
            <circle cx="50" cy="34" r="22" fill={accent} />
            <path d="M8 120c0-26 19-44 42-44s42 18 42 44z" fill={accent} />
          </svg>
          <span className="absolute bottom-[12%] font-display font-black text-5xl sm:text-7xl" style={{ color: `${accent}aa` }}>?</span>
        </div>
      </div>
    </div>
  );
}

export default function AwardsSlide(props: Props) {
  const { pom, teams, sponsor, buttons } = props;
  const player: SideData = { role: 'field', name: pom.name, team: findTeam(teams, pom.teamId, pom.club), image: pom.image };
  const keeper: SideData | null = pom.keeper?.name
    ? { role: 'keeper', name: pom.keeper.name, team: findTeam(teams, pom.keeper.teamId, pom.keeper.club), image: pom.keeper.image }
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
      <div className="relative mt-8 sm:mt-10 grid grid-cols-2 gap-3 sm:gap-10 lg:gap-14 items-start">
        <div className="hidden lg:block absolute left-1/2 -translate-x-1/2 top-4 bottom-4 w-px bg-gradient-to-b from-transparent via-white/15 to-transparent" />
        <AwardSide side="left" data={player} pom={pom} props={props} />
        {keeper ? <AwardSide side="right" data={keeper} pom={pom} props={props} /> : <PlaceholderSide role="keeper" />}
      </div>

      {buttons && <div className="mt-8 sm:mt-9 flex gap-3 justify-center flex-wrap">{buttons}</div>}
    </div>
  );
}
