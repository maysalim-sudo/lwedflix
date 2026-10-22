'use client';

import React, { useState } from 'react';
import { Bookmark, BookmarkCheck, Loader2, Plus, Check, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from './AuthProvider';
import { useWatchlist } from './WatchlistProvider';
import { useRouter } from 'next/navigation';
import { WATCH_STATUSES, STATUS_LABEL, type WatchStatus } from '@/lib/watchlist';

interface WatchlistButtonProps {
  id: string | number;
  type: 'movie' | 'tv' | 'all';
  title: string;
  posterPath: string;
  variant?: 'full' | 'icon';
}

const WatchlistButton = ({
  id,
  type,
  title,
  posterPath,
  variant = 'full',
}: WatchlistButtonProps) => {
  const { user } = useAuth();
  const router = useRouter();
  // One shared fetch for the whole list instead of a query per card.
  const { ready, entries, setEntry } = useWatchlist();
  const [actionLoading, setActionLoading] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const mediaKey = String(id);
  const entry = entries.get(mediaKey) ?? null;
  const rowId = entry?.rowId ?? null;
  const status = entry?.status ?? null;
  const isInWatchlist = rowId !== null;
  const loading = !ready;

  const openMenu = (e: React.MouseEvent) => {
    // These buttons sit inside poster links; without this the click
    // navigates instead of opening the picker.
    e.preventDefault();
    e.stopPropagation();

    if (!user) {
      router.push('/login');
      return;
    }
    setMenuOpen((v) => !v);
  };

  const choose = async (next: WatchStatus) => {
    setActionLoading(true);
    setMenuOpen(false);
    const previous = entry;
    setEntry(mediaKey, { rowId: rowId ?? 'pending', status: next });

    try {
      if (rowId) {
        const { error } = await supabase
          .from('watch_list')
          .update({ status: next })
          .eq('id', rowId)
          .eq('user_id', user!.id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from('watch_list')
          .insert({
            user_id: user!.id,
            movie_id: String(id),
            type: type === 'all' ? 'movie' : type,
            title,
            poster_path: posterPath,
            status: next,
          })
          .select('id')
          .maybeSingle();
        if (error) throw error;
        if (data) setEntry(mediaKey, { rowId: String((data as any).id), status: next });
      }
    } catch {
      setEntry(mediaKey, previous);
    } finally {
      setActionLoading(false);
    }
  };

  const remove = async () => {
    if (!rowId) return;
    setActionLoading(true);
    setMenuOpen(false);
    const previous = entry;
    setEntry(mediaKey, null);

    try {
      const { error } = await supabase
        .from('watch_list')
        .delete()
        .eq('id', previous!.rowId)
        .eq('user_id', user!.id);
      if (error) throw error;
    } catch {
      setEntry(mediaKey, previous);
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) return null;

  const menu = menuOpen && (
    <>
      <div
        className="fixed inset-0 z-30"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setMenuOpen(false);
        }}
      />
      <div
        onClick={(e) => e.preventDefault()}
        className={`absolute z-40 w-44 rounded-2xl bg-card border border-white/10 shadow-2xl p-1.5 ${
          variant === 'icon' ? 'top-11 right-0' : 'top-full left-0 mt-2'
        }`}
      >
        <p className="px-2 py-1 text-[9px] font-bold text-white/30 uppercase tracking-widest">
          {isInWatchlist ? 'Move to' : 'Add to'}
        </p>
        {WATCH_STATUSES.map((s) => (
          <button
            key={s.id}
            onClick={() => choose(s.id)}
            className={`w-full flex items-center justify-between px-2 py-1.5 rounded-lg text-xs transition-colors ${
              status === s.id
                ? 'bg-accent/20 text-accent font-bold'
                : 'text-white/70 hover:bg-white/5 hover:text-white'
            }`}
          >
            <span>{s.label}</span>
            {status === s.id && <Check size={12} />}
          </button>
        ))}
        {isInWatchlist && (
          <button
            onClick={remove}
            className="w-full flex items-center gap-2 mt-1 px-2 py-1.5 rounded-lg text-xs text-red-400 hover:bg-red-500/10 transition-colors"
          >
            <Trash2 size={12} />
            <span>Remove</span>
          </button>
        )}
      </div>
    </>
  );

  if (variant === 'icon') {
    return (
      <div className="relative">
        <button
          onClick={openMenu}
          disabled={actionLoading}
          className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all border shadow-lg ${
            isInWatchlist
              ? 'bg-accent border-accent text-white hover:scale-110'
              : 'bg-black/60 backdrop-blur-md border-white/10 text-white hover:bg-black/80 hover:scale-110'
          }`}
          title={isInWatchlist ? `In watchlist — ${STATUS_LABEL[status!]}` : 'Add to Watchlist'}
        >
          {actionLoading ? (
            <Loader2 className="animate-spin" size={16} />
          ) : isInWatchlist ? (
            <Check size={16} strokeWidth={3} />
          ) : (
            <Plus size={16} strokeWidth={3} />
          )}
        </button>
        {menu}
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={openMenu}
        disabled={actionLoading}
        className={`flex items-center space-x-2 px-6 py-3 rounded-2xl font-bold uppercase tracking-widest text-xs transition-all border ${
          isInWatchlist
            ? 'bg-accent/10 border-accent/30 text-accent hover:bg-accent/20'
            : 'bg-white/5 border-white/10 text-white hover:border-white/20 hover:bg-white/10'
        }`}
      >
        {actionLoading ? (
          <Loader2 className="animate-spin" size={18} />
        ) : isInWatchlist ? (
          <>
            <BookmarkCheck size={18} />
            <span>{STATUS_LABEL[status!]}</span>
          </>
        ) : (
          <>
            <Bookmark size={18} />
            <span>Add to Watchlist</span>
          </>
        )}
      </button>
      {menu}
    </div>
  );
};

export default WatchlistButton;
