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
  contextBridge.exposeInMainWorld('lwedflixPlayer', {
    onState(callback) {
      const listener = (_event, state) => callback(state);
      ipcRenderer.on('player:state', listener);
      return () => ipcRenderer.removeListener('player:state', listener);
    },
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
// applies play/pause/seek from the app. A website can't do this — browsers
// wall off cross-origin frames — and it's what lets watch parties sync.
function playerBridge() {
  // YouTube trailers and the Gen Z background clip aren't the stream.
  if (/(^|\.)youtube(-nocookie)?\.com$/.test(location.hostname)) return;

  // Anything shorter is an ad or a preview, not the feature.
  const MIN_DURATION_S = 240;
  let video = null;
  let lastTimeUpdate = 0;

  for (const type of ['play', 'pause', 'seeked', 'timeupdate', 'loadedmetadata']) {
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
        video = target;
        ipcRenderer.send('player:state', {
          event: type,
          playing: !video.paused,
          time: video.currentTime,
          duration: video.duration,
        });
      },
      true
    );
  }

  window.addEventListener('pagehide', () => {
    if (video) ipcRenderer.send('player:state', { event: 'gone' });
  });

  ipcRenderer.on('player:command', (_event, command) => {
    if (!video) return;
    if (command.action === 'seek') video.currentTime = command.time;
    else if (command.action === 'play') video.play().catch(() => {});
    else if (command.action === 'pause') video.pause();
  });
}
