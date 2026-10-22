import { supabase } from './supabase';

/**
 * The signed-in user's id, or null.
 *
 * Every lib module was inlining `supabase.auth.getUser()` and digging out
 * `data.user?.id` — 22 copies across 8 files, each with its own take on
 * what to do when signed out.
 */
export async function currentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

/** Same, but for write paths where being signed out is an error. */
export async function requireUserId(): Promise<string> {
  const id = await currentUserId();
  if (!id) throw new Error('Not signed in');
  return id;
}
