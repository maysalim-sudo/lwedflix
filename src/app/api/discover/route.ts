import { NextResponse } from 'next/server';
import { discoverContent, getTrending } from '@/lib/tmdb';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const type = (searchParams.get('type') as 'movie' | 'tv') || 'movie';
  const page = searchParams.get('page') || '1';
  
  // Convert searchParams to a plain object excluding internal params
  const params: any = {};
  searchParams.forEach((value, key) => {
    if (key !== 'type' && key !== 'page') {
      params[key] = value;
    }
  });

  const hasFilters = Object.keys(params).length > 0;

  try {
    let data;
    if (hasFilters) {
      data = await discoverContent(type, { ...params, page });
    } else {
      // TMDB Trending doesn't always support the same page param style as discover
      // but we'll try to use discover for consistency if we want pagination
      data = await discoverContent(type, { page, sort_by: 'popularity.desc' });
    }
    
    return NextResponse.json(data);
  } catch (error) {
    console.error('Discover API Error:', error);
    return NextResponse.json({ results: [] }, { status: 500 });
  }
}
