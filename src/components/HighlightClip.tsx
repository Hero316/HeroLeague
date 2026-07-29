import { useEffect, useRef, useState } from 'react';
import { Play } from 'lucide-react';
import type { VideoEmbed } from '../lib/videoEmbed';

// Bindet die YouTube-IFrame-API genau einmal ein und liefert das globale YT-Objekt.
declare global {
  interface Window {
    YT?: any;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let ytApiPromise: Promise<any> | null = null;
function loadYouTubeApi(): Promise<any> {
  if (typeof window === 'undefined') return Promise.reject();
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (ytApiPromise) return ytApiPromise;

  ytApiPromise = new Promise((resolve) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      resolve(window.YT);
    };
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(tag);
  });
  return ytApiPromise;
}

// Highlight-Clip. Für YouTube via IFrame-API (unterdrückt End-Vorschläge).
// `autoplay` startet das Video automatisch (z. B. im Story-Player), `onEnded`
// meldet das Video-Ende (dann kein „Erneut abspielen“-Overlay, sondern der
// Aufrufer entscheidet – z. B. weiterspringen). Twitch fällt aufs iframe zurück.
export default function HighlightClip({
  embed,
  autoplay = false,
  onEnded,
}: {
  embed: VideoEmbed;
  autoplay?: boolean;
  onEnded?: () => void;
}) {
  const holderRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<any>(null);
  const onEndedRef = useRef(onEnded);
  onEndedRef.current = onEnded;
  const [ended, setEnded] = useState(false);

  const isApiClip = embed.provider === 'youtube' && !!embed.youtubeId;

  useEffect(() => {
    if (!isApiClip) return;
    let cancelled = false;

    loadYouTubeApi()
      .then((YT) => {
        if (cancelled || !holderRef.current) return;
        const mount = document.createElement('div');
        holderRef.current.appendChild(mount);
        playerRef.current = new YT.Player(mount, {
          width: '100%',
          height: '100%',
          videoId: embed.youtubeId,
          host: 'https://www.youtube-nocookie.com',
          playerVars: { rel: 0, modestbranding: 1, playsinline: 1, autoplay: autoplay ? 1 : 0 },
          events: {
            onStateChange: (e: any) => {
              if (e.data === YT.PlayerState.ENDED) {
                if (onEndedRef.current) {
                  onEndedRef.current();
                  return;
                }
                setEnded(true);
                try {
                  playerRef.current?.pauseVideo();
                  playerRef.current?.seekTo(0, true);
                  playerRef.current?.pauseVideo();
                } catch {
                  /* egal – Overlay deckt ab */
                }
              } else if (e.data === YT.PlayerState.PLAYING) {
                setEnded(false);
              }
            },
          },
        });
      })
      .catch(() => {
        /* API nicht ladbar – iframe-Fallback greift unten */
      });

    return () => {
      cancelled = true;
      try {
        playerRef.current?.destroy();
      } catch {
        /* schon abgeräumt */
      }
      playerRef.current = null;
    };
  }, [isApiClip, embed.youtubeId, autoplay]);

  const replay = () => {
    setEnded(false);
    try {
      playerRef.current?.seekTo(0, true);
      playerRef.current?.playVideo();
    } catch {
      /* egal */
    }
  };

  if (isApiClip) {
    return (
      <div className="absolute inset-0">
        <div
          ref={holderRef}
          className="absolute inset-0 [&>div]:absolute [&>div]:inset-0 [&>iframe]:absolute [&>iframe]:inset-0 [&>iframe]:h-full [&>iframe]:w-full"
        />
        {ended && (
          <button
            type="button"
            onClick={replay}
            className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-brand-dark/85 backdrop-blur-sm cursor-pointer group"
          >
            <span className="grid place-items-center w-16 h-16 rounded-full bg-brand-accent-light text-brand-dark shadow-[0_0_30px_rgba(34,223,201,.5)] transition-transform group-hover:scale-110">
              <Play className="w-7 h-7 translate-x-0.5" fill="currentColor" />
            </span>
            <span className="font-sans font-bold text-sm text-white uppercase tracking-wider">Erneut abspielen</span>
          </button>
        )}
      </div>
    );
  }

  // Twitch / Fallback: einfaches iframe
  const src = autoplay ? embed.src.replace('autoplay=false', 'autoplay=true') : embed.src;
  return (
    <iframe
      src={src}
      title="Highlight-Clip"
      className="absolute inset-0 h-full w-full"
      loading="lazy"
      allow="autoplay; fullscreen; picture-in-picture"
      allowFullScreen
    />
  );
}
