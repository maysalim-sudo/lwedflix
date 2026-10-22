'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { supabase } from '@/lib/supabase';
import { useAuth } from './AuthProvider';
import { getImageUrl } from '@/lib/imageUrl';
import { getShowProgress } from '@/lib/episodeProgress';
import { Play, Loader2 } from 'lucide-react';

interface HistoryRow {
  id: string;
  movie_id: string;
  type: 'movie' | 'tv';
  title: string;
  poster_path: string | null;
  season: number | null;
  episode: number | null;
  watched_at: string;
}

/**
 * Picks up where you left off.
 *
 * Server-side watch_history gives the titles and last episode; the
 * per-episode percentage lives in localStorage (episodeProgress), so the
 * bar only appears for shows watched on this device.
 */
const ContinueWatching = () => {
  const { user } = useAuth();
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    supabase
      .from('watch_history')
      .select('*')
      .eq('user_id', user.id)
      .order('watched_at', { ascending: false })
      .limit(12)
      .then(({ data }) => {
        if (!cancelled) {
          setRows((data ?? []) as HistoryRow[]);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  if (!user || (!loading && rows.length === 0)) return null;

  const hrefFor = (r: HistoryRow) =>
    r.type === 'tv'
      ? `/tv/${r.movie_id}${r.season ? `?season=${r.season}&episode=${r.episode ?? 1}` : ''}`
      : `/movie/${r.movie_id}`;

  const percentFor = (r: HistoryRow) => {
    if (r.type !== 'tv' || r.season == null || r.episode == null) return 0;
    const pos = getShowProgress(r.movie_id).positions[`${r.season}-${r.episode}`];
    if (!pos || !(pos.duration > 0)) return 0;
    return Math.min(100, Math.round((pos.watched / pos.duration) * 100));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-white tracking-tight">Continue Watching</h2>
        <Link href="/history" className="text-xs font-bold text-accent uppercase tracking-widest hover:underline">
          See all
        </Link>
      </div>

      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="animate-spin text-accent" size={26} />
        </div>
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-2 -mx-1 px-1 snap-x no-scrollbar">
          {rows.map((r) => {
            const pct = percentFor(r);
            return (
              <Link
                key={r.id}
                href={hrefFor(r)}
                className="group relative flex-shrink-0 w-[150px] sm:w-[170px] snap-start"
              >
                <div className="relative aspect-[2/3] rounded-2xl overflow-hidden bg-card border border-white/5 group-hover:border-white/20 transition-all card-hover">
                  <Image
                    src={getImageUrl(r.poster_path, 'w342')}
                    alt={r.title}
                    fill
                    sizes="(max-width: 640px) 150px, 170px"
                    className="object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />

                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <span className="w-11 h-11 rounded-full bg-accent/90 flex items-center justify-center text-white">
                      <Play size={18} className="fill-current ml-0.5" />
                    </span>
                  </div>

                  {r.type === 'tv' && r.season != null && (
                    <span className="absolute top-2 left-2 px-2 py-0.5 rounded-md bg-black/70 backdrop-blur-md border border-white/10 text-[10px] font-bold text-white/90">
                      S{r.season} E{r.episode ?? 1}
                    </span>
                  )}

                  {pct > 0 && (
                    <span className="absolute bottom-0 left-0 right-0 h-1 bg-white/15">
                      <span className="block h-full bg-accent" style={{ width: `${pct}%` }} />
                    </span>
                  )}
                </div>
                <p className="mt-2 text-xs font-medium text-white/80 group-hover:text-white truncate transition-colors">
                  {r.title}
                </p>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ContinueWatching;
