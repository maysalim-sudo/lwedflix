import React, { Suspense } from 'react';
import Image from 'next/image';
import { getTVDetails } from '@/lib/tmdb';
import { getImageUrl } from '@/lib/imageUrl';
import TVPlayerContainer from '@/components/TVPlayerContainer';

export default async function TVPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const show = await getTVDetails(id);

  return (
    <div className="min-h-screen pb-20">
      {/* Backdrop Header */}
      <div className="relative h-[50vh] w-full">
        <Image 
          src={getImageUrl(show.backdrop_path)} 
          alt={show.name}
          fill
          priority
          className="object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent" />
      </div>

      <Suspense fallback={null}>
        <TVPlayerContainer show={show} />
      </Suspense>
    </div>
  );
}
