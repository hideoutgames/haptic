/**
 * Sky fill for viewports wider than the photo can cover. The photo scales with
 * --u like the rest of the hero, so above 1600px it stops growing and the space
 * left and right of it is filled with a matching dark gradient and a procedural
 * starfield. Everything is generated at build time (no image assets, no JS).
 * Sizes are in photo pixels at 1280px wide (the mockup scale).
 */
export const SKY_HEIGHT = 848;

/**
 * Colour of the photo's outer columns as [y, r, g, b], after the CSS filter on
 * the image. Left: sky down to the foothills at y ≈ 600. Right: the mountain
 * skyline at y ≈ 350. Both are softened into a gradual fall-off, since the
 * fill has no silhouette to continue.
 */
const EDGE_LEFT = [
  [0, 7, 4, 0], [156, 8, 5, 1], [254, 7, 7, 7], [324, 3, 9, 14], [411, 0, 15, 29],
  [514, 1, 24, 48], [566, 3, 29, 53], [610, 4, 26, 48], [650, 4, 16, 24],
  [700, 7, 6, 3], [740, 7, 5, 0], [847, 8, 5, 0],
] as const;

const EDGE_RIGHT = [
  [0, 7, 4, 0], [78, 7, 6, 3], [166, 6, 8, 9], [209, 3, 9, 14], [334, 1, 17, 30],
  [380, 2, 14, 24], [430, 4, 9, 10], [480, 7, 5, 1], [520, 7, 5, 0], [847, 7, 5, 0],
] as const;

function edgeGradient(stops: readonly (readonly [number, number, number, number])[]): string {
  const list = stops.map(([y, r, g, b]) => `rgb(${r} ${g} ${b}) ${((y / SKY_HEIGHT) * 100).toFixed(1)}%`);
  return `linear-gradient(to bottom, ${list.join(', ')})`;
}

/** Vertical gradients that continue the photo's left and right edge outwards. */
export const skyEdges = { left: edgeGradient(EDGE_LEFT), right: edgeGradient(EDGE_RIGHT) };

/* ---- Starfield ------------------------------------------------------------ */

const TILE_WIDTH = 900;
/** Stars stop here; the horizon mask in Hero.astro hides everything below. */
const STAR_REACH = 640;

interface StarClass {
  /** Stars per 10 000 px² at the top, plus the extra per px of depth (the photo gets denser toward the horizon). */
  density: number;
  slope: number;
  /** Dot diameter and opacity range. */
  size: number;
  alpha: readonly [number, number];
}

// Fitted to the photo's stars: one class per brightness band, a few brilliant ones on top.
const CLASSES: readonly StarClass[] = [
  { density: 1.8, slope: 0.005, size: 1, alpha: [0.15, 0.26] },
  { density: 1.5, slope: 0.0065, size: 1.1, alpha: [0.26, 0.38] },
  { density: 2.6, slope: 0.0015, size: 1.2, alpha: [0.38, 0.52] },
  { density: 0.9, slope: 0.0045, size: 1.3, alpha: [0.52, 0.7] },
  { density: 0.35, slope: 0.004, size: 1.45, alpha: [0.8, 1] },
  { density: 0.06, slope: 0.0003, size: 2, alpha: [0.9, 1] },
];

/** Cool white, white, a few warm; the photo's stars lean blue. */
const TINTS = [
  { color: 'rgb(214,228,255)', weight: 0.5 },
  { color: 'rgb(255,255,255)', weight: 0.35 },
  { color: 'rgb(255,232,204)', weight: 0.15 },
] as const;

const ALPHA_STEPS = 4;

/** Small seeded PRNG so the field is identical on every build. */
function mulberry32(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickTint(r: number): string {
  let acc = 0;
  for (const tint of TINTS) {
    acc += tint.weight;
    if (r < acc) return tint.color;
  }
  return TINTS[0].color;
}

/**
 * Seamlessly repeating (horizontally) star tile as an SVG data URL. Each star
 * is a short round-capped stroke, slightly stretched sideways like the photo's,
 * and strokes of the same class, tint and opacity share one <path>.
 */
export function starTile(): string {
  const rand = mulberry32(0x4a3b21);
  const groups = new Map<string, { attrs: string; d: string[] }>();

  for (const cls of CLASSES) {
    // Stars at depth y have density a + b·y: sample y from the inverse CDF.
    const total = cls.density * STAR_REACH + (cls.slope * STAR_REACH ** 2) / 2;
    const count = Math.round((total * TILE_WIDTH) / 10_000);
    for (let i = 0; i < count; i++) {
      const f = rand() * total;
      const y = cls.slope > 0
        ? (-cls.density + Math.sqrt(cls.density ** 2 + 2 * cls.slope * f)) / cls.slope
        : f / cls.density;
      const x = 2 + rand() * (TILE_WIDTH - 4);
      const step = Math.floor(rand() * ALPHA_STEPS);
      const alpha = cls.alpha[0] + ((step + 0.5) / ALPHA_STEPS) * (cls.alpha[1] - cls.alpha[0]);
      const tint = pickTint(rand());
      const key = `${cls.size}|${tint}|${alpha.toFixed(2)}`;
      const attrs = `stroke="${tint}" stroke-width="${cls.size}" stroke-opacity="${alpha.toFixed(2)}"`;
      const stretch = (0.05 + rand() * 0.5 * cls.size).toFixed(2);
      const group = groups.get(key) ?? { attrs, d: [] };
      group.d.push(`M${x.toFixed(1)} ${(y + 2).toFixed(1)}h${stretch}`);
      groups.set(key, group);
    }
  }

  const paths = [...groups.values()]
    .map(({ attrs, d }) => `<path ${attrs} d="${d.join('')}"/>`)
    .join('');
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${TILE_WIDTH} ${SKY_HEIGHT}" ` +
    `fill="none" stroke-linecap="round">${paths}</svg>`;
  return `url("data:image/svg+xml,${svg.replace(/[<>#%"]/g, encodeURIComponent)}")`;
}
