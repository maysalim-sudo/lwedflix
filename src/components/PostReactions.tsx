'use client';

import React, { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { SmilePlus } from 'lucide-react';
import PostReactors from './PostReactors';
import {
  REACTIONS,
  REACTION_EMOJI,
  REACTION_LABEL,
  setReaction,
  applyReactionDelta,
  type Reaction,
} from '@/lib/posts';

interface PostReactionsProps {
  postId: string;
  counts: Partial<Record<Reaction, number>>;
  myReaction: Reaction | null;
  /** Parent keeps the post row in sync so a refetch isn't needed. */
  onChanged: (next: { myReaction: Reaction | null; counts: Partial<Record<Reaction, number>> }) => void;
}

const PostReactions = ({ postId, counts, myReaction, onChanged }: PostReactionsProps) => {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showReactors, setShowReactors] = useState(false);

  const total = Object.values(counts).reduce((sum, n) => sum + (n ?? 0), 0);
  const present = REACTIONS.filter((r) => (counts[r] ?? 0) > 0);

  const choose = async (reaction: Reaction) => {
    if (busy) return;
    setOpen(false);

    // Clicking your current reaction clears it.
    const target = myReaction === reaction ? null : reaction;
    const previousReaction = myReaction;
    const previousCounts = counts;

    // Optimistic: reactions should feel instant.
    onChanged({ myReaction: target, counts: applyReactionDelta(counts, myReaction, target) });
    setBusy(true);

    try {
      await setReaction(postId, target);
    } catch {
      onChanged({ myReaction: previousReaction, counts: previousCounts });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-3">
      <div
        className="relative"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
      >
        <button
          onClick={() => (myReaction ? choose(myReaction) : setOpen((v) => !v))}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors ${
            myReaction
              ? 'bg-accent/10 border-accent/30 text-accent'
              : 'bg-white/5 border-white/10 text-white/50 hover:text-white hover:bg-white/10'
          }`}
        >
          {myReaction ? (
            <>
              <span className="text-sm leading-none">{REACTION_EMOJI[myReaction]}</span>
              <span>{REACTION_LABEL[myReaction]}</span>
            </>
          ) : (
            <>
              <SmilePlus size={14} />
              <span>React</span>
            </>
          )}
        </button>

        <AnimatePresence>
          {open && (
            <motion.div
              initial={{ opacity: 0, y: 6, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 6, scale: 0.95 }}
              transition={{ duration: 0.12 }}
              // Sits above the row without displacing it.
              className="absolute bottom-full left-0 mb-2 z-20 flex items-center gap-1 p-1.5 rounded-2xl bg-card border border-white/10 shadow-2xl"
            >
              {REACTIONS.map((r) => (
                <button
                  key={r}
                  onClick={() => choose(r)}
                  title={REACTION_LABEL[r]}
                  className={`w-9 h-9 rounded-xl text-lg leading-none flex items-center justify-center hover:bg-white/10 hover:scale-110 transition-all ${
                    myReaction === r ? 'bg-accent/20' : ''
                  }`}
                >
                  {REACTION_EMOJI[r]}
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {total > 0 && (
        <button
          onClick={() => setShowReactors(true)}
          className="flex items-center gap-1.5 text-xs text-muted hover:text-white transition-colors"
          title="See who reacted"
        >
          <span className="flex -space-x-1">
            {present.map((r) => (
              <span key={r} className="text-sm leading-none" title={`${counts[r]} ${REACTION_LABEL[r]}`}>
                {REACTION_EMOJI[r]}
              </span>
            ))}
          </span>
          <span>{total}</span>
        </button>
      )}

      {showReactors && <PostReactors postId={postId} onClose={() => setShowReactors(false)} />}
    </div>
  );
};

export default PostReactions;
