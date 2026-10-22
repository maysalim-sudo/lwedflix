'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/components/AuthProvider';
import FriendAvatar from '@/components/FriendAvatar';
import { listUsers, setBanned, purgeUserContent, type AdminUser } from '@/lib/moderation';
import { ShieldCheck, Loader2, AlertCircle, Ban, RotateCcw, Trash2, MessageSquare, Search, X } from 'lucide-react';
import PageShell from '@/components/ui/PageShell';
import { PageSpinner } from '@/components/ui/AuthGate';

export default function AdminPage() {
  const { user, isAdmin, loading: authLoading } = useAuth();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  // Filtered client-side: the RPC already returns the whole list in one
  // round trip, so re-querying per keystroke would be pure overhead.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) =>
        u.username.toLowerCase().includes(q) ||
        (u.display_name ?? '').toLowerCase().includes(q)
    );
  }, [users, query]);

  const load = useCallback(async () => {
    try {
      setUsers(await listUsers());
      setError(null);
    } catch (err: any) {
      setError(err?.message ?? 'Could not load users.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!user || !isAdmin) {
      setLoading(false);
      return;
    }
    load();
  }, [authLoading, user, isAdmin, load]);

  const toggleBan = async (target: AdminUser) => {
    const banning = !target.banned_at;
    if (banning && !window.confirm(`Ban @${target.username}? They'll keep read access but can't post.`)) return;

    setBusyId(target.id);
    try {
      await setBanned(target.id, banning);
      await load();
    } catch (err: any) {
      setError(err?.message ?? 'Could not update that user.');
    } finally {
      setBusyId(null);
    }
  };

  const purge = async (target: AdminUser) => {
    const ok = window.confirm(
      `Delete all content from @${target.username}? Their ${target.post_count} post${target.post_count === 1 ? '' : 's'}, comments and channels will be removed. This can't be undone.`
    );
    if (!ok) return;

    setBusyId(target.id);
    try {
      await purgeUserContent(target.id);
      await load();
    } catch (err: any) {
      setError(err?.message ?? 'Could not remove that content.');
    } finally {
      setBusyId(null);
    }
  };

  if (authLoading || loading) return <PageSpinner />;

  // Cosmetic gate only — every RPC re-checks is_admin() server-side, so
  // reaching this URL directly gains nothing.
  if (!user || !isAdmin) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center space-y-6 px-6 text-center">
        <ShieldCheck size={56} className="text-white/10" />
        <div className="space-y-2">
          <h1 className="text-2xl font-bold">Moderators only</h1>
          <p className="text-muted max-w-sm text-sm">You don&apos;t have access to this page.</p>
        </div>
        <Link href="/" className="text-accent font-bold hover:underline">
          Back to Home
        </Link>
      </div>
    );
  }

  return (
    <PageShell
      icon={ShieldCheck}
      title="Moderation"
      subtitle={query.trim() ? `${filtered.length} of ${users.length} users` : `${users.length} users`}
    >
        {error && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-4 flex items-start space-x-3 text-red-400 text-sm">
            <AlertCircle size={18} className="shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <p className="text-xs text-muted">
          Deleting an account entirely isn&apos;t available here — that requires the service-role
          key from a server, and this app only holds the public key. Use the Supabase dashboard
          (Authentication → Users) for that.
        </p>

        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-white/40" size={18} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by username or name…"
            className="w-full bg-white/5 border border-white/10 rounded-2xl py-3.5 pl-12 pr-11 text-white text-sm placeholder:text-white/30 focus:border-accent focus:bg-white/[0.08] transition-all outline-none"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-white/40 hover:text-white transition-colors"
              title="Clear"
            >
              <X size={15} />
            </button>
          )}
        </div>

        {filtered.length === 0 && (
          <p className="text-muted text-sm text-center py-12">
            No users match &ldquo;{query.trim()}&rdquo;.
          </p>
        )}

        <div className="space-y-2">
          {filtered.map((u) => (
            <div
              key={u.id}
              className={`flex items-center justify-between gap-4 p-4 rounded-2xl border transition-colors ${
                u.banned_at
                  ? 'bg-red-500/[0.04] border-red-500/20'
                  : 'bg-white/[0.02] border-white/5 hover:border-white/10'
              }`}
            >
              <Link href={`/u/${u.username}`} className="flex items-center gap-3 min-w-0 group/u">
                <FriendAvatar profile={u} size={40} />
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-sm font-bold text-white truncate group-hover/u:text-accent transition-colors">
                    {u.display_name || u.username}
                    {u.is_admin && (
                      <span className="px-1.5 py-0.5 rounded bg-accent/20 text-accent text-[9px] uppercase tracking-widest shrink-0">
                        Admin
                      </span>
                    )}
                    {u.banned_at && (
                      <span className="px-1.5 py-0.5 rounded bg-red-500/20 text-red-400 text-[9px] uppercase tracking-widest shrink-0">
                        Banned
                      </span>
                    )}
                  </p>
                  <p className="flex items-center gap-2 text-[11px] text-muted">
                    <span className="truncate">@{u.username}</span>
                    <span className="flex items-center gap-1 shrink-0">
                      <MessageSquare size={9} /> {u.post_count}
                    </span>
                  </p>
                </div>
              </Link>

              {u.id !== user.id && !u.is_admin && (
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => toggleBan(u)}
                    disabled={busyId === u.id}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border transition-all disabled:opacity-40 ${
                      u.banned_at
                        ? 'bg-white/5 border-white/10 text-white/60 hover:text-white'
                        : 'bg-red-500/10 border-red-500/20 text-red-400 hover:bg-red-500/20'
                    }`}
                  >
                    {busyId === u.id ? (
                      <Loader2 className="animate-spin" size={13} />
                    ) : u.banned_at ? (
                      <RotateCcw size={13} />
                    ) : (
                      <Ban size={13} />
                    )}
                    <span>{u.banned_at ? 'Unban' : 'Ban'}</span>
                  </button>

                  <button
                    onClick={() => purge(u)}
                    disabled={busyId === u.id || u.post_count === 0}
                    className="p-2 rounded-xl text-white/20 hover:text-red-400 hover:bg-red-500/10 disabled:opacity-30 transition-colors"
                    title="Delete all their content"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
    </PageShell>
  );
}
