'use client';

import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, RefreshCw, Server, PlayCircle, Video as VideoIcon, Film, Tv, Play, Lightbulb, LightbulbOff, Rows2, Maximize } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from './AuthProvider';
import { supabase } from '@/lib/supabase';
import { upsertNowWatching, clearNowWatching, HEARTBEAT_MS } from '@/lib/presence';
import { getDesktopPlayer } from '@/lib/desktopPlayer';
import Image from 'next/image';

interface VideoPlayerProps {
  type: 'movie' | 'tv';
  id: string | number;
  imdbId?: string;
  season?: number;
  episode?: number;
  title?: string;
  posterPath?: string;
  videos?: any[];
  /** Rendered in the toolbar where the mode toggle used to be. */
  controls?: React.ReactNode;
  onProgress?: (position: { watched: number; duration: number }) => void;
  /**
   * Start on a specific provider by name. Watch rooms use this to prefer
   * videasy, the only provider that reports playback progress.
   */
  preferredProvider?: string;
}

interface Provider {
  name: string;
  url: string;
  type: 'tmdb' | 'imdb';
  /**
   * Origins whose postMessage traffic we accept for this provider.
   *
   * Normally just the origin of `url`, but a provider that redirects
   * serves its player — and therefore posts its messages — from the
   * host it lands on, not the one we requested. Stays a strict
   * allowlist; never widen this to a wildcard, since any page on the
   * internet can postMessage this window.
   */
  origins?: string[];
  /**
   * For players whose URLs don't follow `${url}/movie/${id}` and
   * `${url}/tv/${id}/${season}/${episode}`.
   */
  embed?: (kind: 'movie' | 'tv', id: string | number, season: number, episode: number) => string;
}

// Status as of 2026-10-22, checked by pressing play on a movie, a TV
// episode, an anime series and an anime film in each:
//   vidsrc.me  — streams all four (HLS).
//   vidcore    — streams all four (HLS).
//   2embed     — streams all four (HLS); tries to open two pop-ups per load.
//   videasy    — loads, then "We couldn't find that" for all four.
//   vidlink    — "Couldn't find this content" for three of the four.
// Not added: SuperEmbed (multiembed.mov) — full-page casino/shopping ads
// before every video, and movies stalled on "loading server".
// vidsrc.sbs was dropped: its registrar put the domain on clientHold, so it
// no longer resolves anywhere.
const PROVIDERS: Provider[] = [
  // Default: the most reliable in testing. (Progress, watch-party sync and
  // episode auto-marking work on every server — the player bridge reads the
  // <video> itself.)
  //
  // Currently 302-redirects to vidsrc.sh. Kept on .me so the redirect can
  // follow wherever the mirror moves next.
  { name: 'vidsrc.me', url: 'https://vidsrc.me/embed', type: 'tmdb' },
  { name: 'vidcore', url: 'https://vidcore.org/embed', type: 'tmdb' },
  {
    name: '2embed',
    url: 'https://www.2embed.cc',
    type: 'tmdb',
    // Its TV path takes season and episode as `&s=…&e=…` with no `?`.
    embed: (kind, id, season, episode) =>
      kind === 'movie'
        ? `https://www.2embed.cc/embed/${id}`
        : `https://www.2embed.cc/embedtv/${id}&s=${season}&e=${episode}`,
  },
  // Also broadcasts its own progress (MEDIA_DATA over postMessage), which
  // the player listens for too.
  //
  // .net 301-redirects to .to. Pointing straight at .to avoids the hop,
  // and both are listed below because the redirect means either host can
  // end up being the one that posts progress.
  {
    name: 'videasy',
    url: 'https://player.videasy.to',
    type: 'tmdb',
    origins: ['https://player.videasy.to', 'https://player.videasy.net'],
  },
  // Reports no progress.
  { name: 'vidlink', url: 'https://vidlink.pro', type: 'tmdb' },
];

// The "brainrot" split-screen easter egg — looping background footage under
// the real stream, TikTok-reel style. One is picked at random each time the
// mode is turned on. Muted so it doesn't fight the movie's audio; loop needs
// playlist=<same id> since YouTube ignores loop=1 alone for a single video.
const GENZ_VIDEO_IDS = [
  'Moi2b5mLlk8',
  'UzPvJKDrcGg',
  'gICE0rPEeAw',
  '3XK1JWJI_xI',
  '46IpbQ_0FUw',
  'uIH1P2X9VY0',
];

function getGenZEmbedUrl() {
  const id = GENZ_VIDEO_IDS[Math.floor(Math.random() * GENZ_VIDEO_IDS.length)];
  return `https://www.youtube.com/embed/${id}?autoplay=1&mute=1&loop=1&playlist=${id}&controls=0&modestbranding=1&rel=0`;
}

