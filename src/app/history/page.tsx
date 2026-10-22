'use client';

import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/components/AuthProvider';
import MovieCard from '@/components/MovieCard';
import { History, Loader2, ArrowLeft, Trash2 } from 'lucide-react';
import Link from 'next/link';

export default function HistoryPage() {
  const { user, loading: authLoading } = useAuth();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user && !authLoading) {
      setLoading(false);
      return;
    }

    if (user) {
      const fetchHistory = async () => {
        const { data, error } = await supabase
          .from('watch_history')
          .select('*')
          .eq('user_id', user.id)
          .order('watched_at', { ascending: false });

        if (data) setItems(data);
        setLoading(false);
      };

      fetchHistory();
    }
  }, [user, authLoading]);

  const clearHistory = async () => {
    if (!user) return;
    const { error } = await supabase
      .from('watch_history')
      .delete()
      .eq('user_id', user.id);
    
    if (!error) setItems([]);
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="animate-spin text-accent" size={40} />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center space-y-6 px-6">
        <History size={64} className="text-white/10" />
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold">Watch History</h1>
          <p className="text-muted max-w-sm">Sign in to keep track of everything you've watched.</p>
        </div>
        <Link href="/login" className="bg-accent text-white px-8 py-3 rounded-2xl font-bold shadow-xl shadow-accent/20 hover:scale-105 transition-all">
          Sign In Now
        </Link>
      </div>
    );
  }

  return (
    <div className="pt-32 pb-20 min-h-screen">
      <div className="container mx-auto px-6 space-y-12">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="w-12 h-12 bg-accent/20 border border-accent/20 rounded-2xl flex items-center justify-center text-accent">
              <History size={24} />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-white tracking-tight">Viewing History</h1>
              <p className="text-muted text-sm">{items.length} titles watched</p>
            </div>
          </div>
          <div className="flex items-center space-x-4">
            {items.length > 0 && (
              <button 
                onClick={clearHistory}
                className="flex items-center space-x-2 text-red-400 hover:text-red-300 transition-colors text-xs font-bold uppercase tracking-widest"
              >
                <Trash2 size={16} />
                <span>Clear History</span>
              </button>
            )}
            <Link href="/" className="hidden md:flex items-center space-x-2 text-muted hover:text-white transition-colors text-sm font-medium">
              <ArrowLeft size={16} />
              <span>Home</span>
            </Link>
          </div>
        </div>

        {items.length > 0 ? (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-6">
            {items.map((item: any) => (
              <div key={item.id} className="space-y-2">
                <MovieCard 
                  id={item.movie_id}
                  title={item.title || 'Unknown Title'}
                  posterPath={item.poster_path}
                  rating={0}
                  date=""
                  type={item.type}
                />
                <p className="text-[10px] text-muted font-medium uppercase tracking-widest text-center px-2">
                  Watched {new Date(item.watched_at).toLocaleDateString()}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <div className="py-32 text-center space-y-6">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-white/5 border border-white/10 text-white/20">
              <History size={32} />
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-bold">No history yet</h2>
              <p className="text-muted max-w-xs mx-auto text-sm">Movies and shows you watch will appear here so you can pick up where you left off.</p>
            </div>
            <Link href="/" className="inline-block text-accent font-bold hover:underline">Start Watching</Link>
          </div>
        )}
      </div>
    </div>
  );
}
