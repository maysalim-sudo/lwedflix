'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, X } from 'lucide-react';
import FriendAvatar from './FriendAvatar';
import ModalPortal from './ModalPortal';
import { getReactors, REACTION_EMOJI, REACTION_LABEL, type Reactor } from '@/lib/posts';

interface PostReactorsProps {
  postId: string;
  onClose: () => void;
}

/** Modal listing who reacted and with what. */
const PostReactors = ({ postId, onClose }: PostReactorsProps) => {
  const [reactors, setReactors] = useState<Reactor[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    getReactors(postId)
      .then((r) => !cancelled && setReactors(r))
      .catch(() => !cancelled && setReactors([]))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [postId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <ModalPortal>
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[9990] bg-black/70 backdrop-blur-sm flex items-center justify-center p-6"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 10 }}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-sm bg-card border border-white/10 rounded-3xl shadow-2xl overflow-hidden"
        >
          <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
            <h3 className="text-sm font-bold text-white">
              Reactions {reactors.length > 0 && <span className="text-muted">({reactors.length})</span>}
            </h3>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/5 transition-colors"
            >
              <X size={16} />
            </button>
          </div>

          <div className="max-h-80 overflow-y-auto">
            {loading ? (
              <div className="flex justify-center py-10">
                <Loader2 className="animate-spin text-white/30" size={20} />
              </div>
            ) : reactors.length === 0 ? (
              <p className="text-muted text-sm text-center py-10">No reactions yet.</p>
            ) : (
              reactors.map((r, i) => (
                <div
                  key={`${r.profile?.id ?? i}`}
                  className="flex items-center gap-3 px-5 py-3 border-b border-white/[0.03] last:border-0"
                >
                  {r.profile ? (
                    <Link href={`/u/${r.profile.username}`} onClick={onClose}>
                      <FriendAvatar profile={r.profile} size={36} />
                    </Link>
                  ) : (
                    <div className="w-9 h-9 rounded-full bg-white/5" />
                  )}
                  <div className="min-w-0 flex-1">
                    {r.profile ? (
                      <Link
                        href={`/u/${r.profile.username}`}
                        onClick={onClose}
                        className="text-sm font-bold text-white hover:text-accent transition-colors block truncate"
                      >
                        {r.profile.display_name || r.profile.username}
                      </Link>
                    ) : (
                      <span className="text-sm text-white/50">Unknown</span>
                    )}
                    {r.profile && <p className="text-xs text-muted truncate">@{r.profile.username}</p>}
                  </div>
                  <span className="text-lg leading-none shrink-0" title={REACTION_LABEL[r.reaction]}>
                    {REACTION_EMOJI[r.reaction]}
                  </span>
                </div>
              ))
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
    </ModalPortal>
  );
};

export default PostReactors;
