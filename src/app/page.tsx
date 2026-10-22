import React from 'react';
import { getTrending, getPopular, getNowPlaying, getAnimeMix } from '@/lib/tmdb';
import ContinueWatching from '@/components/ContinueWatching';
import HeroSection from '@/components/HeroSection';
import ContentRow from '@/components/ContentRow';

export default async function Home() {
  const [
    trendingResults,
    popularMovies,
    popularTV,
    newestMovies,
    newestTV,
    animeHits
  ] = await Promise.all([
    getTrending('all'),
    getPopular('movie'),
    getPopular('tv'),
    getNowPlaying('movie'),
    getNowPlaying('tv'),
    getAnimeMix()
  ]);

  const trending = trendingResults.results;
  const heroQueue = [
    ...trending.slice(0, 3),
    popularMovies.results[0],
    popularTV.results[0]
  ].filter(Boolean);

  return (
    <div className="min-h-screen pb-20">
      <HeroSection items={heroQueue} />
      
      <div className="container mx-auto px-6 relative z-10 space-y-16">
        <ContinueWatching />

        <ContentRow 
          title="Trending Now" 
          items={trending.slice(1)} 
          type="all" 
        />

        <ContentRow 
          title="Most Watched Movies" 
          items={popularMovies.results} 
          type="movie" 
        />

        <ContentRow 
          title="Anime Hits" 
          items={animeHits.results} 
          type="tv" 
        />

        <ContentRow 
          title="Most Watched TV Shows" 
          items={popularTV.results} 
          type="tv" 
        />

        <ContentRow 
          title="Newest Movie Releases" 
          items={newestMovies.results} 
          type="movie" 
        />

        <ContentRow 
          title="Newest TV Series" 
          items={newestTV.results} 
          type="tv" 
        />

        {/* This could be "Things you might like" later when we have history */}
        <ContentRow 
          title="Suggestions For You" 
          items={trending.slice(10)} 
          type="all" 
        />
      </div>
    </div>
  );
}
