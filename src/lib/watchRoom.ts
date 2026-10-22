import { supabase } from './supabase';
import { shareUrl } from './shareLink';
import type { PartyMessage } from './partySync';

/**
 * Watch parties are live rooms, not database rows: a Supabase Realtime
 * channel named by the room code carries who's in it (Presence), and
 * everyone's position, chat, the host's countdown and playback sync
 * (Broadcast). No account is needed and nothing is stored — a party exists
 * while someone is in it, and its chat goes with it.
 *
 * Every member carries the title in their presence, so the room outlives
 * whoever started it. The host is whoever has been in the room longest.
 *
 * Playback itself is synced through the player bridge (desktopPlayer.ts,
 * partySync.ts); positions are shared too, so the room can show drift.
 */

export interface PartyTitle {
  mediaType: 'movie' | 'tv';
  mediaId: string;
  title: string;
  posterPath: string | null;
  season: number | null;
  episode: number | null;
}

export type PositionSource = 'measured' | 'estimated';

/**
 * Who a member is, shared through Presence. Kept to things that rarely
 * change: Realtime closes the channel of any client that sends more than 5
 * Presence updates in 30 seconds.
 */
export interface PartyPresence {
  id: string;
  name: string;
  /** Profile username for signed-in members; null for guests. */
  username: string | null;
  avatarUrl: string | null;
  joinedAt: number;
  title: PartyTitle | null;
  /** Only meaningful on the host: playback is locked to the host. */
  hostOnly: boolean;
}

/** Where a member's player is, shared by Broadcast every few seconds. */
export interface PartyPosition {
  position: number;
  duration: number | null;
  /**
   * 'measured' comes from the player itself (the desktop bridge, or
   * videasy's progress broadcast). 'estimated' is a local clock anchored to
   * a shared start — right until someone pauses, seeks or buffers.
   */
  positionSource: PositionSource;
  /**
   * The episode the position is in (any key that changes with it); null for
   * movies. Positions from different episodes can't be compared.
   */
  episodeKey: string | null;
}

export interface PartyMember extends PartyPresence {
  /** Null until the member has reported one. */
  position: number | null;
  duration: number | null;
  positionSource: PositionSource;
  episodeKey: string | null;
}

export interface PartyChatMessage {
  id: string;
  by: string;
  name: string;
  username: string | null;
  avatarUrl: string | null;
  body: string;
  at: number;
}

/** Position reports below this gap aren't worth flagging as drift. */
export const DRIFT_TOLERANCE_SECONDS = 5;

/** What can be thrown at the screen during a party. */
export const REACTIONS = ['😂', '😮', '😍', '🔥', '👏', '😭'] as const;
export type Reaction = (typeof REACTIONS)[number];

const MAX_CHAT_LENGTH = 500;
const MAX_NAME_LENGTH = 30;
const HISTORY_SIZE = 50;

// ---- Codes and starting a party ------------------------------------------

/** Short, unambiguous room code — no 0/O or 1/I to mistype. */
function makeCode(): string {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 6 }, () =>
    alphabet[Math.floor(Math.random() * alphabet.length)]
  ).join('');
}

const startedKey = (code: string) => `lwedflix-party:${code}`;

/**
 * Picks a code and remembers the title for this tab, so the room page can
 * announce it. Collisions would need two live parties among ~900M codes.
 */
export function startParty(title: PartyTitle): string {
  const code = makeCode();
  rememberTitle(code, title);
  return code;
}

/** What this tab is showing in the party — kept across reloads (the host's episode changes too). */
export function rememberTitle(code: string, title: PartyTitle) {
  try {
    sessionStorage.setItem(startedKey(code), JSON.stringify(title));
  } catch {
    // Without storage the room still works once someone else brings the
    // title — but the creator is usually alone, so this is worth knowing.
    console.warn('Could not remember the watch party title for this tab.');
  }
}

/** The title this tab started the party with, if it did. */
export function getStartedTitle(code: string): PartyTitle | null {
  try {
    return sanitizeTitle(JSON.parse(sessionStorage.getItem(startedKey(code)) ?? 'null'));
  } catch {
    return null;
  }
}

export function buildRoomUrl(code: string): string {
  return shareUrl(`/watch/${code}`);
}

// ---- Guest identity ------------------------------------------------------

const GUEST_KEY = 'lwedflix-party-guest';

