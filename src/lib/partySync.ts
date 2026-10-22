import type { PlayerCommand, PlayerState } from './desktopPlayer';

/**
 * Watch-party playback sync for the desktop app. Kept free of React and
 * Supabase: it only sees player reports in, room messages in and out, and
 * player commands out.
 *
 * The room shares one playback state. When anyone plays, pauses or seeks in
 * their own player, that state is broadcast and every other player is moved
 * to match. Applying a remote state makes our own player fire the same
 * events, so those echoes are recognised and not re-broadcast — otherwise
 * two clients would bounce one change back and forth.
 *
 * Joining: a member's stream only exists once they've pressed play on the
 * provider's poster. When it appears they ask the room ('hello'), adopt the
 * first answer, and only then start broadcasting — otherwise their fresh
 * start at 0:00 would drag everyone back to the beginning. Some providers
 * also jump to a saved "continue watching" position a moment after loading,
 * so a new stream is left to settle: while it does, anything that happens
 * away from the room's position is kept local (a real pause or play happens
 * where the room is), and once settled it asks the room again and snaps back.
 *
 * Drift: the host's player broadcasts its state every few seconds and
 * anyone more than a couple of seconds off is nudged back into step.
 *
 * Ordering: every action starts a new version of the room's state, and
 * heartbeats and replies carry the version they describe. Anything older
 * than what a member has already seen is ignored — otherwise a heartbeat
 * in flight when someone pauses would arrive afterwards and un-pause them.
 * Two actions at once get the same version; the sender id breaks the tie,
 * so every client picks the same winner.
 */

export type LocalAction = 'play' | 'pause' | 'seeked';

export type PartyMessage =
  | { kind: 'hello'; by: string }
  | {
      kind: 'state';
      reason: 'action' | 'reply' | 'tick';
      /** For 'action': what the sender did, for the "X paused" notice. */
      cause?: LocalAction;
      playing: boolean;
      time: number;
      /** Sender's clock, used to credit network latency while playing. */
      sentAt: number;
      by: string;
      /** Version of the room state, and who started it (the tie-break). */
      v: number;
      vb: string;
    };

export type PartyState = Extract<PartyMessage, { kind: 'state' }>;

/** How long a new player waits for the room before assuming it's alone. */
const JOIN_TIMEOUT_MS = 2500;
/** How long a new stream's own jumps (resume prompts) are kept to itself. */
const SETTLE_MS = 6000;
const TICK_MS = 5000;
/** How long an expected echo is waited for before it's forgotten. */
const ECHO_WINDOW_MS = 2500;
/**
 * Explicit actions are matched tightly. The heartbeat tolerates some drift
 * so a slightly slow stream isn't seeking (and rebuffering) constantly.
 */
const ACTION_SEEK_THRESHOLD_S = 1;
const DRIFT_SEEK_THRESHOLD_S = 2.5;
/** Two machines' clocks can disagree, so credited latency is capped. */
const MAX_LATENCY_S = 3;

export interface PartySyncOptions {
  me: string;
  /** Asked on every heartbeat: the host changes when the host leaves. */
  isHost: () => boolean;
  send: (message: PartyMessage) => void;
  command: (command: PlayerCommand) => void;
  /** Someone else played, paused or seeked. */
  onRemoteAction?: (state: PartyState) => void;
  now?: () => number;
}

/** Room messages come from other clients, so check their shape. */
export function isPartyMessage(value: unknown): value is PartyMessage {
  if (!value || typeof value !== 'object') return false;
  const m = value as Record<string, unknown>;
  if (typeof m.by !== 'string') return false;
  if (m.kind === 'hello') return true;
  return (
    m.kind === 'state' &&
    (m.reason === 'action' || m.reason === 'reply' || m.reason === 'tick') &&
    typeof m.playing === 'boolean' &&
    typeof m.time === 'number' && Number.isFinite(m.time) && m.time >= 0 &&
    typeof m.sentAt === 'number' && Number.isFinite(m.sentAt) &&
    Number.isInteger(m.v) && (m.v as number) >= 0 &&
    typeof m.vb === 'string'
  );
}

export class PartySync {
  private local: (PlayerState & { at: number }) | null = null;
  private joined = false;
  private helloAt = 0;
  /** When the stream appeared; 0 once it has settled. */
  private streamAt = 0;
  /** Whether the room has told us anything since the stream appeared. */
  private heardRoom = false;
  /** The room's playback as last applied or sent, on our clock. */
  private room: { playing: boolean; time: number; at: number } | null = null;
  private version = 0;
  private versionBy = '';
  private lastSent = 0;
  /** Events our own recent commands will make the player fire, counted. */
  private echoes: { counts: Partial<Record<LocalAction, number>>; at: number } | null = null;
  private readonly options: PartySyncOptions;
  private readonly now: () => number;

  constructor(options: PartySyncOptions) {
    this.options = options;
    this.now = options.now ?? Date.now;
  }

  /** True once this member's stream is loaded and in step with the room. */
  get synced(): boolean {
    return this.local !== null && this.joined;
  }

