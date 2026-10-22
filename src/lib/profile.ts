import { supabase } from './supabase';
import { currentUserId, requireUserId } from './session';
import { PROFILE_COLUMNS, type PublicProfile } from './friends';

/**
 * Your own profile, including the columns `profiles_public` deliberately
 * withholds. Read from the base `profiles` table, whose RLS is self-only.
 */
export interface MyProfile extends PublicProfile {
  invite_code: string;
  username_changed_at: string | null;
  is_admin: boolean;
  banned_at: string | null;
}

export interface ProfileUpdate {
  display_name?: string | null;
  bio?: string | null;
  avatar_url?: string | null;
  cover_url?: string | null;
}

export async function getMyProfile(): Promise<MyProfile | null> {
  const userId = await currentUserId();
  if (!userId) return null;

  const { data, error } = await supabase
    .from('profiles')
    .select(
      'id, username, display_name, avatar_url, cover_url, bio, invite_code, username_changed_at, created_at, is_admin, banned_at'
    )
    .eq('id', userId)
    .maybeSingle();

  if (error) throw error;
  return (data as MyProfile) ?? null;
}

export async function getProfileByUsername(username: string): Promise<PublicProfile | null> {
  const { data, error } = await supabase
    .from('profiles_public')
    .select(PROFILE_COLUMNS)
    .eq('username', username.toLowerCase())
    .maybeSingle();

  if (error) throw error;
  return (data as PublicProfile) ?? null;
}

/** Everything except username — that goes through the rate-limited RPC. */
export async function updateProfile(update: ProfileUpdate): Promise<void> {
  const userId = await requireUserId();

  const { error } = await supabase.from('profiles').update(update).eq('id', userId);
  if (error) throw error;
}

/**
 * Renaming goes through an RPC rather than a plain update because the
 * 7-day rate limit can't be expressed as an RLS policy. Returns the
 * normalized (lowercased) username actually stored.
 */
export async function setUsername(username: string): Promise<string> {
  const { data, error } = await supabase.rpc('set_username', { new_username: username });
  if (error) throw error;
  return data as string;
}
