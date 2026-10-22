'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from './AuthProvider';
import type { WatchStatus } from '@/lib/watchlist';

export interface WatchlistEntry {
  rowId: string;
  status: WatchStatus;
}

interface WatchlistContextValue {
  ready: boolean;
  entries: Map<string, WatchlistEntry>;
  setEntry: (mediaId: string, entry: WatchlistEntry | null) => void;
  refresh: () => Promise<void>;
}

const WatchlistContext = createContext<WatchlistContextValue>({
  ready: false,
  entries: new Map(),
  setEntry: () => {},
  refresh: async () => {},
});

/**
 * One query for the whole watchlist, shared by every WatchlistButton.
 *
 * Each button used to look itself up, so a grid of 40 posters meant 40
 * round trips — the home page was firing ~85. The list is small (it's
 * one user's saved titles), so fetching it once and answering from a Map
 * is both faster and far less traffic.
 */
export const WatchlistProvider = ({ children }: { children: React.ReactNode }) => {
  const { user, loading: authLoading } = useAuth();
  const [entries, setEntries] = useState<Map<string, WatchlistEntry>>(new Map());
  const [ready, setReady] = useState(false);

  const refresh = useCallback(async () => {
    if (!user) {
      setEntries(new Map());
      setReady(true);
      return;
    }

    // `status` only exists once migration 0018 has run. Ask for it, and
    // fall back to the older shape rather than leaving every button dead
    // on a database that hasn't been migrated yet.
    let rows: any[] | null = null;
    const withStatus = await supabase
      .from('watch_list')
      .select('id, movie_id, status')
      .eq('user_id', user.id);

    if (withStatus.error) {
      const legacy = await supabase
        .from('watch_list')
        .select('id, movie_id')
        .eq('user_id', user.id);
      rows = legacy.data ?? [];
    } else {
      rows = withStatus.data ?? [];
    }

    const next = new Map<string, WatchlistEntry>();
    for (const r of rows) {
      next.set(String(r.movie_id), {
        rowId: String(r.id),
        status: (r.status ?? 'plan') as WatchStatus,
      });
    }
    setEntries(next);
    setReady(true);
  }, [user]);

  useEffect(() => {
    if (authLoading) return;
    refresh();
  }, [authLoading, refresh]);

  const setEntry = useCallback((mediaId: string, entry: WatchlistEntry | null) => {
    setEntries((prev) => {
      const next = new Map(prev);
      if (entry) next.set(mediaId, entry);
      else next.delete(mediaId);
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({ ready, entries, setEntry, refresh }),
    [ready, entries, setEntry, refresh]
  );

  return <WatchlistContext.Provider value={value}>{children}</WatchlistContext.Provider>;
};

export const useWatchlist = () => useContext(WatchlistContext);
