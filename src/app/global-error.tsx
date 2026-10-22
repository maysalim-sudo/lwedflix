'use client';

import './globals.css';

/**
 * The last resort, for errors in the root layout itself (where error.tsx
 * can't help, because it renders inside that layout). Replaces the whole
 * page, so it brings its own <html> and <body>.
 */
export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen flex items-center justify-center bg-background text-foreground font-sans px-6">
        <title>Lwedflix</title>
        <div className="max-w-md text-center space-y-6">
          <h1 className="text-2xl font-bold">Lwedflix ran into a problem</h1>
          <p className="text-muted text-sm leading-relaxed">
            Something went wrong while starting up this page. Trying again usually fixes it; if it
            keeps happening, restarting the app will.
          </p>
          <button
            onClick={() => unstable_retry()}
            className="bg-accent text-white px-6 py-3 rounded-2xl text-sm font-bold hover:bg-accent/90 transition-all"
          >
            Try again
          </button>
          {error.digest && <p className="text-[11px] text-white/25 font-mono">Reference: {error.digest}</p>}
        </div>
      </body>
    </html>
  );
}
