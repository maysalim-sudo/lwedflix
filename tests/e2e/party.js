// End-to-end watch party: two guests (separate storage, no accounts) in one
// party, each in its own window with the real preload, the real pages and
// real streams. Checks the room, chat, reactions, synced playback, the
// host-only lock, "Up next" and host episode changes.
//
//   npm run build:server   (the harness runs the staged server)
//   npm run test:e2e
//
// Needs the network, Supabase Realtime and a provider that's up, so it
// lives outside CI. The player relay mirrors electron/main.js, keyed per
// window so two guests can share one process.

const { app, BrowserWindow, ipcMain, session } = require('electron');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { installAdBlock } = require('../../electron/adblock');
const { cleanState, cleanCommand } = require('../../electron/playerProtocol');

const ROOT = path.join(__dirname, '..', '..');
const SERVER_DIR = path.join(ROOT, 'server-bundle');
const OUT = path.join(__dirname, 'output');
const PORT = 47305;
const ORIGIN = `http://127.0.0.1:${PORT}`;
const SHOW = { id: 1399, name: 'Game of Thrones' };

const t0 = Date.now();
const log = (...a) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
let server = null;
// app.exit() skips Electron's quit events; this always runs.
process.on('exit', () => server?.kill());
const check = (ok, label) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (!ok) failures++;
};

// As in electron/main.js: players shouldn't see an Electron user agent.
app.userAgentFallback = app.userAgentFallback.replace(/\s(?:Electron|lwedflix)\/\S+/gi, '');

// ---- Player relay (as in electron/main.js) ------------------------------

const playerFrames = new Map();
const lastState = new Map();
ipcMain.on('player:state', (event, state) => {
  const frame = event.senderFrame;
  if (!frame || frame === event.sender.mainFrame) return;
  if (state?.event === 'gone') {
    playerFrames.delete(event.sender.id);
    lastState.delete(event.sender.id);
    event.sender.send('player:state', null);
    return;
  }
  const clean = cleanState(state);
  if (!clean) return;
  playerFrames.set(event.sender.id, frame);
  lastState.set(event.sender.id, clean);
  event.sender.send('player:state', clean);
});
ipcMain.on('player:command', (event, raw) => {
  if (event.senderFrame !== event.sender.mainFrame) return;
  const command = cleanCommand(raw);
  // (The mini player needs main.js's user-gesture trick; not tested here.)
  if (command && command.action !== 'pip') playerFrames.get(event.sender.id)?.send('player:command', command);
});

function makeWindow(partition) {
  installAdBlock(session.fromPartition(partition));
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    show: false,
    webPreferences: {
      partition,
      preload: path.join(ROOT, 'electron', 'preload.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegrationInSubFrames: true,
      backgroundThrottling: false,
    },
  });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e) => {
    if (!e.url.startsWith(ORIGIN)) e.preventDefault();
  });
  win.webContents.setAudioMuted(true);
  return win;
}

// ---- Driving the pages ----------------------------------------------------

const js = (win, code) => win.webContents.executeJavaScript(code, true);
const text = (win) => js(win, 'document.body.innerText');
async function waitFor(fn, label, timeout = 30000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    try {
      if (await fn()) return true;
    } catch {
      // Page mid-navigation; try again.
    }
    await sleep(250);
  }
  log('timed out waiting for', label);
  return false;
}
// React-controlled inputs need the native setter plus an input event.
const typeInto = (win, selector, value) =>
  js(win, `(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, ${JSON.stringify(value)});
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return true; })()`);
const clickButton = (win, match) =>
  js(win, `(() => {
    const b = [...document.querySelectorAll('button')].find((b) => ${match});
    if (b) b.click();
    return Boolean(b); })()`);
// Click the middle of every player frame, as a real user gesture.
const pressPlay = (win) =>
  Promise.all(
    win.webContents.mainFrame.framesInSubtree
      .filter((f) => f !== win.webContents.mainFrame)
      .map((f) =>
        f
          .executeJavaScript(
            `(() => { const el = document.elementFromPoint(innerWidth/2, innerHeight/2); if (el) for (const t of ['pointerdown','mousedown','pointerup','mouseup','click']) el.dispatchEvent(new MouseEvent(t, {bubbles:true,cancelable:true,view:window,clientX:innerWidth/2,clientY:innerHeight/2})); })()`,
            true
          )
          .catch(() => {})
      )
  );
