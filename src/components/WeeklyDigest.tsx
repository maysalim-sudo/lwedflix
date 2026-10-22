'use client';

import React, { useEffect, useState } from 'react';
import { useAuth } from './AuthProvider';
import { getWeeklyDigest, type WeeklyDigest as Digest } from '@/lib/insights';
import { Sparkles } from 'lucide-react';

/** Last seven days across your friends, in one line each. */
const WeeklyDigest = () => {
  const { user } = useAuth();
  const [digest, setDigest] = useState<Digest | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    getWeeklyDigest()
      .then((d) => !cancelled && setDigest(d))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [user]);

  if (!digest) return null;

  const stats = [
    { label: 'posts', value: digest.posts_this_week },
    { label: 'titles watched', value: digest.titles_watched },
    { label: 'reactions to you', value: digest.reactions_received },
    { label: 'replies to you', value: digest.comments_received },
  ].filter((s) => s.value > 0);

  // A digest of all zeros is noise, not information.
  if (stats.length === 0) return null;

  return (
    <div className="p-4 rounded-3xl bg-white/[0.02] border border-white/5 space-y-3">
      <div className="flex items-center gap-2 px-1">
        <Sparkles size={14} className="text-accent" />
        <h2 className="text-sm font-bold text-white">This week</h2>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {stats.map((s) => (
          <div key={s.label} className="px-3 py-2.5 rounded-2xl bg-black/20">
            <p className="text-lg font-bold text-white leading-none">{s.value}</p>
            <p className="text-[10px] text-muted mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {digest.top_title && (
        <p className="text-[11px] text-muted px-1">
          Most watched among friends: <span className="text-white/80">{digest.top_title}</span>
        </p>
      )}
    </div>
  );
};

export default WeeklyDigest;
