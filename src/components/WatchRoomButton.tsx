'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { startParty } from '@/lib/watchRoom';
import { Popcorn } from 'lucide-react';

interface WatchRoomButtonProps {
  mediaType: 'movie' | 'tv';
  mediaId: string | number;
  title: string;
  posterPath?: string | null;
  season?: number | null;
  episode?: number | null;
}

/**
 * Starts a watch party for this title and sends the host into it. Parties
 * are live rooms with no account required (see watchRoom.ts), so this is
 * shown to everyone.
 */
const WatchRoomButton = ({
  mediaType,
  mediaId,
  title,
  posterPath,
  season,
  episode,
}: WatchRoomButtonProps) => {
  const router = useRouter();

  const start = () => {
    const code = startParty({
      mediaType,
      mediaId: String(mediaId),
      title,
      posterPath: posterPath ?? null,
      season: season ?? null,
      episode: episode ?? null,
    });
    router.push(`/watch/${code}`);
  };

  return (
    <button
      onClick={start}
      className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-white/5 border border-white/10 text-white text-xs font-bold hover:bg-white/10 transition-all"
      title="Watch together with friends"
    >
      <Popcorn size={14} />
      <span>Watch party</span>
    </button>
  );
};

export default WatchRoomButton;
