'use client';

import React, { useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { REACTIONS, type Reaction } from '@/lib/watchRoom';

export interface FloatingReaction {
  id: string;
  emoji: Reaction;
  name: string;
  /** Horizontal start, as a percentage of the player's width. */
  x: number;
}

/** Reactions rising over the video. Goes in the player's overlay, so fullscreen shows them too. */
export const ReactionsOverlay = ({ reactions }: { reactions: FloatingReaction[] }) => (
  <AnimatePresence>
    {reactions.map((r) => (
      <motion.div
        key={r.id}
        initial={{ opacity: 0, y: 0, scale: 0.6 }}
        animate={{ opacity: [0, 1, 1, 0], y: -240, scale: 1.1 }}
        transition={{ duration: 2.6, ease: 'easeOut' }}
        className="absolute bottom-6 flex flex-col items-center"
        style={{ left: `${r.x}%` }}
      >
        <span className="text-4xl drop-shadow-[0_4px_12px_rgba(0,0,0,0.6)]">{r.emoji}</span>
        <span className="mt-0.5 px-1.5 rounded-md bg-black/60 text-[10px] font-bold text-white/80 whitespace-nowrap">
          {r.name}
        </span>
      </motion.div>
    ))}
  </AnimatePresence>
);

/** The row of reaction buttons. Rate-limited, so holding one down can't flood the room. */
export const ReactionBar = ({ onReact }: { onReact: (emoji: Reaction) => void }) => {
  const last = useRef(0);
  return (
    <div className="flex items-center gap-1">
      {REACTIONS.map((emoji) => (
        <button
          key={emoji}
          onClick={() => {
            if (Date.now() - last.current < 350) return;
            last.current = Date.now();
            onReact(emoji);
          }}
          className="w-9 h-9 rounded-xl text-lg hover:bg-white/10 active:scale-90 transition-all"
          aria-label={`React ${emoji}`}
        >
          {emoji}
        </button>
      ))}
    </div>
  );
};
