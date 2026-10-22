import { supabase } from './supabase';
import { currentUserId, requireUserId } from './session';

export interface WatchingFriend {
  user_id: string;
  /** Null when the friend is incognito — masked server-side, not in the UI. */
  media_type: 'movie' | 'tv' | null;
  media_id: string | null;
  title: string;
  poster_path: string | null;
  season: number | null;
  episode: number | null;
  updated_at: string;
  is_incognito: boolean;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
}

/**
 * How long a heartbeat stays trustworthy. There is no cron to expire
 * rows, so a browser that closed without cleanup leaves one behind —
 * filtering client-side is honest about that instead of showing someone
 * as "watching" indefinitely.
 */
export const STALE_AFTER_MS = 90_000;

/** Heartbeat interval; comfortably under STALE_AFTER_MS so a live viewer never flickers out. */
export const HEARTBEAT_MS = 25_000;

export interface NowWatchingInput {
  mediaType: 'movie' | 'tv';
  mediaId: string | number;
  title: string;
  posterPath?: string | null;
  season?: number | null;
  episode?: number | null;
}

/** One row per user (user_id is the PK), so this overwrites rather than accumulating. */
export async function upsertNowWatching(input: NowWatchingInput): Promise<void> {
  const userId = await currentUserId();
  if (!userId) return;

  // Read the preference at heartbeat time rather than caching it, so
  // flipping incognito takes effect on the next beat instead of needing
  // a reload.
  const { data: prefs } = await supabase
    .from('profiles')
    .select('watch_incognito')
    .eq('id', userId)
    .maybeSingle();

  await supabase.from('now_watching').upsert(
    {
      user_id: userId,
      media_type: input.mediaType,
      media_id: String(input.mediaId),
      title: input.title,
      poster_path: input.posterPath ?? null,
      season: input.season ?? null,
      episode: input.episode ?? null,
      is_incognito: Boolean(prefs?.watch_incognito),
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' }
  );
}

export async function getIncognito(): Promise<boolean> {
  const userId = await currentUserId();
  if (!userId) return false;

  const { data } = await supabase
    .from('profiles')
    .select('watch_incognito')
    .eq('id', userId)
    .maybeSingle();
  return Boolean(data?.watch_incognito);
}

export async function setIncognito(value: boolean): Promise<void> {
  const userId = await requireUserId();

  const { error } = await supabase
    .from('profiles')
    .update({ watch_incognito: value })
    .eq('id', userId);
  if (error) throw error;

  // Apply to the row already broadcasting, so the change is visible now
  // rather than at the next heartbeat.
  await supabase.from('now_watching').update({ is_incognito: value }).eq('user_id', userId);
}

export async function clearNowWatching(): Promise<void> {
  const userId = await currentUserId();
  if (!userId) return;
  await supabase.from('now_watching').delete().eq('user_id', userId);
}

export function isFresh(updatedAt: string): boolean {
  return Date.now() - new Date(updatedAt).getTime() < STALE_AFTER_MS;
}

export async function getFriendsWatching(): Promise<WatchingFriend[]> {
  const { data, error } = await supabase.rpc('get_friends_watching');
  if (error) throw error;
  return ((data ?? []) as WatchingFriend[]).filter((w) => isFresh(w.updated_at));
}

/**
 * Live presence updates.
 *
 * Subscribes unfiltered rather than with `user_id=in.(...)`: `in` filters
 * on postgres_changes have been unreliable across supabase-js versions,
 * and RLS already restricts the stream to rows the viewer may read. The
 * caller refetches through the RPC on any event, which re-applies both
 * the friendship join and the staleness cutoff.
 */
export function subscribeToPresence(onChange: () => void): () => void {
  const channel = supabase
    .channel(`presence:${crypto.randomUUID()}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'now_watching' }, () => onChange())
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}
