import React from 'react';
import { getGenres, getLanguages, getCountries, discoverContent, getWatchProviders } from '@/lib/tmdb';
import FilterBar from '@/components/FilterBar';
import InfiniteScrollList from '@/components/InfiniteScrollList';

export default async function MoviesPage({
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

  // TMDB ignores `certification` unless it's scoped to a country.
  if (filters.certification) filters.certification_country ||= 'US';

  const [genres, languages, countries, initialResults, providers] = await Promise.all([
    getGenres('movie'),
    getLanguages(),
    getCountries(),
    discoverContent('movie', filters),
    getWatchProviders('movie', 'US')
  ]);

  return (
    <div className="min-h-screen pt-24 pb-20">
      <div className="container mx-auto px-6">
        <div className="mb-12">
          <h1 className="text-4xl font-bold text-white mb-2">Movies</h1>
          <p className="text-muted">Explore thousands of movies from all around the world</p>
        </div>

        <FilterBar 
          genres={genres.genres} 
          languages={languages} 
          countries={countries} 
          providers={providers.results
            .filter((p: any) => !p.provider_name.includes('Channel') && !p.provider_name.includes('Add-on'))
            .slice(0, 30)} 
          type="movie"
          category="movie"
        />

        <InfiniteScrollList 
          initialItems={initialResults.results}
          type="movie"
          filters={filters}
        />
      </div>
    </div>
  );
}
