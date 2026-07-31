import React, { useMemo } from 'react';
import { Match, NewsItem, PlayerStat, Team } from '../types';
import { shortDate } from './ui';

interface LiveTickerProps {
  matches: Match[];
  teams: Team[];
  players: PlayerStat[];
  news?: NewsItem[];
}

// Ein Eintrag im Laufband: News werden hervorgehoben (accent + fett) dargestellt,
// automatische Einträge (Ergebnisse, Anstöße, Top-Torschütze) dezent.
type TickerItem = { text: string; news?: boolean };

// Laufband unter der Navigation: zuerst die frei im Admin gepflegten News
// (hervorgehoben), danach echte Ergebnisse, Anstöße und der Top-Torschütze.
export default function LiveTicker({ matches, teams, players, news = [] }: LiveTickerProps) {
  const items = useMemo(() => {
    const short = (id: string) => teams.find((t) => t.id === id)?.shortName?.toUpperCase() || '???';
    const list: TickerItem[] = [];

    // Freie News zuerst (im Admin gepflegt) – hervorgehoben mit Lautsprecher-Zeichen
    news.forEach((n) => {
      const text = n.text.trim();
      if (text) list.push({ text: `📣 ${text}`, news: true });
    });

    // Live-Spiele
    matches
      .filter((m) => m.status === 'live')
      .forEach((m) => list.push({ text: `${short(m.homeTeamId)} ${m.homeScore ?? 0}–${m.awayScore ?? 0} ${short(m.awayTeamId)} · LIVE` }));

    // Nächste Anstöße
    matches
      .filter((m) => m.status === 'geplant')
      .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`))
      .slice(0, 4)
      .forEach((m) => list.push({ text: `${short(m.homeTeamId)} vs ${short(m.awayTeamId)} · ${shortDate(m.date)} ${m.time}` }));

    // Letzte Ergebnisse
    matches
      .filter((m) => m.status === 'beendet' && m.homeScore !== null)
      .sort((a, b) => `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`))
      .slice(0, 4)
      .forEach((m) => list.push({ text: `${short(m.homeTeamId)} ${m.homeScore}–${m.awayScore} ${short(m.awayTeamId)} · BEENDET` }));

    // Top-Torschütze
    const top = [...players].filter((p) => p.goals > 0).sort((a, b) => b.goals - a.goals)[0];
    if (top) {
      const initial = top.name.trim().charAt(0).toUpperCase();
      const last = top.name.trim().split(/\s+/).slice(-1)[0]?.toUpperCase() || '';
      list.push({ text: `${initial}. ${last} · ${top.goals} TORE · TOP-TORSCHÜTZE` });
    }

    return list;
  }, [matches, teams, players, news]);

  if (items.length === 0) return null;

  const hasLive = matches.some((m) => m.status === 'live');
  const hasNews = news.some((n) => n.text.trim());

  // Eine Durchlauf-Sequenz (zweimal gerendert für das nahtlose Endlos-Band).
  const sequence = (copy: string) => (
    <span className="flex-none flex items-center pl-6" aria-hidden={copy === 'b'}>
      {items.map((it, i) => (
        <React.Fragment key={`${copy}-${i}`}>
          <span
            className={`font-sans text-[12.5px] tracking-[.4px] ${
              it.news ? 'font-extrabold text-brand-accent-light' : 'font-semibold text-hl-mute'
            }`}
          >
            {it.text}
          </span>
          <span className="px-4 text-hl-faint" aria-hidden="true">✦</span>
        </React.Fragment>
      ))}
    </span>
  );

  return (
    <div className="border-b border-white/[.06] bg-white/[.015] overflow-hidden">
      <div className="flex items-center h-[42px]">
        <div className="flex-none flex items-center gap-2 px-4 sm:pl-10 sm:pr-5 h-full bg-[#0b0f0b] relative z-[2] border-r border-white/[.06]">
          <span className={`w-[7px] h-[7px] rounded-full ${hasLive ? 'bg-hl-red hl-pulse' : 'bg-brand-accent-light'}`} />
          <span className="font-sans font-extrabold text-[11px] tracking-[2px] text-hl-text whitespace-nowrap">
            {hasLive ? 'LIVE-TICKER' : hasNews ? 'NEWS' : 'TICKER'}
          </span>
        </div>
        <div className="flex-1 overflow-hidden relative [mask-image:linear-gradient(90deg,transparent,#000_4%,#000_96%,transparent)]">
          <div className="flex whitespace-nowrap hl-marquee">
            {sequence('a')}
            {sequence('b')}
          </div>
        </div>
      </div>
    </div>
  );
}
