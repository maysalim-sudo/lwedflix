'use client';

import React, { useSyncExternalStore } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

// The Navigation API (Chromium, so always present in the desktop app) says
// whether there's anywhere to go, and announces every change of page —
// including Next's client-side ones. Not in TypeScript's DOM types yet.
interface NavigationLike extends EventTarget {
  canGoBack: boolean;
  canGoForward: boolean;
}
const getNavigation = () =>
  (window as unknown as { navigation?: NavigationLike }).navigation ?? null;

const subscribe = (onChange: () => void) => {
  const navigation = getNavigation();
  navigation?.addEventListener('currententrychange', onChange);
  return () => navigation?.removeEventListener('currententrychange', onChange);
};

/** Back and forward for the desktop app's toolbar — it has no browser chrome. */
const HistoryButtons = () => {
  const canGoBack = useSyncExternalStore(subscribe, () => getNavigation()?.canGoBack ?? true, () => false);
  const canGoForward = useSyncExternalStore(subscribe, () => getNavigation()?.canGoForward ?? true, () => false);

  const button =
    'w-8 h-8 rounded-lg flex items-center justify-center transition-colors disabled:opacity-25 disabled:cursor-default ' +
    'text-white/70 enabled:hover:bg-white/10 enabled:hover:text-white';

  return (
    <div className="flex items-center gap-0.5">
      <button onClick={() => history.back()} disabled={!canGoBack} className={button} title="Back" aria-label="Back">
        <ChevronLeft size={20} />
      </button>
      <button onClick={() => history.forward()} disabled={!canGoForward} className={button} title="Forward" aria-label="Forward">
        <ChevronRight size={20} />
      </button>
    </div>
  );
};

export default HistoryButtons;
