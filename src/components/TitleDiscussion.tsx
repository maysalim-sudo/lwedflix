'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useAuth } from './AuthProvider';
import PostComposer from './PostComposer';
import PostFeed from './PostFeed';
import ReviewSection from './ReviewSection';
import { Users, Star, Tv as TvIcon } from 'lucide-react';

interface TitleDiscussionProps {
  mediaType: 'movie' | 'tv';
  mediaId: string | number;
  title: string;
  posterPath?: string | null;
  season?: number | null;
  episode?: number | null;
  /** TMDB's own reviews, rendered by the existing ReviewSection. */
  reviews: any[];
}

type Tab = 'friends' | 'community';

/**
 * Friend comments and TMDB reviews for one title, behind a tab switch.
 *
 * The "friends" side is ordinary posts filtered by media attachment, not
 * a separate comment table — so anything written here also lands in the
 * friends feed and inherits reactions, replies and moderation.
 */
const TitleDiscussion = ({
  mediaType,
  mediaId,
  title,
  posterPath,
  season,
  episode,
  reviews,
}: TitleDiscussionProps) => {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>('friends');
  const [feedKey, setFeedKey] = useState(0);
  // TV only: whole-show discussion, or just this episode. Show-level posts
  // have null season/episode, so scoping is opt-in and never hides them
  // by default.
  const [episodeOnly, setEpisodeOnly] = useState(false);
  const canScope = mediaType === 'tv' && season != null && episode != null;

  const attachment = {
    type: mediaType,
    id: mediaId,
    title,
    posterPath: posterPath ?? null,
    season: season ?? null,
    episode: episode ?? null,
  };

  const tabClass = (active: boolean) =>
    `flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold uppercase tracking-widest transition-all ${
      active ? 'bg-accent text-white shadow-lg' : 'text-white/40 hover:text-white'
    }`;

  return (
    <div className="py-12 border-t border-white/5 space-y-6">
      <div className="flex items-center gap-2 p-1 bg-black/20 rounded-2xl w-fit">
        <button onClick={() => setTab('friends')} className={tabClass(tab === 'friends')}>
          <Users size={14} />
          <span>Friends</span>
        </button>
        <button onClick={() => setTab('community')} className={tabClass(tab === 'community')}>
          <Star size={14} />
          <span>Community Reviews</span>
          {reviews.length > 0 && (
            <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-white/20 text-white text-[10px] flex items-center justify-center">
              {reviews.length}
            </span>
          )}
        </button>
      </div>

      {tab === 'friends' ? (
        <div className="space-y-6">
          {user ? (
            <PostComposer
              attachment={attachment}
              onPosted={() => setFeedKey((k) => k + 1)}
              placeholder={`What did you think of ${title}?`}
            />
          ) : (
            <div className="p-6 rounded-3xl bg-white/[0.02] border border-white/5 text-center space-y-3">
              <p className="text-muted text-sm">Sign in to share your thoughts with friends.</p>
              <Link
                href={`/login?redirect=/${mediaType}/${mediaId}`}
                className="inline-block text-accent font-bold text-sm hover:underline"
              >
                Sign In
              </Link>
            </div>
          )}

          {canScope && (
            <div className="flex items-center gap-2 p-1 bg-black/20 rounded-2xl w-fit">
              <button
                onClick={() => setEpisodeOnly(false)}
                className={`px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all ${
                  !episodeOnly ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white'
                }`}
              >
                Whole show
              </button>
              <button
                onClick={() => setEpisodeOnly(true)}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all ${
                  episodeOnly ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white'
                }`}
              >
                <TvIcon size={11} />
                <span>S{season} E{episode}</span>
              </button>
            </div>
          )}

          <PostFeed
            media={{
              type: mediaType,
              id: mediaId,
              season: canScope && episodeOnly ? season : null,
              episode: canScope && episodeOnly ? episode : null,
            }}
            refreshKey={feedKey}
            emptyTitle="No one's said anything yet"
            emptyBody="Be the first to post about this — your friends will see it in their feed."
          />
        </div>
      ) : (
        // ReviewSection renders its own heading and empty state.
        <div className="-mt-12">
          <ReviewSection reviews={reviews} />
        </div>
      )}
    </div>
  );
};

export default TitleDiscussion;
