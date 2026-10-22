'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import FriendAvatar from './FriendAvatar';
import UserLink from './UserLink';
import SharedWatchlist from './SharedWatchlist';
import { getFriends, type Friend } from '@/lib/friends';
import { getSharedCounts } from '@/lib/sharedWatchlist';
import { Loader2, Users, ChevronDown, ChevronUp, Bookmark } from 'lucide-react';

/** Every shared list you have, grouped by friend, expandable in place. */
const SharedWatchlistsOverview = () => {
  const [friends, setFriends] = useState<Friend[]>([]);
  const [counts, setCounts] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [f, c] = await Promise.all([getFriends(), getSharedCounts()]);
      setFriends(f);
      setCounts(c);
    } catch {
      setFriends([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="animate-spin text-accent" size={28} />
      </div>
    );
  }

  if (friends.length === 0) {
    return (
      <div className="py-20 text-center space-y-6">
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-white/5 border border-white/10 text-white/20">
          <Users size={32} />
        </div>
        <div className="space-y-2">
          <h3 className="text-xl font-bold">No friends yet</h3>
          <p className="text-muted max-w-xs mx-auto text-sm">
            Add friends to start building watchlists together.
          </p>
        </div>
        <Link href="/friends?tab=people" className="inline-block text-accent font-bold hover:underline">
          Find people
        </Link>
      </div>
    );
  }

  // Friends with something shared come first — an empty list is the least
  // interesting thing to look at.
  const sorted = [...friends].sort(
    (a, b) => (counts.get(b.profile.id) ?? 0) - (counts.get(a.profile.id) ?? 0)
  );

  return (
    <div className="space-y-3">
      {sorted.map((f) => {
        const pending = counts.get(f.profile.id) ?? 0;
        const isOpen = expanded === f.profile.id;

        return (
          <div
            key={f.profile.id}
            className="rounded-2xl bg-white/[0.02] border border-white/5 overflow-hidden"
          >
            <button
              onClick={() => setExpanded(isOpen ? null : f.profile.id)}
              className="w-full flex items-center gap-3 p-4 hover:bg-white/[0.02] transition-colors text-left"
            >
              <UserLink username={f.profile.username} nested>
                <FriendAvatar profile={f.profile} size={40} />
              </UserLink>
              <div className="min-w-0 flex-1">
                <UserLink username={f.profile.username} nested>
                  <p className="text-sm font-bold text-white truncate hover:text-accent transition-colors">
                    {f.profile.display_name || f.profile.username}
                  </p>
                </UserLink>
                <p className="text-[11px] text-muted">
                  {pending > 0 ? `${pending} to watch together` : 'Nothing shared yet'}
                </p>
              </div>
              {pending > 0 && (
                <span className="min-w-[22px] h-[22px] px-1.5 rounded-full bg-accent text-white text-[11px] font-bold flex items-center justify-center shrink-0">
                  {pending}
                </span>
              )}
              {isOpen ? (
                <ChevronUp size={16} className="text-white/40 shrink-0" />
              ) : (
                <ChevronDown size={16} className="text-white/40 shrink-0" />
              )}
            </button>

            {/* Mounted only when opened, so this isn't N queries on load. */}
            {isOpen && (
              <div className="px-4 pb-4 border-t border-white/5 pt-4">
                <SharedWatchlist
                  friendId={f.profile.id}
                  friendName={f.profile.display_name || f.profile.username}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default SharedWatchlistsOverview;
