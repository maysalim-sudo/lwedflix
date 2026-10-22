import React from 'react';
import Image from 'next/image';
import { getPersonDetails } from '@/lib/tmdb';
import { getImageUrl } from '@/lib/imageUrl';
import MovieCard from '@/components/MovieCard';
import { MapPin, Calendar, Star } from 'lucide-react';

export default async function PersonPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const person = await getPersonDetails(id);
  
  // Sort and filter credits for the "Known For" section
  const knownFor = (person.combined_credits?.cast || [])
    .sort((a: any, b: any) => b.popularity - a.popularity)
    .slice(0, 12);

  return (
    <div className="min-h-screen pt-24 pb-20">
      <div className="container mx-auto px-6">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-12">
          {/* Left Side: Profile Sidebar */}
          <div className="lg:col-span-1 space-y-8">
            <div className="relative aspect-[2/3] w-full rounded-3xl overflow-hidden shadow-2xl border border-white/5 bg-card">
              <Image 
                src={getImageUrl(person.profile_path, 'h632')} 
                alt={person.name}
                fill
                className="object-cover"
                priority
              />
            </div>
            
            <div className="space-y-6">
              <div>
                <h3 className="text-white font-bold text-lg mb-4">Personal Info</h3>
                <div className="space-y-4">
                  <div>
                    <p className="text-muted text-xs uppercase tracking-widest font-bold mb-1">Known For</p>
                    <p className="text-white text-sm">{person.known_for_department}</p>
                  </div>
                  {person.birthday && (
                    <div>
                      <p className="text-muted text-xs uppercase tracking-widest font-bold mb-1">Birthday</p>
                      <div className="flex items-center space-x-2 text-white text-sm">
                        <Calendar size={14} className="text-accent" />
                        <span>{new Date(person.birthday).toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
                      </div>
                    </div>
                  )}
                  {person.place_of_birth && (
                    <div>
                      <p className="text-muted text-xs uppercase tracking-widest font-bold mb-1">Place of Birth</p>
                      <div className="flex items-center space-x-2 text-white text-sm">
                        <MapPin size={14} className="text-accent" />
                        <span>{person.place_of_birth}</span>
                      </div>
                    </div>
                  )}
                  <div>
                    <p className="text-muted text-xs uppercase tracking-widest font-bold mb-1">Popularity</p>
                    <div className="flex items-center space-x-2 text-white text-sm">
                      <Star size={14} className="text-yellow-500 fill-yellow-500" />
                      <span>{person.popularity.toFixed(1)}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right Side: Main Content */}
          <div className="lg:col-span-3 space-y-12">
            <div className="space-y-4">
              <h1 className="text-5xl md:text-6xl font-bold text-white tracking-tighter">{person.name}</h1>
              {person.biography ? (
                <div className="space-y-4">
                  <h2 className="text-2xl font-bold text-white">Biography</h2>
                  <p className="text-white/70 leading-relaxed max-w-4xl whitespace-pre-line text-lg">
                    {person.biography}
                  </p>
                </div>
              ) : (
                <p className="text-muted italic">No biography available for this person.</p>
              )}
            </div>

            {/* Known For Section */}
            <div className="space-y-8">
              <div className="flex items-center justify-between">
                <h2 className="text-3xl font-bold text-white tracking-tight">Known For</h2>
                <span className="text-xs font-bold text-muted uppercase tracking-widest">Selected Works</span>
              </div>
              
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                {knownFor.map((item: any) => (
                  <MovieCard 
                    key={item.id + item.media_type}
                    id={item.id}
                    title={item.title || item.name}
                    posterPath={item.poster_path}
                    rating={item.vote_average}
                    date={item.release_date || item.first_air_date || ''}
                    type={item.media_type as 'movie' | 'tv'}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
