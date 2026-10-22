import React, { useId } from 'react';

// The wordmark from the launch intro (electron/intro/intro.html), drawn as
// paths on a 100-unit cap height so it needs no font. Keep the two in step.
const GLYPHS = [
  { x: 0, w: 46, d: 'M0 0H18V84H46V100H0Z' },
  { x: 43, w: 84, d: 'M0 0H16L25 62L34 0H50L59 62L68 0H84L69 100H53L42 38L31 100H15Z' },
  { x: 131, w: 44, d: 'M0 0H44V16H18V42H40V58H18V84H44V100H0Z' },
  { x: 182, w: 50, d: 'M0 0H26C41 0 50 10 50 26V74C50 90 41 100 26 100H0ZM18 16V84H25C30 84 32 81 32 74V26C32 19 30 16 25 16Z' },
  { x: 239, w: 42, d: 'M0 0H42V16H18V43H38V59H18V100H0Z' },
  { x: 288, w: 46, d: 'M0 0H18V84H46V100H0Z' },
  { x: 339, w: 18, d: 'M0 0H18V100H0Z' },
  { x: 364, w: 54, d: 'M0 0H19L27 33L35 0H54L38 50L54 100H35L27 67L19 100H0L16 50Z' },
];

/** The LWEDFLIX wordmark. Size it with a height class; the width follows. */
const LwedflixLogo = ({ className = '' }: { className?: string }) => {
  const gradient = `lwedflix-fill-${useId().replace(/:/g, '')}`;
  return (
    <svg viewBox="0 0 418 100" className={className} role="img" aria-label="Lwedflix">
      <defs>
        <linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffc24d" />
          <stop offset="0.45" stopColor="#ff9900" />
          <stop offset="1" stopColor="#ff6200" />
        </linearGradient>
      </defs>
      {GLYPHS.map((g) => (
        <path key={g.x} d={g.d} transform={`translate(${g.x} 0)`} fill={`url(#${gradient})`} fillRule="evenodd" />
      ))}
    </svg>
  );
};

export default LwedflixLogo;