/** A stable id per browser, plus the name the guest chose (if any yet). */
export function getGuest(): { id: string; name: string | null } {
  try {
    const saved = JSON.parse(localStorage.getItem(GUEST_KEY) ?? 'null');
    if (saved && typeof saved.id === 'string') {
      return { id: saved.id, name: typeof saved.name === 'string' ? saved.name : null };
    }
  } catch {
    // Fall through to a fresh guest.
  }
  const guest = { id: `guest-${crypto.randomUUID()}`, name: null };
  try {
    localStorage.setItem(GUEST_KEY, JSON.stringify(guest));
  } catch {
    // A new id each visit is fine; it only has to be unique in the room.
  }
  return guest;
}

export function cleanName(name: string): string {
  return name.replace(/\s+/g, ' ').trim().slice(0, MAX_NAME_LENGTH);
}

export function saveGuestName(name: string): { id: string; name: string } {
  const guest = { id: getGuest().id, name: cleanName(name) };
  try {
    localStorage.setItem(GUEST_KEY, JSON.stringify(guest));
  } catch {
    // Remembered for this visit only.
  }
  return guest;
}

// ---- The room ------------------------------------------------------------

export interface PartyHandlers {
  onMembers(members: PartyMember[]): void;
  onChat(message: PartyChatMessage): void;
  /** Chat from before you joined, sent by the host. */
  onHistory(messages: PartyChatMessage[]): void;
  onCountdown(startsAt: number): void;
  /** Playback sync traffic for partySync.ts; validate before use. */
  onSync(message: unknown): void;
  /** Someone (check it's the host) moved the party to another episode. */
  onEpisode?(change: { by: string; season: number; episode: number }): void;
  /** Includes your own, so everyone's screen shows the same thing. */
  onReaction?(reaction: { id: string; by: string; name: string; emoji: Reaction }): void;
}

export interface PartyConnection {
  /**
   * What this member is showing, carried so the room outlives whoever started
   * it — and, from the host, which episode the party is on.
   */
  setTitle(title: PartyTitle): void;
  /** Host only: lock playback to the host, or unlock it. */
  setHostOnly(on: boolean): void;
  /** Host only: tell everyone right away (presence follows, more slowly). */
  episode(season: number, episode: number): void;
  react(emoji: Reaction): void;
  /** Call every few seconds; goes out by Broadcast, not Presence. */
  reportPosition(position: PartyPosition): void;
  chat(body: string): void;
  countdown(secondsFromNow?: number): void;
  sync(message: PartyMessage): void;
  leave(): void;
}

/** Whoever has been in the room longest. */
export function partyHost(members: PartyMember[]): PartyMember | null {
  return (
    [...members].sort((a, b) => a.joinedAt - b.joinedAt || a.id.localeCompare(b.id))[0] ?? null
  );
}

