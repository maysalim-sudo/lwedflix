'use client';

import React from 'react';
import { Play, Film, Video, Tv } from 'lucide-react';

interface TrailerVideo {
  id: string;
  key: string;
  name: string;
  type: string;
  site: string;
}

interface TrailerSelectorProps {
  videos: TrailerVideo[];
  onSelect: (key: string) => void;
  activeKey: string | null;
}

const TrailerSelector = ({ videos, onSelect, activeKey }: TrailerSelectorProps) => {
  if (!videos || videos.length === 0) return null;

  // Prioritize Trailers, then Teasers, then others
  const sortedVideos = [...videos].sort((a, b) => {
    const order = ['Trailer', 'Teaser', 'Clip', 'Featurette', 'Behind the Scenes'];
    return order.indexOf(a.type) - order.indexOf(b.type);
  });

  const getIcon = (type: string) => {
    switch (type) {
      case 'Trailer': return <Play size={14} className="fill-current" />;
      case 'Teaser': return <Video size={14} />;
      case 'Clip': return <Film size={14} />;
      default: return <Tv size={14} />;
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center space-x-2 text-muted px-2">
        <Video size={16} className="text-accent" />
        <span className="text-[10px] font-bold uppercase tracking-widest">Trailers & Clips</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {sortedVideos.slice(0, 8).map((video) => (
          <button
            key={video.id}
            onClick={() => onSelect(video.key)}
            className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all border ${
              activeKey === video.key 
                ? 'bg-accent border-accent text-white shadow-lg' 
                : 'bg-white/5 border-white/10 text-white/60 hover:text-white hover:border-white/20'
            }`}
          >
            {getIcon(video.type)}
            <span className="max-w-[120px] truncate">{video.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
};

export default TrailerSelector;