// What a person does in their own player's controls: act on the <video>.
const inPlayer = (win, code) =>
  playerFrames
    .get(win.webContents.id)
    .executeJavaScript(`(() => { const v = document.querySelector('video[data-lwedflix-stream]') || document.querySelector('video'); ${code}; return { paused: v.paused, t: v.currentTime, d: v.duration }; })()`, true);
const video = (win) => inPlayer(win, '');
const episodeShown = (win) => js(win, `(document.body.innerText.match(/S(\\d+) · E(\\d+)/) || []).slice(1).join('x')`);
const playerSrc = (win) => js(win, `[...document.querySelectorAll('iframe')].map((f) => f.src).find((s) => s.includes('${SHOW.id}')) || ''`);

async function loadStream(name, win) {
  let lastPress = 0;
  return waitFor(
    async () => {
      if (lastState.get(win.webContents.id)?.duration > 0) return true;
      if (Date.now() - lastPress > 4000) {
        lastPress = Date.now();
        await pressPlay(win);
      }
      return false;
    },
    `${name}'s stream`,
    75000
  );
}

async function joinAsGuest(win, name) {
  await waitFor(() => js(win, `!!document.querySelector('input[placeholder="Your name"]')`), `${name}'s name prompt`);
  await typeInto(win, 'input[placeholder="Your name"]', name);
  await js(win, `document.querySelector('form button[type=submit]').click()`);
}

process.on('unhandledRejection', (e) => {
  console.log(`FAIL  harness error: ${e.message}`);
  failures++;
  app.quit();
});

