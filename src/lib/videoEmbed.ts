// Wandelt einen eingefügten Video-Link (YouTube, YouTube Shorts, Twitch) in eine
// einbettbare iframe-Quelle um – inklusive Seitenverhältnis, damit ein Short
// hochkant (9:16) und ein normales Video im Querformat (16:9) dargestellt wird.
//
// YouTube wird über youtube-nocookie eingebettet und so aufgeräumt wie möglich
// (rel=0, modestbranding). Werbung lässt sich per Embed nicht abschalten – das
// entfällt hier, weil die Clips als nicht gelistete, nicht monetarisierte Videos
// hochgeladen werden.

export type EmbedAspect = 'landscape' | 'portrait';

export interface VideoEmbed {
  src: string;
  aspect: EmbedAspect;
  provider: 'youtube' | 'twitch';
  youtubeId?: string; // für die IFrame-API (End-Vorschläge unterdrücken)
}

// Twitch verlangt einen parent-Parameter mit der aktuellen Domain.
function twitchParent(): string {
  if (typeof window !== 'undefined' && window.location?.hostname) return window.location.hostname;
  return 'localhost';
}

const YT_PARAMS = 'rel=0&modestbranding=1&playsinline=1';

function youtubeEmbed(id: string, aspect: EmbedAspect): VideoEmbed {
  return { src: `https://www.youtube-nocookie.com/embed/${id}?${YT_PARAMS}`, aspect, provider: 'youtube', youtubeId: id };
}

// Erkennt YouTube-Video-IDs aus den gängigen Link-Formen.
function parseYouTube(url: URL): VideoEmbed | null {
  const host = url.hostname.replace(/^www\./, '');

  if (host === 'youtu.be') {
    const id = url.pathname.split('/').filter(Boolean)[0];
    return id ? youtubeEmbed(id, 'landscape') : null;
  }

  if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'youtube-nocookie.com') {
    // Shorts sind hochkant (9:16)
    const shorts = url.pathname.match(/^\/shorts\/([^/?#]+)/);
    if (shorts) return youtubeEmbed(shorts[1], 'portrait');

    // Bereits eine Embed-URL
    const embed = url.pathname.match(/^\/embed\/([^/?#]+)/);
    if (embed) return youtubeEmbed(embed[1], 'landscape');

    // Klassischer Watch-Link
    const v = url.searchParams.get('v');
    if (v) return youtubeEmbed(v, 'landscape');
  }

  return null;
}

// Erkennt Twitch-VODs, Clips und Kanäle.
function parseTwitch(url: URL): VideoEmbed | null {
  const host = url.hostname.replace(/^www\./, '');
  const parent = twitchParent();
  const segments = url.pathname.split('/').filter(Boolean);

  // clips.twitch.tv/<slug>
  if (host === 'clips.twitch.tv' && segments[0]) {
    return { src: `https://clips.twitch.tv/embed?clip=${segments[0]}&parent=${parent}`, aspect: 'landscape', provider: 'twitch' };
  }

  if (host === 'twitch.tv' || host === 'player.twitch.tv') {
    // twitch.tv/<kanal>/clip/<slug>
    const clipIdx = segments.indexOf('clip');
    if (clipIdx >= 0 && segments[clipIdx + 1]) {
      return { src: `https://clips.twitch.tv/embed?clip=${segments[clipIdx + 1]}&parent=${parent}`, aspect: 'landscape', provider: 'twitch' };
    }
    // twitch.tv/videos/<id>
    if (segments[0] === 'videos' && segments[1]) {
      return { src: `https://player.twitch.tv/?video=${segments[1]}&parent=${parent}&autoplay=false`, aspect: 'landscape', provider: 'twitch' };
    }
    // twitch.tv/<kanal>
    if (segments[0]) {
      return { src: `https://player.twitch.tv/?channel=${segments[0]}&parent=${parent}&autoplay=false`, aspect: 'landscape', provider: 'twitch' };
    }
  }

  return null;
}

// Öffentliche Funktion: Link -> einbettbare Quelle (oder null bei unbekanntem Format).
export function toEmbed(rawUrl: string | null | undefined): VideoEmbed | null {
  if (!rawUrl) return null;
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;

  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
  } catch {
    return null;
  }

  return parseYouTube(url) ?? parseTwitch(url);
}
