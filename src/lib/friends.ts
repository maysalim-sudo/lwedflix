import { supabase } from './supabase';
import { currentUserId } from './session';
import { shareUrl } from './shareLink';

/**
 * Friend graph helpers.
 *
 * Friendship is not its own table — it's a `friend_requests` row with
 * status='accepted'. Every query here relies on RLS to scope rows to the
 * signed-in user, so none of these functions take a user id: the policies
 * already restrict `friend_requests` to rows where you're the requester or
 * the addressee.
 */

/** Columns exposed by the `profiles_public` view. Never includes invite_code. */
export interface PublicProfile {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  cover_url: string | null;
  bio: string | null;
  created_at: string;
}

export interface Friend {
  requestId: string;
  profile: PublicProfile;
  since: string;
}

export interface PendingRequest {
  requestId: string;
  profile: PublicProfile;
  createdAt: string;
}

interface FriendRequestRow {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: 'pending' | 'accepted' | 'declined';
  created_at: string;
  responded_at: string | null;
}

export const PROFILE_COLUMNS = 'id, username, display_name, avatar_url, cover_url, bio, created_at';

/**
 * Resolves a set of user ids to profiles, keyed by id for easy joining.
 *
 * Exported because PostgREST can't auto-join to `profiles_public` (a view
 * has no foreign keys), so anything needing author details — comments,
 * notifications — has to do the same two-step.
 */
export async function fetchProfiles(ids: string[]): Promise<Map<string, PublicProfile>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map();

  const { data, error } = await supabase
    .from('profiles_public')
    .select(PROFILE_COLUMNS)
    .in('id', unique);

  if (error) throw error;
  return new Map((data as PublicProfile[]).map((p) => [p.id, p]));
}

/**
 * Finds users by username prefix. Excludes yourself — you can't friend
 * yourself, and the DB would reject it anyway (no_self_request).
 */
export async function searchUsers(query: string): Promise<PublicProfile[]> {
  const term = query.trim().toLowerCase();
  if (term.length < 2) return [];

  const me = await currentUserId();

  const { data, error } = await supabase
    .from('profiles_public')
    .select(PROFILE_COLUMNS)
    .ilike('username', `${term}%`)
    .limit(10);

  if (error) throw error;
  return (data as PublicProfile[]).filter((p) => p.id !== me);
}

/** Accepted friendships, with the *other* person's profile attached. */
export async function getFriends(): Promise<Friend[]> {
  const me = await currentUserId();
  if (!me) return [];

  const { data, error } = await supabase
    .from('friend_requests')
    .select('*')
    .eq('status', 'accepted');

  if (error) throw error;

  const rows = data as FriendRequestRow[];
  const otherIds = rows.map((r) => (r.requester_id === me ? r.addressee_id : r.requester_id));
  const profiles = await fetchProfiles(otherIds);

  return rows
    .map((r) => {
      const otherId = r.requester_id === me ? r.addressee_id : r.requester_id;
      const profile = profiles.get(otherId);
      // A profile can be missing if the account was deleted mid-flight;
      // drop the row rather than rendering a broken card.
      return profile
        ? { requestId: r.id, profile, since: r.responded_at ?? r.created_at }
        : null;
    })
    .filter((f): f is Friend => f !== null);
}

/** Requests sent *to* you and awaiting your response. */
export async function getIncomingRequests(): Promise<PendingRequest[]> {
  const me = await currentUserId();
  if (!me) return [];

  const { data, error } = await supabase
    .from('friend_requests')
    .select('*')
    .eq('status', 'pending')
    .eq('addressee_id', me);

  if (error) throw error;

  const rows = data as FriendRequestRow[];
  const profiles = await fetchProfiles(rows.map((r) => r.requester_id));

  return rows
    .map((r) => {
      const profile = profiles.get(r.requester_id);
      return profile ? { requestId: r.id, profile, createdAt: r.created_at } : null;
    })
    .filter((r): r is PendingRequest => r !== null);
}

/** Requests you've sent that haven't been answered yet. */
export async function getOutgoingRequests(): Promise<PendingRequest[]> {
  const me = await currentUserId();
  if (!me) return [];

  const { data, error } = await supabase
    .from('friend_requests')
    .select('*')
    .eq('status', 'pending')
    .eq('requester_id', me);

  if (error) throw error;

  const rows = data as FriendRequestRow[];
  const profiles = await fetchProfiles(rows.map((r) => r.addressee_id));

  return rows
    .map((r) => {
      const profile = profiles.get(r.addressee_id);
      return profile ? { requestId: r.id, profile, createdAt: r.created_at } : null;
    })
    .filter((r): r is PendingRequest => r !== null);
}

/** Count of requests awaiting your response — drives the navbar badge. */
export async function getIncomingRequestCount(): Promise<number> {
  const me = await currentUserId();
  if (!me) return 0;

  const { count, error } = await supabase
    .from('friend_requests')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending')
    .eq('addressee_id', me);

  if (error) throw error;
  return count ?? 0;
}

export async function sendFriendRequest(addresseeId: string): Promise<void> {
  const me = await currentUserId();
  if (!me) throw new Error('Not signed in');

  const { error } = await supabase.from('friend_requests').insert({
    requester_id: me,
    addressee_id: addresseeId,
    status: 'pending',
  });

  if (error) {
    // unique_friend_pair — a live request or friendship already exists.
    if (error.code === '23505') throw new Error('You already have a request or friendship with this user.');
    throw error;
  }
}

export async function respondToRequest(requestId: string, accept: boolean): Promise<void> {
  const { error } = await supabase
    .from('friend_requests')
    .update({
      status: accept ? 'accepted' : 'declined',
      responded_at: new Date().toISOString(),
    })
    .eq('id', requestId);

  if (error) throw error;
}

/** Withdraw a request you sent. */
export async function cancelRequest(requestId: string): Promise<void> {
  const { error } = await supabase.from('friend_requests').delete().eq('id', requestId);
  if (error) throw error;
}

/** Remove an existing friendship. Either side may do this. */
export async function unfriend(requestId: string): Promise<void> {
  const { error } = await supabase.from('friend_requests').delete().eq('id', requestId);
  if (error) throw error;
}

/**
 * Your personal invite code. Deliberately an RPC rather than a column
 * read — the code is a bearer token, so it's kept off `profiles_public`
 * where anyone could read it off your profile.
 */
export async function getMyInviteCode(): Promise<string | null> {
  const { data, error } = await supabase.rpc('get_my_invite_code');
  if (error) throw error;
  return (data as string | null) ?? null;
}

export function buildInviteUrl(code: string): string {
  return shareUrl(`/invite/${code}`);
}

/**
 * Redeems an invite code into an accepted friendship. This is the only
 * path to an accepted row created by one side alone — the check that you
 * actually hold the code happens inside the security-definer function,
 * where the caller can't bypass it.
 */
export async function acceptInvite(code: string): Promise<PublicProfile | null> {
  const { data, error } = await supabase.rpc('accept_invite', { invite_code_input: code });
  if (error) throw error;

  const row = (data as { friend_id: string; friend_username: string; friend_display_name: string | null }[])?.[0];
  if (!row) return null;

  // The RPC only returns identity columns; the rest are filled on the
  // next real profile fetch.
  return {
    id: row.friend_id,
    username: row.friend_username,
    display_name: row.friend_display_name,
    avatar_url: null,
    cover_url: null,
    bio: null,
    created_at: '',
  };
}

export async function isUsernameAvailable(username: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('is_username_available', { candidate: username });
  if (error) throw error;
  return Boolean(data);
}
