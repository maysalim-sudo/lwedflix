'use client';

import React, { useState } from 'react';
import { Star, User, ChevronDown, ChevronUp } from 'lucide-react';
import Image from 'next/image';
import { getImageUrl } from '@/lib/imageUrl';

interface Review {
  id: string;
  author: string;
  content: string;
  author_details: {
    rating: number | null;
    avatar_path: string | null;
  };
  created_at: string;
}

interface ReviewSectionProps {
  reviews: Review[];
}

const ReviewSection = ({ reviews }: ReviewSectionProps) => {
  const [expandedReviews, setExpandedReviews] = useState<Record<string, boolean>>({});

  const toggleExpand = (id: string) => {
    setExpandedReviews(prev => ({ ...prev, [id]: !prev[id] }));
  };

  if (!reviews || reviews.length === 0) {
    return (
      <div className="py-12 border-t border-white/5">
        <h3 className="text-xl font-bold text-white mb-6">User Reviews</h3>
        <p className="text-muted text-sm">No reviews available for this title yet. Be the first to share your thoughts!</p>
      </div>
    );
  }

  // Display up to 10 reviews
  const displayedReviews = reviews.slice(0, 10);

  return (
    <div className="py-12 border-t border-white/5 space-y-8">
      <div className="flex items-center justify-between">
        <h3 className="text-xl font-bold text-white">Community Reviews</h3>
        <span className="text-xs font-bold text-muted uppercase tracking-widest">{reviews.length} total</span>
      </div>

      <div className="grid grid-cols-1 gap-6">
        {displayedReviews.map((review) => {
          const isExpanded = expandedReviews[review.id];
          const content = review.content;
          const shouldTruncate = content.length > 300;
          const displayContent = shouldTruncate && !isExpanded 
            ? content.slice(0, 300) + '...' 
            : content;

          return (
            <div key={review.id} className="p-6 rounded-3xl bg-white/[0.02] border border-white/5 space-y-4 hover:border-white/10 transition-colors">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 rounded-full bg-accent/20 flex items-center justify-center text-accent overflow-hidden">
                    {review.author_details.avatar_path ? (
                      <div className="relative w-full h-full">
                        <Image 
                          src={getImageUrl(review.author_details.avatar_path, 'w185')} 
                          alt={review.author}
                          fill
                          sizes="40px"
                          className="object-cover"
                        />
                      </div>
                    ) : (
                      <User size={20} />
                    )}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-white">{review.author}</p>
                    <p className="text-[10px] text-muted uppercase tracking-widest">
                      {new Date(review.created_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                
                {review.author_details.rating && (
                  <div className="flex items-center space-x-1 px-2 py-1 rounded-lg bg-yellow-500/10 text-yellow-500">
                    <Star size={12} className="fill-yellow-500" />
                    <span className="text-xs font-bold">{review.author_details.rating}</span>
                  </div>
                )}
              </div>

              <div className="space-y-4">
                <p className="text-white/70 text-sm leading-relaxed whitespace-pre-line">
                  {displayContent}
                </p>
                {shouldTruncate && (
                  <button 
                    onClick={() => toggleExpand(review.id)}
                    className="flex items-center space-x-1 text-accent text-xs font-bold uppercase tracking-widest hover:underline"
                  >
                    {isExpanded ? (
                      <>
                        <ChevronUp size={14} />
                        <span>Show Less</span>
                      </>
                    ) : (
                      <>
                        <ChevronDown size={14} />
                        <span>Read More</span>
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default ReviewSection;
