'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { getImageUrl } from '@/lib/imageUrl';
import { getUserWatchlist, STATUS_LABEL, type WatchlistItem } from '@/lib/watchlist';
import { Bookmark, Star } from 'lucide-react';

/**
 * Someone else's watchlist on their profile.
 *
 * Renders nothing when the list is private or empty — the RPC applies
 * the public check server-side, so an empty result is the same shape as
 * "not shared", and neither deserves a heading.
 */
const PublicWatchlist = ({ ownerId }: { ownerId: string }) => {
  const [items, setItems] = useState<WatchlistItem[]>([]);

  useEffect(() => {
    let cancelled = false;
    getUserWatchlist(ownerId)
      .then((rows) => {
        if (!cancelled) setItems(rows);
      })
      .catch(() => {
        if (!cancelled) setItems([]);
      });
    return () => {
      cancelled = true;
    };
  }, [ownerId]);

  if (items.length === 0) return null;

  return (
    <div className="space-y-4">
      <h2 className="flex items-center gap-2 text-xl font-bold text-white">
        <Bookmark size={18} className="text-accent" />
        <span>Watch list</span>
        <span className="text-sm font-medium text-muted">({items.length})</span>
      </h2>

      <div className="grid grid-cols-3 md:grid-cols-6 gap-4">
        {items.slice(0, 12).map((item) => (
          <Link key={item.id} href={`/${item.type}/${item.movie_id}`} className="group block">
            <div className="relative aspect-[2/3] rounded-xl overflow-hidden bg-card">
              <Image
                src={getImageUrl(item.poster_path, 'w342')}
                alt={item.title}
                fill
                sizes="(max-width: 768px) 33vw, 16vw"
                className="object-cover group-hover:scale-105 transition-transform duration-300"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
              <span className="absolute bottom-2 left-2 text-[9px] font-bold uppercase tracking-wider text-white/80">
                {STATUS_LABEL[item.status]}
              </span>
              {item.rating != null && (
                <span className="absolute top-2 right-2 flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-black/70 text-[9px] font-bold">
                  <Star size={8} className="text-yellow-500 fill-yellow-500" />
                  {item.rating}
                </span>
              )}
            </div>
            <p className="mt-1.5 text-[11px] font-medium text-white/80 line-clamp-1 group-hover:text-accent transition-colors">
              {item.title}
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
};

export default PublicWatchlist;
