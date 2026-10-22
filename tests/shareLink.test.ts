import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { appLinkPath, shareUrl } from '../src/lib/shareLink.ts';

test('lwedflix:// links open only allowlisted pages', () => {
  const cases: [string, string | null][] = [
    ['lwedflix://invite/a1b2c3d4e5f6', '/invite/a1b2c3d4e5f6'],
    ['lwedflix://watch/K7M2QX', '/watch/K7M2QX'],
    ['lwedflix://movie/550', '/movie/550'],
    ['lwedflix://tv/1429?season=2&episode=3', '/tv/1429?season=2&episode=3'],
    ['lwedflix://p/5f0c2a3e-9b1d-4c2e-8f3a-1234567890ab', '/p/5f0c2a3e-9b1d-4c2e-8f3a-1234567890ab'],
    ['lwedflix://movie/550/', '/movie/550'],
    ['lwedflix://admin/x', null],
    ['lwedflix://movie/550/../../admin', null],
    ['lwedflix://movie/abc', null],
    ['lwedflix://movie/550?x=<script>', null],
    ['https://evil.example/movie/550', null],
    ['lwedflix://movie', null],
    ['not a url', null],
  ];
  for (const [input, expected] of cases) assert.equal(appLinkPath(input), expected, input);
});

test('shared links round-trip', () => {
  for (const path of ['/watch/K7M2QX', '/movie/550', '/tv/1399?season=1&episode=2']) {
    assert.equal(appLinkPath(shareUrl(path)), path);
  }
});

// Links from outside the app arrive in electron/main.js, links clicked
// inside it in shareLink.ts. Both must accept exactly the same pages.
test('the app and the desktop shell share one allowlist', () => {
  const source = (file: string) => readFileSync(new URL(file, import.meta.url), 'utf8');
  const pattern = (text: string, name: string) => {
    const match = text.match(new RegExp(`const ${name} = (/.+/);`));
    assert(match, `${name} not found`);
    return match[1];
  };
  const main = source('../electron/main.js');
  const web = source('../src/lib/shareLink.ts');
  assert.equal(pattern(main, 'DEEP_LINK_PATH'), pattern(web, 'APP_LINK_PATH'));
  assert.equal(pattern(main, 'DEEP_LINK_QUERY'), pattern(web, 'APP_LINK_QUERY'));
});
