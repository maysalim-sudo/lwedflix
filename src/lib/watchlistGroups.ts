import { supabase } from './supabase';
import { requireUserId } from './session';

export interface WatchlistGroup {
  id: string;
  name: string;
  owner_id: string;
  member_count: number;
  pending_count: number;
  member_usernames: string[];
  created_at: string;
}

export interface GroupItem {
  id: string;
  media_type: 'movie' | 'tv';
  media_id: string;
  title: string;
  poster_path: string | null;
  status: 'pending' | 'watched';
  added_by: string;
  added_by_username: string;
  added_by_display_name: string | null;
  vote_count: number;
  i_voted: boolean;
  added_at: string;
}

export async function getMyGroups(): Promise<WatchlistGroup[]> {
  const { data, error } = await supabase.rpc('get_my_watchlist_groups');
  if (error) throw error;
  return ((data ?? []) as any[]).map((g) => ({
    ...g,
    member_count: Number(g.member_count ?? 0),
    pending_count: Number(g.pending_count ?? 0),
    member_usernames: g.member_usernames ?? [],
  }));
}

export async function getGroupItems(groupId: string): Promise<GroupItem[]> {
  const { data, error } = await supabase.rpc('get_watchlist_group_items', {
    target_group: groupId,
  });
  if (error) throw error;
  return ((data ?? []) as any[]).map((i) => ({
    ...i,
    vote_count: Number(i.vote_count ?? 0),
    i_voted: Boolean(i.i_voted),
  }));
}

/** Members must already be friends — the RPC silently skips anyone who isn't. */
export async function createGroup(name: string, memberIds: string[]): Promise<string> {
  const { data, error } = await supabase.rpc('create_watchlist_group', {
    group_name: name,
    member_ids: memberIds,
  });
  if (error) throw error;
  return data as string;
}

export async function addMembers(groupId: string, memberIds: string[]): Promise<void> {
  const { error } = await supabase.rpc('add_watchlist_group_members', {
    target_group: groupId,
    member_ids: memberIds,
  });
  if (error) throw error;
}

export async function addGroupItem(
  groupId: string,
  item: {
    mediaType: 'movie' | 'tv';
    mediaId: string | number;
    title: string;
    posterPath?: string | null;
  }
): Promise<void> {
  const userId = await requireUserId();
  const { error } = await supabase.from('watchlist_group_items').insert({
    group_id: groupId,
    added_by: userId,
    media_type: item.mediaType,
    media_id: String(item.mediaId),
    title: item.title,
    poster_path: item.posterPath ?? null,
  });
  // Already on the list is not a failure worth surfacing.
  if (error && !String(error.message).includes('unique_group_item')) throw error;
}

export async function setGroupItemStatus(
  itemId: string,
  status: 'pending' | 'watched'
): Promise<void> {
  const { error } = await supabase
    .from('watchlist_group_items')
    .update({
      status,
      watched_at: status === 'watched' ? new Date().toISOString() : null,
    })
    .eq('id', itemId);
  if (error) throw error;
}

export async function removeGroupItem(itemId: string): Promise<void> {
  const { error } = await supabase.from('watchlist_group_items').delete().eq('id', itemId);
  if (error) throw error;
}

export async function setGroupVote(itemId: string, voted: boolean): Promise<void> {
  const userId = await requireUserId();
  if (voted) {
    const { error } = await supabase
      .from('watchlist_group_votes')
      .upsert({ item_id: itemId, user_id: userId }, { onConflict: 'item_id,user_id' });
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from('watchlist_group_votes')
      .delete()
      .eq('item_id', itemId)
      .eq('user_id', userId);
    if (error) throw error;
  }
}

export async function leaveGroup(groupId: string): Promise<void> {
  const userId = await requireUserId();
  const { error } = await supabase
    .from('watchlist_group_members')
    .delete()
    .eq('group_id', groupId)
    .eq('user_id', userId);
  if (error) throw error;
}
