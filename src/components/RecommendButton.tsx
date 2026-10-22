'use client';

import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import FriendAvatar from './FriendAvatar';
import ModalPortal from './ModalPortal';
import { useAuth } from './AuthProvider';
import { getFriends, type Friend } from '@/lib/friends';
import { recommendToFriend } from '@/lib/sharedWatchlist';
import { getMyGroups, addGroupItem, type WatchlistGroup } from '@/lib/watchlistGroups';
import { Send, Loader2, Check, X, AlertCircle, Users, Search } from 'lucide-react';

interface RecommendButtonProps {
  mediaType: 'movie' | 'tv';
  mediaId: string | number;
  title: string;
  posterPath?: string | null;
}

/** Sends a title to a friend's shared watchlist with you. */
const RecommendButton = ({ mediaType, mediaId, title, posterPath }: RecommendButtonProps) => {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [loading, setLoading] = useState(false);
  const [sentTo, setSentTo] = useState<Set<string>>(new Set());
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const [groups, setGroups] = useState<WatchlistGroup[]>([]);

  // Groups load alongside friends so both targets appear in one list.
  useEffect(() => {
    if (!open) return;
    getMyGroups().then(setGroups).catch(() => setGroups([]));
  }, [open]);

  useEffect(() => {
    if (!open || friends.length > 0) return;
    setLoading(true);
    getFriends()
      .then(setFriends)
      .catch(() => setFriends([]))
      .finally(() => setLoading(false));
  }, [open, friends.length]);

  // Filtered client-side; the friend list is already loaded in full.
  const visible = friends.filter((f) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return (
      f.profile.username.toLowerCase().includes(q) ||
      (f.profile.display_name ?? '').toLowerCase().includes(q)
    );
  });

  if (!user) return null;

  const send = async (friend: Friend) => {
    setBusyId(friend.profile.id);
    setError(null);
    try {
      await recommendToFriend(friend.profile.id, {
        mediaType,
        mediaId,
        title,
        posterPath: posterPath ?? null,
      });
      setSentTo((prev) => new Set(prev).add(friend.profile.id));
    } catch (err: any) {
      setError(err?.message ?? 'Could not send that recommendation.');
    } finally {
      setBusyId(null);
    }
  };

  const sendToGroup = async (group: WatchlistGroup) => {
    setBusyId(group.id);
    setError(null);
    try {
      await addGroupItem(group.id, {
        mediaType,
        mediaId,
        title,
        posterPath: posterPath ?? null,
      });
      setSentTo((prev) => new Set(prev).add(group.id));
    } catch (err: any) {
      setError(err?.message ?? 'Could not add that to the list.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-white/5 border border-white/10 text-white text-xs font-bold hover:bg-white/10 transition-all"
        title="Recommend to a friend"
      >
        <Send size={14} />
        <span>Recommend</span>
      </button>

      <ModalPortal>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[9990] bg-black/70 backdrop-blur-sm flex items-center justify-center p-6"
            onClick={() => setOpen(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 10 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-sm bg-card border border-white/10 rounded-3xl shadow-2xl overflow-hidden"
            >
              <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
                <div className="min-w-0">
                  <h3 className="text-sm font-bold text-white">Recommend</h3>
                  <p className="text-[11px] text-muted truncate">{title}</p>
                </div>
                <button
                  onClick={() => setOpen(false)}
                  className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/5 transition-colors shrink-0"
                >
                  <X size={16} />
                </button>
              </div>

              {error && (
                <p className="flex items-start gap-2 text-[11px] text-red-400 px-5 py-3">
                  <AlertCircle size={13} className="shrink-0 mt-0.5" />
                  <span>{error}</span>
                </p>
              )}

              {friends.length > 5 && (
                <div className="px-5 pt-4">
                  <div className="relative">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/40" size={15} />
                    <input
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Search friends…"
                      className="w-full bg-white/5 border border-white/10 rounded-xl py-2.5 pl-10 pr-3 text-white text-sm placeholder:text-white/30 focus:border-accent transition-all outline-none"
                    />
                  </div>
                </div>
              )}

              <div className="max-h-80 overflow-y-auto">
                {loading ? (
                  <div className="flex justify-center py-10">
                    <Loader2 className="animate-spin text-white/30" size={20} />
                  </div>
                ) : friends.length === 0 ? (
                  <div className="py-10 px-5 text-center space-y-2">
                    <Users size={28} className="text-white/10 mx-auto" />
                    <p className="text-muted text-sm">Add friends first, then recommend.</p>
                  </div>
                ) : visible.length === 0 ? (
                  <p className="text-muted text-sm text-center py-10">
                    No friends match &ldquo;{query.trim()}&rdquo;.
                  </p>
                ) : (
                  <>
                  {groups.length > 0 && (
                    <div className="border-b border-white/5">
                      <p className="px-5 pt-3 pb-1 text-[10px] font-bold text-white/30 uppercase tracking-widest">
                        Shared lists
                      </p>
                      {groups.map((g) => {
                        const sent = sentTo.has(g.id);
                        return (
                          <div
                            key={g.id}
                            className="flex items-center gap-3 px-5 py-3"
                          >
                            <div className="w-9 h-9 rounded-xl bg-accent/15 border border-accent/20 flex items-center justify-center text-accent shrink-0">
                              <Users size={16} />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-bold text-white truncate">{g.name}</p>
                              <p className="text-xs text-muted truncate">
                                {g.member_count} members
                              </p>
                            </div>
                            <button
                              onClick={() => sendToGroup(g)}
                              disabled={sent || busyId === g.id}
                              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all shrink-0 border ${
                                sent
                                  ? 'bg-accent/10 border-accent/30 text-accent'
                                  : 'bg-accent border-accent text-white hover:bg-accent/90 disabled:opacity-40'
                              }`}
                            >
                              {busyId === g.id ? (
                                <Loader2 className="animate-spin" size={13} />
                              ) : sent ? (
                                <Check size={13} />
                              ) : (
                                <Send size={13} />
                              )}
                              <span>{sent ? 'Added' : 'Add'}</span>
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {visible.map((f) => {
                    const sent = sentTo.has(f.profile.id);
                    return (
                      <div
                        key={f.profile.id}
                        className="flex items-center gap-3 px-5 py-3 border-b border-white/[0.03] last:border-0"
                      >
                        <FriendAvatar profile={f.profile} size={36} />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-bold text-white truncate">
                            {f.profile.display_name || f.profile.username}
                          </p>
                          <p className="text-xs text-muted truncate">@{f.profile.username}</p>
                        </div>
                        <button
                          onClick={() => send(f)}
                          disabled={sent || busyId === f.profile.id}
                          className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all shrink-0 border ${
                            sent
                              ? 'bg-accent/10 border-accent/30 text-accent'
                              : 'bg-accent border-accent text-white hover:bg-accent/90 disabled:opacity-40'
                          }`}
                        >
                          {busyId === f.profile.id ? (
                            <Loader2 className="animate-spin" size={13} />
                          ) : sent ? (
                            <Check size={13} />
                          ) : (
                            <Send size={13} />
                          )}
                          <span>{sent ? 'Sent' : 'Send'}</span>
                        </button>
                      </div>
                    );
                  })}
                  </>
                )}
              </div>

              <p className="px-5 py-3 text-[11px] text-muted border-t border-white/5">
                Pick a shared list, or a friend for the list you two share.
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      </ModalPortal>
    </>
  );
};

export default RecommendButton;