app.whenReady().then(async () => {
  if (!fs.existsSync(path.join(SERVER_DIR, 'server.js'))) {
    console.error('No staged server. Run `npm run build:server` first.');
    app.exit(1);
    return;
  }
  // Anything already on the port would be tested instead of this build.
  if (await fetch(ORIGIN).then(() => true, () => false)) {
    console.error(`Port ${PORT} is already in use (a harness server left running?).`);
    app.exit(1);
    return;
  }
  fs.mkdirSync(OUT, { recursive: true });
  server = spawn('node', ['server.js'], {
    cwd: SERVER_DIR,
    env: { ...process.env, PORT: String(PORT), HOSTNAME: '127.0.0.1' },
    stdio: 'ignore',
  });
  await waitFor(async () => (await fetch(`${ORIGIN}/icon.png`)).ok, 'server');

  const alice = makeWindow('e2e-alice');
  const bob = makeWindow('e2e-bob');

  // ---- The room --------------------------------------------------------

  await alice.loadURL(`${ORIGIN}/tv/${SHOW.id}`);
  check(await waitFor(() => clickButton(alice, `b.textContent.includes('Watch party')`), 'watch party button'), 'a signed-out guest can start a party from a show');
  await waitFor(() => js(alice, `location.pathname.startsWith('/watch/')`), 'room url');
  const code = (await js(alice, 'location.pathname')).split('/').pop();
  log('party code', code);
  await joinAsGuest(alice, 'Alice');
  check(await waitFor(async () => (await text(alice)).includes(SHOW.name), 'alice room'), 'Alice is in the room');

  await bob.loadURL(`${ORIGIN}/watch/${code}`);
  await joinAsGuest(bob, 'Bob');
  check(await waitFor(async () => (await text(bob)).includes(SHOW.name), 'bob room'), 'Bob joined with only the code and learned the title from the room');
  check(await waitFor(async () => (await text(bob)).includes('2 people'), 'members'), 'the room shows 2 people');
  check((await text(bob)).includes('the host picks episodes'), 'Bob is told the host picks episodes');
  check(await js(alice, `!!document.querySelector('button[aria-label="Next episode"]')`), 'Alice (host) has episode controls');
  check(!(await js(bob, `!!document.querySelector('button[aria-label="Next episode"]')`)), "Bob doesn't");
  check(!(await js(alice, `[...document.querySelectorAll('button')].some((b) => b.textContent.trim() === 'Invite')`)), 'no friends invite for guests');

  await typeInto(alice, 'input[placeholder="Say something…"]', 'popcorn ready?');
  await js(alice, `document.querySelector('input[placeholder="Say something…"]').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))`);
  check(await waitFor(async () => (await text(bob)).includes('popcorn ready?'), 'chat'), "Bob receives Alice's chat");

  await clickButton(alice, `b.getAttribute('aria-label') === 'React 🔥'`);
  const floating = (win) => js(win, `[...document.querySelectorAll('span.text-4xl')].some((s) => s.textContent === '🔥')`);
  check(await waitFor(() => floating(bob), 'reaction', 5000), "Alice's 🔥 floats over Bob's player");
  check(await floating(alice), '...and over her own');

  // ---- Synced playback -------------------------------------------------

  for (const [name, win] of [['Alice', alice], ['Bob', bob]]) {
    const ok = await loadStream(name, win);
    check(ok, `${name}'s stream loaded and reports through the bridge`);
    if (!ok) return finish('the provider never produced a stream');
  }
  log('letting both streams settle…');
  await sleep(8000);

  await inPlayer(alice, 'v.play()');
  await sleep(3000);
  let a = await video(alice);
  let b = await video(bob);
  check(!a.paused && !b.paused && Math.abs(a.t - b.t) < 2, 'Alice plays → Bob plays in step');

  await inPlayer(alice, 'v.currentTime = 900');
  await sleep(3000);
  a = await video(alice);
  b = await video(bob);
  check(Math.abs(a.t - b.t) < 2.5 && b.t > 890, 'Alice seeks to 15:00 → Bob follows');

  await inPlayer(bob, 'v.pause()');
  await sleep(2500);
  a = await video(alice);
  check(a.paused, 'Bob pauses → Alice pauses (everyone controls by default)');
  check((await text(alice)).includes('Bob paused at'), 'Alice sees "Bob paused at …"');
  await inPlayer(alice, 'v.play()');
  await sleep(3000);

  // ---- Host-only lock --------------------------------------------------

  await js(alice, `[...document.querySelectorAll('button[role=switch]')].find((b) => b.textContent.includes('Only I control playback')).click()`);
  check(await waitFor(async () => (await text(bob)).includes('Playback is locked to Alice'), 'lock reaches bob', 15000), 'Alice locks playback → Bob is told');
  await inPlayer(bob, 'v.pause()');
  await sleep(3500);
  a = await video(alice);
  b = await video(bob);
  check(!a.paused, "Bob's pause doesn't reach Alice");
  check(!b.paused && Math.abs(a.t - b.t) < 2.5, 'Bob snaps back to the room');
  check((await text(bob)).includes('Only the host controls playback'), 'Bob is told why');
  await js(alice, `[...document.querySelectorAll('button[role=switch]')].find((b) => b.textContent.includes('Only I control playback')).click()`);
  check(await waitFor(async () => !(await text(bob)).includes('Playback is locked'), 'unlock reaches bob', 15000), 'Alice unlocks → Bob sees it');

  // ---- Up next and episode changes -------------------------------------

  await inPlayer(alice, 'v.currentTime = v.duration - 15');
  check(await waitFor(async () => /up next/i.test(await text(alice)), 'up next', 10000), '"Up next" shows on the host near the end');
  check(!/up next/i.test(await text(bob)), '...and not on Bob, who follows the host');
  await alice.webContents.capturePage().then((img) => fs.writeFileSync(path.join(OUT, 'alice-up-next.png'), img.toPNG()));
  await clickButton(alice, `b.textContent.includes('Play now')`);
  check(await waitFor(async () => (await episodeShown(bob)) === '1x2', 'bob on E2', 10000), 'Play now moves the party to S1 E2');
  check((await playerSrc(bob)).includes('/1/2'), "Bob's player loads S1 E2");
  check(!/ahead|behind/.test(await text(bob)), "drift isn't measured against the previous episode");

  await clickButton(alice, `b.getAttribute('aria-label') === 'Next episode'`);
  check(await waitFor(async () => (await episodeShown(bob)) === '1x3', 'bob on E3', 10000), 'Next episode → S1 E3 for Bob');
  await clickButton(alice, `b.getAttribute('aria-label') === 'Previous episode'`);
  check(await waitFor(async () => (await episodeShown(bob)) === '1x2', 'bob back on E2', 10000), 'Previous episode → back to S1 E2');
  check((await playerSrc(bob)).includes('/1/2'), "Bob's player follows");

  const late = makeWindow('e2e-carol');
  await late.loadURL(`${ORIGIN}/watch/${code}`);
  await joinAsGuest(late, 'Carol');
  check(await waitFor(async () => (await episodeShown(late)) === '1x2', 'carol on E2', 20000), 'someone joining later lands on the current episode');
  await bob.webContents.capturePage().then((img) => fs.writeFileSync(path.join(OUT, 'bob-room.png'), img.toPNG()));

  finish();
});

function finish(reason) {
  if (reason) log(reason);
  log(failures ? `${failures} check(s) failed` : 'all checks passed');
  app.exit(failures || reason ? 1 : 0);
}
