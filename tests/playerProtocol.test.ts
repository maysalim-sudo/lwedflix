import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanState, cleanCommand } from '../electron/playerProtocol.js';

test('player reports are reduced to plain, bounded values', () => {
  const state = cleanState({
    event: 'timeupdate',
    playing: 1,
    time: 12.5,
    duration: 8348,
    muted: 0,
    volume: 3,
    rate: 1.5,
    buffered: 40,
    buffering: '',
    tracks: [{ label: 'English', language: 'en', extra: '<script>' }, { label: 7 }],
    track: 0,
    injected: 'nope',
  });
  assert.deepEqual(state, {
    event: 'timeupdate',
    playing: true,
    time: 12.5,
    duration: 8348,
    muted: false,
    volume: 1,
    rate: 1.5,
    buffered: 40,
    buffering: false,
    tracks: [
      { label: 'English', language: 'en' },
      { label: '', language: '' },
    ],
    track: 0,
  });
});

test('nonsense in a report falls back to safe defaults', () => {
  const state = cleanState({ event: 'play', time: Number.NaN, duration: Infinity, volume: 'loud', tracks: 'x', track: 5 });
  assert.equal(state?.time, 0);
  assert.equal(state?.duration, 0); // live or unknown
  assert.equal(state?.volume, 1);
  assert.deepEqual(state?.tracks, []);
  assert.equal(state?.track, -1);
  assert.equal(cleanState({ event: 'boom' }), null);
  assert.equal(cleanState(null), null);
  assert.equal(cleanState({ event: 'tracks', tracks: Array.from({ length: 150 }, () => ({ label: 'x' })) })?.tracks.length, 100);
});

test('commands pass only with sane arguments', () => {
  assert.deepEqual(cleanCommand({ action: 'toggle', extra: 1 }), { action: 'toggle' });
  assert.deepEqual(cleanCommand({ action: 'seek', time: 90 }), { action: 'seek', time: 90 });
  assert.equal(cleanCommand({ action: 'seek', time: -1 }), null);
  assert.equal(cleanCommand({ action: 'seekBy', delta: 601 }), null);
  assert.deepEqual(cleanCommand({ action: 'setVolume', volume: 0.4 }), { action: 'setVolume', volume: 0.4 });
  assert.equal(cleanCommand({ action: 'setVolume', volume: 1.5 }), null);
  assert.deepEqual(cleanCommand({ action: 'setMuted', muted: true }), { action: 'setMuted', muted: true });
  assert.equal(cleanCommand({ action: 'setMuted', muted: 'yes' }), null);
  assert.deepEqual(cleanCommand({ action: 'setRate', rate: 2 }), { action: 'setRate', rate: 2 });
  assert.equal(cleanCommand({ action: 'setRate', rate: 16 }), null);
  assert.deepEqual(cleanCommand({ action: 'setTrack', index: -1 }), { action: 'setTrack', index: -1 });
  assert.equal(cleanCommand({ action: 'setTrack', index: 1.5 }), null);
  assert.deepEqual(cleanCommand({ action: 'clean', on: false }), { action: 'clean', on: false });
  assert.equal(cleanCommand({ action: 'clean' }), null);
  assert.deepEqual(cleanCommand({ action: 'liftSubtitles', px: 84.4 }), { action: 'liftSubtitles', px: 84 });
  assert.equal(cleanCommand({ action: 'liftSubtitles', px: -5 }), null);
  assert.deepEqual(cleanCommand({ action: 'report' }), { action: 'report' });
  assert.equal(cleanCommand({ action: 'eval', code: 'x' }), null);
  assert.equal(cleanCommand(undefined), null);
});
