'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/components/AuthProvider';
import {
  Bookmark,
  Users,
  Globe,
  Lock,
  Loader2,
  AlertCircle,
  CheckSquare,
  X,
  Trash2,
} from 'lucide-react';
import PageShell from '@/components/ui/PageShell';
import EmptyState from '@/components/ui/EmptyState';
import TabStrip from '@/components/ui/TabStrip';
import { PageSpinner, SignInPrompt } from '@/components/ui/AuthGate';
import WatchlistGroups from '@/components/WatchlistGroups';
import WatchlistCard from '@/components/WatchlistCard';
import {
  getMyWatchlist,
  isWatchlistPublic,
  setWatchlistPublic,
  countByStatus,
  setStatusBulk,
  removeItems,
  WATCH_STATUSES,
  type WatchlistItem,
  type WatchStatus,
} from '@/lib/watchlist';
import { useWatchlist } from '@/components/WatchlistProvider';

type Tab = 'mine' | 'shared';
type StatusTab = WatchStatus | 'all';

export default function WatchlistPage() {
  const { user, loading: authLoading } = useAuth();
  const [tab, setTab] = useState<Tab>('mine');
  const [statusTab, setStatusTab] = useState<StatusTab>('all');
  const [items, setItems] = useState<WatchlistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [isPublic, setIsPublic] = useState(false);
  const [savingPublic, setSavingPublic] = useState(false);

  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  // Buttons elsewhere read from this cache, so a bulk change has to
  // invalidate it or they'd keep showing the old status.
  const { refresh: refreshCache } = useWatchlist();

  const load = useCallback(async () => {
    try {
      // Fetched unfiltered so the tab counts are real; filtering one list
      // client-side beats a round trip per tab.
      const rows = await getMyWatchlist();
      setItems(rows);
      setError(null);

      // Deliberately not in the same await: the visibility flag is a side
      // detail, and failing to read it shouldn't hide the whole list.
      isWatchlistPublic()
        .then(setIsPublic)
        .catch(() => setIsPublic(false));
    } catch (err: any) {
      setError(err?.message ?? 'Could not load your watchlist.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setLoading(false);
      return;
    }
    load();
  }, [user, authLoading, load]);

  if (authLoading || loading) return <PageSpinner />;

  if (!user) {
    return (
      <SignInPrompt
        icon={Bookmark}
        title="Your Watchlist is Private"
        body="Sign in to save your favorite movies and TV shows across all your devices."
        redirectTo="/watchlist"
      />
    );
  }

  const counts = countByStatus(items);
  const shown = statusTab === 'all' ? items : items.filter((i) => i.status === statusTab);

  const togglePick = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const exitSelect = () => {
    setSelecting(false);
    setPicked(new Set());
  };

  const bulkMove = async (status: WatchStatus) => {
    const ids = [...picked];
    if (ids.length === 0) return;
    setBulkBusy(true);
    const snapshot = items;
    setItems((prev) => prev.map((i) => (picked.has(i.id) ? { ...i, status } : i)));
    try {
      await setStatusBulk(ids, status);
      exitSelect();
      refreshCache();
    } catch (err: any) {
      setItems(snapshot);
      setError(err?.message ?? 'Could not move those titles.');
    } finally {
      setBulkBusy(false);
    }
  };

  const bulkRemove = async () => {
    const ids = [...picked];
    if (ids.length === 0) return;
    setBulkBusy(true);
    const snapshot = items;
    setItems((prev) => prev.filter((i) => !picked.has(i.id)));
    try {
      await removeItems(ids);
      exitSelect();
      refreshCache();
    } catch (err: any) {
      setItems(snapshot);
      setError(err?.message ?? 'Could not remove those titles.');
    } finally {
      setBulkBusy(false);
    }
  };

  const togglePublic = async () => {
    const next = !isPublic;
    setSavingPublic(true);
    setIsPublic(next);
    try {
      await setWatchlistPublic(next);
    } catch (err: any) {
      setIsPublic(!next);
      setError(err?.message ?? 'Could not change that setting.');
    } finally {
      setSavingPublic(false);
    }
  };

  return (
    <PageShell
      icon={Bookmark}
      title="Watch List"
      subtitle={`${items.length} title${items.length === 1 ? '' : 's'} saved`}
      width="wide"
      actions={
        tab === 'mine' ? (
          <div className="flex items-center gap-2">
            {items.length > 0 && (
              <button
                onClick={() => (selecting ? exitSelect() : setSelecting(true))}
                className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-[10px] font-bold uppercase tracking-widest transition-all ${
                  selecting
                    ? 'bg-accent/10 border-accent/30 text-accent'
                    : 'bg-white/5 border-white/10 text-white/50 hover:text-white'
                }`}
              >
                {selecting ? <X size={12} /> : <CheckSquare size={12} />}
                <span>{selecting ? 'Cancel' : 'Select'}</span>
              </button>
            )}
          <button
            onClick={togglePublic}
            disabled={savingPublic}
            className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-[10px] font-bold uppercase tracking-widest transition-all disabled:opacity-50 ${
              isPublic
                ? 'bg-accent/10 border-accent/30 text-accent'
                : 'bg-white/5 border-white/10 text-white/50 hover:text-white'
            }`}
            title={
              isPublic
                ? 'Anyone signed in can see this list on your profile'
                : 'Only you can see this list'
            }
          >
            {savingPublic ? (
              <Loader2 size={12} className="animate-spin" />
            ) : isPublic ? (
              <Globe size={12} />
            ) : (
              <Lock size={12} />
            )}
            <span>{isPublic ? 'Public' : 'Private'}</span>
          </button>
          </div>
        ) : null
      }
    >
      <TabStrip
        active={tab}
        onSelect={(k) => setTab(k as Tab)}
        tabs={[
          { key: 'mine', label: 'Mine', icon: Bookmark },
          { key: 'shared', label: 'Shared', icon: Users },
        ]}
      />

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-4 flex items-start gap-3 text-red-400 text-sm">
          <AlertCircle size={18} className="shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {tab === 'shared' ? (
        <WatchlistGroups />
      ) : items.length === 0 ? (
        <EmptyState
          icon={Bookmark}
          title="Your watchlist is empty"
          body="Add movies and shows you want to watch later and they'll appear here."
          action={
            <Link href="/movies" className="inline-block text-accent font-bold hover:underline">
              Explore Movies
            </Link>
          }
        />
      ) : (
        <div className="space-y-6">
          <TabStrip
            active={statusTab}
            onSelect={(k) => setStatusTab(k as StatusTab)}
            tabs={[
              { key: 'all', label: 'All', badge: counts.all },
              ...WATCH_STATUSES.map((s) => ({
                key: s.id,
                label: s.label,
                badge: counts[s.id],
              })),
            ]}
          />

          {selecting && (
            <div className="sticky top-24 z-30 flex flex-wrap items-center gap-2 p-3 rounded-2xl bg-card border border-accent/30 shadow-2xl">
              <span className="text-xs font-bold text-white px-1">
                {picked.size} selected
              </span>
              <button
                onClick={() =>
                  setPicked(
                    picked.size === shown.length ? new Set() : new Set(shown.map((i) => i.id))
                  )
                }
                className="px-3 py-1.5 rounded-xl bg-white/5 border border-white/10 text-[10px] font-bold uppercase tracking-widest text-white/60 hover:text-white transition-colors"
              >
                {picked.size === shown.length ? 'Clear' : 'Select all'}
              </button>

              <span className="w-px h-5 bg-white/10 mx-1" />

              {WATCH_STATUSES.map((s2) => (
                <button
                  key={s2.id}
                  onClick={() => bulkMove(s2.id)}
                  disabled={picked.size === 0 || bulkBusy}
                  className="px-3 py-1.5 rounded-xl bg-white/5 border border-white/10 text-[10px] font-bold uppercase tracking-widest text-white/70 hover:text-white hover:border-accent/40 disabled:opacity-30 transition-colors"
                >
                  {s2.label}
                </button>
              ))}

              <button
                onClick={bulkRemove}
                disabled={picked.size === 0 || bulkBusy}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-bold uppercase tracking-widest text-red-400 hover:bg-red-500/10 disabled:opacity-30 transition-colors"
              >
                {bulkBusy ? <Loader2 size={11} className="animate-spin" /> : <Trash2 size={11} />}
                <span>Remove</span>
              </button>
            </div>
          )}

          {shown.length === 0 ? (
            <EmptyState
              icon={Bookmark}
              compact
              title="Nothing here yet"
              body="Use the ⋮ menu on any title to move it into this list."
            />
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-6">
              {shown.map((item) => (
                <WatchlistCard
                  key={item.id}
                  item={item}
                  selectable={selecting}
                  selected={picked.has(item.id)}
                  onToggleSelect={togglePick}
                  onChanged={(next) =>
                    setItems((prev) => prev.map((i) => (i.id === next.id ? next : i)))
                  }
                  onRemoved={(id) => setItems((prev) => prev.filter((i) => i.id !== id))}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </PageShell>
  );
}
