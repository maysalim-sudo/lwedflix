import { supabase } from './supabase';
import { requireUserId } from './session';

export interface SharedItem {
  id: string;
  media_type: 'movie' | 'tv';
  media_id: string;
  title: string;
  poster_path: string | null;
  status: 'pending' | 'watched';
  added_at: string;
  watched_at: string | null;
  added_by: string;
  added_by_username: string;
  added_by_display_name: string | null;
  vote_count: number;
  i_voted: boolean;
}

/** The list you share with one friend. Pair ordering is handled server-side. */
export async function getSharedWatchlist(friendId: string): Promise<SharedItem[]> {
  const { data, error } = await supabase.rpc('get_shared_watchlist', { friend_id: friendId });
  if (error) throw error;
  return ((data ?? []) as any[]).map((r) => ({
    ...r,
    vote_count: Number(r.vote_count ?? 0),
    i_voted: Boolean(r.i_voted),
  }));
}

/** One vote per person per item — "what should we watch next". */
export async function setVote(itemId: string, voted: boolean): Promise<void> {
  const userId = await requireUserId();
  if (voted) {
    const { error } = await supabase
      .from('shared_watchlist_votes')
      .upsert({ item_id: itemId, user_id: userId }, { onConflict: 'item_id,user_id' });
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from('shared_watchlist_votes')
      .delete()
      .eq('item_id', itemId)
      .eq('user_id', userId);
    if (error) throw error;
  }
}

/** Pending counts keyed by friend id, for badges. */
export async function getSharedCounts(): Promise<Map<string, number>> {
  const { data, error } = await supabase.rpc('get_my_shared_counts');
  if (error) throw error;
  return new Map(
    ((data ?? []) as { friend_id: string; pending_count: number }[]).map((r) => [
      r.friend_id,
      Number(r.pending_count ?? 0),
    ])
  );
}

export interface RecommendInput {
  mediaType: 'movie' | 'tv';
  mediaId: string | number;
  title: string;
  posterPath?: string | null;
}

/** Adds a title to the pair's shared list. Idempotent. */
export async function recommendToFriend(friendId: string, item: RecommendInput): Promise<void> {
  const { error } = await supabase.rpc('recommend_to_friend', {
    friend_id: friendId,
    p_media_type: item.mediaType,
    p_media_id: String(item.mediaId),
    p_title: item.title,
    p_poster_path: item.posterPath ?? null,
  });
  if (error) throw error;
}

export async function setSharedItemStatus(
  itemId: string,
  status: 'pending' | 'watched'
): Promise<void> {
  const { error } = await supabase
    .from('shared_watchlist_items')
    .update({
      status,
      watched_at: status === 'watched' ? new Date().toISOString() : null,
    })
    .eq('id', itemId);
  if (error) throw error;
}

export async function removeSharedItem(itemId: string): Promise<void> {
  const { error } = await supabase.from('shared_watchlist_items').delete().eq('id', itemId);
  if (error) throw error;
}
