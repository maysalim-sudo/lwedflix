// The episode before or after another, across season boundaries, for places
// that only know the episode they're on (watch parties). Season sizes come
// from TMDB through /api/tv-season and are remembered for the session.

export interface EpisodeRef {
  season: number;
  episode: number;
}

const seasonSizes = new Map<string, Promise<number>>();

function seasonSize(showId: string, season: number): Promise<number> {
  const key = `${showId}:${season}`;
  let size = seasonSizes.get(key);
  if (!size) {
    size = fetch(`/api/tv-season?id=${encodeURIComponent(showId)}&season=${season}`)
      .then((res) => (res.ok ? res.json() : { episodes: [] }))
      .then((data) => (Array.isArray(data?.episodes) ? data.episodes.length : 0))
      .catch(() => {
        // A failed lookup shouldn't stick for the whole session.
        seasonSizes.delete(key);
        return 0;
      });
    seasonSizes.set(key, size);
  }
  return size;
}

/** Null at either end of the show (or when TMDB can't say). Season 0 is specials, so it's skipped. */
export async function adjacentEpisode(
  showId: string,
  { season, episode }: EpisodeRef,
  direction: 1 | -1
): Promise<EpisodeRef | null> {
  if (direction === 1) {
    if (episode < (await seasonSize(showId, season))) return { season, episode: episode + 1 };
    return (await seasonSize(showId, season + 1)) > 0 ? { season: season + 1, episode: 1 } : null;
  }
  if (episode > 1) return { season, episode: episode - 1 };
  if (season <= 1) return null;
  const size = await seasonSize(showId, season - 1);
  return size > 0 ? { season: season - 1, episode: size } : null;
}
