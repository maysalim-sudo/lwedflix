'use client';

import React, { useState, useEffect, useRef } from 'react';
import useInView from '@/hooks/useInView';
import MovieCard from './MovieCard';
import { Loader2, Film } from 'lucide-react';

const InfiniteScrollList = ({ initialItems, type, filters }: { initialItems: any[], type: 'movie' | 'tv' | 'all', filters: any }) => {
  const [items, setItems] = useState(initialItems);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(initialItems.length > 0);
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const isInView = useInView(loadMoreRef);

  useEffect(() => {
    // Reset when filters change
    setItems(initialItems);
    setPage(1);
    setHasMore(initialItems.length > 0);
  }, [filters, initialItems]);

  useEffect(() => {
    if (isInView && hasMore && !loading) {
      loadMore();
    }
  }, [isInView, hasMore, loading]);

  const loadMore = async () => {
    setLoading(true);
    const nextPage = page + 1;
    
    try {
      const queryParams = new URLSearchParams(filters);
      queryParams.set('page', nextPage.toString());
      
      const response = await fetch(`/api/discover?type=${type}&${queryParams.toString()}`);
      const data = await response.json();
      
      if (data.results && data.results.length > 0) {
        setItems((prev) => [...prev, ...data.results]);
        setPage(nextPage);
      } else {
        setHasMore(false);
      }
    } catch (err) {
      console.error('Error loading more:', err);
      setHasMore(false);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-12">
      {items.length === 0 ? (
        <div className="py-20 text-center space-y-4">
          <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mx-auto text-muted">
            <Film size={32} />
          </div>
          <div className="space-y-1">
            <h3 className="text-xl font-bold text-white">Content Not Available</h3>
            <p className="text-muted text-sm max-w-xs mx-auto">
              We couldn't find any {type === 'movie' ? 'movies' : 'shows'} matching your current filters. Try adjusting them!
            </p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-6">
          {items.map((item: any, idx) => (
            <MovieCard
              key={`${item.id}-${idx}`}
              id={item.id}
              title={item.title || item.name}
              posterPath={item.poster_path}
              rating={item.vote_average}
              date={item.release_date || item.first_air_date || ''}
              type={item.title ? 'movie' : 'tv'}
            />
          ))}
        </div>
      )}

      {hasMore && (
        <div ref={loadMoreRef} className="flex justify-center py-12">
          {loading && <Loader2 className="animate-spin text-accent" size={32} />}
        </div>
      )}
    </div>
  );
};

export default InfiniteScrollList;
