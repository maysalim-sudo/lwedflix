import { supabase } from './supabase';

export interface WeeklyDigest {
  friend_count: number;
  posts_this_week: number;
  titles_watched: number;
  reactions_received: number;
  comments_received: number;
  top_title: string | null;
}

export async function getWeeklyDigest(): Promise<WeeklyDigest | null> {
  const { data, error } = await supabase.rpc('get_weekly_digest');
  if (error) throw error;
  const row = (data as any[])?.[0];
  if (!row) return null;
  return {
    friend_count: Number(row.friend_count ?? 0),
    posts_this_week: Number(row.posts_this_week ?? 0),
    titles_watched: Number(row.titles_watched ?? 0),
    reactions_received: Number(row.reactions_received ?? 0),
    comments_received: Number(row.comments_received ?? 0),
    top_title: row.top_title ?? null,
  };
}

export interface TasteMatch {
  shared_count: number;
  my_total: number;
  their_total: number;
  overlap_pct: number;
  sample_titles: string[];
}

/**
 * Watch-history overlap with a friend.
 *
 * Deliberately overlap, not "rating agreement": nothing in the app records
 * a per-title rating, so an agreement percentage would be a made-up
 * number. This measures what the data actually supports — how much of
 * what you've each watched is the same.
 */
export async function getTasteMatch(friendId: string): Promise<TasteMatch | null> {
  const { data, error } = await supabase.rpc('get_taste_match', { friend_id: friendId });
  if (error) throw error;
  const row = (data as any[])?.[0];
  if (!row) return null;
  return {
    shared_count: Number(row.shared_count ?? 0),
    my_total: Number(row.my_total ?? 0),
    their_total: Number(row.their_total ?? 0),
    overlap_pct: Number(row.overlap_pct ?? 0),
    sample_titles: (row.sample_titles ?? []) as string[],
  };
}
