import { getGenres, getLanguages, getCountries, discoverContent, getWatchProviders } from '@/lib/tmdb';
import FilterBar from '@/components/FilterBar';
import InfiniteScrollList from '@/components/InfiniteScrollList';

export default async function TVListPage({
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
    getGenres('tv'),
    getLanguages(),
    getCountries(),
    discoverContent('tv', filters),
    getWatchProviders('tv', 'US')
  ]);

  return (
    <div className="min-h-screen pt-24 pb-20">
      <div className="container mx-auto px-6">
        <div className="mb-12">
          <h1 className="text-4xl font-bold text-white mb-2">TV Shows</h1>
          <p className="text-muted">Discover the latest and greatest television series</p>
        </div>

        <FilterBar 
          genres={genres.genres} 
          languages={languages} 
          countries={countries} 
          providers={providers.results
            .filter((p: any) => !p.provider_name.includes('Channel') && !p.provider_name.includes('Add-on'))
            .slice(0, 30)}
          type="tv"
          category="tv"
        />

        <InfiniteScrollList 
          initialItems={initialResults.results}
          type="tv"
          filters={filters}
        />
      </div>
    </div>
  );
}
