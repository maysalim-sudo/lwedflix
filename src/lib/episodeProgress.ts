// Per-show episode progress.
//
// localStorage stays the source of truth for reads: it's synchronous, so
// every existing caller keeps working unchanged, and progress still works
// signed out. When signed in it is mirrored to `show_progress`, which is
// what makes it survive a new device or a cleared cache.

import { supabase } from './supabase';

const STORAGE_PREFIX = 'cm_progress_';

export interface EpisodePosition {
  watched: number;  // seconds played
  duration: number; // total seconds
}

export interface ShowProgress {
  watched: Record<string, true>; // completed episodes, key: `${season}-${episode}`
  positions: Record<string, EpisodePosition>; // playback position, same key
  lastSeason: number;
  lastEpisode: number;
  updatedAt: number;
}

// Counted as finished at this fraction — most episodes run credits at the end,
// so requiring 100% would mean almost nothing ever gets marked.
const COMPLETE_AT = 0.9;

const storageKey = (showId: string | number) => `${STORAGE_PREFIX}${showId}`;
const episodeKey = (season: number, episode: number) => `${season}-${episode}`;

function readProgress(showId: string | number): ShowProgress | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(storageKey(showId));
    return raw ? (JSON.parse(raw) as ShowProgress) : null;
  } catch {
    return null;
  }
}

function writeProgress(showId: string | number, data: ShowProgress) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(storageKey(showId), JSON.stringify(data));
  } catch {
    // Storage unavailable or full — fail silently, progress just won't persist.
  }
  schedulePush(showId, data);
}

// ---------------------------------------------------------------
// Server mirror
// ---------------------------------------------------------------

const pushTimers = new Map<string, ReturnType<typeof setTimeout>>();

/**
 * Debounced upsert.
 *
 * setEpisodePosition fires about once a second while something plays, so
 * writing straight through would mean a request per tick. Local storage
 * is updated immediately either way; only the mirror waits.
 */
function schedulePush(showId: string | number, data: ShowProgress) {
  if (typeof window === 'undefined') return;

  const key = String(showId);
  const existing = pushTimers.get(key);
  if (existing) clearTimeout(existing);

  pushTimers.set(
    key,
    setTimeout(async () => {
      pushTimers.delete(key);
      try {
        const { data: auth } = await supabase.auth.getUser();
        const userId = auth.user?.id;
        if (!userId) return;

        await supabase.from('show_progress').upsert(
          {
            user_id: userId,
            show_id: key,
            data: data as unknown as Record<string, unknown>,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id,show_id' }
        );
      } catch {
        // Best-effort: localStorage already has it, and the next write
        // pushes the whole blob again anyway.
      }
    }, 1500)
  );
}

/** Union of watched marks, furthest position per episode. */
function mergeProgress(local: ShowProgress, remote: ShowProgress): ShowProgress {
  const watched = { ...remote.watched, ...local.watched };

  const positions: Record<string, EpisodePosition> = { ...remote.positions };
  for (const [key, pos] of Object.entries(local.positions || {})) {
    const other = positions[key];
    if (!other || pos.watched > other.watched) positions[key] = pos;
  }

  // Marks are unioned rather than last-write-wins: losing a watched
  // episode is far more annoying than an un-mark failing to propagate
  // from another device.
  const newer = remote.updatedAt > local.updatedAt ? remote : local;

  return {
    watched,
    positions,
    lastSeason: newer.lastSeason,
    lastEpisode: newer.lastEpisode,
    updatedAt: Math.max(local.updatedAt, remote.updatedAt),
  };
}

/**
 * Pulls this show's saved progress and folds it into local storage.
 *
 * Call once per show on mount; the synchronous getters below then return
 * the merged result. Resolves to true when anything changed, so the
 * caller knows whether to re-read.
 */
export async function hydrateShowProgress(showId: string | number): Promise<boolean> {
  try {
    const { data: auth } = await supabase.auth.getUser();
    const userId = auth.user?.id;
    if (!userId) return false;

    const { data, error } = await supabase
      .from('show_progress')
      .select('data')
      .eq('user_id', userId)
      .eq('show_id', String(showId))
      .maybeSingle();

    if (error || !data?.data) return false;

    const remote = data.data as ShowProgress;
    const local = getShowProgress(showId);
    const merged = mergeProgress(local, {
      watched: remote.watched || {},
      positions: remote.positions || {},
      lastSeason: remote.lastSeason ?? 1,
      lastEpisode: remote.lastEpisode ?? 1,
      updatedAt: remote.updatedAt ?? 0,
    });

    // Write directly, not through writeProgress: a hydrate shouldn't
    // immediately schedule a push of what we just read back.
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(storageKey(showId), JSON.stringify(merged));
      } catch {
        return false;
      }
    }
    return true;
  } catch {
    return false;
  }
}

