/**
 * Shown the moment you navigate, while the next page's data loads — most
 * pages wait on TMDB before they can render anything. A rough outline of a
 * page (a title, then rows of posters) rather than a spinner, so the switch
 * reads as instant.
 */
export default function Loading() {
  return (
    <div className="pt-24 pb-20 min-h-screen" aria-busy="true" aria-label="Loading">
      <div className="container mx-auto px-6 space-y-12 animate-pulse">
        <div className="space-y-3">
          <div className="h-9 w-72 rounded-xl bg-white/[0.06]" />
          <div className="h-4 w-96 max-w-full rounded-lg bg-white/[0.04]" />
        </div>
        {[0, 1].map((row) => (
          <div key={row} className="space-y-4">
            <div className="h-6 w-48 rounded-lg bg-white/[0.06]" />
            <div className="grid grid-cols-3 md:grid-cols-4 xl:grid-cols-6 gap-5">
              {Array.from({ length: 6 }, (_, i) => (
                <div key={i} className="aspect-[2/3] rounded-2xl bg-white/[0.05]" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
