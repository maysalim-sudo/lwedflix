'use client';

import { useEffect, useState } from 'react';
import { getDesktopPlayer, type PlayerState } from '@/lib/desktopPlayer';

/**
 * The stream's latest report from the player bridge — about once a second
 * while playing, and on every play, pause, seek and end. Null before the
 * stream loads, after it goes away, and outside the app.
 *
 * Re-renders its caller on every report, so use it in small components.
 */
export function usePlayerState(): PlayerState | null {
  const [state, setState] = useState<PlayerState | null>(null);
  useEffect(() => getDesktopPlayer()?.onState(setState), []);
  return state;
}
