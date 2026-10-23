// macOS updates for a build without an Apple Developer ID.
//
// electron-updater only installs on macOS when the new version is signed by
// the same Developer ID as the running one, and ad-hoc builds have none. So
// the app updates itself: the release's zip for this Mac is downloaded
// straight from GitHub — not through a browser, so macOS never marks it as
// downloaded from the internet and doesn't ask "Open Anyway" again — checked
// against the sha512 the release lists, unpacked, and swapped in for the
// running app by a small script once the app has quit.

const { execFile, spawn } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { Readable, Transform } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const { promisify } = require('node:util');

const run = promisify(execFile);

/** This Mac's update zip among the files latest-mac.yml lists. */
function pickZip(files, arch) {
  return (
    (files ?? []).find(
      (file) =>
        typeof file?.url === 'string' &&
        file.url.endsWith('-mac.zip') &&
        file.url.includes('-arm64-') === (arch === 'arm64')
    ) ?? null
  );
}

/** /Applications/Lwedflix.app, from /Applications/Lwedflix.app/Contents/MacOS/Lwedflix. */
function appBundlePath(execPath) {
  const bundle = path.resolve(execPath, '..', '..', '..');
  return bundle.endsWith('.app') ? bundle : null;
}

/** Why the running app can't replace itself, or null if it can. */
function whyNotReplaceable(bundle) {
  if (!bundle) return 'it is not running from an app bundle';
  // macOS runs a quarantined app from a read-only copy until it's moved.
  if (bundle.includes('/AppTranslocation/')) return 'it is running from where it was downloaded';
  if (bundle.startsWith('/Volumes/')) return 'it is running from the disk image';
  try {
    fs.accessSync(path.dirname(bundle), fs.constants.W_OK);
    fs.accessSync(bundle, fs.constants.W_OK);
  } catch {
    return 'it does not have permission to replace itself';
  }
  return null;
}

/** Earlier copies an install moved aside next to `bundle` (.Lwedflix.app.old-123). */
function oldCopies(bundle) {
  if (!bundle) return [];
  const dir = path.dirname(bundle);
  const prefix = `.${path.basename(bundle)}.old-`;
  try {
    return fs.readdirSync(dir).filter((entry) => entry.startsWith(prefix)).map((entry) => path.join(dir, entry));
  } catch {
    return [];
  }
}

/** Streams `url` to `file`, checking it against the release's size and sha512 (base64). */
async function download(fetchImpl, url, file, expected) {
  const res = await fetchImpl(url);
  if (!res.ok || !res.body) throw new Error(`Download failed (HTTP ${res.status})`);
  const hash = crypto.createHash('sha512');
  let size = 0;
  const measure = new Transform({
    transform(chunk, _encoding, done) {
      hash.update(chunk);
      size += chunk.length;
      done(null, chunk);
    },
  });
  await pipeline(Readable.fromWeb(res.body), measure, fs.createWriteStream(file));
  if (expected.size && size !== expected.size) throw new Error(`Download is incomplete (${size} of ${expected.size} bytes)`);
  if (hash.digest('base64') !== expected.sha512) throw new Error('Download is corrupt (checksum mismatch)');
}

/** Unpacks the zip and checks that what's inside is the version expected, intact. */
async function unpack(zip, dir, version) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  // ditto keeps the framework symlinks and signatures an app bundle needs.
  await run('/usr/bin/ditto', ['-x', '-k', zip, dir]);
  const name = fs.readdirSync(dir).find((entry) => entry.endsWith('.app'));
  if (!name) throw new Error('The update has no app in it');
  const app = path.join(dir, name);
  const plist = path.join(app, 'Contents', 'Info.plist');
  const { stdout } = await run('/usr/bin/plutil', ['-extract', 'CFBundleShortVersionString', 'raw', '-o', '-', plist]);
  if (stdout.trim() !== version) throw new Error(`The update is version ${stdout.trim()}, not ${version}`);
  await run('/usr/bin/codesign', ['--verify', '--deep', '--strict', app]);
  // Our own download is never quarantined, but a quarantined copy would
  // bring the warning back, so make sure.
  await run('/usr/bin/xattr', ['-dr', 'com.apple.quarantine', app]).catch(() => {});
  return app;
}

