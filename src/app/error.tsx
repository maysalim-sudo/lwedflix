'use client';

import React, { useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { RotateCw, WifiOff, CloudAlert, Loader2 } from 'lucide-react';

const subscribeOnline = (onChange: () => void) => {
  window.addEventListener('online', onChange);
  window.addEventListener('offline', onChange);
  return () => {
    window.removeEventListener('online', onChange);
    window.removeEventListener('offline', onChange);
  };
};

/**
 * Any page that fails to load — almost always TMDB or the connection — lands
 * here instead of Next's bare error screen. `unstable_retry` re-fetches the
 * page, which is what fixes a network hiccup (`reset` would only re-render).
 */
export default function PageError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  const online = useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);
  const [retrying, setRetrying] = useState(false);

  const retry = () => {
    setRetrying(true);
    unstable_retry();
    // The boundary unmounts on success; if it fails again we're re-rendered
    // with the new error and should offer the button again.
    setTimeout(() => setRetrying(false), 4000);
  };

  const Icon = online ? CloudAlert : WifiOff;

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-6 pt-20">
      <div className="max-w-md text-center space-y-6">
        <div className="mx-auto w-16 h-16 rounded-2xl bg-accent/10 border border-accent/20 flex items-center justify-center text-accent">
          <Icon size={30} />
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-white">
            {online ? "Couldn't load this page" : "You're offline"}
          </h1>
          <p className="text-muted text-sm leading-relaxed">
            {online
              ? 'The movie database or the connection hiccupped. It usually works on a second try.'
              : 'Lwedflix needs an internet connection to find titles and stream them. Reconnect and try again.'}
          </p>
        </div>
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={retry}
            disabled={retrying}
            className="flex items-center gap-2 bg-accent text-white px-6 py-3 rounded-2xl text-sm font-bold shadow-lg shadow-accent/20 hover:bg-accent/90 disabled:opacity-60 transition-all"
          >
            {retrying ? <Loader2 size={16} className="animate-spin" /> : <RotateCw size={16} />}
            <span>Try again</span>
          </button>
          <Link
            href="/"
            className="px-6 py-3 rounded-2xl text-sm font-bold text-white/70 hover:text-white bg-white/5 border border-white/10 hover:bg-white/10 transition-all"
          >
            Go home
          </Link>
        </div>
        {error.digest && <p className="text-[11px] text-white/25 font-mono">Reference: {error.digest}</p>}
      </div>
    </div>
  );
}
