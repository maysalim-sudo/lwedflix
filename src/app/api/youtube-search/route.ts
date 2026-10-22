import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q');
  const apiKey = process.env.YOUTUBE_API_KEY;

  if (!q) {
    return NextResponse.json({ error: 'Missing search query' }, { status: 400 });
  }

  if (!apiKey) {
    // Return a graceful 'Missing API' response so the UI can handle it
    return NextResponse.json({ 
      error: 'API Key Missing', 
      message: 'Please add YOUTUBE_API_KEY to your .env.local' 
    }, { status: 401 });
  }

  try {
    const response = await fetch(
      `https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=3&q=${encodeURIComponent(q)}&type=video&key=${apiKey}`
    );
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error?.message || 'YouTube API error');
    }

    const results = data.items.map((item: any) => ({
      id: item.id.videoId,
      title: item.snippet.title,
      thumbnail: item.snippet.thumbnails.medium.url,
      channelTitle: item.snippet.channelTitle,
      publishedAt: item.snippet.publishedAt
    }));

    return NextResponse.json({ results });
  } catch (error: any) {
    console.error('YouTube Search Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
