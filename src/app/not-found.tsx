import Link from 'next/link';
import { Clapperboard } from 'lucide-react';

/** Unknown pages, and anything that calls notFound(). */
export default function NotFound() {
  return (
    <div className="min-h-[80vh] flex items-center justify-center px-6 pt-20">
      <div className="max-w-md text-center space-y-6">
        <div className="mx-auto w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-white/40">
          <Clapperboard size={30} />
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-white">Nothing here</h1>
          <p className="text-muted text-sm leading-relaxed">
            This page doesn&apos;t exist — the link may be old, or mistyped.
          </p>
        </div>
        <Link
          href="/"
          className="inline-block bg-accent text-white px-6 py-3 rounded-2xl text-sm font-bold shadow-lg shadow-accent/20 hover:bg-accent/90 transition-all"
        >
          Go home
        </Link>
      </div>
    </div>
  );
}
