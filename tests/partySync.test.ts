// A room of players run against the real PartySync, with a fake clock, a
// fake network and fake <video> elements that fire events the way real
// ones do — including for the commands PartySync sends them.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PartySync, isPartyMessage, type PartyMessage } from '../src/lib/partySync.ts';
import type { PlayerCommand, PlayerEvent, PlayerState } from '../src/lib/desktopPlayer.ts';

class FakePlayer {
  time = 0;
  playing = false;
  duration = 7000;
  private readonly emit: (state: PlayerState) => void;

  constructor(emit: (state: PlayerState) => void) {
    this.emit = emit;
  }

  report(event: PlayerEvent) {
    this.emit({ event, playing: this.playing, time: this.time, duration: this.duration });
  }

  // What a person does in the player's own controls.
  userPlay() {
    this.playing = true;
    this.report('play');
  }
  userPause() {
    this.playing = false;
    this.report('pause');
  }
  userSeek(time: number) {
    this.time = time;
    this.report('seeked');
  }

  // What the bridge does on command: the same events.
  command(c: PlayerCommand) {
    if (c.action === 'seek') {
      this.time = c.time;
      this.report('seeked');
    }
    if (c.action === 'play' && !this.playing) this.userPlay();
    if (c.action === 'pause' && this.playing) this.userPause();
  }

  advance(ms: number) {
    if (this.playing) this.time += ms / 1000;
  }
}

interface Member {
  id: string;
  sync: PartySync;
  player: FakePlayer;
  sent: PartyMessage[];
  notices: string[];
}

class FakeRoom {
  clock = 1_000_000;
  members: Member[] = [];
  /** Host-only control, as the host's switch sets it. */
  hostOnly = false;
  blocked: string[] = [];
  private wire: { from: string; msg: PartyMessage }[] = [];

  add(id: string, isHost: boolean): Member {
    const member = { id, sent: [], notices: [] } as unknown as Member;
    member.sync = new PartySync({
      me: id,
      isHost: () => isHost,
      now: () => this.clock,
      send: (msg) => {
        assert(isPartyMessage(msg), 'outgoing message is well-formed');
        member.sent.push(msg);
        this.wire.push({ from: id, msg });
      },
      // The real bridge answers asynchronously too.
      command: (c) => queueMicrotask(() => member.player.command(c)),
      onRemoteAction: (s) => member.notices.push(`${s.by} ${s.cause}`),
      canControl: () => isHost || !this.hostOnly,
      onBlocked: () => this.blocked.push(id),
    });
    member.player = this.newPlayer(member);
    this.members.push(member);
    return member;
  }

  /** The member's stream goes away and a new one loads (a server switch). */
  replacePlayer(member: Member) {
    member.sync.handleLocal(null);
    member.player = this.newPlayer(member);
  }

  private newPlayer(member: Member) {
    return new FakePlayer((state) => member.sync.handleLocal(state));
  }

  /** Delivers queued messages to everyone else (Broadcast with self: false). */
  async flush(latencyMs = 80) {
    for (let round = 0; round < 10 && this.wire.length; round++) {
      const batch = this.wire.splice(0);
      this.clock += latencyMs;
      for (const m of this.members) m.player.advance(latencyMs);
      for (const { from, msg } of batch) {
        for (const m of this.members) if (m.id !== from) m.sync.handleRemote(msg);
      }
      await new Promise((resolve) => setTimeout(resolve, 0)); // let queued commands run
    }
  }

  async elapse(ms: number) {
    for (let t = 0; t < ms; t += 250) {
      this.clock += 250;
      for (const m of this.members) {
        m.player.advance(250);
        // Players report progress irregularly; every third step will do.
        if (m.player.playing && (t / 250) % 3 === 0) m.player.report('timeupdate');
      }
      if (t % 1000 === 0) for (const m of this.members) m.sync.tick();
      await this.flush();
    }
  }
}

const near = (a: number, b: number, tolerance = 1.5) => Math.abs(a - b) <= tolerance;
const actionsSent = (m: Member) => m.sent.filter((msg) => msg.kind === 'state' && msg.reason === 'action').length;