export function joinParty(code: string, me: PartyPresence, handlers: PartyHandlers): PartyConnection {
  const channel = supabase.channel(`watch:${code}`, {
    config: { presence: { key: me.id }, broadcast: { self: false } },
  });
  let presence = me;
  let subscribed = false;
  // Realtime closes the channel of a client that sends more than 5 Presence
  // updates in 30 seconds. Changes are coalesced so that never happens: the
  // first goes out at once, anything within the next few seconds waits and
  // goes out as one.
  const PRESENCE_GAP_MS = 6500;
  let lastTrack = 0;
  let trackTimer: ReturnType<typeof setTimeout> | undefined;
  // Realtime keeps every presence a client has tracked under its key, not
  // just the latest, so each carries a revision and readers take the newest.
  let revision = 0;
  const sendPresence = () => {
    lastTrack = Date.now();
    channel.track({ ...presence, rev: ++revision });
  };
  const track = () => {
    if (!subscribed) return; // sent on subscribe
    const wait = lastTrack + PRESENCE_GAP_MS - Date.now();
    if (wait > 0) {
      trackTimer ??= setTimeout(() => {
        trackTimer = undefined;
        track();
      }, wait);
      return;
    }
    sendPresence();
  };
  let history: PartyChatMessage[] = [];
  const positions = new Map<string, PartyPosition>();

  // Presence and broadcasts come from other clients, so everything read
  // back is checked rather than trusted.
  const members = (): PartyMember[] =>
    Object.values(channel.presenceState())
      .map((entries) => sanitizePresence(newestPresence(entries)))
      .filter((m): m is PartyPresence => m !== null)
      .map((m) => ({ position: null, duration: null, positionSource: 'estimated', episodeKey: null, ...positions.get(m.id), ...m }));

  const remember = (message: PartyChatMessage) => {
    history = [...history, message].slice(-HISTORY_SIZE);
  };

  channel
    .on('presence', { event: 'sync' }, () => handlers.onMembers(members()))
    .on('presence', { event: 'join' }, ({ key }) => {
      if (key === me.id || history.length === 0 || partyHost(members())?.id !== me.id) return;
      channel.send({ type: 'broadcast', event: 'history', payload: { to: key, messages: history } });
    })
    .on('broadcast', { event: 'chat' }, ({ payload }) => {
      const message = sanitizeChat(payload);
      if (!message) return;
      remember(message);
      handlers.onChat(message);
    })
    .on('broadcast', { event: 'history' }, ({ payload }) => {
      if (payload?.to !== me.id || history.length > 0 || !Array.isArray(payload.messages)) return;
      history = payload.messages
        .map(sanitizeChat)
        .filter((m: PartyChatMessage | null): m is PartyChatMessage => m !== null)
        .slice(-HISTORY_SIZE);
      handlers.onHistory(history);
    })
    .on('broadcast', { event: 'countdown' }, ({ payload }) => {
      const startsAt = Number(payload?.startsAt);
      // Ignore anything that isn't a near-future start.
      if (Number.isFinite(startsAt) && Math.abs(startsAt - Date.now()) < 60_000) {
        handlers.onCountdown(startsAt);
      }
    })
    .on('broadcast', { event: 'position' }, ({ payload }) => {
      const id = str(payload?.id, 80);
      const position = sanitizePosition(payload);
      if (!id || !position) return;
      positions.set(id, position);
      handlers.onMembers(members());
    })
    .on('broadcast', { event: 'sync' }, ({ payload }) => handlers.onSync(payload))
    .on('broadcast', { event: 'episode' }, ({ payload }) => {
      const by = str(payload?.by, 80);
      const season = int(payload?.season);
      const episode = int(payload?.episode);
      if (by && season !== null && episode !== null && episode > 0) handlers.onEpisode?.({ by, season, episode });
    })
    .on('broadcast', { event: 'reaction' }, ({ payload }) => {
      const reaction = sanitizeReaction(payload);
      if (reaction) handlers.onReaction?.(reaction);
    })
    .subscribe((status) => {
      if (status !== 'SUBSCRIBED') return;
      subscribed = true;
      sendPresence();
    });

  const broadcast = (event: string, payload: unknown) => {
    channel.send({ type: 'broadcast', event, payload }).catch(() => {});
  };

  return {
    setTitle(title) {
      // Each track counts toward the Presence limit; skip no-ops.
      if (JSON.stringify(title) === JSON.stringify(presence.title)) return;
      presence = { ...presence, title };
      track();
    },
    setHostOnly(on) {
      if (presence.hostOnly === on) return;
      presence = { ...presence, hostOnly: on };
      track();
    },
    episode(season, episode) {
      broadcast('episode', { by: presence.id, season, episode });
    },
    react(emoji) {
      const reaction = { id: crypto.randomUUID(), by: presence.id, name: presence.name, emoji };
      handlers.onReaction?.(reaction);
      broadcast('reaction', reaction);
    },
    reportPosition(position) {
      positions.set(presence.id, position);
      handlers.onMembers(members());
      broadcast('position', { id: presence.id, ...position });
    },
    chat(body) {
      const text = body.trim().slice(0, MAX_CHAT_LENGTH);
      if (!text) return;
      const message: PartyChatMessage = {
        id: crypto.randomUUID(),
        by: presence.id,
        name: presence.name,
        username: presence.username,
        avatarUrl: presence.avatarUrl,
        body: text,
        at: Date.now(),
      };
      remember(message);
      handlers.onChat(message);
      broadcast('chat', message);
    },
    countdown(secondsFromNow = 5) {
      const startsAt = Date.now() + secondsFromNow * 1000;
      handlers.onCountdown(startsAt);
      broadcast('countdown', { startsAt });
    },
    sync(message) {
      broadcast('sync', message);
    },
    leave() {
      clearTimeout(trackTimer);
      channel.untrack();
      supabase.removeChannel(channel);
    },
  };
}

