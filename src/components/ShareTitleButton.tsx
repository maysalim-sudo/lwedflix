'use client';

import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import FriendAvatar from './FriendAvatar';
import ModalPortal from './ModalPortal';
import { useAuth } from './AuthProvider';
import { getFriends, type Friend } from '@/lib/friends';
import { shareTitle } from '@/lib/dm';
import { shareUrl } from '@/lib/shareLink';
import {
  Share2,
  Loader2,
  Check,
  X,
  AlertCircle,
  Users,
  Search,
  Link2,
} from 'lucide-react';

interface ShareTitleButtonProps {
  mediaType: 'movie' | 'tv';
  mediaId: string | number;
  title: string;
  posterPath?: string | null;
  season?: number | null;
  episode?: number | null;
}

/**
 * Share a title: copy its link, or send it to a friend as a DM.
 *
 * Distinct from Recommend, which adds to a shared watchlist. This one
 * starts a conversation instead — the same title, but as something to
 * talk about rather than a list entry.
 */
const ShareTitleButton = ({
  mediaType,
  mediaId,
  title,
  posterPath,
  season,
  episode,
}: ShareTitleButtonProps) => {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [loading, setLoading] = useState(false);
  const [sentTo, setSentTo] = useState<Set<string>>(new Set());
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [note, setNote] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open || friends.length > 0) return;
    setLoading(true);
    getFriends()
      .then(setFriends)
      .catch(() => setFriends([]))
      .finally(() => setLoading(false));
  }, [open, friends.length]);

  const path =
    mediaType === 'tv'
      ? `/tv/${mediaId}${season ? `?season=${season}&episode=${episode ?? 1}` : ''}`
      : `/movie/${mediaId}`;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl(path));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Couldn't copy to the clipboard.");
    }
  };

  const send = async (friendId: string) => {
    setBusyId(friendId);
    setError(null);
    try {
      await shareTitle(
        friendId,
        {
          type: mediaType,
          id: mediaId,
          title,
          posterPath: posterPath ?? null,
          season: season ?? null,
          episode: episode ?? null,
        },
        note
      );
      setSentTo((prev) => new Set(prev).add(friendId));
    } catch (err: any) {
      setError(err?.message ?? 'Could not send that.');
    } finally {
      setBusyId(null);
    }
  };

  const q = query.trim().toLowerCase();
  const visible = q
    ? friends.filter(
        (f) =>
          f.profile.username.toLowerCase().includes(q) ||
          (f.profile.display_name ?? '').toLowerCase().includes(q)
      )
    : friends;

  return (
    <>
      <button
        onClick={() => (user ? setOpen(true) : copyLink())}
        className="flex items-center gap-2 px-5 py-3 rounded-2xl bg-white/5 border border-white/10 text-white text-sm font-bold hover:bg-white/10 transition-all"
        title={user ? 'Share this title' : 'Copy link'}
      >
        {copied ? <Check size={16} className="text-accent" /> : <Share2 size={16} />}
        <span>{copied ? 'Copied' : 'Share'}</span>
      </button>

      <AnimatePresence>
        {open && (
          <ModalPortal>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
              className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm flex items-center justify-center p-6"
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.96, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96, y: 10 }}
                onClick={(e) => e.stopPropagation()}
                className="w-full max-w-md rounded-3xl bg-card border border-white/10 shadow-2xl overflow-hidden"
              >
                <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-white truncate">Share {title}</p>
                    <p className="text-[11px] text-muted">Send it to a friend, or copy the link.</p>
                  </div>
                  <button
                    onClick={() => setOpen(false)}
                    className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/5 transition-colors shrink-0"
                    aria-label="Close"
                  >
                    <X size={16} />
                  </button>
                </div>

                <div className="p-4 space-y-3">
                  <button
                    onClick={copyLink}
                    className="w-full flex items-center gap-2.5 px-4 py-3 rounded-2xl bg-white/5 border border-white/10 text-sm font-bold text-white hover:bg-white/10 transition-colors"
                  >
                    {copied ? (
                      <Check size={15} className="text-accent" />
                    ) : (
                      <Link2 size={15} />
                    )}
                    <span>{copied ? 'Link copied' : 'Copy link'}</span>
                  </button>

                  {error && (
                    <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-3 flex items-start gap-2 text-red-400 text-xs">
                      <AlertCircle size={14} className="shrink-0 mt-0.5" />
                      <span>{error}</span>
                    </div>
                  )}

                  <input
                    value={note}
                    onChange={(e) => setNote(e.target.value.slice(0, 400))}
                    placeholder="Add a message (optional)…"
                    className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-2.5 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-accent/40 transition-colors"
                  />

                  <div className="relative">
                    <Search
                      size={14}
                      className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/30"
                    />
                    <input
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Search friends…"
                      className="w-full bg-white/5 border border-white/10 rounded-2xl pl-9 pr-4 py-2.5 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-accent/40 transition-colors"
                    />
                  </div>

                  <div className="max-h-64 overflow-y-auto space-y-1">
                    {loading ? (
                      <div className="flex justify-center py-8">
                        <Loader2 className="animate-spin text-accent" size={22} />
                      </div>
                    ) : visible.length === 0 ? (
                      <div className="py-8 text-center space-y-2">
                        <Users size={26} className="mx-auto text-white/15" />
                        <p className="text-xs text-muted">
                          {friends.length === 0
                            ? 'Add friends to share titles with them.'
                            : 'No friends match that search.'}
                        </p>
                      </div>
                    ) : (
                      visible.map((f) => {
                        const done = sentTo.has(f.profile.id);
                        return (
                          <button
                            key={f.profile.id}
                            onClick={() => !done && send(f.profile.id)}
                            disabled={done || busyId === f.profile.id}
                            className="w-full flex items-center gap-3 p-2.5 rounded-2xl hover:bg-white/5 disabled:opacity-60 transition-colors text-left"
                          >
                            <FriendAvatar profile={f.profile} size={36} />
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-bold text-white truncate">
                                {f.profile.display_name || f.profile.username}
                              </p>
                              <p className="text-[11px] text-muted truncate">
                                @{f.profile.username}
                              </p>
                            </div>
                            {busyId === f.profile.id ? (
                              <Loader2 size={16} className="animate-spin text-accent shrink-0" />
                            ) : done ? (
                              <span className="flex items-center gap-1 text-[10px] font-bold text-accent uppercase tracking-widest shrink-0">
                                <Check size={13} />
                                Sent
                              </span>
                            ) : null}
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              </motion.div>
            </motion.div>
          </ModalPortal>
        )}
      </AnimatePresence>
    </>
  );
};

export default ShareTitleButton;
