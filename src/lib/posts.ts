import { supabase } from './supabase';
import { currentUserId, requireUserId } from './session';
import { fetchProfiles, type PublicProfile } from './friends';

export const REACTIONS = ['like', 'love', 'laugh', 'wow', 'sad'] as const;
export type Reaction = (typeof REACTIONS)[number];

export const REACTION_EMOJI: Record<Reaction, string> = {
  like: '👍',
  love: '❤️',
  laugh: '😂',
  wow: '😮',
  sad: '😢',
};

export const REACTION_LABEL: Record<Reaction, string> = {
  like: 'Like',
  love: 'Love',
  laugh: 'Haha',
  wow: 'Wow',
  sad: 'Sad',
};

export type Visibility = 'friends' | 'public';

/** A row from the `get_posts` RPC — post, author, and aggregates in one. */
export interface Post {
  id: string;
  user_id: string;
  body: string;
  image_url: string | null;
  visibility: Visibility;
  media_type: 'movie' | 'tv' | null;
  media_id: string | null;
  media_title: string | null;
  poster_path: string | null;
  season: number | null;
  episode: number | null;
  created_at: string;
  edited_at: string | null;
  channel_id: string | null;
  channel_slug: string | null;
  channel_name: string | null;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  comment_count: number;
  reaction_counts: Partial<Record<Reaction, number>>;
  my_reaction: Reaction | null;
  /** Set when this post is a repost of another. */
  repost_of: string | null;
  /**
   * The original, embedded. Null when the viewer can't see it — RLS
   * still applies inside the feed query, so a repost never leaks a post
   * the viewer wasn't allowed to read.
   */
  repost_source: RepostSource | null;
  repost_count: number;
  i_reposted: boolean;
}

/** The subset of a post shown inside a repost card. */
export interface RepostSource {
  id: string;
  user_id: string;
  body: string;
  image_url: string | null;
  media_type: 'movie' | 'tv' | null;
  media_id: string | null;
  media_title: string | null;
  poster_path: string | null;
  season: number | null;
  episode: number | null;
  created_at: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
}

export interface PostComment {
  id: string;
  post_id: string;
  user_id: string;
  parent_id: string | null;
  body: string;
  created_at: string;
  edited_at: string | null;
  author: PublicProfile | null;
  reaction_counts: Partial<Record<Reaction, number>>;
  my_reaction: Reaction | null;
  /** One level only — replies to replies re-target the same parent. */
  replies: PostComment[];
}

/** Someone who reacted, for the "who reacted" list. */
export interface Reactor {
  profile: PublicProfile | null;
  reaction: Reaction;
}

/** Composite cursor — a timestamp alone skips rows when two posts share one. */
export interface PostCursor {
  created_at: string;
  id: string;
}

export interface CreatePostInput {
  body: string;
  imageUrl?: string | null;
  visibility: Visibility;
  /** Posting into a channel forces public visibility (DB constraint). */
  channelId?: string | null;
  media?: {
    type: 'movie' | 'tv';
    id: string | number;
    title: string;
    posterPath?: string | null;
    season?: number | null;
    episode?: number | null;
  } | null;
  /** Set to quote-repost another post. */
  repostOf?: string | null;
}

export const PAGE_SIZE = 20;

/**
 * Applies a reaction change to a count map without refetching. Shared by
 * post and comment reaction pickers, which were carrying identical copies.
 */
export function applyReactionDelta(
  counts: Partial<Record<Reaction, number>>,
  from: Reaction | null,
  to: Reaction | null
): Partial<Record<Reaction, number>> {
  const next = { ...counts };
  if (from) {
    const remaining = (next[from] ?? 1) - 1;
    if (remaining > 0) next[from] = remaining;
    else delete next[from];
  }
  if (to) next[to] = (next[to] ?? 0) + 1;
  return next;
}

function normalizePost(row: any): Post {
  return {
    ...row,
    // bigint comes back as a number or a string depending on size.
    comment_count: Number(row.comment_count ?? 0),
    reaction_counts: (row.reaction_counts ?? {}) as Partial<Record<Reaction, number>>,
    repost_of: row.repost_of ?? null,
    repost_source: (row.repost_source ?? null) as RepostSource | null,
    repost_count: Number(row.repost_count ?? 0),
    i_reposted: Boolean(row.i_reposted),
  };
}

export interface MediaScope {
  type: 'movie' | 'tv';
  id: string;
  /** Optional: narrow a show's discussion to one episode. */
  season?: number | null;
  episode?: number | null;
}

async function fetchPosts(
  targetUser: string | null,
  cursor?: PostCursor | null,
  targetChannel?: string | null,
  media?: MediaScope | null,
  targetPost?: string | null
): Promise<Post[]> {
  const { data, error } = await supabase.rpc('get_posts', {
    target_user: targetUser,
    before_created: cursor?.created_at ?? null,
    before_id: cursor?.id ?? null,
    page_size: PAGE_SIZE,
    target_channel: targetChannel ?? null,
    target_media_type: media?.type ?? null,
    target_media_id: media?.id ?? null,
    target_post: targetPost ?? null,
    target_season: media?.season ?? null,
    target_episode: media?.episode ?? null,
  });

  if (error) throw error;
  return (data as any[]).map(normalizePost);
}

