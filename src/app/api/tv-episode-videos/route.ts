import { NextResponse } from 'next/server';
import { getEpisodeVideos } from '@/lib/tmdb';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  const season = searchParams.get('season');
  const episode = searchParams.get('episode');

  if (!id || !season || !episode) {
    return NextResponse.json({ error: 'Missing id, season, or episode' }, { status: 400 });
  }

  try {
    const data = await getEpisodeVideos(id, Number(season), Number(episode));
    return NextResponse.json(data);
  } catch (error) {
    console.error('TV Episode Videos API Error:', error);
    return NextResponse.json({ results: [] }, { status: 500 });
  }
}
