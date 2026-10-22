import { supabase } from './supabase';
import { requireUserId } from './session';

export const DM_PAGE_SIZE = 40;

export interface DmThread {
  thread_id: string;
  other_id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  last_body: string | null;
  last_sender_id: string | null;
  last_message_at: string;
  unread_count: number;
}

export interface DmMessage {
  id: string;
  sender_id: string;
  body: string;
  created_at: string;
  /** A shared movie or show. Null on an ordinary text message. */
  media_type: 'movie' | 'tv' | null;
  media_id: string | null;
  media_title: string | null;
  poster_path: string | null;
  season: number | null;
  episode: number | null;
}

export interface DmAttachment {
  type: 'movie' | 'tv';
  id: string | number;
  title: string;
  posterPath?: string | null;
  season?: number | null;
  episode?: number | null;
}

export interface DmCursor {
  created_at: string;
  id: string;
}

/** Every conversation you're in, most recent first. */
export async function getThreads(): Promise<DmThread[]> {
  const { data, error } = await supabase.rpc('get_dm_threads');
  if (error) throw error;
  return ((data ?? []) as any[]).map((r) => ({
    ...r,
    unread_count: Number(r.unread_count ?? 0),
  }));
}

/**
 * Find or create the thread with someone. Server-side this is
 * friends-only, so it throws for a stranger rather than silently
 * returning an unusable id.
 */
export async function openThread(otherId: string): Promise<string> {
  const { data, error } = await supabase.rpc('open_dm', { other_id: otherId });
  if (error) throw error;
  return data as string;
}

/** Newest-first page. The view reverses for display. */
export async function getMessages(
  threadId: string,
  cursor?: DmCursor | null
): Promise<DmMessage[]> {
  const { data, error } = await supabase.rpc('get_dm_messages', {
    target_thread: threadId,
    before_created: cursor?.created_at ?? null,
    before_id: cursor?.id ?? null,
    page_size: DM_PAGE_SIZE,
  });
  if (error) throw error;
  return (data ?? []) as DmMessage[];
}

export async function sendMessage(
  threadId: string,
  body: string,
  attachment?: DmAttachment | null
): Promise<void> {
  const senderId = await requireUserId();
  const trimmed = body.trim();
  // A title on its own is a valid message; an empty one still isn't.
  if (!trimmed && !attachment) return;

  const { error } = await supabase.from('dm_messages').insert({
    thread_id: threadId,
    sender_id: senderId,
    body: trimmed,
    media_type: attachment?.type ?? null,
    media_id: attachment ? String(attachment.id) : null,
    media_title: attachment?.title ?? null,
    poster_path: attachment?.posterPath ?? null,
    season: attachment?.season ?? null,
    episode: attachment?.episode ?? null,
  });
  if (error) throw error;
}

/** Opens the thread with someone and sends them a title in one step. */
export async function shareTitle(
  friendId: string,
  attachment: DmAttachment,
  note = ''
): Promise<string> {
  const threadId = await openThread(friendId);
  await sendMessage(threadId, note, attachment);
  return threadId;
}

export async function markRead(threadId: string): Promise<void> {
  const { error } = await supabase.rpc('mark_dm_read', { target_thread: threadId });
  if (error) throw error;
}

export async function getUnreadTotal(): Promise<number> {
  const threads = await getThreads();
  return threads.reduce((n, t) => n + t.unread_count, 0);
}

/**
 * Live messages.
 *
 * Filtered to one thread server-side — a plain `eq` filter, which is the
 * reliable kind here. Without `threadId` it listens to every dm_messages
 * change the subscriber can see, which is what the thread list wants.
 */
export function subscribeToMessages(
  onChange: (message: DmMessage | null) => void,
  threadId?: string
): () => void {
  // Unique per subscription. A fixed topic name returns the *existing*
  // channel on a second call, and adding callbacks to an already-subscribed
  // channel throws — which React's double-invoked effects trigger every
  // time in development.
  const channel = supabase
    .channel(`dm:${threadId ?? 'all'}:${crypto.randomUUID()}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'dm_messages',
        ...(threadId ? { filter: `thread_id=eq.${threadId}` } : {}),
      },
      (payload) => onChange((payload.new as DmMessage) ?? null)
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}
