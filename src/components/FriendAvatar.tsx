'use client';

import React from 'react';
import { User } from 'lucide-react';
import type { PublicProfile } from '@/lib/friends';

interface FriendAvatarProps {
  profile: Pick<PublicProfile, 'username' | 'display_name' | 'avatar_url'>;
  size?: number;
}

/**
 * Avatar for another user. `avatar_url` is almost always null today
 * (nothing in the app populates it — it'd only come from an OAuth
 * provider), so the initial fallback is the common path, not the edge case.
 */
const FriendAvatar = ({ profile, size = 40 }: FriendAvatarProps) => {
  const label = profile.display_name || profile.username;
  const initial = label.trim().charAt(0).toUpperCase() || '?';

  return (
    <div
      className="rounded-full bg-accent/20 border border-accent/20 flex items-center justify-center text-accent font-bold overflow-hidden shrink-0"
      style={{ width: size, height: size, fontSize: size * 0.4 }}
    >
      {profile.avatar_url ? (
        // Not next/image: these are arbitrary third-party OAuth URLs, which
        // would need every possible host in next.config's image domains.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={profile.avatar_url} alt={label} className="w-full h-full object-cover" />
      ) : initial === '?' ? (
        <User size={size * 0.5} />
      ) : (
        <span>{initial}</span>
      )}
    </div>
  );
};

export default FriendAvatar;
