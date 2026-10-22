// Renders build/icon.png (1024×1024), which electron-builder turns into the
// macOS .icns, Windows .ico and Linux icons. Re-run after changing the
// artwork:
//   npm run icon
//
// The monogram is the L from the intro's wordmark (electron/intro/intro.html),
// drawn as a folded ribbon: the foot tucks under the stem, so it starts in
// shadow.

import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..');
// sharp is installed alongside Next.js (one of its optional dependencies).
const sharp = createRequire(join(rootDir, 'package.json'))('sharp');

// L glyph: 100-unit cap height, stem 18 wide, foot reaching x=46.
const K = 5.4;
const X = 400;
const Y = 512 - 50 * K;
const u = (n) => n * K;

const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <defs>
    <linearGradient id="tile" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#1d1b19"/>
      <stop offset="1" stop-color="#060606"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.5" cy="0.55" r="0.5">
      <stop offset="0" stop-color="#ff8a00" stop-opacity="0.42"/>
      <stop offset="0.6" stop-color="#ff5a00" stop-opacity="0.08"/>
      <stop offset="1" stop-color="#ff5a00" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="stem" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffc24d"/>
      <stop offset="0.45" stop-color="#ff9900"/>
      <stop offset="1" stop-color="#ff6a00"/>
    </linearGradient>
    <linearGradient id="foot" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#9c3300"/>
      <stop offset="0.35" stop-color="#e86400"/>
      <stop offset="1" stop-color="#ffa733"/>
    </linearGradient>
    <linearGradient id="stemShine" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#fff" stop-opacity="0"/>
      <stop offset="0.55" stop-color="#fff" stop-opacity="0.22"/>
      <stop offset="1" stop-color="#fff" stop-opacity="0"/>
    </linearGradient>
    <filter id="soft" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="18"/>
    </filter>
    <clipPath id="tileClip">
      <rect x="100" y="100" width="824" height="824" rx="184"/>
    </clipPath>
  </defs>

  <rect x="100" y="100" width="824" height="824" rx="184" fill="url(#tile)"/>
  <g clip-path="url(#tileClip)">
    <ellipse cx="512" cy="540" rx="400" ry="360" fill="url(#glow)"/>

    <!-- glow under the monogram -->
    <g filter="url(#soft)" opacity="0.55">
      <rect x="${X}" y="${Y}" width="${u(18)}" height="${u(100)}" fill="#ff7a00"/>
      <rect x="${X + u(18)}" y="${Y + u(84)}" width="${u(28)}" height="${u(16)}" fill="#ff7a00"/>
    </g>

    <!-- foot first, so the stem sits over its shadowed end -->
    <rect x="${X + u(12)}" y="${Y + u(84)}" width="${u(34)}" height="${u(16)}" fill="url(#foot)"/>
    <rect x="${X}" y="${Y}" width="${u(18)}" height="${u(100)}" fill="url(#stem)"/>
    <rect x="${X}" y="${Y}" width="${u(18)}" height="${u(100)}" fill="url(#stemShine)"/>
  </g>
  <rect x="101" y="101" width="822" height="822" rx="183" fill="none" stroke="#fff" stroke-opacity="0.07" stroke-width="2"/>
</svg>`;

const out = join(rootDir, 'build', 'icon.png');
await sharp(Buffer.from(svg)).png().toFile(out);
console.log(`Wrote ${out}`);
