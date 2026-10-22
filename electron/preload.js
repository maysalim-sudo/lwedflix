// Runs in every frame (nodeIntegrationInSubFrames), always in an isolated
// world: the main frame gets the intro or app bridges, embedded frames get
// the player bridge.

const { contextBridge, ipcRenderer } = require('electron');

if (window !== window.top) {
  playerBridge();
} else if (location.protocol === 'file:') {
  // The intro page.
  contextBridge.exposeInMainWorld('lwedflix', {
    whenAppReady: () => ipcRenderer.invoke('app:when-ready'),
    introFinished: () => ipcRenderer.send('intro:finished'),
  });
} else {
  // The app's side of the player bridge (src/lib/desktopPlayer.ts).
  const subscribe = (channel) => (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  };
  contextBridge.exposeInMainWorld('lwedflixPlayer', {
    onState: subscribe('player:state'),
    onProblem: subscribe('player:problem'),
    onShortcut: subscribe('player:shortcut'),
    command: (command) => ipcRenderer.send('player:command', command),
  });

  // Every popup is denied in the main process, so links leaving the app
  // (user-posted links in posts and comments) are routed to the system
  // browser here instead of silently doing nothing.
  window.addEventListener(
    'click',
    (event) => {
      if (event.defaultPrevented || event.button !== 0) return;
      const anchor = event.target instanceof Element ? event.target.closest('a[href]') : null;
      if (!anchor) return;
      const url = new URL(anchor.href, location.href);
      if (url.origin === location.origin || !/^https?:$/.test(url.protocol)) return;
      event.preventDefault();
      ipcRenderer.send('open-external', url.href);
    },
    true
  );

  // Mouse back/forward buttons, which a bare window doesn't map to history.
  window.addEventListener('mouseup', (event) => {
    if (event.button === 3) history.back();
    if (event.button === 4) history.forward();
  });
}

// Inside the embedded players: finds the stream's <video> in whichever
// cross-origin frame the provider renders it, reports its state, and
// applies commands from the app. A website can't do this — browsers wall off
// cross-origin frames — and it's what lets watch parties sync.
function playerBridge() {
  // YouTube trailers and the Gen Z background clip aren't the stream.
  if (/(^|\.)youtube(-nocookie)?\.com$/.test(location.hostname)) return;

  // Anything shorter is an ad or a preview, not the feature.
  const MIN_DURATION_S = 240;
  let video = null;
  let lastTimeUpdate = 0;

  const report = (type) =>
    ipcRenderer.send('player:state', {
      event: type,
      playing: !video.paused,
      time: video.currentTime,
      duration: video.duration,
    });

  for (const type of ['play', 'pause', 'seeked', 'timeupdate', 'loadedmetadata', 'ended']) {
    // Media events don't bubble, but a capturing listener on the document
    // still sees them, including from <video> elements created later.
    document.addEventListener(
      type,
      (event) => {
        const target = event.target;
        if (!(target instanceof HTMLVideoElement) || !(target.duration >= MIN_DURATION_S)) return;
        if (type === 'timeupdate') {
          if (Date.now() - lastTimeUpdate < 1000) return;
          lastTimeUpdate = Date.now();
        }
        if (video !== target) {
          video = target;
          // Lets the main process find it from the page's own world (the
          // mini player needs a user gesture there).
          video.dataset.lwedflixStream = '';
        }
        report(type);
      },
      true
    );
  }

  window.addEventListener('pagehide', () => {
    if (video) ipcRenderer.send('player:state', { event: 'gone' });
  });

  ipcRenderer.on('player:command', (_event, command) => {
    if (!video) return;
    switch (command.action) {
      case 'seek':
        video.currentTime = command.time;
        break;
      case 'seekBy':
        video.currentTime = Math.min(Math.max(video.currentTime + command.delta, 0), video.duration);
        break;
      case 'play':
        video.play().catch(() => {});
        break;
      case 'pause':
        video.pause();
        break;
      case 'toggle':
        if (video.paused) video.play().catch(() => {});
        else video.pause();
        break;
      case 'toggleMute':
        video.muted = !video.muted;
        break;
    }
  });

  watchForProblems(() => video !== null);
  forwardShortcuts(() => video);
}

// A server that can't play a title says so in its own words, often before
// any <video> exists ("We couldn't find that"). Report it once, so the app
// can try the next server instead of leaving the viewer at an error.
function watchForProblems(hasStream) {
  const UNAVAILABLE =
    /couldn['’]?t find|could not find|not available|unavailable|no (video )?sources?\b|(video|media|file) (not found|was deleted|has been removed)|failed to load/i;
  let reported = false;
  const send = (reason) => {
    if (reported || hasStream()) return;
    reported = true;
    observer.disconnect();
    ipcRenderer.send('player:problem', { reason });
  };

  // A video that fails before it ever plays is the same problem.
  document.addEventListener(
    'error',
    (event) => {
      if (event.target instanceof HTMLVideoElement && !(event.target.currentTime > 0)) send('error');
    },
    true
  );

  let pending = false;
  const check = () => {
    pending = false;
    const text = document.body?.innerText ?? '';
    if (text.length < 2000 && UNAVAILABLE.test(text)) send('unavailable');
  };
  const observer = new MutationObserver(() => {
    if (pending) return;
    pending = true;
    setTimeout(check, 500);
  });
  const start = () => {
    observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
    check();
    // Error screens appear early; a page still fine after this long is just a page.
    setTimeout(() => observer.disconnect(), 30000);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
}

// The app's player shortcuts, for when keyboard focus is inside the player.
// Handled here only in the frame that holds the stream — anywhere else the
// provider's own keys (say, Space to start playback) keep working.
function forwardShortcuts(getVideo) {
  window.addEventListener(
    'keydown',
    (event) => {
      const video = getVideo();
      if (!video || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target;
      if (target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;

      const key = event.key.toLowerCase();
      if (key === ' ' || key === 'k') {
        if (video.paused) video.play().catch(() => {});
        else video.pause();
      } else if (key === 'arrowleft' || key === 'j') {
        video.currentTime = Math.max(video.currentTime - 10, 0);
      } else if (key === 'arrowright' || key === 'l') {
        video.currentTime = Math.min(video.currentTime + 10, video.duration);
      } else if (key === 'm') {
        video.muted = !video.muted;
      } else if (key === 'p') {
        // A keypress here is the user gesture picture-in-picture needs.
        video.disablePictureInPicture = false;
        if (document.pictureInPictureElement) document.exitPictureInPicture().catch(() => {});
        else video.requestPictureInPicture().catch(() => {});
      } else if (key === 'f') {
        // Fullscreen belongs to the app's player frame, not this one.
        ipcRenderer.send('player:key', 'f');
      } else {
        return;
      }
      // Ours alone: the provider's player would otherwise act on it too
      // (Space toggling twice is no toggle at all).
      event.preventDefault();
      event.stopImmediatePropagation();
    },
    true
  );
}
