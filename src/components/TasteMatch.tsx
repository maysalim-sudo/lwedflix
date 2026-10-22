'use client';

import React, { useEffect, useState } from 'react';
import { getTasteMatch, type TasteMatch as Match } from '@/lib/insights';
import { Sparkles } from 'lucide-react';

/**
 * How much of what you've each watched overlaps.
 *
 * Not "rating agreement" — nothing in the app records per-title ratings,
 * so a percentage of agreement would be fabricated. This is a Jaccard
 * overlap of watch history, which the data genuinely supports.
 */
const TasteMatch = ({ friendId, friendName }: { friendId: string; friendName: string }) => {
  const [match, setMatch] = useState<Match | null>(null);

  useEffect(() => {
    let cancelled = false;
    getTasteMatch(friendId)
      .then((m) => !cancelled && setMatch(m))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [friendId]);

  // Nothing in common yet isn't worth a card.
  if (!match || match.shared_count === 0) return null;

  return (
    <div className="p-5 rounded-3xl bg-white/[0.02] border border-white/5 space-y-3">
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-2xl bg-accent/20 border border-accent/20 flex items-center justify-center text-accent shrink-0">
          <Sparkles size={20} />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-bold text-white">
            {match.overlap_pct}% taste overlap
          </p>
          <p className="text-[11px] text-muted">
            {match.shared_count} title{match.shared_count === 1 ? '' : 's'} you&apos;ve both watched
          </p>
        </div>
      </div>

      {match.sample_titles.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {match.sample_titles.map((t) => (
            <span
              key={t}
              className="px-2.5 py-1 rounded-lg bg-white/5 border border-white/5 text-[11px] text-white/70"
            >
              {t}
            </span>
          ))}
        </div>
      )}

      <p className="text-[10px] text-muted">
        Based on what you and {friendName} have each opened — not on ratings.
      </p>
    </div>
  );
};

export default TasteMatch;
