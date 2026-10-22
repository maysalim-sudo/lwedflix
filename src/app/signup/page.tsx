'use client';

import React, { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import LwedflixLogo from '@/components/LwedflixLogo';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { isUsernameAvailable } from '@/lib/friends';
import { Mail, Lock, User, AtSign, ArrowRight, Loader2, AlertCircle, Check } from 'lucide-react';
import { motion } from 'framer-motion';

const USERNAME_PATTERN = /^[a-z0-9_]{3,20}$/;

/** Only same-origin paths, so ?redirect= can't be used as an open redirect. */
function safeRedirect(raw: string | null): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) return '/';
  return raw;
}

type UsernameState = 'empty' | 'invalid' | 'checking' | 'available' | 'taken';

function SignupForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = safeRedirect(searchParams.get('redirect'));
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [usernameState, setUsernameState] = useState<UsernameState>('empty');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Debounced availability check. This is a convenience only — the real
  // uniqueness guarantee is the DB constraint, and the signup trigger
  // falls back to a numbered suffix if someone wins the race.
  useEffect(() => {
    if (username === '') {
      setUsernameState('empty');
      return;
    }
    if (!USERNAME_PATTERN.test(username)) {
      setUsernameState('invalid');
      return;
    }
    setUsernameState('checking');
    const timer = setTimeout(async () => {
      try {
        setUsernameState((await isUsernameAvailable(username)) ? 'available' : 'taken');
      } catch {
        // Don't block signup on a failed check; the DB is the source of truth.
        setUsernameState('available');
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [username]);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          display_name: fullName,
          username,
        },
      },
    });

    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      // Carry the invite destination through so an invited user lands back
      // on the invite after signing in.
      router.push(redirectTo === '/' ? '/login' : `/login?redirect=${encodeURIComponent(redirectTo)}`);
      router.refresh();
    }
  };

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
        <div className="bg-card border border-white/10 rounded-[32px] p-8 md:p-10 shadow-2xl backdrop-blur-xl">
          <div className="text-center mb-10">
            <Link href="/" className="inline-flex mb-8 group" aria-label="Lwedflix home">
              <LwedflixLogo className="h-9 w-auto drop-shadow-[0_0_16px_rgba(255,140,0,0.3)] group-hover:scale-105 transition-transform" />
            </Link>
            <h1 className="text-3xl font-bold text-white tracking-tight mb-2">Create Account</h1>
            <p className="text-muted text-sm">Join Lwedflix to track your movies and TV shows.</p>
          </div>

          <form onSubmit={handleSignup} className="space-y-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-bold text-white/40 uppercase tracking-[0.2em] ml-1">Full Name</label>
                <div className="relative">
                  <User className="absolute left-4 top-1/2 -translate-y-1/2 text-white/40" size={18} />
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="John Doe"
                    className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 pl-12 pr-4 text-white text-sm focus:border-accent focus:bg-white/[0.08] transition-all outline-none"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-white/40 uppercase tracking-[0.2em] ml-1">Username</label>
                <div className="relative">
                  <AtSign className="absolute left-4 top-1/2 -translate-y-1/2 text-white/40" size={18} />
                  <input
                    type="text"
                    required
                    value={username}
                    // Normalized as you type so what you see is exactly what
                    // the DB constraint will accept.
                    onChange={(e) =>
                      setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 20))
                    }
                    placeholder="johndoe"
                    className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 pl-12 pr-12 text-white text-sm focus:border-accent focus:bg-white/[0.08] transition-all outline-none"
                  />
                  {usernameState === 'checking' && (
                    <Loader2 className="absolute right-4 top-1/2 -translate-y-1/2 animate-spin text-white/40" size={16} />
                  )}
                  {usernameState === 'available' && (
                    <Check className="absolute right-4 top-1/2 -translate-y-1/2 text-accent" size={16} />
                  )}
                </div>
                {usernameState === 'invalid' && (
                  <p className="text-[11px] text-white/40 ml-1">
                    3–20 characters, lowercase letters, numbers and underscores only.
                  </p>
                )}
                {usernameState === 'taken' && (
                  <p className="text-[11px] text-red-400 ml-1">That username is already taken.</p>
                )}
                {usernameState === 'available' && (
                  <p className="text-[11px] text-accent ml-1">@{username} is available.</p>
                )}
                {usernameState === 'empty' && (
                  <p className="text-[11px] text-white/40 ml-1">This is how friends will find you.</p>
                )}
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-white/40 uppercase tracking-[0.2em] ml-1">Email Address</label>
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-white/40" size={18} />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="john@example.com"
                    className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 pl-12 pr-4 text-white text-sm focus:border-accent focus:bg-white/[0.08] transition-all outline-none"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-white/40 uppercase tracking-[0.2em] ml-1">Password</label>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-white/40" size={18} />
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 pl-12 pr-4 text-white text-sm focus:border-accent focus:bg-white/[0.08] transition-all outline-none"
                  />
                </div>
              </div>
            </div>

            {error && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 flex items-start space-x-3 text-red-400 text-sm"
              >
                <AlertCircle size={18} className="shrink-0 mt-0.5" />
                <span>{error}</span>
              </motion.div>
            )}

            <button
              type="submit"
              disabled={loading || usernameState === 'taken' || usernameState === 'invalid'}
              className="group relative w-full bg-accent hover:bg-accent/90 disabled:bg-accent/50 text-white py-4 rounded-2xl font-bold tracking-widest uppercase text-xs shadow-xl shadow-accent/20 transition-all active:scale-[0.98] overflow-hidden"
            >
              <span className="relative z-10 flex items-center justify-center">
                {loading ? (
                  <Loader2 className="animate-spin" size={20} />
                ) : (
                  <>
                    Sign Up
                    <ArrowRight size={18} className="ml-2 group-hover:translate-x-1 transition-transform" />
                  </>
                )}
              </span>
              <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/10 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000" />
            </button>
          </form>

          <p className="text-center mt-10 text-muted text-sm">
            Already have an account?{' '}
            <Link
              href={redirectTo === '/' ? '/login' : `/login?redirect=${encodeURIComponent(redirectTo)}`}
              className="text-white font-bold hover:text-accent transition-colors"
            >
              Sign in
            </Link>
          </p>
        </div>
      </motion.div>
    </div>
  );
}

export default function SignupPage() {
  // useSearchParams opts this subtree out of prerendering, so it needs a
  // Suspense boundary or the build fails on this route.
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <Loader2 className="animate-spin text-accent" size={40} />
        </div>
      }
    >
      <SignupForm />
    </Suspense>
  );
}
