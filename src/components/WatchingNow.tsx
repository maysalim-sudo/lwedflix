'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import FriendAvatar from './FriendAvatar';
import UserLink from './UserLink';
import { getImageUrl } from '@/lib/imageUrl';
import {
  getFriendsWatching,
  subscribeToPresence,
  isFresh,
  STALE_AFTER_MS,
  type WatchingFriend,
} from '@/lib/presence';
import { Loader2, Tv as TvIcon, Film, EyeOff } from 'lucide-react';
import IncognitoToggle from './IncognitoToggle';

export function useFriendsWatching() {
  const [watching, setWatching] = useState<WatchingFriend[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setWatching(await getFriendsWatching());
    } catch {
      setWatching([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const unsubscribe = subscribeToPresence(load);

    // Rows expire by age rather than by an event, so re-filter on a timer
    // as well — otherwise someone who closed their tab would linger until
    // the next unrelated realtime message arrived.
    const sweep = setInterval(() => {
      setWatching((prev) => prev.filter((w) => isFresh(w.updated_at)));
    }, STALE_AFTER_MS / 3);

    return () => {
      unsubscribe();
      clearInterval(sweep);
    };
  }, [load]);

  return { watching, loading };
}

function watchHref(w: WatchingFriend) {
  if (!w.media_id || !w.media_type) return null;
  return w.media_type === 'tv'
    ? `/tv/${w.media_id}${w.season ? `?season=${w.season}&episode=${w.episode ?? 1}` : ''}`
    : `/movie/${w.media_id}`;
}

function Row({ w }: { w: WatchingFriend }) {
  const href = watchHref(w);

  const body = (
    <>
      <UserLink username={w.username} nested className="relative shrink-0 block">
        <FriendAvatar profile={w} size={36} />
        {/* Pulsing dot: this is live data, and it should look like it. */}
        <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-accent ring-2 ring-card">
          <span className="absolute inset-0 rounded-full bg-accent animate-ping opacity-75" />
        </span>
      </UserLink>

      <div className="min-w-0 flex-1">
        <UserLink username={w.username} nested>
          <p className="text-xs font-bold text-white truncate hover:text-accent transition-colors">
            {w.display_name || w.username}
          </p>
        </UserLink>
        <p className="flex items-center gap-1 text-[10px] text-muted truncate">
          {w.is_incognito ? (
            <EyeOff size={9} />
          ) : w.media_type === 'tv' ? (
            <TvIcon size={9} />
          ) : (
            <Film size={9} />
          )}
          <span
            className={`truncate ${
              w.is_incognito ? 'italic' : 'group-hover/row:text-accent transition-colors'
            }`}
          >
            {w.title}
          </span>
          {!w.is_incognito && w.season != null && w.episode != null && (
            <span className="shrink-0">· S{w.season}E{w.episode}</span>
          )}
        </p>
      </div>

      {/* No poster when incognito — the server never sent one. */}
      <div className="relative w-8 h-11 rounded-md overflow-hidden bg-card shrink-0 flex items-center justify-center">
        {w.is_incognito ? (
          <EyeOff size={13} className="text-white/20" />
        ) : (
          <Image
            src={getImageUrl(w.poster_path, 'w185')}
            alt={w.title}
            fill
            sizes="32px"
            className="object-cover"
          />
        )}
      </div>
    </>
  );

  // Incognito rows have no media to navigate to, so they aren't links.
  if (!href) {
    return <div className="flex items-center gap-3 p-2 rounded-xl">{body}</div>;
  }

  return (
    <Link
      href={href}
      className="flex items-center gap-3 p-2 rounded-xl hover:bg-white/5 transition-colors group/row"
    >
      {body}
    </Link>
  );
}

/** Inline list for the friends tab. */
const WatchingNow = () => {
  const { watching, loading } = useFriendsWatching();

  return (
    <div className="p-4 rounded-3xl bg-white/[0.02] border border-white/5 space-y-3">
      <div className="flex items-center justify-between px-1">
        <h2 className="text-sm font-bold text-white">Watching now</h2>
        {watching.length > 0 && (
          <span className="text-[10px] font-bold text-accent uppercase tracking-widest">
            {watching.length} live
          </span>
        )}
      </div>

      <IncognitoToggle />

      {loading ? (
        <div className="flex justify-center py-6">
          <Loader2 className="animate-spin text-white/30" size={18} />
        </div>
      ) : watching.length === 0 ? (
        <p className="text-xs text-muted px-1 py-2">
          No friends are watching anything right now.
        </p>
      ) : (
        <div className="space-y-1">
          {watching.map((w) => (
            <Row key={w.user_id} w={w} />
          ))}
        </div>
      )}
    </div>
  );
};

export { Row as WatchingRow };
export default WatchingNow;
