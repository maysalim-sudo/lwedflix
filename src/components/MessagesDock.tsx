'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import { useAuth } from './AuthProvider';
import FriendAvatar from './FriendAvatar';
import DmThreadView from './DmThreadView';
import { getThreads, openThread, subscribeToMessages, type DmThread } from '@/lib/dm';
import { getFriends, type Friend } from '@/lib/friends';
import {
  MessageCircle,
  X,
  PenSquare,
  ArrowLeft,
  Loader2,
  Search,
  Maximize2,
} from 'lucide-react';

type View = 'list' | 'new' | 'thread';

interface MessagesDockProps {
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
}

/**
 * Floating messages dock, bottom-right beside the watching dock.
 *
 * Unlike that one this stays visible with nothing in it — starting a
 * conversation is half the point, so an empty state here is useful
 * rather than clutter.
 */
const MessagesDock = ({ open, onToggle, onClose }: MessagesDockProps) => {
  const { user } = useAuth();

  const [threads, setThreads] = useState<DmThread[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>('list');
  const [activeId, setActiveId] = useState<string | null>(null);

  const [friends, setFriends] = useState<Friend[]>([]);
  const [friendQuery, setFriendQuery] = useState('');
  const [starting, setStarting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setThreads(await getThreads());
    } catch {
      // The dock is ambient — a failure here shouldn't throw an error
      // banner over every page. The page at /messages reports properly.
      setThreads([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!user) {
      setThreads([]);
      setLoading(false);
      return;
    }
    load();
    return subscribeToMessages(() => load());
  }, [user, load]);

  // Friends load lazily — only when you actually go to compose.
  useEffect(() => {
    if (view !== 'new' || friends.length > 0) return;
    getFriends()
      .then(setFriends)
      .catch(() => setFriends([]));
  }, [view, friends.length]);

  if (!user) return null;

  const unread = threads.reduce((n, t) => n + t.unread_count, 0);
  const active = threads.find((t) => t.thread_id === activeId) ?? null;

  const start = async (friendId: string) => {
    setStarting(friendId);
    setError(null);
    try {
      const id = await openThread(friendId);
      // Pull the new thread in before switching, or the view would have
      // nothing to render.
      await load();
      setActiveId(id);
      setView('thread');
    } catch (err: any) {
      setError(err?.message ?? 'Could not start that conversation.');
    } finally {
      setStarting(null);
    }
  };

  const q = friendQuery.trim().toLowerCase();
  const shownFriends = q
    ? friends.filter(
        (f) =>
          f.profile.username.toLowerCase().includes(q) ||
          (f.profile.display_name ?? '').toLowerCase().includes(q)
      )
    : friends;

  const back = () => {
    setView('list');
    setActiveId(null);
  };

  return (
    <div className="flex flex-col items-end">
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.96 }}
            transition={{ duration: 0.15 }}
            className="absolute bottom-full right-0 mb-3 w-80 max-w-[calc(100vw-3rem)] rounded-3xl bg-card border border-white/10 shadow-2xl overflow-hidden"
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
              <p className="flex items-center gap-2 text-xs font-bold text-white min-w-0">
                {view !== 'list' ? (
                  <button
                    onClick={back}
                    className="p-1 -ml-1 rounded-lg text-white/40 hover:text-white transition-colors"
                    aria-label="Back"
                  >
                    <ArrowLeft size={14} />
                  </button>
                ) : (
                  <MessageCircle size={13} className="text-accent" />
                )}
                <span className="truncate">
                  {view === 'new' ? 'New message' : view === 'thread' ? 'Conversation' : 'Messages'}
                </span>
              </p>

              <div className="flex items-center gap-1 shrink-0">
                {view === 'list' && (
                  <button
                    onClick={() => setView('new')}
                    className="p-1 rounded-lg text-white/40 hover:text-accent hover:bg-white/5 transition-colors"
                    title="Start a conversation"
                  >
                    <PenSquare size={14} />
                  </button>
                )}
                <Link
                  href={active ? `/messages?thread=${active.thread_id}` : '/messages'}
                  onClick={onClose}
                  className="p-1 rounded-lg text-white/40 hover:text-white hover:bg-white/5 transition-colors"
                  title="Open full view"
                >
                  <Maximize2 size={13} />
                </Link>
                <button
                  onClick={onClose}
                  className="p-1 rounded-lg text-white/40 hover:text-white hover:bg-white/5 transition-colors"
                  aria-label="Close"
                >
                  <X size={14} />
                </button>
              </div>
            </div>

            {error && (
              <p className="px-4 py-2 text-[11px] text-red-400 border-b border-white/5">{error}</p>
            )}

            {view === 'thread' && active ? (
              <DmThreadView
                key={active.thread_id}
                thread={active}
                myId={user.id}
                variant="dock"
                onBack={back}
                onRead={load}
              />
            ) : view === 'new' ? (
              <div className="flex flex-col h-[26rem]">
                <div className="p-3 border-b border-white/5 shrink-0">
                  <div className="relative">
                    <Search
                      size={13}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30"
                    />
                    <input
                      value={friendQuery}
                      onChange={(e) => setFriendQuery(e.target.value)}
                      placeholder="Search friends…"
                      className="w-full bg-white/5 border border-white/10 rounded-xl pl-8 pr-3 py-2 text-xs text-white placeholder:text-white/30 focus:outline-none focus:border-accent/40 transition-colors"
                    />
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto p-2">
                  {shownFriends.length === 0 ? (
                    <p className="text-[11px] text-muted text-center py-10 px-4">
                      {friends.length === 0
                        ? 'Add friends before you can message anyone.'
                        : 'No friends match that search.'}
                    </p>
                  ) : (
                    shownFriends.map((f) => (
                      <button
                        key={f.profile.id}
                        onClick={() => start(f.profile.id)}
                        disabled={starting !== null}
                        className="w-full flex items-center gap-3 p-2 rounded-xl hover:bg-white/5 disabled:opacity-40 transition-colors text-left"
                      >
                        <FriendAvatar profile={f.profile} size={32} />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-bold text-white truncate">
                            {f.profile.display_name || f.profile.username}
                          </p>
                          <p className="text-[10px] text-muted truncate">@{f.profile.username}</p>
                        </div>
                        {starting === f.profile.id && (
                          <Loader2 size={14} className="animate-spin text-accent shrink-0" />
                        )}
                      </button>
                    ))
                  )}
                </div>
              </div>
            ) : (
              <div className="max-h-80 overflow-y-auto p-2">
                {loading ? (
                  <div className="flex justify-center py-10">
                    <Loader2 className="animate-spin text-white/30" size={18} />
                  </div>
                ) : threads.length === 0 ? (
                  <div className="text-center py-10 px-4 space-y-3">
                    <p className="text-[11px] text-muted">No conversations yet.</p>
                    <button
                      onClick={() => setView('new')}
                      className="text-[11px] font-bold text-accent hover:underline"
                    >
                      Start one
                    </button>
                  </div>
                ) : (
                  threads.map((t) => (
                    <button
                      key={t.thread_id}
                      onClick={() => {
                        setActiveId(t.thread_id);
                        setView('thread');
                      }}
                      className="w-full flex items-center gap-3 p-2 rounded-xl hover:bg-white/5 transition-colors text-left"
                    >
                      <FriendAvatar profile={t} size={32} />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold text-white truncate">
                          {t.display_name || t.username}
                        </p>
                        <p
                          className={`text-[10px] truncate ${
                            t.unread_count > 0 ? 'text-white/80 font-medium' : 'text-muted'
                          }`}
                        >
                          {t.last_body
                            ? `${t.last_sender_id === user.id ? 'You: ' : ''}${t.last_body}`
                            : 'No messages yet'}
                        </p>
                      </div>
                      {t.unread_count > 0 && (
                        <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-accent text-white text-[10px] font-bold flex items-center justify-center shrink-0">
                          {t.unread_count > 9 ? '9+' : t.unread_count}
                        </span>
                      )}
                    </button>
                  ))
                )}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <button
        onClick={onToggle}
        className="relative flex items-center gap-2 pl-3 pr-4 py-2.5 rounded-full bg-card border border-white/10 text-white shadow-2xl hover:scale-105 active:scale-95 transition-transform"
        title="Messages"
      >
        <MessageCircle size={15} className="text-accent" />
        <span className="text-xs font-bold">Messages</span>
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-accent text-white text-[10px] font-bold flex items-center justify-center">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>
    </div>
  );
};

export default MessagesDock;
