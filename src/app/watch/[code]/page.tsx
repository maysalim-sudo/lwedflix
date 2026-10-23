'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import VideoPlayer from '@/components/VideoPlayer';
import FriendAvatar from '@/components/FriendAvatar';
import UserLink from '@/components/UserLink';
import UpNextCard from '@/components/UpNextCard';
import InviteFriendsButton from '@/components/party/InviteFriendsButton';
import { ReactionBar, ReactionsOverlay, type FloatingReaction } from '@/components/party/Reactions';
import {
  joinParty,
  partyHost,
  getStartedTitle,
  rememberTitle,
  getGuest,
  saveGuestName,
  cleanName,
  buildRoomUrl,
  formatDrift,
  formatTimestamp,
  DRIFT_TOLERANCE_SECONDS,
  type PartyMember,
  type PartyChatMessage,
  type PartyConnection,
  type PartyTitle,
} from '@/lib/watchRoom';
import { fetchProfiles } from '@/lib/friends';
import { timeAgo } from '@/lib/posts';
import { getDesktopPlayer } from '@/lib/desktopPlayer';
import { PartySync, isPartyMessage } from '@/lib/partySync';
import { adjacentEpisode, type EpisodeRef } from '@/lib/episodes';
import {
  Popcorn,
  Loader2,
  Copy,
  Check,
  Send,
  Play,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Lock,
  LockOpen,
} from 'lucide-react';

interface Identity {
  id: string;
  name: string;
  username: string | null;
  avatarUrl: string | null;
}

// True only on the client, without an effect (the guest lives in
// localStorage, which the server render can't see).
const noSubscribe = () => () => {};
const useIsClient = () => useSyncExternalStore(noSubscribe, () => true, () => false);

/** How long to wait for someone carrying the title before calling the room empty. */
const EMPTY_AFTER_MS = 6000;
/** How long a reaction floats over the player. */
const REACTION_MS = 2800;

