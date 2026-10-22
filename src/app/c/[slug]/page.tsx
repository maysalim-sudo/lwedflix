'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import PostComposer from '@/components/PostComposer';
import PostFeed from '@/components/PostFeed';
import { getChannelBySlug, joinChannel, leaveChannel, type Channel } from '@/lib/channels';
import { Hash, Loader2, Users, MessageSquare, AlertCircle } from 'lucide-react';
import PageShell from '@/components/ui/PageShell';
import EmptyState from '@/components/ui/EmptyState';
import { PageSpinner, SignInPrompt } from '@/components/ui/AuthGate';

export default function ChannelPage() {
  const params = useParams<{ slug: string }>();
  const slug = params?.slug ?? '';
  const { user, loading: authLoading } = useAuth();

  const [channel, setChannel] = useState<Channel | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [feedKey, setFeedKey] = useState(0);

  const load = useCallback(async () => {
    try {
      setChannel(await getChannelBySlug(slug));
      setError(null);
    } catch (err: any) {
      setError(err?.message ?? 'Could not load this channel.');
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setLoading(false);
      return;
    }
    load();
  }, [authLoading, user, load]);

  const toggleMembership = async () => {
    if (!channel) return;
    setBusy(true);
    const wasMember = channel.is_member;
    setChannel({
      ...channel,
      is_member: !wasMember,
      member_count: channel.member_count + (wasMember ? -1 : 1),
    });
    try {
      if (wasMember) await leaveChannel(channel.id);
      else await joinChannel(channel.id);
    } catch (err: any) {
      setError(err?.message ?? 'Could not update membership.');
      load();
    } finally {
      setBusy(false);
    }
  };

  if (authLoading || loading) return <PageSpinner />;

  if (!user) {
    return (
      <SignInPrompt
        icon={Hash}
        title="Channels are for members"
        body="Sign in to read and post in channels."
        redirectTo={`/c/${slug}`}
      />
    );
  }

  if (!channel) {
    return (
      <EmptyState
        icon={Hash}
        title="Channel not found"
        body={`Nothing here goes by c/${slug}.`}
        action={
          <Link href="/friends?tab=channels" className="text-accent font-bold hover:underline">
            Browse channels
          </Link>
        }
      />
    );
  }

  return (
    <PageShell
      icon={Hash}
      title={channel.name}
      backHref="/friends?tab=channels"
      backLabel="All channels"
      width="narrow"
      subtitle={
        <span className="flex items-center gap-3">
          <span>c/{channel.slug}</span>
          <span className="flex items-center gap-1">
            <Users size={12} /> {channel.member_count}
          </span>
          <span className="flex items-center gap-1">
            <MessageSquare size={12} /> {channel.post_count}
          </span>
        </span>
      }
    >
        {channel.description && (
          <p className="text-sm text-white/70 leading-relaxed">{channel.description}</p>
        )}

        {error && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-4 flex items-start space-x-3 text-red-400 text-sm">
            <AlertCircle size={18} className="shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <button
          onClick={toggleMembership}
          disabled={busy}
          className={`px-5 py-2.5 rounded-xl text-xs font-bold transition-all border ${
            channel.is_member
              ? 'bg-white/5 border-white/10 text-white/50 hover:text-white'
              : 'bg-accent border-accent text-white hover:bg-accent/90'
          }`}
        >
          {channel.is_member ? 'Joined — leave channel' : 'Join channel'}
        </button>

        {/* Anyone signed in may post: channels are public spaces, and
            gating the composer on membership just adds a step before the
            join people were going to do anyway. */}
        <PostComposer
          channelId={channel.id}
          onPosted={() => setFeedKey((k) => k + 1)}
          placeholder={`Post in ${channel.name}…`}
        />

        <PostFeed
          channelId={channel.id}
          refreshKey={feedKey}
          emptyTitle="Nothing posted here yet"
          emptyBody="Be the first to start a conversation in this channel."
        />
    </PageShell>
  );
}