/** A single post, for permalinks. Null when it doesn't exist or RLS hides it. */
export async function getPostById(id: string): Promise<Post | null> {
  const rows = await fetchPosts(null, null, null, null, id);
  return rows[0] ?? null;
}

/** Your posts plus your friends', newest first. */
export function getFeed(cursor?: PostCursor | null): Promise<Post[]> {
  return fetchPosts(null, cursor);
}

/** One person's timeline. RLS still decides what's actually visible. */
export function getUserPosts(userId: string, cursor?: PostCursor | null): Promise<Post[]> {
  return fetchPosts(userId, cursor);
}

/** Posts in one channel, newest first. */
export function getChannelPosts(channelId: string, cursor?: PostCursor | null): Promise<Post[]> {
  return fetchPosts(null, cursor, channelId);
}

/**
 * Everything posted about one title — the "Friends" tab on a movie or
 * show page. These are ordinary posts carrying a media attachment, so
 * they also appear in the friends feed and support the same reactions,
 * replies and moderation without a parallel system.
 */
export function getTitlePosts(
  mediaType: 'movie' | 'tv',
  mediaId: string | number,
  cursor?: PostCursor | null,
  scope?: { season?: number | null; episode?: number | null }
): Promise<Post[]> {
  return fetchPosts(null, cursor, null, {
    type: mediaType,
    id: String(mediaId),
    season: scope?.season ?? null,
    episode: scope?.episode ?? null,
  });
}

export async function createPost(input: CreatePostInput): Promise<void> {
  const userId = await requireUserId();

  const { error } = await supabase.from('posts').insert({
    user_id: userId,
    body: input.body.trim(),
    image_url: input.imageUrl ?? null,
    channel_id: input.channelId ?? null,
    // The channel_posts_are_public constraint requires this, so force it
    // here rather than letting the insert fail on a mismatch.
    visibility: input.channelId ? 'public' : input.visibility,
    media_type: input.media?.type ?? null,
    media_id: input.media ? String(input.media.id) : null,
    media_title: input.media?.title ?? null,
    poster_path: input.media?.posterPath ?? null,
    season: input.media?.season ?? null,
    episode: input.media?.episode ?? null,
    repost_of: input.repostOf ?? null,
  });

  if (error) throw error;
}

/**
 * Plain repost — no commentary. Reposting a repost targets the original
 * so chains can't form; the DB rejects a self-reference either way.
 */
export async function repost(post: Post): Promise<void> {
  const userId = await requireUserId();
  const targetId = post.repost_of ?? post.id;

  const { error } = await supabase.from('posts').insert({
    user_id: userId,
    body: '',
    // A repost of a friends-only post stays friends-only: widening it
    // would expose the original to people the author didn't share with.
    visibility: post.visibility,
    repost_of: targetId,
  });
  if (error) throw error;
}

/** Removes your plain repost of a post. Quote reposts are deleted as posts. */
export async function undoRepost(post: Post): Promise<void> {
  const userId = await requireUserId();
  const targetId = post.repost_of ?? post.id;

  const { error } = await supabase
    .from('posts')
    .delete()
    .eq('user_id', userId)
    .eq('repost_of', targetId)
    .eq('body', '');
  if (error) throw error;
}

export async function updatePost(id: string, body: string): Promise<void> {
  const { error } = await supabase.from('posts').update({ body: body.trim() }).eq('id', id);
  if (error) throw error;
}

export async function deletePost(id: string): Promise<void> {
  const { error } = await supabase.from('posts').delete().eq('id', id);
  if (error) throw error;
}

/**
 * Sets, switches, or clears your reaction. Passing null removes it.
 *
 * The upsert relies on the (post_id, user_id) primary key as its conflict
 * target — which is also why post_reactions needs an UPDATE policy, since
 * PostgREST emits ON CONFLICT DO UPDATE here.
 */
export async function setReaction(postId: string, reaction: Reaction | null): Promise<void> {
  const userId = await requireUserId();

  if (reaction === null) {
    const { error } = await supabase
      .from('post_reactions')
      .delete()
      .eq('post_id', postId)
      .eq('user_id', userId);
    if (error) throw error;
    return;
  }

  const { error } = await supabase
    .from('post_reactions')
    .upsert({ post_id: postId, user_id: userId, reaction }, { onConflict: 'post_id,user_id' });
  if (error) throw error;
}

/**
 * Comments for one post, oldest first, with author profiles attached.
 *
 * Two queries rather than a join: PostgREST can't auto-join to
 * `profiles_public` because a view has no foreign keys.
 */
