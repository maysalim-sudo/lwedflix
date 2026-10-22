// Builds every installer and publishes them as GitHub release v<version>.
//
//   GH_TOKEN=<token> npm run release
//
// electron-builder uploads several artifacts at once, and when the release
// doesn't exist yet each upload creates one — leaving duplicate releases
// for the same tag. So the release is created here first, as a draft: every
// upload finds it, and nobody sees a half-uploaded release. It's published
// only once everything is up.

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(join(rootDir, 'package.json'), 'utf8'));
const { owner, repo } = pkg.build.publish[0];
const tag = `v${pkg.version}`;
const api = `https://api.github.com/repos/${owner}/${repo}`;

const token = process.env.GH_TOKEN;
if (!token) {
  console.error('Set GH_TOKEN to a GitHub token with write access to this repo first.');
  process.exit(1);
}
const headers = {
  Authorization: `Bearer ${token}`,
  Accept: 'application/vnd.github+json',
  'User-Agent': 'lwedflix-release',
};

async function github(path, options = {}) {
  const res = await fetch(`${api}${path}`, { ...options, headers: { ...headers, ...options.headers } });
  if (!res.ok) throw new Error(`GitHub ${options.method ?? 'GET'} ${path}: ${res.status} ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}

const run = (args) => {
  const result = spawnSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', args, {
    cwd: rootDir,
    stdio: 'inherit',
    env: process.env,
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
};

const alreadyPublished = () => {
  console.error(`${tag} is already published. Bump "version" in package.json for a new release.`);
  process.exit(1);
};
// The tag endpoint only ever returns a published release, so it's the
// authoritative check; the list (which includes drafts) can lag behind it.
const byTag = await fetch(`${api}/releases/tags/${tag}`, { headers });
if (byTag.ok) alreadyPublished();
const existing = (await github('/releases?per_page=100')).filter((r) => r.tag_name === tag);
if (existing.some((r) => !r.draft)) alreadyPublished();
const release =
  existing[0] ??
  (await github('/releases', {
    method: 'POST',
    body: JSON.stringify({ tag_name: tag, name: pkg.version, draft: true }),
  }));
console.log(`\nDraft ${tag} ready — building and uploading into it.\n`);

run(['node', 'scripts/build-server.mjs']);
run(['electron-builder', '--mac', '--win', '--linux', '--publish', 'always']);

// electron-builder skips (rather than fails) uploads it can't make, so
// confirm the files actually landed before making anything public.
const draft = await github(`/releases/${release.id}`);
if (!draft.draft || draft.assets.length === 0) {
  console.error(`Not publishing: the ${tag} draft has ${draft.assets.length} files (draft: ${draft.draft}). Check the build output above.`);
  process.exit(1);
}

const published = await github(`/releases/${release.id}`, {
  method: 'PATCH',
  body: JSON.stringify({ draft: false, make_latest: 'true' }),
});
console.log(`\nPublished ${tag} with ${published.assets.length} files: ${published.html_url}`);
