import { supabase } from './supabase';

export interface AdminUser {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  is_admin: boolean;
  banned_at: string | null;
  created_at: string;
  post_count: number;
}

/**
 * Moderator user list.
 *
 * The RPC returns zero rows for non-admins rather than raising, so a
 * probing client can't learn who exists — treat an empty result as
 * "not a moderator", not as "no users".
 */
export async function listUsers(): Promise<AdminUser[]> {
  const { data, error } = await supabase.rpc('admin_list_users');
  if (error) throw error;
  return ((data ?? []) as any[]).map((u) => ({ ...u, post_count: Number(u.post_count ?? 0) }));
}

export async function setBanned(userId: string, banned: boolean): Promise<void> {
  const { error } = await supabase.rpc('admin_set_banned', {
    target_user: userId,
    banned,
  });
  if (error) throw error;
}

/**
 * Deletes everything a user posted, leaving the account itself intact.
 *
 * Removing the auth account needs the service-role key from a server —
 * this app only ships the anon key — so that's a Supabase dashboard
 * operation (Authentication > Users).
 */
export async function purgeUserContent(userId: string): Promise<void> {
  const { error } = await supabase.rpc('admin_purge_user_content', { target_user: userId });
  if (error) throw error;
}

export async function deleteChannel(channelId: string): Promise<void> {
  // Posts cascade with the channel via the FK.
  const { error } = await supabase.from('channels').delete().eq('id', channelId);
  if (error) throw error;
}
