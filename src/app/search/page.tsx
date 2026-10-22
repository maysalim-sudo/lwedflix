import React from 'react';
import { searchTMDB } from '@/lib/tmdb';
import MovieCard from '@/components/MovieCard';
import UserSearchResults from '@/components/UserSearchResults';
import { Search as SearchIcon } from 'lucide-react';

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q: string }> }) {
  const { q } = await searchParams;
  const query = q || '';
  let results = [];
  
  if (query) {
    const data = await searchTMDB(query);
    results = data.results.filter((item: any) => item.media_type === 'movie' || item.media_type === 'tv');
  }

  return (
    <div className="pt-32 pb-20 min-h-screen">
      <div className="container mx-auto px-6 space-y-10">
        <div className="flex items-center space-x-4">
          <div className="w-12 h-12 bg-white/5 border border-white/10 rounded-2xl flex items-center justify-center text-accent">
            <SearchIcon size={24} />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-white tracking-tight">Search Results</h1>
            <p className="text-muted text-sm">Showing results for "{query}"</p>
          </div>
        </div>

        <UserSearchResults query={query} />

        {results.length > 0 ? (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-6">
            {results.map((item: any) => (
              <MovieCard 
                key={item.id}
                id={item.id}
                title={item.title || item.name}
                posterPath={item.poster_path}
                rating={item.vote_average}
                date={item.release_date || item.first_air_date || ''}
                type={item.media_type}
              />
            ))}
          </div>
        ) : (
          <div className="py-20 text-center">
            <p className="text-muted">No results found for your search.</p>
          </div>
        )}
      </div>
    </div>
  );
}
