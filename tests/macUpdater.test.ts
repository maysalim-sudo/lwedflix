// The parts of the macOS self-updater that don't need macOS: choosing the
// download, checking it, deciding whether a copy can replace itself, and the
// swap script (with a stand-in for `open`). Unpacking uses macOS tools and
// is covered by updating a real installed copy by hand (see README).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pickZip, appBundlePath, whyNotReplaceable, oldCopies, download, startInstall } from '../electron/macUpdater.js';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'lwedflix-update-'));

// Paths and the swap script are macOS's (POSIX); CI also runs these tests
// on Windows, where there's no /bin/sh.
const posixOnly = { skip: process.platform === 'win32' && 'macOS paths and shell' };

// What latest-mac.yml lists for a release.
const FILES = [
  { url: 'Lwedflix-1.2.0-mac.zip', sha512: 'x64', size: 1 },
  { url: 'Lwedflix-1.2.0-arm64-mac.zip', sha512: 'arm', size: 1 },
  { url: 'Lwedflix-1.2.0.dmg', sha512: 'dmg', size: 1 },
  { url: 'Lwedflix-1.2.0-arm64.dmg', sha512: 'armdmg', size: 1 },
];

test("picks this Mac's zip", () => {
  assert.equal(pickZip(FILES, 'arm64')?.sha512, 'arm');
  assert.equal(pickZip(FILES, 'x64')?.sha512, 'x64');
  assert.equal(pickZip(FILES.filter((f) => f.url.endsWith('.dmg')), 'arm64'), null);
  assert.equal(pickZip(undefined, 'arm64'), null);
});

test('finds the app bundle from the executable', posixOnly, () => {
  assert.equal(appBundlePath('/Applications/Lwedflix.app/Contents/MacOS/Lwedflix'), '/Applications/Lwedflix.app');
  assert.equal(appBundlePath('/usr/local/bin/electron'), null);
});

test('only a copy it can write to replaces itself', posixOnly, () => {
  const dir = tmp();
  const bundle = path.join(dir, 'Lwedflix.app');
  fs.mkdirSync(bundle);
  assert.equal(whyNotReplaceable(bundle), null);
  assert.match(whyNotReplaceable('/private/var/folders/x/AppTranslocation/ABC/d/Lwedflix.app') ?? '', /downloaded/);
  assert.match(whyNotReplaceable('/Volumes/Lwedflix 1.2.0/Lwedflix.app') ?? '', /disk image/);
  assert.match(whyNotReplaceable(path.join(dir, 'Missing.app')) ?? '', /permission/);
  assert.match(whyNotReplaceable(null) ?? '', /bundle/);
});

test('finds old copies an install left behind', posixOnly, () => {
  const dir = tmp();
  for (const name of ['Lwedflix.app', '.Lwedflix.app.old-12', '.Lwedflix.app.old-345', 'Other.app', '.Other.app.old-1']) {
    fs.mkdirSync(path.join(dir, name));
  }
  assert.deepEqual(
    oldCopies(path.join(dir, 'Lwedflix.app')).map((p: string) => path.basename(p)).sort(),
    ['.Lwedflix.app.old-12', '.Lwedflix.app.old-345']
  );
  assert.deepEqual(oldCopies(null), []);
});

test('downloads are checked against the release', async () => {
  const body = crypto.randomBytes(200_000);
  const sha512 = crypto.createHash('sha512').update(body).digest('base64');
  const fetch = async () => new Response(body);
  const file = path.join(tmp(), 'update.zip');

  await download(fetch, 'https://example/update.zip', file, { sha512, size: body.length });
  assert.deepEqual(fs.readFileSync(file), body);

  await assert.rejects(download(fetch, 'u', file, { sha512: 'wrong', size: body.length }), /checksum/);
  await assert.rejects(download(fetch, 'u', file, { sha512, size: body.length + 1 }), /incomplete/);
  await assert.rejects(download(async () => new Response('', { status: 404 }), 'u', file, { sha512, size: 1 }), /HTTP 404/);
});

/** A process to stand in for the running app: the script waits for it to exit. */
function fakeApp() {
  const child = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 500)']);
  return child.pid!;
}

async function waitFor(file: string) {
  for (let i = 0; i < 100; i++) {
    if (fs.existsSync(file) && fs.readFileSync(file, 'utf8').trim()) return fs.readFileSync(file, 'utf8').trim();
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`${file} never appeared`);
}

test('the swap waits for the app to quit, replaces it, and reopens it', posixOnly, async () => {
  const dir = tmp();
  const current = path.join(dir, 'Lwedflix.app');
  const next = path.join(dir, 'staged', 'Lwedflix.app');
  fs.mkdirSync(current, { recursive: true });
  fs.writeFileSync(path.join(current, 'version'), '1.1.0');
  fs.mkdirSync(next, { recursive: true });
  fs.writeFileSync(path.join(next, 'version'), '1.2.0');

  // `open` is looked up on PATH; this one records how it was called. (Not
  // with echo: Linux's takes the leading -n as its own option.)
  const bin = path.join(dir, 'bin');
  fs.mkdirSync(bin);
  fs.writeFileSync(path.join(bin, 'open'), `#!/bin/sh\nprintf '%s\\n' "$*" > "${path.join(dir, 'opened')}"\n`, { mode: 0o755 });
  const savedPath = process.env.PATH;
  process.env.PATH = `${bin}:${savedPath}`;
  try {
    const result = path.join(dir, 'result.txt');
    startInstall({ pid: fakeApp(), current, next, result, relaunch: true, args: ['--user-data-dir=/x'] });
    assert.equal(await waitFor(result), 'ok');
    assert.equal(fs.readFileSync(path.join(current, 'version'), 'utf8'), '1.2.0');
    assert.equal(fs.existsSync(next), false);
    assert.deepEqual(fs.readdirSync(dir).filter((f) => f.includes('.old-')), [], 'the old copy is cleaned up');
    assert.equal(await waitFor(path.join(dir, 'opened')), `-n ${current} --args --user-data-dir=/x`);
  } finally {
    process.env.PATH = savedPath;
  }
});

test('a failed swap leaves the installed app as it was', posixOnly, async () => {
  const dir = tmp();
  const current = path.join(dir, 'Lwedflix.app');
  fs.mkdirSync(current);
  fs.writeFileSync(path.join(current, 'version'), '1.1.0');
  const result = path.join(dir, 'result.txt');

  startInstall({ pid: fakeApp(), current, next: path.join(dir, 'nothing-here.app'), result, relaunch: false });
  assert.match(await waitFor(result), /^failed:/);
  assert.equal(fs.readFileSync(path.join(current, 'version'), 'utf8'), '1.1.0');
  assert.deepEqual(fs.readdirSync(dir).filter((f) => f.includes('.old-')), []);
});
