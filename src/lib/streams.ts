import type { StreamsConfig } from '../types';
import { apiFetch } from './api';

// Konfiguration der beiden Testspieltag-Streams (Feld 1 / Feld 2) lesen/speichern.
export const fetchStreams = () => apiFetch<StreamsConfig>('/api/twitch?resource=streams');

export const saveStreams = (cfg: StreamsConfig) =>
  apiFetch<StreamsConfig>('/api/twitch?resource=streams', {
    method: 'POST',
    body: JSON.stringify(cfg),
  });

// Dasselbe für die echte Liga (eigene Kanäle, unabhängig vom Testspieltag).
export const fetchLeagueStreams = () => apiFetch<StreamsConfig>('/api/twitch?resource=leagueStreams');

export const saveLeagueStreams = (cfg: StreamsConfig) =>
  apiFetch<StreamsConfig>('/api/twitch?resource=leagueStreams', {
    method: 'POST',
    body: JSON.stringify(cfg),
  });

// Twitch-Player-Einbettung. `parent` muss der Host der einbettenden Seite sein –
// wir nehmen ihn dynamisch aus window.location, damit es auf hero-league.de,
// dev.hero-league.de und localhost gleichermaßen funktioniert.
export function twitchPlayerSrc(channel: string, opts?: { muted?: boolean; autoplay?: boolean }): string {
  const host = typeof window !== 'undefined' ? window.location.hostname : 'hero-league.de';
  const p = new URLSearchParams({
    channel,
    parent: host,
    autoplay: String(opts?.autoplay ?? true),
    muted: String(opts?.muted ?? true),
  });
  return `https://player.twitch.tv/?${p.toString()}`;
}

export const twitchChannelUrl = (channel: string) => `https://twitch.tv/${encodeURIComponent(channel)}`;
