'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import FriendAvatar from './FriendAvatar';
import { useAuth } from './AuthProvider';
import { searchUsers, type PublicProfile } from '@/lib/friends';
import { Users, Loader2 } from 'lucide-react';

/** People matching the global search query. Hidden entirely when there are none. */
const UserSearchResults = ({ query }: { query: string }) => {
  const { user } = useAuth();
  const [people, setPeople] = useState<PublicProfile[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // searchUsers reads profiles_public, which is authenticated-only.
    if (!user || query.trim().length < 2) {
      setPeople([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    searchUsers(query)
      .then((r) => !cancelled && setPeople(r))
      .catch(() => !cancelled && setPeople([]))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [query, user]);

  if (!user) return null;
  if (!loading && people.length === 0) return null;

  return (
    <div className="space-y-4">
      <h2 className="flex items-center gap-2 text-xl font-bold text-white">
        <Users size={20} className="text-accent" />
        <span>People</span>
      </h2>

      {loading ? (
        <div className="flex justify-center py-6">
          <Loader2 className="animate-spin text-white/30" size={20} />
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {people.map((p) => (
            <Link
              key={p.id}
              href={`/u/${p.username}`}
              className="flex items-center gap-3 p-4 rounded-2xl bg-white/[0.02] border border-white/5 hover:border-white/10 transition-colors group/p"
            >
              <FriendAvatar profile={p} size={40} />
              <div className="min-w-0">
                <p className="text-sm font-bold text-white truncate group-hover/p:text-accent transition-colors">
                  {p.display_name || p.username}
                </p>
                <p className="text-xs text-muted truncate">@{p.username}</p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
};

export default UserSearchResults;
