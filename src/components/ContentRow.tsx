'use client';

import React from 'react';
import MovieCard from './MovieCard';
import { ChevronRight } from 'lucide-react';
import Link from 'next/link';

interface ContentRowProps {
  title: string;
  items: any[];
  type: 'movie' | 'tv' | 'all';
}

const ContentRow = ({ title, items, type }: ContentRowProps) => {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-white tracking-tight">{title}</h2>
        <Link 
          href={type === 'tv' ? '/tv' : '/movies'}
          className="flex items-center space-x-1 text-sm font-bold uppercase tracking-widest text-accent hover:text-white transition-colors group"
        >
          <span>See All</span>
          <ChevronRight size={14} className="group-hover:translate-x-1 transition-transform" />
        </Link>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-6">
        {items.slice(0, 6).map((item: any) => (
          <MovieCard 
            key={item.id}
            id={item.id}
            title={item.title || item.name}
            posterPath={item.poster_path}
            rating={item.vote_average}
            date={(item.release_date || item.first_air_date || '').split('-')[0]}
            type={item.title ? 'movie' : 'tv'}
          />
        ))}
      </div>
    </div>
  );
};

export default ContentRow;
