'use client';

import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { UserPlus, X, Check, Loader2 } from 'lucide-react';
import ModalPortal from '@/components/ModalPortal';
import FriendAvatar from '@/components/FriendAvatar';
import { getFriends, type Friend } from '@/lib/friends';
import { shareTitle } from '@/lib/dm';
import { buildRoomUrl, type PartyTitle } from '@/lib/watchRoom';

/**
 * Sends the party straight to friends' messages: the title as a card, and
 * the room's link, which opens the room in their app.
 */
const InviteFriendsButton = ({ code, title }: { code: string; title: PartyTitle }) => {
  const [open, setOpen] = useState(false);
  const [friends, setFriends] = useState<Friend[] | null>(null);
  const [status, setStatus] = useState<Record<string, 'sending' | 'sent' | 'failed'>>({});

  useEffect(() => {
    if (!open || friends) return;
    getFriends()
      .then(setFriends)
      .catch(() => setFriends([]));
  }, [open, friends]);

  const invite = async (friend: Friend) => {
    const id = friend.profile.id;
    setStatus((s) => ({ ...s, [id]: 'sending' }));
    try {
      await shareTitle(
        id,
        {
          type: title.mediaType,
          id: title.mediaId,
          title: title.title,
          posterPath: title.posterPath,
          season: title.season,
          episode: title.episode,
        },
        `Join my watch party: ${buildRoomUrl(code)}`
      );
      setStatus((s) => ({ ...s, [id]: 'sent' }));
    } catch {
      setStatus((s) => ({ ...s, [id]: 'failed' }));
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-xs font-bold hover:bg-white/10 transition-all whitespace-nowrap"
      >
        <UserPlus size={14} />
        <span>Invite</span>
      </button>

      <AnimatePresence>
        {open && (
          <ModalPortal>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[10000] bg-black/70 backdrop-blur-sm flex items-center justify-center p-6"
              onClick={() => setOpen(false)}
            >
              <motion.div
                initial={{ scale: 0.96, y: 8 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.96, y: 8 }}
                onClick={(e) => e.stopPropagation()}
                className="w-full max-w-sm rounded-3xl bg-card border border-white/10 shadow-2xl overflow-hidden"
              >
                <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
                  <div>
                    <p className="text-sm font-bold text-white">Invite friends</p>
                    <p className="text-[11px] text-muted">They get the party link in their messages.</p>
                  </div>
                  <button onClick={() => setOpen(false)} className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/10" aria-label="Close">
                    <X size={16} />
                  </button>
                </div>
                <div className="max-h-80 overflow-y-auto p-2">
                  {!friends ? (
                    <div className="py-10 flex justify-center">
                      <Loader2 className="animate-spin text-accent" size={22} />
                    </div>
                  ) : friends.length === 0 ? (
                    <p className="py-10 text-center text-xs text-muted">No friends yet — share the code instead.</p>
                  ) : (
                    friends.map((friend) => {
                      const state = status[friend.profile.id];
                      return (
                        <div key={friend.profile.id} className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-white/[0.03]">
                          <FriendAvatar profile={friend.profile} size={34} />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-bold text-white truncate">
                              {friend.profile.display_name || friend.profile.username}
                            </p>
                            <p className="text-[11px] text-muted truncate">@{friend.profile.username}</p>
                          </div>
                          <button
                            onClick={() => invite(friend)}
                            disabled={state === 'sending' || state === 'sent'}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all ${
                              state === 'sent'
                                ? 'bg-accent/15 text-accent'
                                : state === 'failed'
                                ? 'bg-red-500/15 text-red-300 hover:bg-red-500/25'
                                : 'bg-accent text-white hover:bg-accent/90'
                            }`}
                          >
                            {state === 'sending' ? (
                              <Loader2 size={12} className="animate-spin" />
                            ) : state === 'sent' ? (
                              <Check size={12} />
                            ) : null}
                            <span>{state === 'sent' ? 'Sent' : state === 'failed' ? 'Retry' : 'Invite'}</span>
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>
              </motion.div>
            </motion.div>
          </ModalPortal>
        )}
      </AnimatePresence>
    </>
  );
};

export default InviteFriendsButton;
