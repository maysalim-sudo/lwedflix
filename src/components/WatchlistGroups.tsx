'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import FriendAvatar from './FriendAvatar';
import EmptyState from './ui/EmptyState';
import { getImageUrl } from '@/lib/imageUrl';
import { getFriends, type Friend } from '@/lib/friends';
import {
  getMyGroups,
  getGroupItems,
  createGroup,
  addMembers,
  setGroupItemStatus,
  removeGroupItem,
  setGroupVote,
  leaveGroup,
  type WatchlistGroup,
  type GroupItem,
} from '@/lib/watchlistGroups';
import {
  Loader2,
  Users,
  Plus,
  X,
  Check,
  RotateCcw,
  Trash2,
  ArrowBigUp,
  AlertCircle,
  ArrowLeft,
  UserPlus,
  LogOut,
} from 'lucide-react';

/** Shared watchlists, now with any number of people in them. */
const WatchlistGroups = () => {
  const [groups, setGroups] = useState<WatchlistGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [friends, setFriends] = useState<Friend[]>([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setGroups(await getMyGroups());
      setError(null);
    } catch (err: any) {
      setError(err?.message ?? 'Could not load your shared lists.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!creating || friends.length > 0) return;
    getFriends().then(setFriends).catch(() => setFriends([]));
  }, [creating, friends.length]);

  const submitGroup = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const id = await createGroup(name.trim(), [...picked]);
      setName('');
      setPicked(new Set());
      setCreating(false);
      await load();
      setOpenId(id);
    } catch (err: any) {
      setError(err?.message ?? 'Could not create that list.');
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="animate-spin text-accent" size={28} />
      </div>
    );
  }

  const openGroup = groups.find((g) => g.id === openId) ?? null;

  if (openGroup) {
    return (
      <GroupDetail
        group={openGroup}
        friends={friends}
        onBack={() => {
          setOpenId(null);
          load();
        }}
        onNeedFriends={() => {
          if (friends.length === 0) getFriends().then(setFriends).catch(() => {});
        }}
      />
    );
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-4 flex items-start gap-3 text-red-400 text-sm">
          <AlertCircle size={18} className="shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <div className="flex items-center justify-between gap-3">
        <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest">
          Shared lists
        </p>
        <button
          onClick={() => setCreating((v) => !v)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 border border-white/10 text-[10px] font-bold uppercase tracking-widest text-white/70 hover:text-white transition-colors"
        >
          {creating ? <X size={12} /> : <Plus size={12} />}
          <span>{creating ? 'Cancel' : 'New list'}</span>
        </button>
      </div>

      {creating && (
        <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/5 space-y-3">
          <input
            value={name}
            onChange={(e) => setName(e.target.value.slice(0, 60))}
            placeholder="List name — e.g. Friday horror nights"
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-accent/40 transition-colors"
          />

          <div>
            <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest mb-2">
              Add friends ({picked.size} selected)
            </p>
            {friends.length === 0 ? (
              <p className="text-xs text-muted">
                You can create the list now and add people once you have friends.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {friends.map((f) => {
                  const on = picked.has(f.profile.id);
                  return (
                    <button
                      key={f.profile.id}
                      onClick={() =>
                        setPicked((prev) => {
                          const next = new Set(prev);
                          if (next.has(f.profile.id)) next.delete(f.profile.id);
                          else next.add(f.profile.id);
                          return next;
                        })
                      }
                      className={`flex items-center gap-2 px-2.5 py-1.5 rounded-xl border text-xs transition-colors ${
                        on
                          ? 'bg-accent/10 border-accent/30 text-accent'
                          : 'bg-white/5 border-white/10 text-white/60 hover:text-white'
                      }`}
                    >
                      <FriendAvatar profile={f.profile} size={20} />
                      <span className="truncate max-w-[120px]">
                        {f.profile.display_name || f.profile.username}
                      </span>
                      {on && <Check size={12} />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <button
            onClick={submitGroup}
            disabled={busy || !name.trim()}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-accent text-white text-xs font-bold disabled:opacity-40 hover:bg-accent/90 transition-all"
          >
            {busy ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
            <span>Create list</span>
          </button>
        </div>
      )}

      {groups.length === 0 && !creating ? (
        <EmptyState
          icon={Users}
          compact
          title="No shared lists yet"
          body="Create one and invite as many friends as you like."
        />
      ) : (
        <div className="space-y-2">
          {groups.map((g) => (
            <button
              key={g.id}
              onClick={() => setOpenId(g.id)}
              className="w-full flex items-center gap-3 p-4 rounded-2xl bg-white/[0.02] border border-white/5 hover:border-white/10 transition-colors text-left"
            >
              <div className="w-10 h-10 rounded-xl bg-accent/15 border border-accent/20 flex items-center justify-center text-accent shrink-0">
                <Users size={18} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-white truncate">{g.name}</p>
                <p className="text-[11px] text-muted truncate">
                  {g.member_count} {g.member_count === 1 ? 'member' : 'members'}
                  {g.member_usernames.length > 0 && ` · with ${g.member_usernames.join(', ')}`}
                </p>
              </div>
              {g.pending_count > 0 && (
                <span className="min-w-[22px] h-6 px-2 rounded-full bg-accent/15 text-accent text-[10px] font-bold flex items-center justify-center shrink-0">
                  {g.pending_count}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

/** One group's titles, with voting. */
const GroupDetail = ({
  group,
  friends,
  onBack,
  onNeedFriends,
}: {
  group: WatchlistGroup;
  friends: Friend[];
  onBack: () => void;
  onNeedFriends: () => void;
}) => {
  const [items, setItems] = useState<GroupItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    try {
      setItems(await getGroupItems(group.id));
      setError(null);
    } catch (err: any) {
      setError(err?.message ?? 'Could not load this list.');
    } finally {
      setLoading(false);
    }
  }, [group.id]);

  useEffect(() => {
    load();
    onNeedFriends();
    // onNeedFriends is a stable-enough parent callback; re-running on it
    // would refetch friends every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load]);

  const vote = async (item: GroupItem) => {
    const next = !item.i_voted;
    setItems((prev) =>
      prev.map((i) =>
        i.id === item.id
          ? { ...i, i_voted: next, vote_count: i.vote_count + (next ? 1 : -1) }
          : i
      )
    );
    try {
      await setGroupVote(item.id, next);
    } catch (err: any) {
      setError(err?.message ?? 'Could not register that vote.');
      load();
    }
  };

  const toggleWatched = async (item: GroupItem) => {
    const next = item.status === 'watched' ? 'pending' : 'watched';
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, status: next } : i)));
    try {
      await setGroupItemStatus(item.id, next);
    } catch (err: any) {
      setError(err?.message ?? 'Could not update that item.');
      load();
    }
  };

  const remove = async (item: GroupItem) => {
    setItems((prev) => prev.filter((i) => i.id !== item.id));
    try {
      await removeGroupItem(item.id);
    } catch (err: any) {
      setError(err?.message ?? 'Could not remove that item.');
      load();
    }
  };

  const invite = async (friendId: string) => {
    try {
      await addMembers(group.id, [friendId]);
      setAdding(false);
    } catch (err: any) {
      setError(err?.message ?? 'Could not add them.');
    }
  };

  const pending = items.filter((i) => i.status === 'pending');
  const watched = items.filter((i) => i.status === 'watched');

  const row = (item: GroupItem) => (
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
            {item.added_by_display_name || `@${item.added_by_username}`}
          </p>
        </div>
      </Link>

      <div className="flex items-center gap-1 shrink-0">
        {item.status === 'pending' && (
          <button
            onClick={() => vote(item)}
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
          className="p-2 rounded-xl text-white/30 hover:text-accent hover:bg-accent/10 transition-colors"
          title={item.status === 'watched' ? 'Mark as not watched' : 'Mark as watched'}
        >
          {item.status === 'watched' ? <RotateCcw size={15} /> : <Check size={15} />}
        </button>
        <button
          onClick={() => remove(item)}
          className="p-2 rounded-xl text-white/20 hover:text-red-400 hover:bg-red-500/10 transition-colors"
          title="Remove"
        >
          <Trash2 size={15} />
        </button>
      </div>
    </div>
  );

  const invitable = friends.filter((f) => !group.member_usernames.includes(f.profile.username));

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="p-2 rounded-xl text-white/40 hover:text-white hover:bg-white/5 transition-colors"
          aria-label="Back to lists"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="min-w-0 flex-1">
          <h3 className="text-lg font-bold text-white truncate">{group.name}</h3>
          <p className="text-[11px] text-muted truncate">
            {group.member_count} {group.member_count === 1 ? 'member' : 'members'}
          </p>
        </div>
        <button
          onClick={() => setAdding((v) => !v)}
          className="p-2 rounded-xl text-white/40 hover:text-accent hover:bg-accent/10 transition-colors"
          title="Add someone"
        >
          <UserPlus size={17} />
        </button>
        <button
          onClick={() => leaveGroup(group.id).then(onBack).catch(() => {})}
          className="p-2 rounded-xl text-white/30 hover:text-red-400 hover:bg-red-500/10 transition-colors"
          title="Leave this list"
        >
          <LogOut size={17} />
        </button>
      </div>

      {adding && (
        <div className="p-3 rounded-2xl bg-white/[0.02] border border-white/5">
          {invitable.length === 0 ? (
            <p className="text-xs text-muted">Everyone you're friends with is already here.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {invitable.map((f) => (
                <button
                  key={f.profile.id}
                  onClick={() => invite(f.profile.id)}
                  className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl bg-white/5 border border-white/10 text-xs text-white/70 hover:text-white transition-colors"
                >
                  <FriendAvatar profile={f.profile} size={20} />
                  <span>{f.profile.display_name || f.profile.username}</span>
                  <Plus size={12} />
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-4 flex items-start gap-3 text-red-400 text-sm">
          <AlertCircle size={18} className="shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="animate-spin text-accent" size={24} />
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={Users}
          compact
          title="Nothing on this list yet"
          body="Use Recommend on any movie or show to add it here."
        />
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

export default WatchlistGroups;
