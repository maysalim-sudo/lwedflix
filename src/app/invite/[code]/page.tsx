'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { useAuth } from '@/components/AuthProvider';
import FriendAvatar from '@/components/FriendAvatar';
import UserLink from '@/components/UserLink';
import { acceptInvite, type PublicProfile } from '@/lib/friends';
import { Users, Loader2, AlertCircle, Check, Film } from 'lucide-react';

type State =
  | { kind: 'idle' }
  | { kind: 'redeeming' }
  | { kind: 'done'; friend: PublicProfile | null }
  | { kind: 'error'; message: string };

export default function InvitePage() {
  const params = useParams<{ code: string }>();
  const code = params?.code ?? '';
  const { user, loading: authLoading } = useAuth();
  const [state, setState] = useState<State>({ kind: 'idle' });

  // Redeeming mutates the friend graph, so it must happen exactly once —
  // React 18 dev double-invokes effects, and auth state settling can
  // re-run this too.
  const redeemed = useRef(false);

  useEffect(() => {
    if (authLoading || !user || !code || redeemed.current) return;
    redeemed.current = true;

    setState({ kind: 'redeeming' });
    acceptInvite(code)
      .then((friend) => setState({ kind: 'done', friend }))
      .catch((err: any) =>
        setState({ kind: 'error', message: err?.message ?? 'This invite link could not be used.' })
      );
  }, [authLoading, user, code]);

  return (
    <div className="min-h-screen flex items-center justify-center px-6 py-32">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-accent/10 rounded-full blur-[128px]" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-accent/5 rounded-full blur-[128px]" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md relative z-10"
      >
        <div className="bg-card border border-white/10 rounded-[32px] p-8 md:p-10 shadow-2xl backdrop-blur-xl text-center">
          <Link href="/" className="inline-flex items-center space-x-2 mb-6 group">
            <div className="w-12 h-12 bg-accent rounded-2xl flex items-center justify-center text-white shadow-xl shadow-accent/20 group-hover:scale-110 transition-transform">
              <Film size={24} />
            </div>
          </Link>

          {authLoading && (
            <div className="py-6 flex justify-center">
              <Loader2 className="animate-spin text-accent" size={32} />
            </div>
          )}

          {!authLoading && !user && (
            <>
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-accent/20 border border-accent/20 text-accent mb-6">
                <Users size={28} />
              </div>
              <h1 className="text-2xl font-bold text-white tracking-tight mb-2">
                You&apos;ve been invited
              </h1>
              <p className="text-muted text-sm mb-8">
                Sign in and you&apos;ll be connected automatically. Your invite link is saved.
              </p>
              <div className="space-y-3">
                <Link
                  href={`/login?redirect=/invite/${encodeURIComponent(code)}`}
                  className="block w-full bg-accent text-white py-4 rounded-2xl font-bold tracking-widest uppercase text-xs shadow-xl shadow-accent/20 hover:bg-accent/90 transition-all"
                >
                  Sign In
                </Link>
                <Link
                  href={`/signup?redirect=/invite/${encodeURIComponent(code)}`}
                  className="block w-full bg-white/5 border border-white/10 text-white py-4 rounded-2xl font-bold tracking-widest uppercase text-xs hover:bg-white/10 transition-all"
                >
                  Create Account
                </Link>
              </div>
            </>
          )}

          {!authLoading && user && state.kind === 'redeeming' && (
            <div className="py-6 space-y-4">
              <Loader2 className="animate-spin text-accent mx-auto" size={32} />
              <p className="text-muted text-sm">Connecting you…</p>
            </div>
          )}

          {state.kind === 'done' && (
            <>
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-accent/20 border border-accent/20 text-accent mb-6">
                <Check size={28} />
              </div>
              <h1 className="text-2xl font-bold text-white tracking-tight mb-2">You&apos;re connected</h1>
              {state.friend ? (
                <div className="flex items-center justify-center gap-3 my-6">
                  <UserLink username={state.friend.username} nested>
                    <FriendAvatar profile={state.friend} size={48} />
                  </UserLink>
                  <div className="text-left">
                    <p className="text-sm font-bold text-white">
                      {state.friend.display_name || state.friend.username}
                    </p>
                    <p className="text-xs text-muted">@{state.friend.username}</p>
                  </div>
                </div>
              ) : (
                <p className="text-muted text-sm mb-8">You&apos;re now friends.</p>
              )}
              <Link
                href="/friends"
                className="block w-full bg-accent text-white py-4 rounded-2xl font-bold tracking-widest uppercase text-xs shadow-xl shadow-accent/20 hover:bg-accent/90 transition-all"
              >
                Go to Friends
              </Link>
            </>
          )}

          {state.kind === 'error' && (
            <>
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-500/10 border border-red-500/20 text-red-400 mb-6">
                <AlertCircle size={28} />
              </div>
              <h1 className="text-2xl font-bold text-white tracking-tight mb-2">
                Invite link didn&apos;t work
              </h1>
              <p className="text-muted text-sm mb-8">{state.message}</p>
              <Link
                href="/friends"
                className="block w-full bg-white/5 border border-white/10 text-white py-4 rounded-2xl font-bold tracking-widest uppercase text-xs hover:bg-white/10 transition-all"
              >
                Go to Friends
              </Link>
            </>
          )}
        </div>
      </motion.div>
    </div>
  );
}
