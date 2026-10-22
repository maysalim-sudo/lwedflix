'use client';

import { useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { getUnreadTotal, subscribeToMessages } from '@/lib/dm';
import { getIncomingRequestCount } from '@/lib/friends';

/** Pending friend requests and unread DMs, for the navigation badges. */
export function useNavBadges(user: User | null) {
  const [pendingRequests, setPendingRequests] = useState(0);
  const [unreadDms, setUnreadDms] = useState(0);

  // Refetched on mount and whenever the window regains focus — a badge
  // count doesn't justify a realtime subscription, and coming back to the
  // window is when a stale count would actually be noticed.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const refresh = async () => {
      try {
        const count = await getIncomingRequestCount();
        if (!cancelled) setPendingRequests(count);
      } catch {
        // Non-critical; leave the previous count rather than surfacing an error.
      }
    };
    refresh();
    window.addEventListener('focus', refresh);
    return () => {
      cancelled = true;
      window.removeEventListener('focus', refresh);
    };
  }, [user]);

  // Unread DMs. Unlike friend requests these arrive mid-session and are
  // worth showing immediately, so this one listens as well as refetching.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const refresh = async () => {
      try {
        const n = await getUnreadTotal();
        if (!cancelled) setUnreadDms(n);
      } catch {
        // Non-critical; keep the previous count.
      }
    };
    refresh();
    const unsubscribe = subscribeToMessages(() => refresh());
    window.addEventListener('focus', refresh);
    return () => {
      cancelled = true;
      unsubscribe();
      window.removeEventListener('focus', refresh);
    };
  }, [user]);

  // Signed out, there's nothing to count — whatever the last fetch said.
  return { pendingRequests: user ? pendingRequests : 0, unreadDms: user ? unreadDms : 0 };
}
