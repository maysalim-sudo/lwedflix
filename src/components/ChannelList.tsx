'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  getChannels,
  createChannel,
  joinChannel,
  leaveChannel,
  type Channel,
} from '@/lib/channels';
import { deleteChannel } from '@/lib/moderation';
import { useAuth } from './AuthProvider';
import { Loader2, Plus, Hash, Users, MessageSquare, AlertCircle, X, Trash2, Flame } from 'lucide-react';

/** Browse, create and join channels. */
const ChannelList = () => {
  const { user, isAdmin } = useAuth();
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [creating, setCreating] = useState(false);
  const [slug, setSlug] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setChannels(await getChannels());
      setError(null);
    } catch (err: any) {
      setError(err?.message ?? 'Could not load channels.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const submit = async () => {
    if (!slug.trim() || !name.trim() || saving) return;
    setSaving(true);
    setError(null);
    try {
      await createChannel({ slug, name, description });
      setSlug('');
      setName('');
      setDescription('');
      setCreating(false);
      await load();
    } catch (err: any) {
      setError(err?.message ?? 'Could not create that channel.');
    } finally {
      setSaving(false);
    }
  };

  const removeChannel = async (channel: Channel) => {
    // Posts cascade with the channel, so this is worth confirming.
    const ok = window.confirm(
      `Delete c/${channel.slug}? Its ${channel.post_count} post${channel.post_count === 1 ? '' : 's'} will be removed too. This can't be undone.`
    );
    if (!ok) return;

    setBusyId(channel.id);
    try {
      await deleteChannel(channel.id);
      setChannels((prev) => prev.filter((c) => c.id !== channel.id));
    } catch (err: any) {
      setError(err?.message ?? 'Could not delete that channel.');
    } finally {
      setBusyId(null);
    }
  };

  const toggleMembership = async (channel: Channel) => {
    setBusyId(channel.id);
    // Optimistic: joining should feel immediate.
    setChannels((prev) =>
      prev.map((c) =>
        c.id === channel.id
          ? {
              ...c,
              is_member: !c.is_member,
              member_count: c.member_count + (c.is_member ? -1 : 1),
            }
          : c
      )
    );
    try {
      if (channel.is_member) await leaveChannel(channel.id);
      else await joinChannel(channel.id);
    } catch (err: any) {
      setError(err?.message ?? 'Could not update membership.');
      load();
    } finally {
      setBusyId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="animate-spin text-accent" size={32} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white">Channels</h2>
          <p className="text-muted text-xs">
            Public spaces for a topic — anyone signed in can read and join.
          </p>
        </div>
        <button
          onClick={() => setCreating((v) => !v)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-accent text-white text-xs font-bold hover:bg-accent/90 transition-all shrink-0"
        >
          {creating ? <X size={14} /> : <Plus size={14} />}
          <span>{creating ? 'Cancel' : 'New channel'}</span>
        </button>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-4 flex items-start space-x-3 text-red-400 text-sm">
          <AlertCircle size={18} className="shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {creating && (
        <div className="p-6 rounded-3xl bg-white/[0.02] border border-white/5 space-y-4 max-w-2xl">
          <div className="space-y-2">
            <label className="text-xs font-bold text-white/40 uppercase tracking-[0.2em] ml-1 block">
              Handle
            </label>
            <div className="relative">
              <Hash className="absolute left-4 top-1/2 -translate-y-1/2 text-white/40" size={16} />
              <input
                value={slug}
                onChange={(e) =>
                  setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 24))
                }
                placeholder="horror"
                className="w-full bg-white/5 border border-white/10 rounded-2xl py-3 pl-11 pr-4 text-white text-sm focus:border-accent focus:bg-white/[0.08] transition-all outline-none"
              />
            </div>
            <p className="text-[11px] text-white/40 ml-1">2–24 characters: a–z, 0–9 or _</p>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-white/40 uppercase tracking-[0.2em] ml-1 block">
              Display name
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value.slice(0, 40))}
              placeholder="Horror Movies"
              className="w-full bg-white/5 border border-white/10 rounded-2xl py-3 px-4 text-white text-sm focus:border-accent focus:bg-white/[0.08] transition-all outline-none"
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-white/40 uppercase tracking-[0.2em] ml-1 block">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value.slice(0, 300))}
              rows={2}
              placeholder="What belongs in here?"
              className="w-full bg-white/5 border border-white/10 rounded-2xl py-3 px-4 text-white text-sm focus:border-accent focus:bg-white/[0.08] transition-all outline-none resize-none"
            />
          </div>

          <button
            onClick={submit}
            disabled={!slug.trim() || !name.trim() || saving}
            className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-accent text-white text-xs font-bold uppercase tracking-widest shadow-lg shadow-accent/20 hover:bg-accent/90 disabled:opacity-40 transition-all"
          >
            {saving ? <Loader2 className="animate-spin" size={14} /> : <Plus size={14} />}
            <span>Create channel</span>
          </button>
        </div>
      )}

      {channels.length === 0 ? (
        <div className="py-20 text-center space-y-6">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-white/5 border border-white/10 text-white/20">
            <Hash size={32} />
          </div>
          <div className="space-y-2">
            <h3 className="text-xl font-bold">No channels yet</h3>
            <p className="text-muted max-w-xs mx-auto text-sm">
              Create the first one — a place for horror, anime, weekly picks, anything.
            </p>
          </div>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {channels.map((c) => (
            <div
              key={c.id}
              className="flex items-center justify-between gap-4 p-4 rounded-2xl bg-white/[0.02] border border-white/5 hover:border-white/10 transition-colors"
            >
              <Link href={`/c/${c.slug}`} className="flex items-center gap-3 min-w-0 group/ch">
                <div className="w-10 h-10 rounded-xl bg-accent/20 border border-accent/20 flex items-center justify-center text-accent shrink-0">
                  <Hash size={18} />
                </div>
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 text-sm font-bold text-white truncate group-hover/ch:text-accent transition-colors">
                    <span className="truncate">{c.name}</span>
                    {/* Sorted server-side by last-7-days activity, so this
                        marks what's actually alive right now. */}
                    {c.recent_post_count > 0 && (
                      <span
                        className="flex items-center gap-0.5 text-[9px] font-bold text-accent shrink-0"
                        title={`${c.recent_post_count} post${c.recent_post_count === 1 ? '' : 's'} this week`}
                      >
                        <Flame size={9} />
                        {c.recent_post_count}
                      </span>
                    )}
                  </p>
                  <p className="flex items-center gap-2 text-[11px] text-muted">
                    <span className="truncate">c/{c.slug}</span>
                    <span className="flex items-center gap-1 shrink-0">
                      <Users size={9} /> {c.member_count}
                    </span>
                    <span className="flex items-center gap-1 shrink-0">
                      <MessageSquare size={9} /> {c.post_count}
                    </span>
                  </p>
                </div>
              </Link>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => toggleMembership(c)}
                  disabled={busyId === c.id}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-all border ${
                    c.is_member
                      ? 'bg-white/5 border-white/10 text-white/50 hover:text-white'
                      : 'bg-accent border-accent text-white hover:bg-accent/90'
                  }`}
                >
                  {c.is_member ? 'Joined' : 'Join'}
                </button>

                {(c.created_by === user?.id || isAdmin) && (
                  <button
                    onClick={() => removeChannel(c)}
                    disabled={busyId === c.id}
                    className="p-2 rounded-xl text-white/20 hover:text-red-400 hover:bg-red-500/10 disabled:opacity-40 transition-colors"
                    title={c.created_by === user?.id ? 'Delete channel' : 'Delete channel (moderator)'}
                  >
                    <Trash2 size={15} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ChannelList;
