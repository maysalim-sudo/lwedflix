'use client';

import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Star } from 'lucide-react';
import { getImageUrl } from '@/lib/imageUrl';
import WatchlistButton from './WatchlistButton';

interface MovieCardProps {
  id: number;
  title: string;
  posterPath: string;
  rating: number;
  date: string;
  type: 'movie' | 'tv';
}

const MovieCard = ({ id, title, posterPath, rating, date, type }: MovieCardProps) => {
  return (
    <div className="group relative">
      <Link href={`/${type}/${id}`} className="block">
        <div className="relative aspect-[2/3] overflow-hidden rounded-2xl bg-card card-hover">
          <Image 
            src={getImageUrl(posterPath, 'w500')} 
            alt={title}
            fill
            sizes="(max-width: 768px) 50vw, (max-width: 1200px) 33vw, 20vw"
            className="object-cover group-hover:scale-110 transition-transform duration-500"
          />
          {/* Permanent bottom overlay for readability */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
          
          {/* Hover highlight overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
          
          <div className="absolute top-3 right-3 bg-black/60 backdrop-blur-md px-2 py-1 rounded-lg flex items-center space-x-1 border border-white/10 z-10">
            <Star className="text-yellow-500 fill-yellow-500" size={14} />
            <span className="text-xs font-bold">{rating.toFixed(1)}</span>
          </div>

          <div className="absolute bottom-4 left-4 right-4 translate-y-4 group-hover:translate-y-0 transition-transform duration-300">
            <p className="text-xs font-medium text-accent uppercase tracking-wider mb-1">{date}</p>
            <h3 className="font-bold text-sm line-clamp-1 text-white">{title}</h3>
          </div>
        </div>
        <div className="mt-3">
          <h3 className="text-sm font-medium text-white/90 group-hover:text-white transition-colors truncate">{title}</h3>
          <div className="flex items-center space-x-2 mt-0.5">
            <span className="text-xs text-muted">{type === 'movie' ? 'Movie' : 'TV Series'}</span>
            <span className="text-white/20">•</span>
            <div className="flex items-center space-x-1 text-accent">
              <Star size={10} className="fill-accent" />
              <span className="text-xs font-bold">{rating.toFixed(1)}</span>
            </div>
          </div>
        </div>
      </Link>
      
      {/* Absolute Watchlist Button Overlay */}
      <div className="absolute top-3 left-3 opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-20">
        <WatchlistButton 
          id={id} 
          type={type} 
          title={title} 
          posterPath={posterPath} 
          variant="icon"
        />
      </div>
    </div>
  );
};

export default MovieCard;