test('a room of players stays in step', async (t) => {
  const room = new FakeRoom();
  const host = room.add('host', true);
  const pos = (m: Member) => m.player.time;

  await t.test('the first player alone becomes synced after the join timeout', async () => {
    host.player.userPlay();
    await room.elapse(4000);
    assert(host.sync.synced);
    host.player.userSeek(600);
    await room.flush();
  });

  const guest = room.add('guest', false);
  await t.test("a joiner's fresh start at 0:00 doesn't drag the room back", async () => {
    await room.elapse(1000);
    guest.player.userPlay();
    await room.flush();
    await room.elapse(1500);
    assert(guest.sync.synced);
    assert(near(pos(guest), pos(host)), `guest caught up (${pos(guest)} vs ${pos(host)})`);
    assert(pos(host) > 590, 'host stayed put');
  });

  await t.test('a pause reaches everyone, at the same spot, without echoing back', async () => {
    const before = actionsSent(host);
    guest.player.userPause();
    await room.flush();
    await room.elapse(1000);
    assert(!host.player.playing);
    assert(near(pos(host), pos(guest), 0.5));
    assert.equal(actionsSent(host) - before, 0, 'host did not echo the pause');
    assert.equal(host.notices.at(-1), 'guest pause');
  });

  await t.test('a seek then play is followed', async () => {
    host.player.userSeek(1800);
    await room.flush();
    host.player.userPlay();
    await room.flush();
    await room.elapse(2000);
    assert(guest.player.playing && near(pos(guest), pos(host)));
  });

  await t.test("the host's heartbeat pulls a stalled player back", async () => {
    guest.player.time -= 6;
    guest.player.report('timeupdate');
    await room.elapse(6000);
    assert(near(pos(guest), pos(host), 2.5), `off by ${(pos(host) - pos(guest)).toFixed(1)}s`);
  });

  await t.test('small drift is left alone (no constant seeking)', async () => {
    guest.player.time -= 1;
    await room.elapse(6000);
    assert(Math.abs(pos(host) - pos(guest)) < 1.6);
  });

  const third = room.add('third', false);
  await t.test('a mid-movie joiner catches up without disturbing anyone', async () => {
    const hostTime = pos(host);
    third.player.userPlay();
    await room.flush();
    await room.elapse(1500);
    assert(near(pos(third), pos(host)));
    assert(pos(host) >= hostTime);
  });

  await t.test('switching server re-joins at the room position', async () => {
    room.replacePlayer(third);
    third.player.userPlay();
    await room.flush();
    await room.elapse(1500);
    assert(near(pos(third), pos(host)));
  });

  const fourth = room.add('fourth', false);
  await t.test("a provider's own resume jump stays local, then snaps back", async () => {
    fourth.player.userPlay();
    await room.flush();
    await room.elapse(1500);
    assert(near(pos(fourth), pos(host)));
    const before = pos(host);
    fourth.player.userSeek(2195); // the provider's "continue watching" jump
    await room.flush();
    await room.elapse(1000);
    assert(near(pos(host), before + 1.5, 2), `host was dragged to ${pos(host).toFixed(1)}`);
    await room.elapse(7000);
    assert(near(pos(fourth), pos(host)), `fourth at ${pos(fourth).toFixed(1)}, host at ${pos(host).toFixed(1)}`);
    // Once settled, its real actions go out again.
    fourth.player.userPause();
    await room.flush();
    await room.elapse(500);
    assert(!host.player.playing);
  });

  await t.test('a heartbeat in flight when someone pauses does not undo the pause', async () => {
    host.player.userPlay();
    await room.flush();
    await room.elapse(1000);
    room.clock += 5000;
    for (const m of room.members) m.player.advance(5000);
    host.sync.tick(); // queued first: "playing at X"
    guest.player.userPause(); // queued after it: "paused"
    await room.flush();
    await room.elapse(1000);
    assert(room.members.every((m) => !m.player.playing), 'everyone paused');
  });

  await t.test('two actions at once still converge', async () => {
    host.player.userPlay();
    third.player.userSeek(pos(third) + 120);
    await room.flush();
    await room.elapse(2000);
    assert.equal(new Set(room.members.map((m) => m.player.playing)).size, 1, 'all agree on play/pause');
    assert(room.members.every((m) => near(pos(m), pos(host), 2.5)), 'all at the same position');
  });
});

test('host-only control', async (t) => {
  const room = new FakeRoom();
  const host = room.add('host', true);
  host.player.userPlay();
  await room.elapse(4000);
  host.player.userSeek(600);
  await room.flush();
  const guest = room.add('guest', false);
  guest.player.userPlay();
  await room.flush();
  await room.elapse(9000);
  const inStep = () => near(host.player.time, guest.player.time);
  assert(inStep(), 'guest synced');

  room.hostOnly = true;
  await t.test("a guest's pause is undone, and the room keeps playing", async () => {
    guest.player.userPause();
    await room.flush();
    await room.elapse(1500);
    assert(host.player.playing);
    assert(guest.player.playing && inStep());
    assert.deepEqual(room.blocked, ['guest']);
  });

  await t.test("a guest's seek is undone too", async () => {
    guest.player.userSeek(guest.player.time + 300);
    await room.flush();
    await room.elapse(1500);
    assert(inStep());
  });

  await t.test('the host still controls everyone', async () => {
    host.player.userPause();
    await room.flush();
    await room.elapse(500);
    assert(!guest.player.playing);
  });

  await t.test('with the lock off, guests control again', async () => {
    room.hostOnly = false;
    host.player.userPlay();
    await room.flush();
    await room.elapse(1000);
    guest.player.userPause();
    await room.flush();
    await room.elapse(500);
    assert(!host.player.playing);
  });
});

test('room messages from other clients are checked', () => {
  assert(isPartyMessage({ kind: 'hello', by: 'x' }));
  assert(isPartyMessage({ kind: 'state', by: 'x', reason: 'action', playing: true, time: 5, sentAt: 1, v: 1, vb: 'x' }));
  assert(!isPartyMessage({ kind: 'state', by: 'x', reason: 'action', playing: true, time: -5, sentAt: 1, v: 1, vb: 'x' }));
  assert(!isPartyMessage({ kind: 'state', by: 'x', reason: 'action', playing: true, time: 5, sentAt: 1 }), 'unversioned');
  assert(!isPartyMessage({ kind: 'state', by: 'x', reason: 'boom', playing: true, time: 5, sentAt: 1, v: 1, vb: 'x' }));
  assert(!isPartyMessage({ kind: 'hello' }));
  assert(!isPartyMessage(null));
});
