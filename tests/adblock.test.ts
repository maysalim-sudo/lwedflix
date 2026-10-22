import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isBlockedHost, isBlockedUrl, installAdBlock } from '../electron/adblock.js';

test('blocks ad and tracker hosts, including their subdomains', () => {
  for (const host of ['doubleclick.net', 'cm.g.doubleclick.net', '4.adsco.re', 'C.ADSCO.RE', 'mc.yandex.ru', 'scripts.clarity.ms', 'histats.com.']) {
    assert(isBlockedHost(host), host);
  }
  assert(isBlockedUrl('https://inpqo2k8wknq.l4.adsco.re:2087/x?y=1'));
});

// The players' own hosts and their streams must never match: blocking one
// makes a working server look broken.
test('leaves players, streams and the app alone', () => {
  for (const host of [
    'vidsrc.me',
    'vidsrc.sh',
    'stellarconductornexus.com', // vidsrc.me's player frame
    'vidcore.org',
    'vidcoree.edgeone.dev',
    'www.2embed.cc',
    'vidsrc.buzz',
    'vidlink.pro',
    'player.videasy.to',
    'image.tmdb.org',
    'abcdefgh.supabase.co',
    'www.youtube.com',
    'p16-sign-sg.tiktokcdn.com',
    'notdoubleclick.net',
    'yandex.ru',
    'bing.com',
    '127.0.0.1',
  ]) {
    assert(!isBlockedHost(host), host);
  }
  assert(!isBlockedUrl('not a url'));
});

test('cancels blocked requests below the top frame, and every download', () => {
  type Details = { url: string; resourceType: string };
  let onBeforeRequest: ((details: Details, callback: (response: { cancel?: boolean }) => void) => void) | undefined;
  let onWillDownload: ((event: { preventDefault(): void }, item: { getURL(): string }) => void) | undefined;
  const session = {
    webRequest: {
      onBeforeRequest: (_filter: unknown, listener: typeof onBeforeRequest) => {
        onBeforeRequest = listener;
      },
    },
    on: (event: string, listener: typeof onWillDownload) => {
      if (event === 'will-download') onWillDownload = listener;
    },
  };
  const blocked: string[] = [];
  const downloads: string[] = [];
  installAdBlock(session, { onBlock: (d: Details) => blocked.push(d.url), onDownload: (url: string) => downloads.push(url) });

  const decide = (url: string, resourceType: string) => {
    let response: { cancel?: boolean } | undefined;
    onBeforeRequest!({ url, resourceType }, (r) => {
      response = r;
    });
    return Boolean(response?.cancel);
  };
  assert(decide('https://ib.adnxs.com/px', 'image'));
  assert(decide('https://bcp.crwdcntrl.net/frame', 'subFrame'));
  assert(!decide('https://vidsrc.me/embed/movie/550', 'subFrame'));
  // The top frame is the app itself; the shell's navigation guard covers it.
  assert(!decide('https://doubleclick.net/', 'mainFrame'));
  assert.deepEqual(blocked, ['https://ib.adnxs.com/px', 'https://bcp.crwdcntrl.net/frame']);

  let prevented = false;
  onWillDownload!({ preventDefault: () => (prevented = true) }, { getURL: () => 'https://x.example/setup.exe' });
  assert(prevented);
  assert.deepEqual(downloads, ['https://x.example/setup.exe']);
});
