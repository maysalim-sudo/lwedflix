'use client';

import React, { useState } from 'react';
import { ChevronRight, Play } from 'lucide-react';

interface EpisodePickerProps {
  seasons: any[];
  onSelect: (season: number, episode: number) => void;
  activeSeason: number;
  activeEpisode: number;
}

const EpisodePicker = ({ seasons, onSelect, activeSeason, activeEpisode }: EpisodePickerProps) => {
  const [selectedSeason, setSelectedSeason] = useState(activeSeason);
  
  const currentSeasonData = seasons.find(s => s.season_number === selectedSeason);
  const episodes = currentSeasonData ? Array.from({ length: currentSeasonData.episode_count }, (_, i) => i + 1) : [];

  return (
    <div className="space-y-6">
      <div className="flex items-center space-x-4 overflow-x-auto pb-2 scrollbar-hide">
        {seasons.map((season) => (
          <button
            key={season.id}
            onClick={() => setSelectedSeason(season.season_number)}
            className={`px-4 py-2 rounded-xl text-sm font-bold whitespace-nowrap transition-all border ${
              selectedSeason === season.season_number 
                ? 'bg-accent border-accent text-white' 
                : 'bg-white/5 border-white/10 text-muted hover:border-white/20'
            }`}
          >
            Season {season.season_number}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
        {episodes.map((ep) => (
          <button
            key={ep}
            onClick={() => onSelect(selectedSeason, ep)}
            className={`p-4 rounded-2xl border text-left transition-all group ${
              selectedSeason === activeSeason && ep === activeEpisode
                ? 'bg-accent/10 border-accent/50 text-accent'
                : 'bg-card border-white/5 text-muted hover:border-white/20'
            }`}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-bold uppercase tracking-wider">Ep {ep}</span>
              <Play size={12} className={selectedSeason === activeSeason && ep === activeEpisode ? 'fill-accent' : 'opacity-0 group-hover:opacity-100 transition-opacity'} />
            </div>
            <p className="text-sm font-medium line-clamp-1">Episode {ep}</p>
          </button>
        ))}
      </div>
    </div>
  );
};

export default EpisodePicker;
