'use client';

import React, { Suspense, useCallback, useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import PageShell from '@/components/ui/PageShell';
import { PageSpinner, SignInPrompt } from '@/components/ui/AuthGate';
import EmptyState from '@/components/ui/EmptyState';
import FriendAvatar from '@/components/FriendAvatar';
import DmThreadView from '@/components/DmThreadView';
import { getThreads, subscribeToMessages, type DmThread } from '@/lib/dm';
import Link from 'next/link';
import { MessageCircle, AlertCircle } from 'lucide-react';

const MessagesInner = () => {
  const { user, loading: authLoading } = useAuth();
  const params = useSearchParams();
  const router = useRouter();

  const [threads, setThreads] = useState<DmThread[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const activeId = params.get('thread');

  const load = useCallback(async () => {
    try {
      setThreads(await getThreads());
      setError(null);
    } catch (err: any) {
      setError(err?.message ?? 'Could not load your conversations.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authLoading) return;
    // Clear the spinner even when signed out — the signed-out branch
    // renders below the loading check.
    if (!user) {
      setLoading(false);
      return;
    }
    load();
  }, [authLoading, user, load]);

  // Any new message anywhere re-orders the list and updates unread counts.
  useEffect(() => {
    if (!user) return;
    return subscribeToMessages(() => load());
  }, [user, load]);

  if (authLoading || loading) return <PageSpinner />;

  if (!user) {
    return (
      <SignInPrompt
        icon={MessageCircle}
        title="Messages"
        body="Sign in to message your friends."
        redirectTo="/messages"
      />
    );
  }

  const active = threads.find((t) => t.thread_id === activeId) ?? null;
  const totalUnread = threads.reduce((n, t) => n + t.unread_count, 0);

  const select = (id: string | null) => {
    router.replace(id ? `/messages?thread=${id}` : '/messages');
  };

  return (
    <PageShell
      icon={MessageCircle}
      title="Messages"
      subtitle={
        totalUnread > 0
          ? `${totalUnread} unread message${totalUnread === 1 ? '' : 's'}`
          : 'Your conversations with friends'
      }
      width="wide"
    >
      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-4 flex items-start gap-3 text-red-400 text-sm">
          <AlertCircle size={18} className="shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {threads.length === 0 && !error ? (
        <EmptyState
          icon={MessageCircle}
          title="No conversations yet"
          body="Open a friend's profile and hit Message to start one."
          action={
            <Link
              href="/friends"
              className="inline-block text-accent font-bold text-sm hover:underline"
            >
              Go to friends
            </Link>
          }
        />
      ) : (
        <div className="grid md:grid-cols-[320px_1fr] gap-6">
          {/* On mobile the list hides once a thread is open — two panes
              don't fit, and the thread is what you came for. */}
          <div className={`space-y-1.5 ${active ? 'hidden md:block' : ''}`}>
            {threads.map((t) => {
              const isActive = t.thread_id === activeId;
              const name = t.display_name || t.username;
              return (
                <button
                  key={t.thread_id}
                  onClick={() => select(t.thread_id)}
                  className={`w-full flex items-center gap-3 p-3 rounded-2xl border text-left transition-colors ${
                    isActive
                      ? 'bg-accent/10 border-accent/30'
                      : 'bg-white/[0.02] border-white/5 hover:border-white/10'
                  }`}
                >
                  <FriendAvatar profile={t} size={40} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-white truncate">{name}</p>
                    <p
                      className={`text-[11px] truncate ${
                        t.unread_count > 0 ? 'text-white/80 font-medium' : 'text-muted'
                      }`}
                    >
                      {t.last_body
                        ? `${t.last_sender_id === user.id ? 'You: ' : ''}${t.last_body}`
                        : 'No messages yet'}
                    </p>
                  </div>
                  {t.unread_count > 0 && (
                    <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-accent text-white text-[10px] font-bold flex items-center justify-center shrink-0">
                      {t.unread_count > 9 ? '9+' : t.unread_count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div className={active ? '' : 'hidden md:block'}>
            {active ? (
              <DmThreadView
                key={active.thread_id}
                thread={active}
                myId={user.id}
                onBack={() => select(null)}
                onRead={load}
              />
            ) : (
              <div className="h-[70vh] rounded-3xl bg-white/[0.02] border border-white/5 flex items-center justify-center">
                <p className="text-sm text-muted">Pick a conversation to start reading.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </PageShell>
  );
};

// useSearchParams opts this subtree out of prerendering, so it needs a
// Suspense boundary or the build fails on this route.
const MessagesPage = () => (
  <Suspense fallback={<PageSpinner />}>
    <MessagesInner />
  </Suspense>
);

export default MessagesPage;
