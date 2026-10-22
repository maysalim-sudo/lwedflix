import React from 'react';
import { getGenres, getLanguages, getCountries, getWatchProviders, getAnimeMix } from '@/lib/tmdb';
import FilterBar from '@/components/FilterBar';
import InfiniteScrollList from '@/components/InfiniteScrollList';

export default async function AnimePage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  
  // Transform searchParams for the API
  const filters: Record<string, string> = {};
  Object.keys(params).forEach(key => {
    const val = params[key];
    if (typeof val === 'string') filters[key] = val;
  });

  // Base anime filters. Genre COMBINES with whatever the user picked
  // rather than replacing it — assigning '16' outright meant every genre
  // choice on this page silently did nothing. Comma is AND in TMDB.
  const picked = (filters.with_genres || '').split(',').filter((g) => g && g !== '16');
  filters.with_genres = ['16', ...picked].join(',');
  filters.with_original_language = 'ja'; // Japanese

  // certification only applies when scoped to a country.
  if (filters.certification) filters.certification_country ||= 'US';

  const [genres, languages, countries, initialResults, providers] = await Promise.all([
    getGenres('tv'),
    getLanguages(),
    getCountries(),
    getAnimeMix(), // Custom mixed results for initial load
    getWatchProviders('tv', 'US')
  ]);

  return (
    <div className="min-h-screen pt-24 pb-20">
      <div className="container mx-auto px-6">
        <div className="mb-12">
          <h1 className="text-4xl font-bold text-white mb-2">Anime</h1>
          <p className="text-muted">Masterpieces of Japanese Animation</p>
        </div>

        <FilterBar 
          genres={genres.genres} 
          languages={languages} 
          countries={countries} 
          providers={providers.results
            .filter((p: any) => !p.provider_name.includes('Channel') && !p.provider_name.includes('Add-on'))
            .slice(0, 30)}
          // Anime browses the /tv endpoint, but the filter set shown is
          // anime-specific — language and country are pinned below.
          type="tv"
          category="anime"
        />

        <InfiniteScrollList 
          initialItems={initialResults.results}
          type="tv" // New pages will load TV shows by default
          filters={filters}
        />
      </div>
    </div>
  );
}
