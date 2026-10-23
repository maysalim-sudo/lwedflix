import { useSyncExternalStore } from 'react';

// Whose controls the player shows: the app's own ('app', the default), or
// the server's ('server') — for a server's own subtitles or quality menu.
// Remembered on this computer.

export type ControlsMode = 'app' | 'server';

const KEY = 'lwedflix:player-controls';
const listeners = new Set<() => void>();

function read(): ControlsMode {
  try {
    return localStorage.getItem(KEY) === 'server' ? 'server' : 'app';
  } catch {
    return 'app';
  }
}

export function setControlsMode(mode: ControlsMode) {
  try {
    localStorage.setItem(KEY, mode);
  } catch {
    // Kept for this session only.
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useControlsMode(): ControlsMode {
  return useSyncExternalStore(subscribe, read, () => 'app');
}
