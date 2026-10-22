import { NextResponse } from 'next/server';
import { getTVSeasonDetails } from '@/lib/tmdb';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  const season = searchParams.get('season');

  if (!id || !season) {
    return NextResponse.json({ error: 'Missing id or season' }, { status: 400 });
  }

  try {
    const data = await getTVSeasonDetails(id, Number(season));
    return NextResponse.json(data);
  } catch (error) {
    console.error('TV Season API Error:', error);
    return NextResponse.json({ episodes: [] }, { status: 500 });
  }
}
