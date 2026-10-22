'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { getImageUrl } from '@/lib/imageUrl';
import UserLink from './UserLink';
import {
  getSharedWatchlist,
  setSharedItemStatus,
  removeSharedItem,
  setVote,
  type SharedItem,
} from '@/lib/sharedWatchlist';
import { Loader2, Check, RotateCcw, Trash2, AlertCircle, Bookmark, ArrowBigUp } from 'lucide-react';

interface SharedWatchlistProps {
  friendId: string;
  friendName: string;
}

/** The watchlist you share with one friend. Either side can edit it. */
const SharedWatchlist = ({ friendId, friendName }: SharedWatchlistProps) => {
  const [items, setItems] = useState<SharedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setItems(await getSharedWatchlist(friendId));
      setError(null);
    } catch (err: any) {
      setError(err?.message ?? 'Could not load your shared watchlist.');
    } finally {
      setLoading(false);
    }
  }, [friendId]);

  useEffect(() => {
    load();
  }, [load]);

  const toggleWatched = async (item: SharedItem) => {
    const next = item.status === 'watched' ? 'pending' : 'watched';
    setBusyId(item.id);
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, status: next } : i)));
    try {
      await setSharedItemStatus(item.id, next);
    } catch (err: any) {
      setError(err?.message ?? 'Could not update that item.');
      load();
    } finally {
      setBusyId(null);
    }
  };

  const toggleVote = async (item: SharedItem) => {
    const next = !item.i_voted;
    // Optimistic; the list re-sorts by votes on the next load.
    setItems((prev) =>
      prev.map((i) =>
        i.id === item.id
          ? { ...i, i_voted: next, vote_count: i.vote_count + (next ? 1 : -1) }
          : i
      )
    );
    try {
      await setVote(item.id, next);
    } catch (err: any) {
      setError(err?.message ?? 'Could not register that vote.');
      load();
    }
  };

  const remove = async (item: SharedItem) => {
    setBusyId(item.id);
    setItems((prev) => prev.filter((i) => i.id !== item.id));
    try {
      await removeSharedItem(item.id);
    } catch (err: any) {
      setError(err?.message ?? 'Could not remove that item.');
      load();
    } finally {
      setBusyId(null);
    }
  };

  const pending = items.filter((i) => i.status === 'pending');
  const watched = items.filter((i) => i.status === 'watched');

  if (loading) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="animate-spin text-white/30" size={22} />
      </div>
    );
  }

  const row = (item: SharedItem) => (
    <div
      key={item.id}
      className={`flex items-center gap-3 p-3 rounded-2xl bg-white/[0.02] border border-white/5 hover:border-white/10 transition-colors ${
        item.status === 'watched' ? 'opacity-60' : ''
      }`}
    >
      <Link
        href={`/${item.media_type}/${item.media_id}`}
        className="flex items-center gap-3 min-w-0 flex-1 group/item"
      >
        <div className="relative w-10 h-14 rounded-lg overflow-hidden bg-card shrink-0">
          <Image
            src={getImageUrl(item.poster_path, 'w185')}
            alt={item.title}
            fill
            sizes="40px"
            className="object-cover"
          />
        </div>
        <div className="min-w-0">
          <p
            className={`text-sm font-bold text-white truncate group-hover/item:text-accent transition-colors ${
              item.status === 'watched' ? 'line-through' : ''
            }`}
          >
            {item.title}
          </p>
          <p className="text-[11px] text-muted truncate">
            {item.media_type === 'tv' ? 'TV Series' : 'Movie'} · added by{' '}
            <UserLink username={item.added_by_username} nested className="hover:text-accent">
              {item.added_by_display_name || `@${item.added_by_username}`}
            </UserLink>
          </p>
        </div>
      </Link>

      <div className="flex items-center gap-1 shrink-0">
        {/* Votes only matter for things not yet watched. */}
        {item.status === 'pending' && (
          <button
            onClick={() => toggleVote(item)}
            className={`flex flex-col items-center justify-center w-9 py-1 rounded-xl border transition-colors ${
              item.i_voted
                ? 'bg-accent/10 border-accent/30 text-accent'
                : 'bg-white/5 border-white/10 text-white/40 hover:text-white'
            }`}
            title={item.i_voted ? 'Remove your vote' : 'Vote to watch this next'}
          >
            <ArrowBigUp size={15} className={item.i_voted ? 'fill-current' : ''} />
            <span className="text-[10px] font-bold leading-none">{item.vote_count}</span>
          </button>
        )}

        <button
          onClick={() => toggleWatched(item)}
          disabled={busyId === item.id}
          className={`p-2 rounded-xl transition-colors disabled:opacity-40 ${
            item.status === 'watched'
              ? 'text-white/40 hover:text-white'
              : 'text-white/30 hover:text-accent hover:bg-accent/10'
          }`}
          title={item.status === 'watched' ? 'Mark as not watched' : 'Mark as watched together'}
        >
          {item.status === 'watched' ? <RotateCcw size={15} /> : <Check size={15} />}
        </button>
        <button
          onClick={() => remove(item)}
          disabled={busyId === item.id}
          className="p-2 rounded-xl text-white/20 hover:text-red-400 hover:bg-red-500/10 disabled:opacity-40 transition-colors"
          title="Remove"
        >
          <Trash2 size={15} />
        </button>
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-4 flex items-start space-x-3 text-red-400 text-sm">
          <AlertCircle size={18} className="shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {items.length === 0 ? (
        <div className="py-12 text-center space-y-4">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-white/5 border border-white/10 text-white/20">
            <Bookmark size={26} />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-bold">Nothing shared yet</h3>
            <p className="text-muted max-w-xs mx-auto text-xs">
              Use Recommend on any movie or show to add it to the list you share with{' '}
              {friendName}.
            </p>
          </div>
        </div>
      ) : (
        <>
          {pending.length > 0 && (
            <div className="space-y-2">
              <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest px-1">
                To watch ({pending.length}) · most voted first
              </p>
              {pending.map(row)}
            </div>
          )}
          {watched.length > 0 && (
            <div className="space-y-2 pt-2">
              <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest px-1">
                Watched ({watched.length})
              </p>
              {watched.map(row)}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default SharedWatchlist;
