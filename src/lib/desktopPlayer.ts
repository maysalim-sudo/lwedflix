/**
 * The player bridge (electron/preload.js).
 *
 * A preload runs inside the embedded player's cross-origin frames, finds the
 * stream's <video>, reports its state and applies play/pause/seek — the one
 * thing a browser forbids a web page from doing. It only exists inside the
 * app: under `npm run dev` in a browser `window.lwedflixPlayer` is missing,
 * and the player simply isn't synced.
 */

export type PlayerEvent = 'play' | 'pause' | 'seeked' | 'timeupdate' | 'loadedmetadata';

export interface PlayerState {
  /** The media event behind this report. */
  event: PlayerEvent;
  playing: boolean;
  /** Seconds. */
  time: number;
  duration: number;
}

export type PlayerCommand =
  | { action: 'play' }
  | { action: 'pause' }
  | { action: 'seek'; time: number };

export interface DesktopPlayer {
  /**
   * Called on every play, pause and seek, and about once a second while
   * playing. `null` means the stream went away (page left, server switched).
   * Returns an unsubscribe function.
   */
  onState(callback: (state: PlayerState | null) => void): () => void;
  /** Dropped if no stream has reported yet. */
  command(command: PlayerCommand): void;
}

declare global {
  interface Window {
    lwedflixPlayer?: DesktopPlayer;
  }
}

export function getDesktopPlayer(): DesktopPlayer | null {
  return typeof window === 'undefined' ? null : window.lwedflixPlayer ?? null;
}
