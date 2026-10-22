import { supabase } from './supabase';
import { requireUserId, currentUserId } from './session';

export type WatchStatus = 'watching' | 'on_hold' | 'plan' | 'dropped' | 'completed';

/** Order matters: this drives the tab strip. */
export const WATCH_STATUSES: { id: WatchStatus; label: string }[] = [
  { id: 'watching', label: 'Watching' },
  { id: 'on_hold', label: 'On-Hold' },
  { id: 'plan', label: 'Plan to Watch' },
  { id: 'dropped', label: 'Dropped' },
  { id: 'completed', label: 'Completed' },
];

export const STATUS_LABEL: Record<WatchStatus, string> = WATCH_STATUSES.reduce(
  (acc, s) => ({ ...acc, [s.id]: s.label }),
  {} as Record<WatchStatus, string>
);

export interface WatchlistItem {
  id: string;
  movie_id: string;
  type: 'movie' | 'tv';
  title: string;
  poster_path: string | null;
  status: WatchStatus;
  rating: number | null;
  added_at: string;
}

function normalize(row: any): WatchlistItem {
  return {
    id: String(row.id),
    movie_id: String(row.movie_id),
    type: row.type === 'tv' ? 'tv' : 'movie',
    title: row.title ?? '',
    poster_path: row.poster_path ?? null,
    status: (row.status ?? 'plan') as WatchStatus,
    rating: row.rating == null ? null : Number(row.rating),
    added_at: row.added_at,
  };
}

/** Your own list. Pass a status to filter, or omit for everything. */
export async function getMyWatchlist(status?: WatchStatus | null): Promise<WatchlistItem[]> {
  const userId = await requireUserId();

  let query = supabase
    .from('watch_list')
    .select('*')
    .eq('user_id', userId)
    .order('added_at', { ascending: false });

  if (status) query = query.eq('status', status);

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map(normalize);
}

/**
 * Someone else's list. Goes through the RPC rather than a direct select
 * so the "is it public" check lives in one place server-side.
 */
export async function getUserWatchlist(
  ownerId: string,
  status?: WatchStatus | null
): Promise<WatchlistItem[]> {
  const { data, error } = await supabase.rpc('get_public_watchlist', {
    owner: ownerId,
    status_filter: status ?? null,
  });
  if (error) throw error;
  return ((data ?? []) as any[]).map(normalize);
}

export async function setStatus(itemId: string, status: WatchStatus): Promise<void> {
  const userId = await requireUserId();
  const { error } = await supabase
    .from('watch_list')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', itemId)
    .eq('user_id', userId);
  if (error) throw error;
}

/** Pass null to clear the score. */
export async function setRating(itemId: string, rating: number | null): Promise<void> {
  const userId = await requireUserId();
  const { error } = await supabase
    .from('watch_list')
    .update({ rating, updated_at: new Date().toISOString() })
    .eq('id', itemId)
    .eq('user_id', userId);
  if (error) throw error;
}

/**
 * Move many titles at once.
 *
 * One request with `in`, not a loop of updates — a 40-item selection
 * would otherwise be 40 round trips, and a partial failure would leave
 * the list in a state neither the server nor the UI agrees on.
 */
export async function setStatusBulk(itemIds: string[], status: WatchStatus): Promise<void> {
  if (itemIds.length === 0) return;
  const userId = await requireUserId();
  const { error } = await supabase
    .from('watch_list')
    .update({ status, updated_at: new Date().toISOString() })
    .in('id', itemIds)
    .eq('user_id', userId);
  if (error) throw error;
}

export async function removeItems(itemIds: string[]): Promise<void> {
  if (itemIds.length === 0) return;
  const userId = await requireUserId();
  const { error } = await supabase
    .from('watch_list')
    .delete()
    .in('id', itemIds)
    .eq('user_id', userId);
  if (error) throw error;
}

export async function removeItem(itemId: string): Promise<void> {
  const userId = await requireUserId();
  const { error } = await supabase
    .from('watch_list')
    .delete()
    .eq('id', itemId)
    .eq('user_id', userId);
  if (error) throw error;
}

export async function isWatchlistPublic(): Promise<boolean> {
  const userId = await currentUserId();
  if (!userId) return false;

  const { data, error } = await supabase
    .from('profiles')
    .select('watchlist_public')
    .eq('id', userId)
    .maybeSingle();

  if (error) throw error;
  return Boolean(data?.watchlist_public);
}

export async function setWatchlistPublic(isPublic: boolean): Promise<void> {
  const userId = await requireUserId();
  const { error } = await supabase
    .from('profiles')
    .update({ watchlist_public: isPublic })
    .eq('id', userId);
  if (error) throw error;
}

/** Counts per status, for the tab badges. One pass over the list. */
export function countByStatus(items: WatchlistItem[]): Record<WatchStatus | 'all', number> {
  const counts = {
    all: items.length,
    watching: 0,
    on_hold: 0,
    plan: 0,
    dropped: 0,
    completed: 0,
  } as Record<WatchStatus | 'all', number>;
  for (const item of items) counts[item.status] += 1;
  return counts;
}
