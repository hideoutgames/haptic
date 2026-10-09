/**
 * The hero "aurora": a stack of soft elliptical radial gradients composited
 * over the night sky. Values were fitted to the mockup, so they are written
 * in mockup pixels (a 1280 × 960 canvas) and converted to percentages, which
 * lets the whole glow scale with whatever box it is painted into.
 *
 * Layers are listed bottom to top. `dx` > 0 draws a mirrored pair at
 * 640 ± dx, otherwise the blob sits on the centre line.
 */
export const GLOW_WIDTH = 1280;
export const GLOW_HEIGHT = 960;

interface Blob {
  dx: number;
  cy: number;
  rx: number;
  ry: number;
  /** Peak opacity at the blob centre. */
  a: number;
  color: string;
}

const BLOBS: Blob[] = [
  { dx: 366, cy: 526, rx: 222, ry: 267, a: 0.95, color: '#933dda' }, // violet flanks
  { dx: 0, cy: 572, rx: 657, ry: 192, a: 1, color: '#ff008c' }, // magenta floor
  { dx: 0, cy: 519, rx: 544, ry: 400, a: 0.97, color: '#9e2a6a' }, // plum body
  { dx: 252, cy: 394, rx: 235, ry: 207, a: 0.84, color: '#ff4d38' }, // coral shoulders
  { dx: 0, cy: 402, rx: 471, ry: 172, a: 1, color: '#d23a37' }, // red core
  { dx: 0, cy: 279, rx: 547, ry: 224, a: 0.71, color: '#ff8e0c' }, // orange band
  { dx: 303, cy: 289, rx: 194, ry: 171, a: 0.59, color: '#ff860f' }, // orange shoulders
  { dx: 0, cy: 210, rx: 406, ry: 44, a: 1, color: '#c2842c' }, // sandy rim
  { dx: 0, cy: 176, rx: 369, ry: 83, a: 1, color: '#9b844f' }, // sandy cap
  { dx: 0, cy: 130, rx: 351, ry: 101, a: 0.76, color: '#12486f' }, // teal crown
];

/** Gaussian-like falloff that reaches exactly 0 at the blob radius. */
const falloff = (d: number): number => {
  const k = 3.2;
  return (Math.exp(-k * d * d) - Math.exp(-k)) / (1 - Math.exp(-k));
};

const STEPS = 8;

function rgb(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
}

function gradient(cx: number, blob: Blob): string {
  const { cy, rx, ry, a, color } = blob;
  const stops = Array.from({ length: STEPS + 1 }, (_, i) => {
    const alpha = (a * falloff(i / STEPS)).toFixed(3);
    return `rgb(${rgb(color)} / ${alpha}) ${(i / STEPS) * 100}%`;
  });
  const pct = (v: number, of: number) => `${((v / of) * 100).toFixed(2)}%`;
  return `radial-gradient(ellipse ${pct(rx, GLOW_WIDTH)} ${pct(ry, GLOW_HEIGHT)} at ${pct(cx, GLOW_WIDTH)} ${pct(cy, GLOW_HEIGHT)}, ${stops.join(', ')})`;
}

/** CSS `background-image` value for the glow (topmost layer first). */
export function glowBackground(): string {
  const layers: string[] = [];
  for (const blob of BLOBS) {
    const cx = GLOW_WIDTH / 2;
    if (blob.dx === 0) layers.push(gradient(cx, blob));
    else layers.push(gradient(cx - blob.dx, blob), gradient(cx + blob.dx, blob));
  }
  return layers.reverse().join(',\n');
}