export async function getComments(postId: string): Promise<PostComment[]> {
  const me = await currentUserId();

  const { data, error } = await supabase
    .from('post_comments')
    .select('*')
    .eq('post_id', postId)
    .order('created_at', { ascending: true });

  if (error) throw error;

  const rows = data as {
    id: string;
    post_id: string;
    user_id: string;
    parent_id: string | null;
    body: string;
    created_at: string;
    edited_at: string | null;
  }[];

  if (rows.length === 0) return [];

  // Reactions for every comment in one round trip rather than per comment.
  //
  // Non-fatal on purpose: comment_reactions only exists once migration
  // 0005 has been applied, and comments themselves should keep working
  // in the meantime rather than the whole thread failing to load.
  let reactionRows: { comment_id: string; user_id: string; reaction: Reaction }[] = [];
  try {
    const { data: rx, error: reactionError } = await supabase
      .from('comment_reactions')
      .select('comment_id, user_id, reaction')
      .in('comment_id', rows.map((r) => r.id));
    if (!reactionError && rx) reactionRows = rx as typeof reactionRows;
  } catch {
    // Table not migrated yet — render comments without reactions.
  }

  const counts = new Map<string, Partial<Record<Reaction, number>>>();
  const mine = new Map<string, Reaction>();
  for (const r of reactionRows) {
    const bucket = counts.get(r.comment_id) ?? {};
    bucket[r.reaction] = (bucket[r.reaction] ?? 0) + 1;
    counts.set(r.comment_id, bucket);
    if (r.user_id === me) mine.set(r.comment_id, r.reaction);
  }

  const profiles = await fetchProfiles(rows.map((r) => r.user_id));

  const byId = new Map<string, PostComment>();
  for (const r of rows) {
    byId.set(r.id, {
      ...r,
      author: profiles.get(r.user_id) ?? null,
      reaction_counts: counts.get(r.id) ?? {},
      my_reaction: mine.get(r.id) ?? null,
      replies: [],
    });
  }

  // Nest one level. A reply whose parent is missing (deleted, or itself a
  // reply) is promoted to top level rather than vanishing.
  const roots: PostComment[] = [];
  for (const comment of byId.values()) {
    const parent = comment.parent_id ? byId.get(comment.parent_id) : null;
    if (parent && !parent.parent_id) parent.replies.push(comment);
    else roots.push(comment);
  }

  return roots;
}

export async function addComment(
  postId: string,
  body: string,
  parentId?: string | null
): Promise<void> {
  const userId = await requireUserId();

  const { error } = await supabase.from('post_comments').insert({
    post_id: postId,
    user_id: userId,
    parent_id: parentId ?? null,
    body: body.trim(),
  });
  if (error) throw error;
}

export async function setCommentReaction(
  commentId: string,
  reaction: Reaction | null
): Promise<void> {
  const userId = await requireUserId();

  if (reaction === null) {
    const { error } = await supabase
      .from('comment_reactions')
      .delete()
      .eq('comment_id', commentId)
      .eq('user_id', userId);
    if (error) throw error;
    return;
  }

  const { error } = await supabase
    .from('comment_reactions')
    .upsert({ comment_id: commentId, user_id: userId, reaction }, { onConflict: 'comment_id,user_id' });
  if (error) throw error;
}

/** Who reacted to a post, for the reactions detail list. */
export async function getReactors(postId: string): Promise<Reactor[]> {
  const { data, error } = await supabase
    .from('post_reactions')
    .select('user_id, reaction')
    .eq('post_id', postId);

  if (error) throw error;

  const rows = (data ?? []) as { user_id: string; reaction: Reaction }[];
  const profiles = await fetchProfiles(rows.map((r) => r.user_id));

  return rows.map((r) => ({ profile: profiles.get(r.user_id) ?? null, reaction: r.reaction }));
}

/**
 * Live feed updates. Fires on any change to posts, comments or reactions
 * that the viewer is allowed to see — RLS scopes the stream server-side.
 *
 * Needs those tables in the supabase_realtime publication (0005 adds
 * them); without it the subscription silently receives nothing.
 */
export function subscribeToFeed(onChange: () => void): () => void {
  const channel = supabase.channel(`feed:${crypto.randomUUID()}`);

  for (const table of ['posts', 'post_comments', 'post_reactions'] as const) {
    channel.on('postgres_changes', { event: '*', schema: 'public', table }, () => onChange());
  }

  channel.subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}

export async function updateComment(id: string, body: string): Promise<void> {
  const { error } = await supabase
    .from('post_comments')
    .update({ body: body.trim() })
    .eq('id', id);
  if (error) throw error;
}

export async function deleteComment(id: string): Promise<void> {
  const { error } = await supabase.from('post_comments').delete().eq('id', id);
  if (error) throw error;
}

/** Short relative time ("2h", "3d"). The app has no date library. */
export function timeAgo(iso: string): string {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(iso).toLocaleDateString();
}
