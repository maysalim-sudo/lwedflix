'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Image from 'next/image';
import NextLink from 'next/link';
import { Play, Info, Star, ChevronLeft, ChevronRight } from 'lucide-react';
import { getImageUrl } from '@/lib/imageUrl';
import { motion, AnimatePresence } from 'framer-motion';

interface HeroItem {
  id: number;
  title?: string;
  name?: string;
  backdrop_path: string;
  overview: string;
  vote_average: number;
  release_date?: string;
  first_air_date?: string;
  media_type: 'movie' | 'tv';
}

interface HeroProps {
  items: HeroItem[];
}

const HeroSection = ({ items }: HeroProps) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isAutoPlaying, setIsAutoPlaying] = useState(true);

  const nextSlide = useCallback(() => {
    setCurrentIndex((prev) => (prev + 1) % items.length);
  }, [items.length]);

  const prevSlide = () => {
    setCurrentIndex((prev) => (prev - 1 + items.length) % items.length);
  };

  useEffect(() => {
    if (!isAutoPlaying) return;
    const interval = setInterval(nextSlide, 8000);
    return () => clearInterval(interval);
  }, [isAutoPlaying, nextSlide]);

  if (!items || items.length === 0) return null;

  const movie = items[currentIndex];
  const title = movie.title || movie.name;
  const year = (movie.release_date || movie.first_air_date || '').split('-')[0];

  return (
    <div 
      // The floor keeps the copy from riding up under the top bar in short
      // windows (the desktop app goes down to 640px tall).
      className="relative h-[85vh] min-h-[640px] w-full overflow-hidden bg-black"
      onMouseEnter={() => setIsAutoPlaying(false)}
      onMouseLeave={() => setIsAutoPlaying(true)}
    >
      <AnimatePresence mode="wait">
        <motion.div
          key={movie.id}
          initial={{ opacity: 0, scale: 1.1 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ duration: 1.2, ease: "easeOut" }}
          className="absolute inset-0"
        >
          {/* Background Image with Zoom Effect */}
          <Image 
            src={getImageUrl(movie.backdrop_path)} 
            alt={title || 'Hero'}
            fill
            priority
            className="object-cover opacity-60"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-background via-background/40 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent" />
        </motion.div>
      </AnimatePresence>

      {/* Padded clear of the top bar above and the carousel controls below. */}
      <div className="container mx-auto px-6 h-full flex flex-col justify-center relative z-10 pt-16 pb-28">
        <AnimatePresence mode="wait">
          <motion.div 
            key={movie.id}
            initial={{ opacity: 0, x: -50 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 50 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className="max-w-2xl space-y-6"
          >
            <div className="flex items-center space-x-3 text-sm font-medium">
              <span className="bg-accent px-3 py-1 rounded-full text-white shadow-lg shadow-accent/20">Featured</span>
              <div className="flex items-center space-x-1 text-white/90">
                <Star className="text-yellow-500 fill-yellow-500" size={16} />
                <span>{movie.vote_average.toFixed(1)} Rating</span>
              </div>
              <span className="text-white/60">{year}</span>
              <span className="text-white/60 uppercase tracking-widest text-[10px] bg-white/10 px-2 py-0.5 rounded">{movie.media_type}</span>
            </div>

            <h1 className="text-5xl md:text-7xl font-bold text-white tracking-tight leading-tight drop-shadow-2xl">
              {title}
            </h1>
            
            <p className="text-lg text-white/70 line-clamp-3 leading-relaxed max-w-xl drop-shadow-md">
              {movie.overview}
            </p>

            <div className="flex items-center space-x-4 pt-4">
              <NextLink 
                href={`/${movie.media_type}/${movie.id}`}
                className="bg-white text-black px-10 py-4 rounded-full font-bold flex items-center space-x-2 hover:bg-white/90 transition-all scale-100 hover:scale-105 active:scale-95 shadow-xl"
              >
                <Play fill="black" size={20} />
                <span>Watch Now</span>
              </NextLink>
              <NextLink 
                href={`/${movie.media_type}/${movie.id}`}
                className="bg-white/10 backdrop-blur-xl text-white border border-white/20 px-10 py-4 rounded-full font-bold flex items-center space-x-2 hover:bg-white/20 transition-all shadow-xl"
              >
                <Info size={20} />
                <span>More Info</span>
              </NextLink>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Navigation Controls */}
      <div className="absolute bottom-12 right-12 flex items-center space-x-6 z-20">
        <div className="flex space-x-3">
          {items.map((_, idx) => (
            <button
              key={idx}
              onClick={() => setCurrentIndex(idx)}
              className={`transition-all duration-300 rounded-full h-1.5 ${
                currentIndex === idx ? 'w-8 bg-accent' : 'w-2 bg-white/20 hover:bg-white/40'
              }`}
            />
          ))}
        </div>
        
        <div className="flex space-x-2 border-l border-white/10 pl-6 mx-4">
          <button 
            onClick={prevSlide}
            className="p-2 rounded-full bg-white/5 border border-white/10 text-white/70 hover:bg-white/10 hover:text-white transition-all active:scale-90"
          >
            <ChevronLeft size={20} />
          </button>
          <button 
            onClick={nextSlide}
            className="p-2 rounded-full bg-white/5 border border-white/10 text-white/70 hover:bg-white/10 hover:text-white transition-all active:scale-90"
          >
            <ChevronRight size={20} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default HeroSection;