// ---- Validation ----------------------------------------------------------

const str = (v: unknown, max: number): string | null =>
  typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null;
const num = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null;
const int = (v: unknown): number | null =>
  Number.isInteger(v) && (v as number) >= 0 ? (v as number) : null;

function sanitizeTitle(v: unknown): PartyTitle | null {
  if (!v || typeof v !== 'object') return null;
  const t = v as Record<string, unknown>;
  const title = str(t.title, 200);
  // The id goes straight into the player's embed URL: digits only.
  const mediaId = typeof t.mediaId === 'string' && /^\d{1,10}$/.test(t.mediaId) ? t.mediaId : null;
  if ((t.mediaType !== 'movie' && t.mediaType !== 'tv') || !mediaId || !title) return null;
  return {
    mediaType: t.mediaType,
    mediaId,
    title,
    posterPath: typeof t.posterPath === 'string' && /^\/[\w.-]+$/.test(t.posterPath) ? t.posterPath : null,
    season: int(t.season),
    episode: int(t.episode),
  };
}

/** The latest of a member's tracked presences (see `revision` in joinParty). */
function newestPresence(entries: unknown[]): unknown {
  const rev = (v: unknown) => {
    const r = (v as { rev?: unknown } | null)?.rev;
    return typeof r === 'number' && Number.isFinite(r) ? r : -1;
  };
  return entries.reduce((newest, entry) => (rev(entry) >= rev(newest) ? entry : newest), entries[0]);
}

function sanitizePresence(v: unknown): PartyPresence | null {
  if (!v || typeof v !== 'object') return null;
  const m = v as Record<string, unknown>;
  const id = str(m.id, 80);
  const name = str(m.name, MAX_NAME_LENGTH);
  const joinedAt = num(m.joinedAt);
  if (!id || !name || joinedAt === null) return null;
  return {
    id,
    name,
    username: str(m.username, 40),
    avatarUrl: typeof m.avatarUrl === 'string' && /^https:\/\//.test(m.avatarUrl) ? m.avatarUrl : null,
    joinedAt,
    title: sanitizeTitle(m.title),
    hostOnly: m.hostOnly === true,
  };
}

function sanitizeReaction(v: unknown): { id: string; by: string; name: string; emoji: Reaction } | null {
  if (!v || typeof v !== 'object') return null;
  const m = v as Record<string, unknown>;
  const id = str(m.id, 80);
  const by = str(m.by, 80);
  const name = str(m.name, MAX_NAME_LENGTH);
  const emoji = (REACTIONS as readonly unknown[]).includes(m.emoji) ? (m.emoji as Reaction) : null;
  return id && by && name && emoji ? { id, by, name, emoji } : null;
}

function sanitizePosition(v: unknown): PartyPosition | null {
  if (!v || typeof v !== 'object') return null;
  const m = v as Record<string, unknown>;
  const position = num(m.position);
  if (position === null) return null;
  return {
    position,
    duration: num(m.duration),
    positionSource: m.positionSource === 'measured' ? 'measured' : 'estimated',
    episodeKey: str(m.episodeKey, 60),
  };
}

function sanitizeChat(v: unknown): PartyChatMessage | null {
  if (!v || typeof v !== 'object') return null;
  const m = v as Record<string, unknown>;
  const id = str(m.id, 80);
  const by = str(m.by, 80);
  const name = str(m.name, MAX_NAME_LENGTH);
  const body = str(m.body, MAX_CHAT_LENGTH);
  const at = num(m.at);
  if (!id || !by || !name || !body || at === null) return null;
  return {
    id,
    by,
    name,
    username: str(m.username, 40),
    avatarUrl: typeof m.avatarUrl === 'string' && /^https:\/\//.test(m.avatarUrl) ? m.avatarUrl : null,
    body,
    at,
  };
}

// ---- Formatting ----------------------------------------------------------

/** A player-style timestamp: 1:02:03, or 4:05 under an hour. */
export function formatTimestamp(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

export function formatDrift(seconds: number): string {
  const abs = Math.abs(Math.round(seconds));
  if (abs < 60) return `${abs}s`;
  const m = Math.floor(abs / 60);
  const s = abs % 60;
  return `${m}m ${s}s`;
}
