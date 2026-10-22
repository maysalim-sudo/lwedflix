import { test } from 'node:test';
import assert from 'node:assert/strict';
import { adjacentEpisode } from '../src/lib/episodes.ts';

// A show with seasons of 10, 8 and 2 episodes, served the way
// /api/tv-season answers.
const SEASONS: Record<string, number> = { 1: 10, 2: 8, 3: 2 };
const requests: string[] = [];
Object.assign(globalThis, {
  fetch: async (url: string) => {
    requests.push(url);
    const season = new URL(url, 'http://app').searchParams.get('season')!;
    const count = SEASONS[season] ?? 0;
    return new Response(JSON.stringify({ episodes: Array.from({ length: count }, (_, i) => ({ episode_number: i + 1 })) }));
  },
});

test('steps within a season', async () => {
  assert.deepEqual(await adjacentEpisode('1399', { season: 1, episode: 3 }, 1), { season: 1, episode: 4 });
  assert.deepEqual(await adjacentEpisode('1399', { season: 1, episode: 3 }, -1), { season: 1, episode: 2 });
});

test('crosses season boundaries both ways', async () => {
  assert.deepEqual(await adjacentEpisode('1399', { season: 1, episode: 10 }, 1), { season: 2, episode: 1 });
  assert.deepEqual(await adjacentEpisode('1399', { season: 2, episode: 1 }, -1), { season: 1, episode: 10 });
});

test('stops at either end of the show', async () => {
  assert.equal(await adjacentEpisode('1399', { season: 3, episode: 2 }, 1), null);
  assert.equal(await adjacentEpisode('1399', { season: 1, episode: 1 }, -1), null);
});

test('looks each season up once', async () => {
  requests.length = 0;
  await adjacentEpisode('1400', { season: 2, episode: 8 }, 1);
  await adjacentEpisode('1400', { season: 2, episode: 7 }, 1);
  await adjacentEpisode('1400', { season: 3, episode: 1 }, -1);
  assert.deepEqual(
    requests.map((url) => new URL(url, 'http://app').searchParams.get('season')),
    ['2', '3']
  );
});
