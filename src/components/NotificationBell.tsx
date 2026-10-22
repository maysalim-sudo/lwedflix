'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { Bell, Loader2, CheckCheck } from 'lucide-react';
import FriendAvatar from './FriendAvatar';
import UserLink from './UserLink';
import { useAuth } from './AuthProvider';
import {
  getNotifications,
  getUnreadCount,
  markRead,
  markAllRead,
  subscribeToNotifications,
  describeNotification,
  notificationHref,
  type AppNotification,
} from '@/lib/notifications';
import { timeAgo } from '@/lib/posts';

const NotificationBell = () => {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(false);

  const refreshCount = useCallback(async () => {
    try {
      setUnread(await getUnreadCount());
    } catch {
      // Non-critical; keep the previous count rather than surfacing an error.
    }
  }, []);

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await getNotifications());
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial count, plus a live subscription so the badge moves without a
  // reload. Also refetches on tab focus, which covers the case where the
  // socket dropped while the tab was in the background.
  useEffect(() => {
    if (!user) {
      setUnread(0);
      setItems([]);
      return;
    }

    refreshCount();
    const onFocus = () => refreshCount();
    window.addEventListener('focus', onFocus);

    const unsubscribe = subscribeToNotifications(user.id, () => {
      refreshCount();
      // Keep an open panel current instead of showing stale rows.
      setOpen((isOpen) => {
        if (isOpen) loadList();
        return isOpen;
      });
    });

    return () => {
      window.removeEventListener('focus', onFocus);
      unsubscribe();
    };
  }, [user, refreshCount, loadList]);

  if (!user) return null;

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next) loadList();
  };

  const openItem = async (n: AppNotification) => {
    setOpen(false);
    if (!n.read_at) {
      setItems((prev) =>
        prev.map((i) => (i.id === n.id ? { ...i, read_at: new Date().toISOString() } : i))
      );
      setUnread((c) => Math.max(0, c - 1));
      try {
        await markRead(n.id);
      } catch {
        refreshCount();
      }
    }
  };

  const readAll = async () => {
    setItems((prev) => prev.map((i) => ({ ...i, read_at: i.read_at ?? new Date().toISOString() })));
    setUnread(0);
    try {
      await markAllRead();
    } catch {
      refreshCount();
    }
  };

  return (
    <div className="relative">
      <button
        onClick={toggle}
        className="relative w-10 h-10 rounded-full flex items-center justify-center text-white/70 hover:text-accent hover:bg-white/5 transition-all"
        title="Notifications"
      >
        <Bell size={20} />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-accent text-white text-[10px] font-bold flex items-center justify-center">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40"
              onClick={() => setOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.95 }}
              className="absolute right-0 mt-4 w-80 max-w-[calc(100vw-2rem)] bg-card border border-white/10 rounded-2xl shadow-2xl z-50 backdrop-blur-xl overflow-hidden"
            >
              <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
                <p className="text-xs font-bold text-white/40 uppercase tracking-widest">
                  Notifications
                </p>
                <div className="flex items-center gap-3">
                  {unread > 0 && (
                    <button
                      onClick={readAll}
                      className="flex items-center gap-1 text-[10px] font-bold text-accent uppercase tracking-widest hover:underline"
                    >
                      <CheckCheck size={12} />
                      <span>Read all</span>
                    </button>
                  )}
                  <Link
                    href="/notifications"
                    onClick={() => setOpen(false)}
                    className="text-[10px] font-bold text-white/40 uppercase tracking-widest hover:text-white"
                  >
                    History
                  </Link>
                </div>
              </div>

              <div className="max-h-96 overflow-y-auto">
                {loading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="animate-spin text-white/30" size={20} />
                  </div>
                ) : items.length === 0 ? (
                  <p className="text-muted text-sm text-center py-8 px-4">
                    Nothing yet. Reactions, comments and friend activity land here.
                  </p>
                ) : (
                  items.map((n) => (
                    <Link
                      key={n.id}
                      href={notificationHref(n)}
                      onClick={() => openItem(n)}
                      className={`flex items-start gap-3 px-4 py-3 hover:bg-white/5 transition-colors border-b border-white/[0.03] last:border-0 ${
                        n.read_at ? '' : 'bg-accent/[0.06]'
                      }`}
                    >
                      {n.actor ? (
                        <UserLink username={n.actor.username} nested>
                          <FriendAvatar profile={n.actor} size={32} />
                        </UserLink>
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-white/5 shrink-0" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-xs text-white/80 leading-snug">
                          {describeNotification(n)}
                        </p>
                        <p className="text-[10px] text-muted mt-0.5">{timeAgo(n.created_at)}</p>
                      </div>
                      {!n.read_at && (
                        <span className="w-2 h-2 rounded-full bg-accent shrink-0 mt-1.5" />
                      )}
                    </Link>
                  ))
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};

export default NotificationBell;
