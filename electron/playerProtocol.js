// What crosses the player bridge, checked in the main process on the way
// through. Player states come from the servers' frames — third-party pages
// — so only plain, bounded values reach the app. Commands come from the app
// page, and only the ones the bridge understands, with sane arguments, reach
// the player.

const STATE_EVENTS = new Set([
  'play',
  'pause',
  'seeked',
  'timeupdate',
  'progress',
  'loadedmetadata',
  'ended',
  'volumechange',
  'ratechange',
  'waiting',
  'playing',
  'tracks',
  'status',
]);

const MAX_TRACKS = 100;

const finite = (value, fallback = 0) => (Number.isFinite(value) ? value : fallback);
const text = (value, max) => (typeof value === 'string' ? value.slice(0, max) : '');

/** A report from a player frame, or null if it isn't one. */
function cleanState(state) {
  if (!state || !STATE_EVENTS.has(state.event)) return null;
  const tracks = Array.isArray(state.tracks)
    ? state.tracks.slice(0, MAX_TRACKS).map((t) => ({ label: text(t?.label, 80), language: text(t?.language, 20) }))
    : [];
  const track = Number.isInteger(state.track) && state.track >= 0 && state.track < tracks.length ? state.track : -1;
  return {
    event: state.event,
    playing: Boolean(state.playing),
    time: Math.max(finite(state.time), 0),
    duration: Math.max(finite(state.duration), 0),
    muted: Boolean(state.muted),
    volume: Math.min(Math.max(finite(state.volume, 1), 0), 1),
    rate: Math.min(Math.max(finite(state.rate, 1), 0.0625), 16),
    buffered: Math.max(finite(state.buffered), 0),
    buffering: Boolean(state.buffering),
    tracks,
    track,
  };
}

/** A command from the app page, or null if the bridge shouldn't pass it on. */
function cleanCommand(command) {
  const action = command?.action;
  switch (action) {
    case 'play':
    case 'pause':
    case 'toggle':
    case 'toggleMute':
    case 'pip':
    case 'report':
      return { action };
    case 'seek':
      return Number.isFinite(command.time) && command.time >= 0 ? { action, time: command.time } : null;
    case 'seekBy':
      return Number.isFinite(command.delta) && Math.abs(command.delta) <= 600 ? { action, delta: command.delta } : null;
    case 'setVolume':
      return Number.isFinite(command.volume) && command.volume >= 0 && command.volume <= 1 ? { action, volume: command.volume } : null;
    case 'setMuted':
      return typeof command.muted === 'boolean' ? { action, muted: command.muted } : null;
    case 'setRate':
      return Number.isFinite(command.rate) && command.rate >= 0.25 && command.rate <= 4 ? { action, rate: command.rate } : null;
    case 'setTrack':
      return Number.isInteger(command.index) && command.index >= -1 && command.index < MAX_TRACKS ? { action, index: command.index } : null;
    case 'clean':
      return typeof command.on === 'boolean' ? { action, on: command.on } : null;
    case 'liftSubtitles':
      return Number.isFinite(command.px) && command.px >= 0 && command.px <= 1000 ? { action, px: Math.round(command.px) } : null;
    default:
      return null;
  }
}

module.exports = { cleanState, cleanCommand };