export default function WatchPartyPage() {
  const params = useParams<{ code: string }>();
  const code = (params?.code ?? '').toUpperCase();
  const { user, loading: authLoading } = useAuth();
  const isClient = useIsClient();

  // ---- Who you are in the room ----------------------------------------
  // Your profile when signed in; otherwise a guest with a name you pick,
  // remembered on this device. No account needed either way.

  const [profile, setProfile] = useState<Identity | null>(null);
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const fallback: Identity = { id: user.id, name: 'Member', username: null, avatarUrl: null };
    fetchProfiles([user.id])
      .then((profiles) => {
        if (cancelled) return;
        const p = profiles.get(user.id);
        setProfile(
          p
            ? { id: user.id, name: cleanName(p.display_name || p.username) || 'Member', username: p.username, avatarUrl: p.avatar_url }
            : fallback
        );
      })
      .catch(() => {
        if (!cancelled) setProfile(fallback);
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  const guest = useMemo(
    () => (isClient && !authLoading && !user ? getGuest() : null),
    [isClient, authLoading, user]
  );
  const [guestName, setGuestName] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState('');
  const needsName = Boolean(guest && !(guestName ?? guest.name));

  const identity = useMemo<Identity | null>(() => {
    if (user) return profile?.id === user.id ? profile : null;
    const name = guestName ?? guest?.name;
    return guest && name ? { id: guest.id, name, username: null, avatarUrl: null } : null;
  }, [user, profile, guest, guestName]);

  // ---- Room state ------------------------------------------------------

  const [members, setMembers] = useState<PartyMember[]>([]);
  const [messages, setMessages] = useState<PartyChatMessage[]>([]);
  const [isEmpty, setIsEmpty] = useState(false);
  const [startsAt, setStartsAt] = useState<number | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const [draft, setDraft] = useState('');
  const connectionRef = useRef<PartyConnection | null>(null);

  // Latest position read from the player, so the heartbeat has something
  // to send between progress events.
  const myPosition = useRef<{ watched: number; duration: number; episodeKey: string | null } | null>(null);

  const [syncHint, setSyncHint] = useState<string | null>(null);
  const hintTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Control of the player, which is what makes playback sync. Null only
  // under `npm run dev` in a browser.
  const [desktopPlayer] = useState(getDesktopPlayer);
  // The stream's <video> exists — i.e. this member has pressed play once.
  const [streamReady, setStreamReady] = useState(false);

  const host = partyHost(members);
  const amHost = Boolean(identity && host?.id === identity.id);
  // The host can lock playback to themselves. Their own switch is local
  // state (Presence is slow to echo); everyone else reads it off the host.
  const [lockPlayback, setLockPlayback] = useState(false);
  const lockRef = useRef(false);
  const hostOnly = amHost ? lockPlayback : Boolean(host?.hostOnly);
  // For the sync callbacks, which outlive any one render.
  const membersRef = useRef<PartyMember[]>([]);
  const amHostRef = useRef(false);
  const hostOnlyRef = useRef(false);
  useEffect(() => {
    membersRef.current = members;
    amHostRef.current = amHost;
    hostOnlyRef.current = hostOnly;
  }, [members, amHost, hostOnly]);

  // The host picks what's on. The creator's tab knows the title, and the
  // host's later episode changes are kept here; everyone else follows the
  // host's copy — and, until Presence catches up, the host's latest
  // episode broadcast.
  const startedTitle = useMemo(() => (isClient ? getStartedTitle(code) : null), [isClient, code]);
  const [changedTitle, setChangedTitle] = useState<PartyTitle | null>(null);
  const [liveEpisode, setLiveEpisode] = useState<(EpisodeRef & { by: string }) | null>(null);
  const myTitle = changedTitle ?? startedTitle;
  const carrier = partyHost(members.filter((m) => m.title));
  let title: PartyTitle | null = null;
  if (amHost || !carrier?.title) {
    title = myTitle ?? carrier?.title ?? null;
  } else {
    title = carrier.title;
    if (title.mediaType === 'tv' && liveEpisode && liveEpisode.by === host?.id) {
      title = { ...title, season: liveEpisode.season, episode: liveEpisode.episode };
    }
  }
  const titleKey = title ? JSON.stringify(title) : null;
  const episodeKey =
    title?.mediaType === 'tv' ? `${title.mediaId}:${title.season ?? 1}:${title.episode ?? 1}` : null;

  const [reactions, setReactions] = useState<FloatingReaction[]>([]);

  const flashHint = useCallback((text: string, ms = 5000) => {
    setSyncHint(text);
    clearTimeout(hintTimer.current);
    hintTimer.current = setTimeout(() => setSyncHint(null), ms);
  }, []);

  // Join the live room, and wire up synced playback: play, pause and seek
  // in anyone's player move everyone's (see partySync.ts).
  useEffect(() => {
    if (!identity || !code) return;
    let sync: PartySync | null = null;
    const reactionTimers = new Set<ReturnType<typeof setTimeout>>();

    const connection = joinParty(
      code,
      { ...identity, joinedAt: Date.now(), title: getStartedTitle(code), hostOnly: lockRef.current },
      {
        onMembers: setMembers,
        onChat: (message) => setMessages((prev) => [...prev, message].slice(-200)),
        onHistory: setMessages,
        onCountdown: setStartsAt,
        onSync: (message) => {
          if (sync && isPartyMessage(message)) sync.handleRemote(message);
        },
        onEpisode: (change) => {
          const host = partyHost(membersRef.current);
          if (change.by !== host?.id) return;
          setLiveEpisode(change);
          flashHint(`${host.name} moved the party to S${change.season} · E${change.episode}`);
        },
        onReaction: (reaction) => {
          const floating: FloatingReaction = {
            id: reaction.id,
            emoji: reaction.emoji,
            name: reaction.by === identity.id ? 'You' : reaction.name,
            x: 8 + Math.random() * 80,
          };
          setReactions((prev) => [...prev, floating].slice(-30));
          const t = setTimeout(() => {
            reactionTimers.delete(t);
            setReactions((prev) => prev.filter((r) => r.id !== floating.id));
          }, REACTION_MS);
          reactionTimers.add(t);
        },
      }
    );
    connectionRef.current = connection;
    const emptyTimer = setTimeout(() => setIsEmpty(true), EMPTY_AFTER_MS);

    let stopListening = () => {};
    let ticker: ReturnType<typeof setInterval> | undefined;
    if (desktopPlayer) {
      const partySync = new PartySync({
        me: identity.id,
        isHost: () => amHostRef.current,
        send: (message) => connection.sync(message),
        command: (command) => desktopPlayer.command(command),
        onRemoteAction: (state) => {
          const name = membersRef.current.find((m) => m.id === state.by)?.name ?? 'Someone';
          const did =
            state.cause === 'pause' ? 'paused at' : state.cause === 'seeked' ? 'jumped to' : 'pressed play at';
          flashHint(`${name} ${did} ${formatTimestamp(state.time)}`);
        },
        canControl: () => amHostRef.current || !hostOnlyRef.current,
        onBlocked: () => flashHint('Only the host controls playback in this party'),
      });
      sync = partySync;
      stopListening = desktopPlayer.onState((state) => {
        partySync.handleLocal(state);
        setStreamReady(state !== null);
      });
      ticker = setInterval(() => partySync.tick(), 1000);
    }

    return () => {
      clearTimeout(emptyTimer);
      clearInterval(ticker);
      reactionTimers.forEach(clearTimeout);
      stopListening();
      connection.leave();
      connectionRef.current = null;
    };
  }, [identity, code, desktopPlayer, flashHint]);

  // Carry the title too, so the room outlives whoever started it.
  useEffect(() => {
    if (titleKey) connectionRef.current?.setTitle(JSON.parse(titleKey));
  }, [titleKey]);

  // Host countdown, ticking locally off the shared start time.
  useEffect(() => {
    if (!startsAt) return;
    const tick = () => {
      const remaining = Math.ceil((startsAt - Date.now()) / 1000);
      setCountdown(remaining > 0 ? remaining : null);
    };
    tick();
    const t = setInterval(tick, 250);
    return () => clearInterval(t);
  }, [startsAt]);

  // Position heartbeat, for the drift readout. Nothing until this member's
  // stream is playing and reporting.
  useEffect(() => {
    const t = setInterval(() => {
      const measured = myPosition.current;
      if (!measured) return;
      connectionRef.current?.reportPosition({
        position: measured.watched,
        duration: measured.duration,
        positionSource: 'measured',
        episodeKey: measured.episodeKey,
      });
    }, 5000);
    return () => clearInterval(t);
  }, []);

  // When the host's countdown hits zero, the host's player starts from the
  // top and everyone else follows through the sync.
  useEffect(() => {
    if (!startsAt || !desktopPlayer || !amHost) return;
    const delay = startsAt - Date.now();
    if (delay <= 0) return;
    const t = setTimeout(() => {
      desktopPlayer.command({ action: 'seek', time: 0 });
      desktopPlayer.command({ action: 'play' });
    }, delay);
    return () => clearTimeout(t);
  }, [startsAt, amHost, desktopPlayer]);

  // The host's next episode, looked up ahead of time for "Up next".
  const [upNext, setUpNext] = useState<{ key: string; next: EpisodeRef | null } | null>(null);
  useEffect(() => {
    if (!episodeKey || !amHost) return;
    const [showId, season, episode] = episodeKey.split(':');
    let cancelled = false;
    adjacentEpisode(showId, { season: Number(season), episode: Number(episode) }, 1).then((next) => {
      if (!cancelled) setUpNext({ key: episodeKey, next });
    });
    return () => {
      cancelled = true;
    };
  }, [episodeKey, amHost]);
  const nextEpisode = upNext?.key === episodeKey ? upNext.next : null;
  const atLastEpisode = upNext?.key === episodeKey && upNext.next === null;

  /** Host only: everyone's player moves to this episode. */
  const changeEpisode = (to: EpisodeRef) => {
    if (!title || title.mediaType !== 'tv') return;
    const next: PartyTitle = { ...title, season: to.season, episode: to.episode };
    setChangedTitle(next);
    rememberTitle(code, next);
    // Presence (the title effect above) takes a few seconds to reach
    // everyone; the broadcast switches them now.
    connectionRef.current?.episode(to.season, to.episode);
    myPosition.current = null;
    flashHint(`Moved the party to S${to.season} · E${to.episode}`);
  };

  const [stepping, setStepping] = useState(false);
  const stepEpisode = async (direction: 1 | -1) => {
    if (!title || title.mediaType !== 'tv') return;
    setStepping(true);
    try {
      const to = await adjacentEpisode(title.mediaId, { season: title.season ?? 1, episode: title.episode ?? 1 }, direction);
      if (to) changeEpisode(to);
      else flashHint(direction === 1 ? "That's the last episode" : "That's the first episode");
    } finally {
      setStepping(false);
    }
  };

  const toggleLock = () => {
    const on = !lockPlayback;
    setLockPlayback(on);
    lockRef.current = on;
    connectionRef.current?.setHostOnly(on);
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(buildRoomUrl(code));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard can be blocked; the input below is selectable.
    }
  };

  const send = () => {
    const body = draft.trim();
    if (!body) return;
    setDraft('');
    connectionRef.current?.chat(body);
  };

  // ---- Render ----------------------------------------------------------

  if (needsName) {
    const name = cleanName(nameDraft);
    return (
      <div className="min-h-screen flex items-center justify-center px-6">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (name) setGuestName(saveGuestName(name).name);
          }}
          className="w-full max-w-sm p-8 rounded-3xl bg-white/[0.02] border border-white/5 space-y-5 text-center"
        >
          <Popcorn size={48} className="mx-auto text-accent" />
          <div className="space-y-1">
            <h1 className="text-2xl font-bold">Join the watch party</h1>
            <p className="text-muted text-sm">Pick a name so friends know who&apos;s here. No account needed.</p>
          </div>
          <input
            autoFocus
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value.slice(0, 30))}
            placeholder="Your name"
            className="w-full bg-black/30 border border-white/10 rounded-2xl px-5 py-3 text-white text-center placeholder:text-white/25 outline-none focus:border-accent/50 transition-colors"
          />
          <button
            type="submit"
            disabled={!name}
            className="w-full bg-accent text-white py-3 rounded-2xl font-bold shadow-xl shadow-accent/20 hover:bg-accent/90 disabled:opacity-40 transition-all"
          >
            Join party
          </button>
          <p className="text-xs text-muted">
            Have an account?{' '}
            <Link href={`/login?redirect=/watch/${encodeURIComponent(code)}`} className="text-accent hover:underline">
              Sign in
            </Link>
          </p>
        </form>
      </div>
    );
  }

  if (!identity || (!title && !isEmpty)) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <Loader2 className="animate-spin text-accent" size={40} />
        {identity && <p className="text-muted text-sm">Joining party {code}…</p>}
      </div>
    );
  }

  if (!title) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center space-y-6 px-6 text-center">
        <Popcorn size={56} className="text-white/10" />
        <div className="space-y-2">
          <h1 className="text-2xl font-bold">No one&apos;s here</h1>
          <p className="text-muted max-w-sm text-sm">
            Party {code} is empty — it may have ended, or the code is mistyped. This page joins
            automatically if someone comes back.
          </p>
        </div>
        <Link href="/watch" className="text-accent font-bold hover:underline">
          Enter another code
        </Link>
      </div>
    );
  }

  const me = members.find((m) => m.id === identity.id);

  return (
    <div className="pt-28 pb-20 min-h-screen">
      <div className="container mx-auto px-6 space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            <div className="w-12 h-12 bg-accent/20 border border-accent/20 rounded-2xl flex items-center justify-center text-accent shrink-0">
              <Popcorn size={24} />
            </div>
            <div className="min-w-0">
              <h1 className="text-2xl font-bold text-white tracking-tight truncate">{title.title}</h1>
              <p className="text-muted text-sm">
                Watch party {code} · {members.length} {members.length === 1 ? 'person' : 'people'}
                {title.season != null && ` · S${title.season}E${title.episode ?? 1}`}
              </p>
            </div>
          </div>
          <Link
            href={`/${title.mediaType}/${title.mediaId}`}
            className="hidden md:flex items-center gap-2 text-muted hover:text-white transition-colors text-sm font-medium shrink-0"
          >
            <ArrowLeft size={16} />
            <span>Title page</span>
          </Link>
        </div>

        {/* Countdown overlays everything: it's the one moment everyone
            needs to act on simultaneously. */}
        {countdown !== null && (
          <div className="fixed inset-0 z-[9995] bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center gap-4">
            <p className="text-white/60 text-sm uppercase tracking-widest">
              Starting in
            </p>
            <p className="text-8xl font-bold text-accent tabular-nums">{countdown}</p>
          </div>
        )}

        <div className="grid lg:grid-cols-3 gap-6 items-start">
          <div className="lg:col-span-2 space-y-4">
            <VideoPlayer
              type={title.mediaType}
              id={title.mediaId}
              season={title.season ?? 1}
              episode={title.episode ?? 1}
              title={title.title}
              posterPath={title.posterPath ?? undefined}
              onProgress={(p) => {
                myPosition.current = { ...p, episodeKey };
              }}
              onNext={amHost && nextEpisode ? () => changeEpisode(nextEpisode) : undefined}
              nextLabel={nextEpisode ? `S${nextEpisode.season} E${nextEpisode.episode}` : undefined}
              overlay={
                <>
                  <ReactionsOverlay reactions={reactions} />
                  {/* Only the host's player moves the party on; everyone
                      else follows the episode change. */}
                  {amHost && nextEpisode && episodeKey && (
                    <UpNextCard key={episodeKey} next={nextEpisode} onPlayNext={() => changeEpisode(nextEpisode)} />
                  )}
                </>
              }
            />

            <div className="flex flex-wrap items-center justify-between gap-3">
              <ReactionBar onReact={(emoji) => connectionRef.current?.react(emoji)} />
              {title.mediaType === 'tv' &&
                (amHost ? (
                  <div className="flex items-center gap-1 rounded-xl bg-white/[0.03] border border-white/5 p-1">
                    <button
                      onClick={() => stepEpisode(-1)}
                      disabled={stepping || ((title.season ?? 1) <= 1 && (title.episode ?? 1) <= 1)}
                      className="p-1.5 rounded-lg text-white/60 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-transparent transition-all"
                      aria-label="Previous episode"
                    >
                      <ChevronLeft size={16} />
                    </button>
                    <span className="px-2 text-xs font-bold text-white tabular-nums">
                      S{title.season ?? 1} · E{title.episode ?? 1}
                    </span>
                    <button
                      onClick={() => stepEpisode(1)}
                      disabled={stepping || atLastEpisode}
                      className="p-1.5 rounded-lg text-white/60 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-transparent transition-all"
                      aria-label="Next episode"
                    >
                      <ChevronRight size={16} />
                    </button>
                  </div>
                ) : (
                  <p className="text-[11px] text-muted">
                    <span className="font-bold text-white tabular-nums">
                      S{title.season ?? 1} · E{title.episode ?? 1}
                    </span>{' '}
                    · the host picks episodes
                  </p>
                ))}
            </div>

            <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/5 space-y-3">
              <p className="flex items-center gap-2 text-[11px] text-muted leading-relaxed">
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${streamReady ? 'bg-accent' : 'bg-white/30'}`} />
                <span>
                  {hostOnly && !amHost
                    ? 'Synced playback — the host plays, pauses and skips for everyone.'
                    : 'Synced playback — play, pause or skip in your player and everyone follows.'}
                </span>
              </p>
              {amHost ? (
                <button
                  onClick={toggleLock}
                  role="switch"
                  aria-checked={lockPlayback}
                  className="flex items-center gap-2.5 text-[11px] text-muted hover:text-white transition-colors"
                >
                  <span
                    className={`relative w-7 h-4 rounded-full transition-colors ${lockPlayback ? 'bg-accent' : 'bg-white/15'}`}
                  >
                    <span
                      className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all ${lockPlayback ? 'left-3.5' : 'left-0.5'}`}
                    />
                  </span>
                  {lockPlayback ? <Lock size={12} /> : <LockOpen size={12} />}
                  <span>Only I control playback</span>
                </button>
              ) : (
                hostOnly && (
                  <p className="flex items-center gap-2 text-[11px] text-muted">
                    <Lock size={12} className="text-accent" />
                    <span>Playback is locked to {host?.name ?? 'the host'} — pausing or skipping snaps you back to the room.</span>
                  </p>
                )
              )}
              {!streamReady && (
                <p className="text-[11px] text-yellow-500/80 leading-relaxed">
                  Press play in the player once to load your stream — you&apos;ll jump to
                  wherever the room is.
                </p>
              )}
              <div className="flex gap-2">
                <input
                  readOnly
                  value={buildRoomUrl(code)}
                  onFocus={(e) => e.currentTarget.select()}
                  className="flex-1 bg-black/30 border border-white/10 rounded-xl px-4 py-2.5 text-xs text-white/70 font-mono outline-none focus:border-accent/40"
                />
                <button
                  onClick={copyLink}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-xs font-bold hover:bg-white/10 transition-all"
                >
                  {copied ? <Check size={14} /> : <Copy size={14} />}
                  <span>{copied ? 'Copied' : 'Copy'}</span>
                </button>
                {user && <InviteFriendsButton code={code} title={title} />}
                {amHost && (
                  <button
                    onClick={() => connectionRef.current?.countdown(5)}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-accent text-white text-xs font-bold hover:bg-accent/90 transition-all whitespace-nowrap"
                  >
                    <Play size={14} />
                    <span>Start countdown</span>
                  </button>
                )}
              </div>
              <p className="text-[11px] text-muted">
                Or join with the code{' '}
                <span className="font-mono font-bold text-white tracking-widest">{code}</span>{' '}
                from Watch → Watch Party. No account needed.
              </p>
            </div>
          </div>

          <div className="space-y-4">
            {/* Drift panel */}
            <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/5 space-y-3">
              <h2 className="text-sm font-bold text-white px-1">In the room</h2>
              <div className="space-y-2">
                {members.map((m) => {
                  const isMe = m.id === identity.id;
                  // Only positions in the episode on screen compare; anything
                  // else is from before an episode change.
                  const theirs = m.episodeKey === episodeKey ? m.position : null;
                  const mine = me?.episodeKey === episodeKey ? me.position : null;
                  const drift = (theirs ?? 0) - (mine ?? 0);
                  const offBy = Math.abs(drift);
                  const known = isMe || (theirs !== null && mine !== null);
                  const avatar = { username: m.name, display_name: m.name, avatar_url: m.avatarUrl };

                  return (
                    <div key={m.id} className="flex items-center gap-3 p-2 rounded-xl hover:bg-white/[0.03] transition-colors">
                      <UserLink username={isMe ? null : m.username}>
                        <FriendAvatar profile={avatar} size={32} />
                      </UserLink>
                      <div className="min-w-0 flex-1">
                        <UserLink username={isMe ? null : m.username}>
                          <p className="text-xs font-bold text-white truncate hover:text-accent transition-colors">
                            {isMe ? 'You' : m.name}
                            {m.id === host?.id && <span className="ml-1.5 text-[9px] text-accent uppercase tracking-widest">host</span>}
                            {!m.username && !isMe && <span className="ml-1.5 text-[9px] text-white/30 uppercase tracking-widest">guest</span>}
                          </p>
                        </UserLink>
                        <p className="flex items-center gap-1 text-[10px] text-muted">
                          <span>
                            {!known
                              ? theirs === null
                                ? 'no position yet'
                                : 'press play to compare'
                              : isMe
                              ? 'reference'
                              : offBy <= DRIFT_TOLERANCE_SECONDS
                              ? 'in sync'
                              : `${formatDrift(drift)} ${drift > 0 ? 'ahead' : 'behind'}`}
                          </span>
                        </p>
                      </div>

                      {!isMe && known && (
                        <span
                          className={`w-2 h-2 rounded-full shrink-0 ${
                            offBy <= DRIFT_TOLERANCE_SECONDS ? 'bg-accent' : 'bg-yellow-500'
                          }`}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
              {syncHint && (
                <p className="px-3 py-2 rounded-xl bg-accent/10 border border-accent/20 text-[11px] text-accent">
                  {syncHint}
                </p>
              )}

              {members.length <= 1 && (
                <p className="text-[11px] text-muted px-1">
                  Share the link or code above to bring friends in.
                </p>
              )}
            </div>

            {/* Chat. Lives as long as the party; newcomers get the recent
                messages from the host. */}
            <div className="rounded-2xl bg-white/[0.02] border border-white/5 overflow-hidden flex flex-col max-h-[26rem]">
              <p className="text-sm font-bold text-white px-4 py-3 border-b border-white/5">Chat</p>
              <div className="flex-1 overflow-y-auto p-3 space-y-3 min-h-[10rem]">
                {messages.length === 0 ? (
                  <p className="text-[11px] text-muted text-center py-6">No messages yet.</p>
                ) : (
                  messages.map((m) => (
                    <div key={m.id} className="flex items-start gap-2">
                      <UserLink username={m.username}>
                        <FriendAvatar profile={{ username: m.name, display_name: m.name, avatar_url: m.avatarUrl }} size={26} />
                      </UserLink>
                      <div className="min-w-0">
                        <p className="text-[10px] text-muted">
                          <UserLink username={m.username} className="font-bold hover:text-accent">
                            {m.by === identity.id ? 'You' : m.name}
                          </UserLink>{' '}
                          · {timeAgo(new Date(m.at).toISOString())}
                        </p>
                        <p className="text-xs text-white/80 break-words">{m.body}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
              <div className="flex items-center gap-2 p-3 border-t border-white/5">
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value.slice(0, 500))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      send();
                    }
                  }}
                  placeholder="Say something…"
                  className="flex-1 bg-white/5 border border-white/10 rounded-xl py-2 px-3 text-white text-xs placeholder:text-white/30 focus:border-accent transition-all outline-none"
                />
                <button
                  onClick={send}
                  disabled={!draft.trim()}
                  className="p-2 rounded-xl bg-accent text-white hover:bg-accent/90 disabled:opacity-40 transition-all"
                >
                  <Send size={14} />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
