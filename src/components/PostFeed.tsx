'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import useInView from '@/hooks/useInView';
import PostCard from './PostCard';
import {
  getFeed,
  getUserPosts,
  getChannelPosts,
  getTitlePosts,
  subscribeToFeed,
  PAGE_SIZE,
  type Post,
  type PostCursor,
} from '@/lib/posts';
import { Loader2, MessageSquare, AlertCircle } from 'lucide-react';

interface PostFeedProps {
  /** Omit for the friends feed; pass a user id for a profile timeline. */
  userId?: string;
  /** Pass a channel id for a channel feed. Takes precedence over userId. */
  channelId?: string;
  /** Pass a title for the per-title discussion. Takes precedence over both. */
  media?: { type: 'movie' | 'tv'; id: string | number; season?: number | null; episode?: number | null } | null;
  /** Bump to force a reload — used after the composer publishes. */
  refreshKey?: number;
  emptyTitle?: string;
  emptyBody?: string;
}

const PostFeed = ({
  userId,
  channelId,
  media = null,
  refreshKey = 0,
  emptyTitle = 'Nothing here yet',
  emptyBody = 'Posts from you and your friends will show up here.',
}: PostFeedProps) => {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadMoreRef = useRef<HTMLDivElement>(null);
  const isInView = useInView(loadMoreRef);

  // Kept as primitives in the dep list: an inline `media` object would be
  // a new reference every render and re-fetch the feed in a loop.
  const mediaType = media?.type ?? null;
  const mediaId = media?.id == null ? null : String(media.id);
  const mediaSeason = media?.season ?? null;
  const mediaEpisode = media?.episode ?? null;

  const fetchPage = useCallback(
    (cursor?: PostCursor | null) => {
      if (mediaType && mediaId)
        return getTitlePosts(mediaType, mediaId, cursor, {
          season: mediaSeason,
          episode: mediaEpisode,
        });
      if (channelId) return getChannelPosts(channelId, cursor);
      if (userId) return getUserPosts(userId, cursor);
      return getFeed(cursor);
    },
    [userId, channelId, mediaType, mediaId, mediaSeason, mediaEpisode]
  );

  // Initial load, and whenever the feed is asked to refresh.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchPage(null)
      .then((rows) => {
        if (cancelled) return;
        setPosts(rows);
        setHasMore(rows.length === PAGE_SIZE);
        setError(null);
      })
      .catch((err: any) => {
        if (!cancelled) setError(err?.message ?? 'Could not load posts.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [fetchPage, refreshKey]);

  // Live updates. Any change to posts/comments/reactions refetches page 1
  // and merges it in: new posts get prepended, and existing rows have
  // their counts refreshed. Merging rather than replacing keeps whatever
  // the viewer has already paged in, and avoids yanking their scroll.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;

    const unsubscribe = subscribeToFeed(() => {
      // Debounced: one burst of activity shouldn't mean many refetches.
      if (timer) clearTimeout(timer);
      timer = setTimeout(async () => {
        try {
          const fresh = await fetchPage(null);
          setPosts((prev) => {
            if (prev.length === 0) return fresh;
            const freshById = new Map(fresh.map((p) => [p.id, p]));
            const seen = new Set(prev.map((p) => p.id));
            const added = fresh.filter((p) => !seen.has(p.id));
            const updated = prev.map((p) => freshById.get(p.id) ?? p);
            return [...added, ...updated];
          });
        } catch {
          // Transient; the next event or a manual reload will recover.
        }
      }, 700);
    });

    return () => {
      if (timer) clearTimeout(timer);
      unsubscribe();
    };
  }, [fetchPage]);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore || posts.length === 0) return;
    setLoadingMore(true);
    try {
      const last = posts[posts.length - 1];
      // Composite cursor: a timestamp alone would skip rows whenever two
      // posts share one.
      const rows = await fetchPage({ created_at: last.created_at, id: last.id });
      setPosts((prev) => {
        const seen = new Set(prev.map((p) => p.id));
        return [...prev, ...rows.filter((r) => !seen.has(r.id))];
      });
      setHasMore(rows.length === PAGE_SIZE);
    } catch (err: any) {
      setError(err?.message ?? 'Could not load more posts.');
      setHasMore(false);
    } finally {
      setLoadingMore(false);
    }
  }, [posts, hasMore, loadingMore, fetchPage]);

  useEffect(() => {
    if (isInView && hasMore && !loading && !loadingMore) loadMore();
  }, [isInView, hasMore, loading, loadingMore, loadMore]);

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="animate-spin text-accent" size={32} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-4 flex items-start space-x-3 text-red-400 text-sm">
          <AlertCircle size={18} className="shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {posts.length === 0 && !error ? (
        <div className="py-20 text-center space-y-6">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-white/5 border border-white/10 text-white/20">
            <MessageSquare size={32} />
          </div>
          <div className="space-y-2">
            <h3 className="text-xl font-bold">{emptyTitle}</h3>
            <p className="text-muted max-w-xs mx-auto text-sm">{emptyBody}</p>
          </div>
        </div>
      ) : (
        posts.map((post) => (
          <PostCard
            key={post.id}
            post={post}
            onChanged={(updated) =>
              setPosts((prev) => prev.map((p) => (p.id === updated.id ? updated : p)))
            }
            onDeleted={(id) => setPosts((prev) => prev.filter((p) => p.id !== id))}
          />
        ))
      )}

      {hasMore && posts.length > 0 && (
        <div ref={loadMoreRef} className="flex justify-center py-8">
          {loadingMore && <Loader2 className="animate-spin text-accent" size={24} />}
        </div>
      )}
    </div>
  );
};

export default PostFeed;
