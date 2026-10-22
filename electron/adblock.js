// Ad and tracker blocking for the embedded players, plus a stop to the
// "download" prompts their ads throw up.
//
// The list is curated from what the providers in src/components/VideoPlayer.tsx
// actually load (ad exchanges, popunder networks, trackers) plus the big
// ad networks they rotate through. Stream hosts are never on it: blocking
// one makes a server look broken. When a provider stops playing after a
// list change, run the probe in tests/e2e/providers.js with and without
// blocking and compare.
//
// A blocked domain covers its subdomains.

const BLOCKED_DOMAINS = new Set([
  // Ad exchanges and ad-tech
  'doubleclick.net',
  'googlesyndication.com',
  'googleadservices.com',
  'googletagservices.com',
  'adservice.google.com',
  'amazon-adsystem.com',
  'adnxs.com',
  'adsrvr.org',
  'criteo.com',
  'criteo.net',
  'pubmatic.com',
  'rubiconproject.com',
  'openx.net',
  'taboola.com',
  'outbrain.com',
  'revcontent.com',
  'mgid.com',
  'adskeeper.com',
  'rapidadexchange.com',
  'adexchangerapid.com',
  'adsco.re',
  // Popunder and redirect networks
  'popads.net',
  'popcash.net',
  'propellerads.com',
  'propellerclick.com',
  'onclickads.net',
  'adsterra.com',
  'highperformanceformat.com',
  'profitabledisplaynetwork.com',
  'effectiveratecpm.com',
  'effectivegatecpm.com',
  'exoclick.com',
  'exosrv.com',
  'magsrv.com',
  'realsrv.com',
  'tsyndicate.com',
  'trafficjunky.net',
  'juicyads.com',
  'hilltopads.net',
  'clickadu.com',
  'adcash.com',
  'acscdn.com',
  'a-ads.com',
  'ad-maven.com',
  'monetag.com',
  'richads.com',
  'galaksion.com',
  'intellipopup.com',
  'tagivi.com',
  'protrafficinspector.com',
  'nresystems.com',
  'kettledroopingcontinuation.com',
  'unfortunatelyejectinflected.com',
  'realizationnewestfangs.com',
  'interlinecustomroofingllc.com',
  'createlouisville.org',
  'portalfluently.com',
  'flushpersist.com',
  'p16-ad-site-sign-sg.tiktokcdn.com',
  'p19-ad-site-sign-sg.tiktokcdn.com',
  // Trackers and audience data
  'google-analytics.com',
  'googletagmanager.com',
  'analytics.yahoo.com',
  'clarity.ms',
  'bat.bing.com',
  'c.bing.com',
  'mc.yandex.ru',
  'histats.com',
  'statcounter.com',
  'amung.us',
  'quantserve.com',
  'scorecardresearch.com',
  'hotjar.com',
  'cloudflareinsights.com',
  'crwdcntrl.net',
  'dtscout.com',
  'dtscdn.com',
  'zeotap.com',
  'onaudience.com',
  'mrktmtrcs.net',
  'rqtrk.eu',
  'usrpubtrck.com',
  'usrpubtrk.com',
]);

function isBlockedHost(hostname) {
  let host = String(hostname).toLowerCase().replace(/\.$/, '');
  for (;;) {
    if (BLOCKED_DOMAINS.has(host)) return true;
    const dot = host.indexOf('.');
    if (dot === -1) return false;
    host = host.slice(dot + 1);
  }
}

function isBlockedUrl(url) {
  try {
    return isBlockedHost(new URL(url).hostname);
  } catch {
    return false;
  }
}

/**
 * Cancels requests to blocked hosts from anything but the top-level page
 * (the app itself), and every download — the app never downloads anything,
 * so any download is an ad's.
 */
function installAdBlock(ses, { onBlock, onDownload } = {}) {
  ses.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*'] }, (details, callback) => {
    if (details.resourceType !== 'mainFrame' && isBlockedUrl(details.url)) {
      onBlock?.(details);
      callback({ cancel: true });
      return;
    }
    callback({});
  });
  ses.on('will-download', (event, item) => {
    event.preventDefault();
    onDownload?.(item.getURL());
  });
}

module.exports = { BLOCKED_DOMAINS, isBlockedHost, isBlockedUrl, installAdBlock };