/** Pushes whatever is in localStorage for a show, without waiting. */
export function syncShowProgress(showId: string | number) {
  const local = readProgress(showId);
  if (local) schedulePush(showId, local);
}

export function getShowProgress(showId: string | number): ShowProgress {
  const stored = readProgress(showId);
  return {
    watched: stored?.watched || {},
    positions: stored?.positions || {}, // absent in records written before positions existed
    lastSeason: stored?.lastSeason ?? 1,
    lastEpisode: stored?.lastEpisode ?? 1,
    updatedAt: stored?.updatedAt ?? 0,
  };
}

export function getLastPosition(showId: string | number): { season: number; episode: number } | null {
  const p = readProgress(showId);
  return p ? { season: p.lastSeason, episode: p.lastEpisode } : null;
}

export function setLastPosition(showId: string | number, season: number, episode: number) {
  const p = getShowProgress(showId);
  p.lastSeason = season;
  p.lastEpisode = episode;
  p.updatedAt = Date.now();
  writeProgress(showId, p);
}

export function isEpisodeWatched(showId: string | number, season: number, episode: number): boolean {
  return !!readProgress(showId)?.watched[episodeKey(season, episode)];
}

export function markEpisodeWatched(showId: string | number, season: number, episode: number) {
  const p = getShowProgress(showId);
  p.watched[episodeKey(season, episode)] = true;
  p.updatedAt = Date.now();
  writeProgress(showId, p);
}

export function toggleEpisodeWatched(showId: string | number, season: number, episode: number) {
  const p = getShowProgress(showId);
  const key = episodeKey(season, episode);
  if (p.watched[key]) delete p.watched[key];
  else p.watched[key] = true;
  p.updatedAt = Date.now();
  writeProgress(showId, p);
}

export function getWatchedKeys(showId: string | number): Set<string> {
  return new Set(Object.keys(getShowProgress(showId).watched));
}

export function getEpisodePositions(showId: string | number): Record<string, EpisodePosition> {
  return getShowProgress(showId).positions;
}

/**
 * Records real playback position reported by the player. Returns true if this
 * changed anything worth re-rendering — the caller polls once a second, so
 * unchanged reports should not churn state or storage.
 */
export function setEpisodePosition(
  showId: string | number,
  season: number,
  episode: number,
  watched: number,
  duration: number
): boolean {
  if (!(duration > 0) || !(watched >= 0)) return false;

  const p = getShowProgress(showId);
  const key = episodeKey(season, episode);
  const prev = p.positions[key];

  const completed = watched / duration >= COMPLETE_AT;
  const newlyCompleted = completed && !p.watched[key];
  // Ignore sub-second jitter so a paused player doesn't write every tick.
  const moved = !prev || Math.abs(prev.watched - watched) >= 1 || prev.duration !== duration;
  if (!moved && !newlyCompleted) return false;

  p.positions[key] = { watched, duration };
  if (completed) p.watched[key] = true;
  p.updatedAt = Date.now();
  writeProgress(showId, p);
  return true;
}
