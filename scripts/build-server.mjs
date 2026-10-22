// Builds the Next.js app as a standalone server and stages it in
// server-bundle/, which electron-builder ships as the app's server/ resource
// (electron/main.js runs it).
//
// Standalone output deliberately leaves out public/ and .next/static (it
// expects a CDN to serve them), so both are copied in alongside it.

import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const standaloneDir = join(rootDir, '.next', 'standalone');
const serverDir = join(rootDir, 'server-bundle');

// Server-only variables the app reads at runtime. NEXT_PUBLIC_* ones are
// inlined at build time and need nothing here. This is an allowlist on
// purpose: whatever is written below ships inside the installer, readable
// by anyone who has it, so never add a secret that must stay private.
const RUNTIME_ENV = ['TMDB_ACCESS_TOKEN', 'YOUTUBE_API_KEY'];

const nextBin = join(rootDir, 'node_modules', 'next', 'dist', 'bin', 'next');
if (!existsSync(nextBin)) {
  console.error('Next.js is not installed — run `npm install` first.');
  process.exit(1);
}

// Same resolution Next uses (.env.production.local, .env.local, ...).
const { loadEnvConfig } = createRequire(nextBin)('@next/env');
loadEnvConfig(rootDir, false, { info() {}, error: console.error });
if (!process.env.TMDB_ACCESS_TOKEN) {
  console.error('TMDB_ACCESS_TOKEN is not set (.env.local or the environment) — the app cannot load any titles without it.');
  process.exit(1);
}

const build = spawnSync(process.execPath, [nextBin, 'build'], { cwd: rootDir, stdio: 'inherit' });
if (build.status !== 0) process.exit(build.status ?? 1);

if (!existsSync(join(standaloneDir, 'server.js'))) {
  console.error('next build did not produce .next/standalone/server.js');
  process.exit(1);
}

rmSync(serverDir, { recursive: true, force: true });
cpSync(standaloneDir, serverDir, { recursive: true });
cpSync(join(rootDir, '.next', 'static'), join(serverDir, '.next', 'static'), { recursive: true });
cpSync(join(rootDir, 'public'), join(serverDir, 'public'), { recursive: true });

// sharp is only loaded for image optimization, which next.config turns off.
// Next's own server trace pulls it in regardless (route-level trace excludes
// don't reach it), and its 16MB of binaries match the build machine's
// platform — dead weight on a Mac, the wrong OS in a Windows build.
for (const pkg of ['sharp', '@img']) {
  rmSync(join(serverDir, 'node_modules', pkg), { recursive: true, force: true });
}

// The standalone server doesn't copy .env files, but it does load them from
// its own directory on startup.
const runtimeEnv = RUNTIME_ENV.filter((key) => process.env[key])
  .map((key) => `${key}=${process.env[key]}\n`)
  .join('');
writeFileSync(join(serverDir, '.env.production'), runtimeEnv);

console.log(`\nStaged standalone server in ${serverDir}`);
