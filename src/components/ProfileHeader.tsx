'use client';

import React from 'react';
import Image from 'next/image';
import FriendAvatar from './FriendAvatar';
import type { PublicProfile } from '@/lib/friends';

interface ProfileHeaderProps {
  profile: Pick<PublicProfile, 'username' | 'display_name' | 'avatar_url' | 'cover_url' | 'bio'>;
  /** Edit button, friend controls, etc. */
  actions?: React.ReactNode;
}

const ProfileHeader = ({ profile, actions }: ProfileHeaderProps) => {
  return (
    <div className="rounded-3xl overflow-hidden bg-white/[0.02] border border-white/5">
      <div className="relative w-full aspect-[3/1] bg-card">
        {profile.cover_url ? (
          // next/image here (unlike the avatar) because covers are 1600px
          // wide and always Supabase-hosted, so the optimizer and srcset
          // actually earn their keep.
          <Image
            src={profile.cover_url}
            alt=""
            fill
            sizes="100vw"
            className="object-cover"
            priority
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-accent/20 via-accent/5 to-transparent" />
        )}
      </div>

      <div className="px-6 pb-6">
        {/* Pulled up so the avatar straddles the cover's bottom edge. */}
        <div className="flex items-end justify-between gap-4 -mt-12 mb-4">
          {/* relative z-10 is required, not cosmetic: the cover above is
              position:relative, and a positioned element paints over a
              non-positioned sibling regardless of DOM order — which
              clipped the top half of this avatar. */}
          <div className="relative z-10 rounded-full ring-4 ring-background">
            <FriendAvatar profile={profile} size={96} />
          </div>
          {actions && <div className="pb-1">{actions}</div>}
        </div>

        <div className="space-y-2">
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight">
              {profile.display_name || profile.username}
            </h1>
            <p className="text-sm text-muted">@{profile.username}</p>
          </div>
          {profile.bio && (
            <p className="text-sm text-white/70 leading-relaxed max-w-2xl whitespace-pre-line">
              {profile.bio}
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default ProfileHeader;
