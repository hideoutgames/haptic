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
  { dx: 365, cy: 534, rx: 222, ry: 282, a: 0.97, color: '#933dda' }, // violet flanks
  { dx: 0, cy: 566, rx: 653, ry: 188, a: 1, color: '#ff0082' }, // magenta floor
  { dx: 0, cy: 475, rx: 531, ry: 337, a: 0.98, color: '#962e71' }, // plum body
  { dx: 254, cy: 396, rx: 233, ry: 206, a: 0.8, color: '#ff4d38' }, // coral shoulders
  { dx: 0, cy: 369, rx: 459, ry: 235, a: 1, color: '#d73433' }, // red core
  { dx: 0, cy: 285, rx: 540, ry: 239, a: 0.79, color: '#ff7a05' }, // orange band
  { dx: 297, cy: 289, rx: 201, ry: 163, a: 0.57, color: '#ff890c' }, // orange shoulders
  { dx: 0, cy: 225, rx: 469, ry: 71, a: 0.65, color: '#cc9329' }, // sandy rim
  { dx: 0, cy: 179, rx: 400, ry: 89, a: 0.68, color: '#a19558' }, // sandy cap
  { dx: 0, cy: 132, rx: 354, ry: 114, a: 0.48, color: '#005fa6' }, // blue crown
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
