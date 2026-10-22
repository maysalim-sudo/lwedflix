'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { getImageUrl } from '@/lib/imageUrl';
import {
  setStatus as saveStatus,
  setRating as saveRating,
  removeItem,
  WATCH_STATUSES,
  STATUS_LABEL,
  type WatchlistItem,
  type WatchStatus,
} from '@/lib/watchlist';
import { MoreVertical, Star, Trash2, Check, Loader2 } from 'lucide-react';

interface WatchlistCardProps {
  item: WatchlistItem;
  /** Someone else's list is display-only. */
  editable?: boolean;
  /** In selection mode the poster picks instead of navigating. */
  selectable?: boolean;
  selected?: boolean;
  onToggleSelect?: (id: string) => void;
  onChanged: (item: WatchlistItem) => void;
  onRemoved: (id: string) => void;
}

const STATUS_TONE: Record<WatchStatus, string> = {
  watching: 'bg-accent/90 text-white',
  completed: 'bg-emerald-500/90 text-white',
  on_hold: 'bg-amber-500/90 text-black',
  dropped: 'bg-red-500/90 text-white',
  plan: 'bg-white/20 text-white',
};

const WatchlistCard = ({
  item,
  editable = true,
  selectable = false,
  selected = false,
  onToggleSelect,
  onChanged,
  onRemoved,
}: WatchlistCardProps) => {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const href = `/${item.type}/${item.movie_id}`;

  const changeStatus = async (status: WatchStatus) => {
    setBusy(true);
    // Optimistic: the menu closes immediately and the badge updates, so the
    // list doesn't feel like it stalls on every change.
    onChanged({ ...item, status });
    setOpen(false);
    try {
      await saveStatus(item.id, status);
    } catch {
      onChanged(item);
    } finally {
      setBusy(false);
    }
  };

  const changeRating = async (rating: number | null) => {
    setBusy(true);
    onChanged({ ...item, rating });
    try {
      await saveRating(item.id, rating);
    } catch {
      onChanged(item);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    setOpen(false);
    onRemoved(item.id);
    try {
      await removeItem(item.id);
    } catch {
      // The next load restores it; nothing useful to say inline.
    }
  };

  const poster = (
    <div
      className={`relative aspect-[2/3] overflow-hidden rounded-2xl bg-card card-hover ${
        selected ? 'ring-2 ring-accent' : ''
      }`}
    >
      <Image
        src={getImageUrl(item.poster_path, 'w500')}
        alt={item.title}
        fill
        sizes="(max-width: 768px) 50vw, (max-width: 1200px) 33vw, 20vw"
        className="object-cover group-hover:scale-110 transition-transform duration-500"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />

      <span
        className={`absolute bottom-3 left-3 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider backdrop-blur-md ${
          STATUS_TONE[item.status]
        }`}
      >
        {STATUS_LABEL[item.status]}
      </span>

      {item.rating != null && (
        <span className="absolute bottom-3 right-3 flex items-center gap-1 px-2 py-0.5 rounded-md bg-black/70 backdrop-blur-md border border-white/10 text-[10px] font-bold">
          <Star size={10} className="text-yellow-500 fill-yellow-500" />
          {item.rating}
        </span>
      )}

      {selectable && (
        <span
          className={`absolute top-3 left-3 w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-colors ${
            selected
              ? 'bg-accent border-accent text-white'
              : 'bg-black/50 border-white/40 backdrop-blur-md'
          }`}
        >
          {selected && <Check size={14} strokeWidth={3} />}
        </span>
      )}
    </div>
  );

  return (
    <div className="group relative">
      {selectable ? (
        <button
          onClick={() => onToggleSelect?.(item.id)}
          className="block w-full text-left"
          aria-pressed={selected}
        >
          {poster}
        </button>
      ) : (
        <Link href={href} className="block">
          {poster}
        </Link>
      )}

      {editable && !selectable && (
        <>
          <button
            onClick={(e) => {
              e.preventDefault();
              setOpen((v) => !v);
            }}
            className="absolute top-3 right-3 z-20 p-1.5 rounded-lg bg-black/60 backdrop-blur-md border border-white/10 text-white opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
            aria-label={`Options for ${item.title}`}
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : <MoreVertical size={14} />}
          </button>

          {open && (
            <>
              <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
              <div className="absolute top-11 right-3 z-30 w-44 rounded-2xl bg-card border border-white/10 shadow-2xl p-1.5">
                <p className="px-2 py-1 text-[9px] font-bold text-white/30 uppercase tracking-widest">
                  Status
                </p>
                {WATCH_STATUSES.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => changeStatus(s.id)}
                    className={`w-full flex items-center justify-between px-2 py-1.5 rounded-lg text-xs transition-colors ${
                      item.status === s.id
                        ? 'bg-accent/20 text-accent font-bold'
                        : 'text-white/70 hover:bg-white/5 hover:text-white'
                    }`}
                  >
                    <span>{s.label}</span>
                    {item.status === s.id && <Check size={12} />}
                  </button>
                ))}

                <p className="px-2 pt-2 pb-1 text-[9px] font-bold text-white/30 uppercase tracking-widest">
                  Your score
                </p>
                <div className="grid grid-cols-5 gap-1 px-1">
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                    <button
                      key={n}
                      // Tapping the current score clears it, so there's a way
                      // back to "unrated" without a separate control.
                      onClick={() => changeRating(item.rating === n ? null : n)}
                      className={`py-1 rounded-md text-[10px] font-bold transition-colors ${
                        item.rating === n
                          ? 'bg-accent text-white'
                          : 'bg-white/5 text-white/50 hover:bg-white/10 hover:text-white'
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>

                <button
                  onClick={remove}
                  className="w-full flex items-center gap-2 mt-2 px-2 py-1.5 rounded-lg text-xs text-red-400 hover:bg-red-500/10 transition-colors"
                >
                  <Trash2 size={12} />
                  <span>Remove</span>
                </button>
              </div>
            </>
          )}
        </>
      )}

      <div className="mt-3 space-y-0.5">
        <Link href={href}>
          <h3 className="font-bold text-sm line-clamp-1 text-white hover:text-accent transition-colors">
            {item.title}
          </h3>
        </Link>
        <p className="text-[11px] text-muted uppercase tracking-wider">
          {item.type === 'tv' ? 'TV' : 'Movie'}
        </p>
      </div>
    </div>
  );
};

export default WatchlistCard;
