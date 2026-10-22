import { supabase } from './supabase';
import { requireUserId } from './session';

export interface Channel {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  created_by: string;
  created_at: string;
  member_count: number;
  post_count: number;
  is_member: boolean;
  recent_post_count: number;
  last_activity: string | null;
}

function normalize(row: any): Channel {
  return {
    ...row,
    member_count: Number(row.member_count ?? 0),
    post_count: Number(row.post_count ?? 0),
    is_member: Boolean(row.is_member),
    recent_post_count: Number(row.recent_post_count ?? 0),
    last_activity: row.last_activity ?? null,
  };
}

/** All channels with counts and your membership, in one round trip. */
export async function getChannels(): Promise<Channel[]> {
  const { data, error } = await supabase.rpc('get_channels');
  if (error) throw error;
  return (data as any[]).map(normalize);
}

export async function getChannelBySlug(slug: string): Promise<Channel | null> {
  // No single-channel RPC: the list is small, and reusing get_channels
  // keeps membership/count logic in exactly one place.
  const all = await getChannels();
  return all.find((c) => c.slug === slug.toLowerCase()) ?? null;
}

export async function createChannel(input: {
  slug: string;
  name: string;
  description?: string | null;
}): Promise<Channel> {
  const userId = await requireUserId();

  const slug = input.slug.trim().toLowerCase();
  if (!/^[a-z0-9_]{2,24}$/.test(slug)) {
    throw new Error('Channel handle must be 2–24 characters: a–z, 0–9 or _');
  }

  const { data, error } = await supabase
    .from('channels')
    .insert({
      slug,
      name: input.name.trim(),
      description: input.description?.trim() || null,
      created_by: userId,
    })
    .select()
    .single();

  if (error) {
    if (error.code === '23505') throw new Error('That channel handle is already taken.');
    throw error;
  }

  // Creating a channel implies joining it; nobody wants to create a
  // channel and then have to join their own.
  await joinChannel((data as any).id);

  return normalize({ ...data, member_count: 1, post_count: 0, is_member: true });
}

export async function joinChannel(channelId: string): Promise<void> {
  const userId = await requireUserId();

  const { error } = await supabase
    .from('channel_members')
    .upsert({ channel_id: channelId, user_id: userId }, { onConflict: 'channel_id,user_id' });
  if (error) throw error;
}

export async function leaveChannel(channelId: string): Promise<void> {
  const userId = await requireUserId();

  const { error } = await supabase
    .from('channel_members')
    .delete()
    .eq('channel_id', channelId)
    .eq('user_id', userId);
  if (error) throw error;
}
