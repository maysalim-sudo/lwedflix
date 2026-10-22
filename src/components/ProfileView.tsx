'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from './AuthProvider';
import ProfileHeader from './ProfileHeader';
import ImageUploadField from './ImageUploadField';
import AccountSettings from './AccountSettings';
import PostComposer from './PostComposer';
import PostFeed from './PostFeed';
import SharedWatchlist from './SharedWatchlist';
import TasteMatch from './TasteMatch';
import FriendRequestButton, { type RelationshipStatus } from './FriendRequestButton';
import MessageButton from './MessageButton';
import PublicWatchlist from './PublicWatchlist';
import { getMyProfile, getProfileByUsername, updateProfile, setUsername, type MyProfile } from '@/lib/profile';
import {
  isUsernameAvailable,
  getFriends,
  getIncomingRequests,
  getOutgoingRequests,
  type PublicProfile,
} from '@/lib/friends';
import {
  User as UserIcon,
  Loader2,
  ArrowLeft,
  AlertCircle,
  Check,
  Pencil,
  AtSign,
  Settings,
  X,
} from 'lucide-react';

const USERNAME_PATTERN = /^[a-z0-9_]{3,20}$/;
type UsernameState = 'idle' | 'invalid' | 'checking' | 'available' | 'taken';

interface ProfileViewProps {
  /** Omit for the signed-in user's own profile. */
  username?: string;
}

/**
 * One profile surface for both /profile and /u/[username]. Ownership —
 * not the route — decides whether the editor and account settings show.
 */