const VideoPlayer = ({ 
  type, 
  id, 
  imdbId, 
  season = 1, 
  episode = 1, 
  title, 
  posterPath,
  videos = [],
  controls,
  onProgress,
  preferredProvider
}: VideoPlayerProps) => {
  const { user } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [activeProvider, setActiveProvider] = useState(
    () => PROVIDERS.find((p) => p.name === preferredProvider) ?? PROVIDERS[0]
  );

  const [lightsOff, setLightsOff] = useState(false);
  // Invariant maintained by every setter that touches these: genZMode true
  // always implies lightsOff true, since the split layout only makes sense
  // inside the centered theater box.
  const [genZMode, setGenZMode] = useState(false);
  // Picked once per activation, not recomputed on every render — otherwise
  // any unrelated re-render (e.g. a progress tick) would reroll the iframe
  // src and restart the clip.
  const [genZEmbedUrl, setGenZEmbedUrl] = useState('');
  const [mounted, setMounted] = useState(false);
  const playerRef = useRef<HTMLDivElement>(null);
  const slotRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => setMounted(true), []);

  // Escape exits lights-off (and Gen Z) mode from anywhere on the page.
  useEffect(() => {
    if (!lightsOff) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setLightsOff(false);
        setGenZMode(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [lightsOff]);

  useEffect(() => {
    if (!lightsOff) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [lightsOff]);

  // The player always lives in a portal on <body>, never inside the page's
  // nested stacking contexts, so theater mode is a plain z-index change rather
  // than a fight with ancestor z-indexes. It stays portaled in normal mode too:
  // moving an iframe between parents reloads it and restarts the stream.
  // `slot` below reserves the layout space and this tracks its geometry, in
  // document coordinates so normal scrolling moves the player with the page.
  const [box, setBox] = useState({ top: 0, left: 0, width: 0, height: 0 });
  useEffect(() => {
    const el = slotRef.current;
    if (!el) return;
    const update = () => {
      const r = el.getBoundingClientRect();
      setBox({
        top: r.top + window.scrollY,
        left: r.left + window.scrollX,
        width: r.width,
        height: r.height,
      });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    observer.observe(document.body); // content above the player shifting it down
    window.addEventListener('resize', update);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', update);
    };
  }, [mounted]);

  // Theater-mode centering, computed in pixels rather than the usual
  // `top/left: 50%` + `transform: translate(-50%, -50%)` trick. Chromium has
  // a long-standing bug where a CSS transform on any ancestor OUTSIDE a
  // cross-origin iframe silently breaks that iframe's own internal
  // requestFullscreen() calls — so the provider's native fullscreen button
  // stopped working while our own (which fullscreens the transformed element
  // itself) kept working. No transform anywhere in the ancestor chain avoids it.
  const [theaterBox, setTheaterBox] = useState({ top: 0, left: 0, width: 0, height: 0 });
  useEffect(() => {
    if (!lightsOff) return;
    const update = () => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      let width: number;
      let height: number;
      if (genZMode) {
        width = vw * 0.96;
        height = vh * 0.94;
      } else {
        width = Math.min(vw * 0.95, vh * 0.88 * (16 / 9));
        height = width * (9 / 16);
      }
      setTheaterBox({ width, height, left: (vw - width) / 2, top: (vh - height) / 2 });
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [lightsOff, genZMode]);
  
  // Find primary trailer
  const primaryTrailer = videos.find((v: any) => v.type === 'Trailer' && v.site === 'YouTube') || videos[0];
  const [currentTrailerKey, setCurrentTrailerKey] = useState<string | null>(primaryTrailer?.key || null);

  // Record History
  useEffect(() => {
    if (!user) return;

    const recordHistory = async () => {
      try {
        await supabase.from('watch_history').upsert({
          user_id: user.id,
          movie_id: String(id),
          type: type,
          title: title,
          poster_path: posterPath,
          season: type === 'tv' ? season : null,
          episode: type === 'tv' ? episode : null,
          watched_at: new Date().toISOString(),
        }, { onConflict: 'user_id, movie_id' });
      } catch (err) {
        console.error('History record error:', err);
      }
    };

    const timer = setTimeout(recordHistory, 10000);
    return () => clearTimeout(timer);
  }, [user, id, type, season, episode, posterPath, title]);

  // Live presence heartbeat, so friends can see what you're watching.
  //
  // Keyed to "this player is open in video mode" rather than actual
  // play/pause: only one provider reports any playback signal at all (see
  // the MEDIA_DATA note below), so genuine play state isn't knowable for
  // the rest. The row carries updated_at and readers apply a staleness
  // cutoff, which is what stops an abandoned tab showing you as watching
  // forever.
  useEffect(() => {
    if (!user || !title) return;

    const beat = () =>
      upsertNowWatching({
        mediaType: type,
        mediaId: id,
        title,
        posterPath,
        season: type === 'tv' ? season : null,
        episode: type === 'tv' ? episode : null,
      }).catch(() => {
        // Presence is best-effort; never let it disrupt playback.
      });

    beat();
    const interval = setInterval(beat, HEARTBEAT_MS);

    return () => {
      clearInterval(interval);
      clearNowWatching().catch(() => {});
    };
  }, [user, id, type, season, episode, posterPath, title]);

  // Videasy broadcasts its watch history to the parent once a second. It's
  // send-only (there's no inbound command channel), but it's enough to track
  // real playback position instead of guessing from elapsed wall time.
  // Providers that don't post anything simply never fire this.
  useEffect(() => {
    if (!onProgress) return;
    let allowedOrigins: string[];
    try {
      allowedOrigins = activeProvider.origins ?? [new URL(activeProvider.url).origin];
    } catch {
      return;
    }

    const handler = (event: MessageEvent) => {
      // Any page can postMessage us; only trust the embed we actually loaded.
      if (!allowedOrigins.includes(event.origin)) return;

      let envelope: any;
      try {
        envelope = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
      } catch {
        return;
      }
      if (!envelope || envelope.type !== 'MEDIA_DATA') return;

      let history: any;
      try {
        history = typeof envelope.data === 'string' ? JSON.parse(envelope.data) : envelope.data;
      } catch {
        return;
      }
      if (!history || typeof history !== 'object') return;

      // Entries are keyed by an internal id, so match on the TMDB id they carry.
      const entry = Object.values<any>(history).find(
        (e) => e && String(e.id) === String(id)
      );
      if (!entry) return;

      const position =
        type === 'tv'
          ? entry.show_progress?.[`s${season}e${episode}`]?.progress
          : entry.progress;

      if (position && Number(position.duration) > 0) {
        onProgress({
          watched: Number(position.watched) || 0,
          duration: Number(position.duration),
        });
      }
    };

    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [onProgress, activeProvider, id, type, season, episode]);

  // The player bridge reads the stream's own <video>, so progress is real on
  // every server, not just videasy.
  useEffect(() => {
    const player = getDesktopPlayer();
    if (!player || !onProgress) return;
    return player.onState((state) => {
      if (state && state.duration > 0 && Number.isFinite(state.duration)) {
        onProgress({ watched: state.time, duration: state.duration });
      }
    });
  }, [onProgress]);

  // If a provider fails to load (dead domain, blocked request), the iframe's
  // onLoad never fires — clear the spinner so the user can switch servers.
  useEffect(() => {
    if (!isLoading) return;
    const timer = setTimeout(() => setIsLoading(false), 15000);
    return () => clearTimeout(timer);
  }, [isLoading, activeProvider, season, episode]);

  const getEmbedUrl = () => {
    // Check if we have an active YouTube selection
    if (activeProvider.name === 'YT_EMBED' && currentTrailerKey) {
      return `https://www.youtube.com/embed/${currentTrailerKey}?autoplay=1`;
    }

    const base = activeProvider.url;
    const useId = (activeProvider.type === 'imdb' && imdbId) ? imdbId : id;
    if (activeProvider.embed) return activeProvider.embed(type, useId, season, episode);

    if (type === 'movie') {
      if (activeProvider.name === 'vidsrc.in') return `${base}/${useId}/`;
      return `${base}/movie/${useId}`;
    } else {
      if (activeProvider.name === 'vidsrc.in') return `${base}/${useId}/${season}-${episode}/`;
      return `${base}/tv/${useId}/${season}/${episode}`;
    }
  };

  return (
    <div className="space-y-6">
      {/* Reserves the player's place in the page flow. The player itself is
          portaled to <body> so nothing caps its z-index. */}
      <div ref={slotRef} className="w-full aspect-video rounded-3xl bg-black border border-white/5" />

      {mounted && createPortal(
        <>
          {lightsOff && (
            <div
              className="fixed inset-0 z-[9990] bg-black/70 backdrop-blur-2xl cursor-pointer"
              onClick={() => {
                setLightsOff(false);
                setGenZMode(false);
              }}
            />
          )}

          <div
            ref={playerRef}
            className="overflow-hidden bg-black shadow-2xl border border-white/5 group rounded-3xl"
            style={
              lightsOff
                ? {
                    // Pixel values from theaterBox, not the transform-based
                    // centering trick — see the comment above that effect.
                    position: 'fixed',
                    top: theaterBox.top,
                    left: theaterBox.left,
                    width: theaterBox.width,
                    height: theaterBox.height,
                    zIndex: 9999,
                  }
                : {
                    // Document coordinates, so the page scrolls it naturally.
                    position: 'absolute',
                    top: box.top,
                    left: box.left,
                    width: box.width,
                    height: box.height,
                    zIndex: 30,
                  }
            }
          >
            <div className={`w-full h-full ${genZMode ? 'flex flex-col' : ''}`}>
              <div className={`relative ${genZMode ? 'w-full h-1/2' : 'w-full h-full'}`}>
                {isLoading && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-black z-10">
                    <Loader2 className="animate-spin text-accent mb-4" size={40} />
                    <p className="text-muted text-sm font-medium uppercase tracking-widest">
                      Initialising Stream...
                    </p>
                  </div>
                )}

                <iframe
                  ref={iframeRef}
                  key={`${currentTrailerKey}-${activeProvider.url}-${season}-${episode}`}
                  src={getEmbedUrl()}
                  className="w-full h-full"
                  allowFullScreen
                  allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
                  referrerPolicy="no-referrer"
                  onLoad={() => setIsLoading(false)}
                  frameBorder="0"
                />
              </div>

              {genZMode && (
                <div className="relative w-full h-1/2 border-t-2 border-accent/60">
                  <iframe
                    src={genZEmbedUrl}
                    className="w-full h-full"
                    allow="autoplay; encrypted-media"
                    frameBorder="0"
                  />
                  <span className="absolute top-2 left-2 px-2 py-0.5 rounded-md bg-black/60 backdrop-blur-md border border-white/10 text-[9px] font-bold uppercase tracking-widest text-white/70">
                    Subway Surfers
                  </span>
                </div>
              )}
            </div>

            <div className="absolute top-4 right-4 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity z-30">
              <button
                onClick={() => {
                  const enable = !genZMode;
                  if (enable) setGenZEmbedUrl(getGenZEmbedUrl());
                  setGenZMode(enable);
                  setLightsOff(enable);
                }}
                className={`p-2 backdrop-blur-md rounded-full transition-colors border ${
                  genZMode
                    ? 'bg-gradient-to-r from-pink-500 to-purple-500 text-white border-transparent'
                    : 'bg-black/60 text-white/70 hover:text-white border-white/10'
                }`}
                title={genZMode ? 'Exit Gen Z Mode' : 'Gen Z Mode'}
              >
                <Rows2 size={18} />
              </button>
              <button
                onClick={() => {
                  const el = playerRef.current;
                  if (!el) return;
                  // The provider's own in-frame fullscreen button is
                  // unreliable — it's third-party, cross-origin UI we don't
                  // control, and varies (or breaks) per provider. This
                  // fullscreens our own wrapper instead, which always works.
                  if (document.fullscreenElement) document.exitFullscreen();
                  else el.requestFullscreen();
                }}
                className="p-2 bg-black/60 backdrop-blur-md rounded-full text-white/70 hover:text-white transition-colors border border-white/10"
                title="Fullscreen"
              >
                <Maximize size={18} />
              </button>
              <button
                onClick={() => {
                  setLightsOff((v) => !v);
                  setGenZMode(false);
                }}
                className={`p-2 backdrop-blur-md rounded-full transition-colors border ${
                  lightsOff
                    ? 'bg-accent/80 text-white border-accent'
                    : 'bg-black/60 text-white/70 hover:text-white border-white/10'
                }`}
                title={lightsOff ? 'Lights On' : 'Lights Off'}
              >
                {lightsOff ? <Lightbulb size={18} /> : <LightbulbOff size={18} />}
              </button>
              <button
                onClick={() => {
                  setIsLoading(true);
                  if (iframeRef.current) iframeRef.current.src = getEmbedUrl();
                }}
                className="p-2 bg-black/60 backdrop-blur-md rounded-full text-white/70 hover:text-white transition-colors border border-white/10"
                title="Reload Player"
              >
                <RefreshCw size={18} />
              </button>
            </div>
          </div>
        </>,
        document.body
      )}

      {/* Mode & Provider Switching */}
      <div className="flex flex-col space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-3 rounded-2xl bg-white/5 border border-white/5 shadow-lg">
          {/* Caller-supplied controls (episode navigation on TV). */}
          {controls ? (
            <div className="flex items-center gap-2">{controls}</div>
          ) : (
            <span />
          )}

          {/* Server Selection */}
          <div className="flex items-center gap-1.5 p-1 bg-black/20 rounded-xl overflow-x-auto no-scrollbar">
              <div className="flex items-center space-x-2 px-2 border-r border-white/10 opacity-40">
                <Server size={12} />
              </div>
              {PROVIDERS.map((provider) => (
                <button
                  key={provider.url}
                  onClick={() => {
                    setIsLoading(true);
                    setActiveProvider(provider);
                  }}
                  className={`px-3 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all whitespace-nowrap ${
                    activeProvider.url === provider.url 
                      ? 'bg-white/10 text-white border border-white/20' 
                      : 'text-white/40 hover:text-white'
                  }`}
                >
                  {provider.name}
              </button>
            ))}
          </div>
        </div>
      </div>

    </div>
  );
};

export default VideoPlayer;