// Waits for the app to quit, moves the new copy into place (keeping the old
// one until the new one is there, and putting it back if the move fails),
// writes how it went to `result` for the next launch, and optionally opens
// the app again. Paths arrive as arguments, never spliced into the script.
const INSTALL_SCRIPT = `
pid="$1"; current="$2"; next="$3"; relaunch="$4"; result="$5"; shift 5
# Would make the reopened app start as plain Node and exit.
unset ELECTRON_RUN_AS_NODE
waited=0
while kill -0 "$pid" 2>/dev/null; do
  sleep 0.2
  waited=$((waited + 1))
  if [ "$waited" -gt 300 ]; then echo "failed: Lwedflix did not quit" > "$result"; exit 1; fi
done
# Hidden, next to the app. A copy macOS approved through "Open Anyway" is
# locked against changes: it can be renamed but not always deleted, and then
# the next launch tries again (see oldCopies).
backup="$(dirname "$current")/.$(basename "$current").old-$$"
if mv "$current" "$backup" 2> "$result.err"; then
  if mv "$next" "$current" 2>> "$result.err"; then
    rm -rf "$backup" 2>/dev/null
    echo ok > "$result"
  else
    mv "$backup" "$current"
    { echo "failed:"; cat "$result.err"; } > "$result"
  fi
else
  { echo "failed:"; cat "$result.err"; } > "$result"
fi
rm -f "$result.err"
if [ "$relaunch" = 1 ]; then open -n "$current" --args "$@"; fi
`;

/** @param {{ pid: number, current: string, next: string, result: string, relaunch: boolean, args?: string[] }} options */
function startInstall({ pid, current, next, result, relaunch, args = [] }) {
  const child = spawn(
    '/bin/sh',
    ['-c', INSTALL_SCRIPT, 'lwedflix-update', String(pid), current, next, relaunch ? '1' : '0', result, ...args],
    { detached: true, stdio: 'ignore' }
  );
  child.unref();
  return child;
}

/**
 * fetch: Electron's net.fetch. workDir: where downloads are unpacked (on the
 * same disk as the app, so the swap is a rename). releasesUrl: the GitHub
 * releases page the feed points at.
 */
function createMacUpdater({ fetch, log, workDir, releasesUrl, execPath = process.execPath, arch = process.arch, args = [] }) {
  const bundle = appBundlePath(execPath);
  const blocked = whyNotReplaceable(bundle);
  const resultFile = path.join(workDir, 'result.txt');
  const unpackDir = path.join(workDir, 'unpacked');
  let preparing = null;
  let ready = null;
  let installing = false;

  // Leftovers from an earlier session: a download cut short, the empty
  // folder a finished install moved the app out of, and old copies the swap
  // couldn't delete.
  for (const entry of fs.existsSync(workDir) ? fs.readdirSync(workDir) : []) {
    if (entry !== 'result.txt') fs.rmSync(path.join(workDir, entry), { recursive: true, force: true });
  }
  for (const old of oldCopies(bundle)) {
    try {
      fs.rmSync(old, { recursive: true, force: true });
    } catch {
      // Still locked; it's hidden, and tried again next launch.
    }
  }

  return {
    /** Why this copy can't update itself (null when it can). */
    blocked,

    /** How the last install went ('ok' or 'failed: …'), once; null if there wasn't one. */
    takeLastResult() {
      try {
        const result = fs.readFileSync(resultFile, 'utf8').trim();
        fs.rmSync(resultFile, { force: true });
        return result;
      } catch {
        return null;
      }
    },

    /** Downloads and unpacks the update; resolves with its version once it's ready to install. */
    prepare(info) {
      if (ready?.version === info.version) return Promise.resolve(info.version);
      if (preparing) return preparing;
      preparing = (async () => {
        const file = pickZip(info.files, arch);
        if (!file) throw new Error('The release has no update for this Mac');
        fs.mkdirSync(workDir, { recursive: true });
        const name = path.basename(file.url);
        const zip = path.join(workDir, name);
        log(`Downloading ${name}`);
        await download(fetch, `${releasesUrl}/download/v${info.version}/${encodeURIComponent(name)}`, zip, file);
        const app = await unpack(zip, unpackDir, info.version);
        fs.rmSync(zip, { force: true });
        ready = { version: info.version, app };
        log(`Ready to install ${info.version}`);
        return info.version;
      })().finally(() => {
        preparing = null;
      });
      return preparing;
    },

    get readyVersion() {
      return ready?.version ?? null;
    },

    /** Swaps the update in once the app quits. Call once; the caller quits the app. */
    install(relaunch) {
      if (!ready || installing || blocked) return false;
      installing = true;
      log(`Installing ${ready.version} when Lwedflix quits${relaunch ? ', then reopening it' : ''}`);
      startInstall({ pid: process.pid, current: bundle, next: ready.app, result: resultFile, relaunch, args });
      return true;
    },
  };
}

module.exports = { pickZip, appBundlePath, whyNotReplaceable, oldCopies, download, startInstall, createMacUpdater };