const ProfileView = ({ username: routeUsername }: ProfileViewProps) => {
  const { user, loading: authLoading } = useAuth();

  const [profile, setProfile] = useState<PublicProfile | MyProfile | null>(null);
  const [isOwner, setIsOwner] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [relationship, setRelationship] = useState<{ status: RelationshipStatus; requestId?: string }>({
    status: 'none',
  });

  const [panel, setPanel] = useState<'none' | 'edit' | 'settings'>('none');
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [usernameInput, setUsernameInput] = useState('');
  const [usernameState, setUsernameState] = useState<UsernameState>('idle');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [feedKey, setFeedKey] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // No username in the route means "me", which needs the base table
      // (invite code, username_changed_at) rather than the public view.
      const owner = !routeUsername;
      let p: PublicProfile | MyProfile | null = owner
        ? await getMyProfile()
        : await getProfileByUsername(routeUsername!);

      if (!p) {
        setNotFound(true);
        setProfile(null);
        return;
      }

      // Visiting your own /u/<name> should behave exactly like /profile.
      const mine = !!user && p.id === user.id;
      if (mine && !owner) p = (await getMyProfile()) ?? p;

      setProfile(p);
      setIsOwner(mine || owner);
      setNotFound(false);
      setDisplayName(p.display_name ?? '');
      setBio(p.bio ?? '');
      setUsernameInput(p.username);

      if (!mine && !owner && user) {
        const [friends, incoming, outgoing] = await Promise.all([
          getFriends(),
          getIncomingRequests(),
          getOutgoingRequests(),
        ]);
        const f = friends.find((x) => x.profile.id === p!.id);
        const i = incoming.find((x) => x.profile.id === p!.id);
        const o = outgoing.find((x) => x.profile.id === p!.id);
        if (f) setRelationship({ status: 'friends', requestId: f.requestId });
        else if (i) setRelationship({ status: 'incoming', requestId: i.requestId });
        else if (o) setRelationship({ status: 'outgoing', requestId: o.requestId });
        else setRelationship({ status: 'none' });
      }

      setError(null);
    } catch (err: any) {
      setError(err?.message ?? 'Could not load this profile.');
    } finally {
      setLoading(false);
    }
  }, [routeUsername, user]);

  useEffect(() => {
    if (authLoading) return;
    if (!user && !routeUsername) {
      setLoading(false);
      return;
    }
    load();
  }, [authLoading, user, routeUsername, load]);

  // Debounced availability check, skipping your own current name —
  // is_username_available has no self-exclusion and would call it taken.
  useEffect(() => {
    if (panel !== 'edit' || !profile) return;
    if (usernameInput === profile.username) {
      setUsernameState('idle');
      return;
    }
    if (!USERNAME_PATTERN.test(usernameInput)) {
      setUsernameState('invalid');
      return;
    }
    setUsernameState('checking');
    const timer = setTimeout(async () => {
      try {
        setUsernameState((await isUsernameAvailable(usernameInput)) ? 'available' : 'taken');
      } catch {
        setUsernameState('available');
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [usernameInput, panel, profile]);

  const persistImage = async (field: 'avatar_url' | 'cover_url', url: string | null) => {
    setProfile((prev) => (prev ? { ...prev, [field]: url } : prev));
    try {
      await updateProfile({ [field]: url });
    } catch (err: any) {
      setError(err?.message ?? 'Could not save that image.');
      load();
    }
  };

  const save = async () => {
    if (!profile) return;
    setSaving(true);
    setError(null);
    try {
      await updateProfile({ display_name: displayName.trim() || null, bio: bio.trim() || null });
      // Last, because a rate-limit rejection here shouldn't discard the
      // name and bio edits above.
      if (usernameInput !== profile.username) await setUsername(usernameInput);
      await load();
      setPanel('none');
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err: any) {
      setError(err?.message ?? 'Could not save your profile.');
    } finally {
      setSaving(false);
    }
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="animate-spin text-accent" size={40} />
      </div>
    );
  }

  if (!user && !routeUsername) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center space-y-6 px-6">
        <UserIcon size={64} className="text-white/10" />
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold">Your profile</h1>
          <p className="text-muted max-w-sm">Sign in to set up your profile and share what you&apos;re watching.</p>
        </div>
        <Link
          href="/login?redirect=/profile"
          className="bg-accent text-white px-8 py-3 rounded-2xl font-bold shadow-xl shadow-accent/20 hover:scale-105 transition-all"
        >
          Sign In Now
        </Link>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center space-y-6 px-6 text-center">
        <UserIcon size={56} className="text-white/10" />
        <div className="space-y-2">
          <h1 className="text-2xl font-bold">Profile not found</h1>
          <p className="text-muted max-w-sm text-sm">
            No one here goes by @{routeUsername}.
          </p>
        </div>
        <Link href="/friends?tab=people" className="text-accent font-bold hover:underline">
          Find people
        </Link>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center space-y-6 px-6 text-center">
        <AlertCircle size={48} className="text-red-400/60" />
        <div className="space-y-2">
          <h1 className="text-2xl font-bold">Profile not set up yet</h1>
          <p className="text-muted max-w-md text-sm">
            Your account has no profile row. Run the{' '}
            <code className="text-accent">0002_social_posts.sql</code> migration — it backfills
            profiles for accounts created before the social features existed.
          </p>
        </div>
      </div>
    );
  }

  const canSave =
    !saving && usernameState !== 'taken' && usernameState !== 'invalid' && usernameState !== 'checking';

  return (
    <div className="pt-32 pb-20 min-h-screen">
      <div className="container mx-auto px-6 max-w-3xl space-y-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="w-12 h-12 bg-accent/20 border border-accent/20 rounded-2xl flex items-center justify-center text-accent">
              <UserIcon size={24} />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-white tracking-tight">
                {isOwner ? 'Your Profile' : profile.display_name || profile.username}
              </h1>
              <p className="text-muted text-sm">
                {isOwner ? 'How friends see you' : `@${profile.username}`}
              </p>
            </div>
          </div>
          <Link
            href="/"
            className="hidden md:flex items-center space-x-2 text-muted hover:text-white transition-colors text-sm font-medium"
          >
            <ArrowLeft size={16} />
            <span>Back to Home</span>
          </Link>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-4 flex items-start space-x-3 text-red-400 text-sm">
            <AlertCircle size={18} className="shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {saved && (
          <div className="bg-accent/10 border border-accent/20 rounded-2xl p-4 flex items-center space-x-3 text-accent text-sm">
            <Check size={18} />
            <span>Profile saved.</span>
          </div>
        )}

        <ProfileHeader
          profile={profile}
          actions={
            isOwner ? (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPanel((p) => (p === 'edit' ? 'none' : 'edit'))}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-white text-xs font-bold hover:bg-white/10 transition-all"
                >
                  {panel === 'edit' ? <X size={14} /> : <Pencil size={14} />}
                  <span>{panel === 'edit' ? 'Close' : 'Edit'}</span>
                </button>
                <button
                  onClick={() => setPanel((p) => (p === 'settings' ? 'none' : 'settings'))}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-white text-xs font-bold hover:bg-white/10 transition-all"
                  title="Account settings"
                >
                  <Settings size={14} />
                  <span className="hidden sm:inline">Settings</span>
                </button>
              </div>
            ) : (
              user && (
                <div className="flex items-center gap-2">
                  {/* Messaging is friends-only server-side, so only offer
                      it once the friendship actually exists. */}
                  {relationship.status === 'friends' && (
                    <MessageButton userId={profile.id} />
                  )}
                  <FriendRequestButton
                    profileId={profile.id}
                    status={relationship.status}
                    requestId={relationship.requestId}
                    onChanged={load}
                  />
                </div>
              )
            )
          }
        />

        {isOwner && panel === 'settings' && <AccountSettings />}

        {isOwner && panel === 'edit' && (
          <div className="p-6 rounded-3xl bg-white/[0.02] border border-white/5 space-y-6">
            <h2 className="text-lg font-bold text-white">Edit profile</h2>

            <div className="grid gap-6 sm:grid-cols-2">
              <ImageUploadField
                label="Profile picture"
                bucket="avatars"
                mode="avatar"
                shape="circle"
                currentUrl={profile.avatar_url}
                onUploaded={(url) => persistImage('avatar_url', url)}
              />
              <ImageUploadField
                label="Cover photo"
                bucket="covers"
                mode="cover"
                shape="banner"
                currentUrl={profile.cover_url}
                onUploaded={(url) => persistImage('cover_url', url)}
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-white/40 uppercase tracking-[0.2em] ml-1 block">
                Display name
              </label>
              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value.slice(0, 50))}
                placeholder="Your name"
                className="w-full bg-white/5 border border-white/10 rounded-2xl py-3 px-4 text-white text-sm focus:border-accent focus:bg-white/[0.08] transition-all outline-none"
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-white/40 uppercase tracking-[0.2em] ml-1 block">
                Username
              </label>
              <div className="relative">
                <AtSign className="absolute left-4 top-1/2 -translate-y-1/2 text-white/40" size={16} />
                <input
                  value={usernameInput}
                  onChange={(e) =>
                    setUsernameInput(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 20))
                  }
                  className="w-full bg-white/5 border border-white/10 rounded-2xl py-3 pl-11 pr-11 text-white text-sm focus:border-accent focus:bg-white/[0.08] transition-all outline-none"
                />
                {usernameState === 'checking' && (
                  <Loader2 className="absolute right-4 top-1/2 -translate-y-1/2 animate-spin text-white/40" size={15} />
                )}
                {usernameState === 'available' && (
                  <Check className="absolute right-4 top-1/2 -translate-y-1/2 text-accent" size={15} />
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
                <p className="text-[11px] text-accent ml-1">@{usernameInput} is available.</p>
              )}
              {usernameState === 'idle' && (
                <p className="text-[11px] text-white/40 ml-1">
                  Changeable once every 7 days. Changing it breaks old links to your profile.
                </p>
              )}
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-white/40 uppercase tracking-[0.2em] ml-1 block">
                Bio
              </label>
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value.slice(0, 300))}
                rows={3}
                placeholder="Tell your friends what you're into."
                className="w-full bg-white/5 border border-white/10 rounded-2xl py-3 px-4 text-white text-sm focus:border-accent focus:bg-white/[0.08] transition-all outline-none resize-none"
              />
              <p className="text-[11px] text-white/30 ml-1 text-right">{bio.length}/300</p>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={save}
                disabled={!canSave}
                className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-accent text-white text-xs font-bold uppercase tracking-widest shadow-lg shadow-accent/20 hover:bg-accent/90 disabled:opacity-50 transition-all"
              >
                {saving ? <Loader2 className="animate-spin" size={14} /> : <Check size={14} />}
                <span>Save changes</span>
              </button>
              <button
                onClick={() => setPanel('none')}
                disabled={saving}
                className="px-6 py-3 rounded-2xl bg-white/5 border border-white/10 text-white/60 text-xs font-bold uppercase tracking-widest hover:text-white hover:bg-white/10 disabled:opacity-50 transition-all"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Shows only when they've made the list public; the RPC returns
            nothing otherwise, so this collapses to null on its own. */}
        {!isOwner && <PublicWatchlist ownerId={profile.id} />}

        {/* Only meaningful between friends — RLS would return an empty
            list to anyone else anyway. */}
        {!isOwner && relationship.status === 'friends' && (
          <TasteMatch
            friendId={profile.id}
            friendName={profile.display_name || profile.username}
          />
        )}

        {!isOwner && relationship.status === 'friends' && (
          <div className="space-y-4">
            <h2 className="text-xl font-bold text-white">
              Shared watchlist
            </h2>
            <SharedWatchlist
              friendId={profile.id}
              friendName={profile.display_name || profile.username}
            />
          </div>
        )}

        {isOwner && <PostComposer onPosted={() => setFeedKey((k) => k + 1)} placeholder="Share something…" />}

        <div className="space-y-4">
          <h2 className="text-xl font-bold text-white">{isOwner ? 'Your posts' : 'Posts'}</h2>
          <PostFeed
            userId={profile.id}
            refreshKey={feedKey}
            emptyTitle={isOwner ? 'You haven’t posted yet' : 'No posts to show'}
            emptyBody={
              isOwner
                ? 'Anything you post shows up here and in your friends’ feeds.'
                : 'Posts you’re allowed to see will appear here.'
            }
          />
        </div>
      </div>
    </div>
  );
};

export default ProfileView;