  /** Feed every report from the desktop player bridge. */
  handleLocal(state: PlayerState | null): void {
    const now = this.now();
    if (state === null) {
      this.local = null;
      this.joined = false;
      this.echoes = null;
      return;
    }

    const first = this.local === null;
    this.local = { ...state, at: now };
    if (first) {
      this.streamAt = now;
      this.heardRoom = false;
      this.hello(now);
      return;
    }

    if (!this.joined) return;
    if (state.event !== 'play' && state.event !== 'pause' && state.event !== 'seeked') return;
    if (this.isEcho(state.event, now)) return;
    if (this.streamAt && this.heardRoom && this.awayFromRoom(now)) return; // settling; see tick()
    this.broadcast('action', state.event);
  }

  handleRemote(message: PartyMessage): void {
    if (message.by === this.options.me) return;
    if (message.kind === 'hello') {
      if (this.synced) this.broadcast('reply');
      return;
    }
    if (!this.local) return;
    // Answers to someone else's hello; we're already in step.
    if (message.reason === 'reply' && this.joined) return;
    if (this.isStale(message)) return;
    this.version = message.v;
    this.versionBy = message.vb;
    this.apply(message);
    if (message.reason === 'action') this.options.onRemoteAction?.(message);
  }

  private isStale(state: PartyState): boolean {
    return state.v < this.version || (state.v === this.version && state.vb < this.versionBy);
  }

  /** Call about once a second. */
  tick(): void {
    const now = this.now();
    if (this.local && !this.joined && now - this.helloAt >= JOIN_TIMEOUT_MS) this.joined = true;

    if (this.local && this.streamAt && now - this.streamAt >= SETTLE_MS) {
      this.streamAt = 0;
      // If there's a room to follow, ask again — undoing any jump the
      // provider made on its own while settling. Alone, our position stands.
      if (this.heardRoom) {
        this.joined = false;
        this.hello(now);
      }
    }

    if (this.options.isHost() && this.synced && now - this.lastSent >= TICK_MS) this.broadcast('tick');
  }

  private hello(now: number): void {
    this.helloAt = now;
    this.options.send({ kind: 'hello', by: this.options.me });
  }

  private broadcast(reason: PartyState['reason'], cause?: LocalAction): void {
    const now = this.now();
    const time = this.position(now);
    this.lastSent = now;
    this.room = { playing: this.local!.playing, time, at: now };
    if (reason === 'action') {
      this.version += 1;
      this.versionBy = this.options.me;
    }
    this.options.send({
      kind: 'state',
      reason,
      ...(cause && { cause }),
      playing: this.local!.playing,
      time,
      sentAt: now,
      by: this.options.me,
      v: this.version,
      vb: this.versionBy,
    });
  }

  /** Where the local player is now, extrapolated from its last report. */
  private position(now: number): number {
    const local = this.local!;
    return local.playing ? local.time + (now - local.at) / 1000 : local.time;
  }

  private awayFromRoom(now: number): boolean {
    const room = this.room;
    if (!room) return false;
    const roomTime = room.playing ? room.time + (now - room.at) / 1000 : room.time;
    return Math.abs(this.position(now) - roomTime) > DRIFT_SEEK_THRESHOLD_S;
  }

  private apply(state: PartyState): void {
    const now = this.now();
    const latency = state.playing
      ? Math.min(Math.max((now - state.sentAt) / 1000, 0), MAX_LATENCY_S)
      : 0;
    const target = state.time + latency;
    const threshold = state.reason === 'tick' ? DRIFT_SEEK_THRESHOLD_S : ACTION_SEEK_THRESHOLD_S;
    const seek = Math.abs(this.position(now) - target) > threshold;
    const toggle = this.local!.playing !== state.playing;

    // Any word from the room — a reply, a heartbeat or someone acting —
    // means this player now follows the room.
    this.joined = true;
    this.heardRoom = true;
    this.room = { playing: state.playing, time: target, at: now };
    if (!seek && !toggle) return;

    // Two states can arrive before the player has acted on the first, so
    // expected echoes add up rather than replace each other...
    const counts = this.echoes && now - this.echoes.at <= ECHO_WINDOW_MS ? this.echoes.counts : {};
    const expect = (event: LocalAction) => {
      counts[event] = (counts[event] ?? 0) + 1;
    };
    if (seek) {
      expect('seeked');
      this.options.command({ action: 'seek', time: target });
    }
    if (toggle) {
      const action = state.playing ? 'play' : 'pause';
      expect(action);
      this.options.command({ action });
    }
    this.echoes = { counts, at: now };
    // ...and until the player reports back, it's taken to be where it was
    // sent: the next state must be compared with that, not with where the
    // player last said it was.
    this.local = { ...this.local!, playing: state.playing, time: target, at: now };
  }

  /**
   * Each command makes the player fire one matching event, so each expected
   * event is consumed once. Matching on the event type, not on timing, means
   * a real pause right after someone else's seek still goes out.
   */
  private isEcho(event: LocalAction, now: number): boolean {
    const echoes = this.echoes;
    if (!echoes || now - echoes.at > ECHO_WINDOW_MS || !echoes.counts[event]) return false;
    echoes.counts[event] -= 1;
    return true;
  }
}
