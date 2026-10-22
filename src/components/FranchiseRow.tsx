import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Star } from 'lucide-react';
import { getImageUrl } from '@/lib/imageUrl';

interface FranchiseItem {
  id: number;
  title: string;
  posterPath: string | null;
  rating: number;
  year: string;
}

interface FranchiseRowProps {
  title: string;
  icon: React.ReactNode;
  items: FranchiseItem[];
  currentId?: number;
}

// Horizontally-scrolling, chronologically-ordered carousel used for both a
// movie's own collection (direct sequels/prequels) and its wider studio
// franchise (e.g. other Marvel/DC titles). Items arrive pre-sorted by the
// caller since "chronological" means different things for each source.
const FranchiseRow = ({ title, icon, items, currentId }: FranchiseRowProps) => {
  if (items.length === 0) return null;

  return (
    <div className="space-y-4">
      <h3 className="text-xl font-bold text-white flex items-center space-x-2">
        {icon}
        <span>{title}</span>
      </h3>

      <div className="flex gap-4 overflow-x-auto pb-2 -mx-1 px-1 snap-x snap-mandatory no-scrollbar">
        {items.map((item) => {
          const isCurrent = item.id === currentId;
          return (
            <Link
              key={item.id}
              href={`/movie/${item.id}`}
              className="group relative flex-shrink-0 w-[140px] sm:w-[160px] snap-start"
            >
              <div
                className={`relative aspect-[2/3] rounded-xl overflow-hidden bg-card border transition-all ${
                  isCurrent
                    ? 'border-accent ring-2 ring-accent'
                    : 'border-white/5 group-hover:border-white/20'
                }`}
              >
                <Image
                  src={getImageUrl(item.posterPath, 'w342')}
                  alt={item.title}
                  fill
                  sizes="(max-width: 640px) 140px, 160px"
                  className="object-cover group-hover:scale-110 transition-transform duration-500"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" />

                <span className="absolute top-2 left-2 px-2 py-0.5 rounded-md bg-black/60 backdrop-blur-md border border-white/10 text-[10px] font-bold text-white/80">
                  {item.year || '—'}
                </span>

                {item.rating > 0 && (
                  <span className="absolute top-2 right-2 flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-black/60 backdrop-blur-md border border-white/10">
                    <Star size={9} className="text-yellow-500 fill-yellow-500" />
                    <span className="text-[10px] font-bold text-white">{item.rating.toFixed(1)}</span>
                  </span>
                )}

                {isCurrent && (
                  <span className="absolute bottom-2 left-2 right-2 px-2 py-1 rounded-lg bg-accent text-white text-[10px] font-bold uppercase tracking-widest text-center">
                    Watching
                  </span>
                )}
              </div>
              <p className="mt-2 text-xs font-medium text-white/80 group-hover:text-white line-clamp-2 transition-colors">
                {item.title}
              </p>
            </Link>
          );
        })}
      </div>
    </div>
  );
};

export default FranchiseRow;
