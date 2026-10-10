/**
 * Sky fill for viewports wider than the photo can cover. The photo scales with
 * --u like the rest of the hero, so above 1600px it stops growing and the space
 * left and right of it is filled with a matching dark gradient and a procedural
 * starfield. Everything is generated at build time (no image assets, no JS).
 * Sizes are in photo pixels at 1280px wide (the mockup scale).
 */
export const SKY_HEIGHT = 848;

type Stop = readonly [y: number, r: number, g: number, b: number];

/**
 * Colour of the photo's outer columns as [y, r, g, b], after the CSS filter on
 * the image. Left: sky down to the foothills at y ≈ 600. Right: the mountain
 * skyline at y ≈ 350. The fill has no silhouette to continue, so both are
 * smoothed (see `smooth`) into a gradual fall-off toward the horizon.
 */
const EDGE_LEFT: readonly Stop[] = [
  [0, 7, 4, 0], [156, 8, 5, 1], [254, 7, 7, 7], [324, 3, 9, 14], [411, 0, 15, 29],
  [514, 1, 24, 48], [566, 3, 29, 53], [610, 4, 26, 48], [650, 4, 16, 24],
  [700, 7, 6, 3], [740, 7, 5, 0], [847, 8, 5, 0],
];

const EDGE_RIGHT: readonly Stop[] = [
  [0, 7, 4, 0], [78, 7, 6, 3], [166, 6, 8, 9], [209, 3, 9, 14], [334, 1, 17, 30],
  [380, 2, 14, 24], [430, 4, 9, 10], [480, 7, 5, 1], [520, 7, 5, 0], [847, 7, 5, 0],
];

/**
 * What the sky settles into far from the photo: the dark warm black of its top
 * and bottom, with none of the horizon glow (that is blended in by distance, see
 * the .sky-half rules in Hero.astro).
 */
const EDGE_FAR: readonly Stop[] = [[0, 7, 4, 0], [156, 8, 5, 1], [847, 7, 5, 0]];

/** Colour at depth `y`, linear between the stops. */
function colorAt(stops: readonly Stop[], y: number): [number, number, number] {
  if (y <= stops[0][0]) return [stops[0][1], stops[0][2], stops[0][3]];
  for (let i = 1; i < stops.length; i++) {
    const [y1, r1, g1, b1] = stops[i];
    if (y <= y1) {
      const [y0, r0, g0, b0] = stops[i - 1];
      const t = (y - y0) / (y1 - y0);
      return [r0 + (r1 - r0) * t, g0 + (g1 - g0) * t, b0 + (b1 - b0) * t];
    }
  }
  const last = stops[stops.length - 1];
  return [last[1], last[2], last[3]];
}

/** Gaussian blur of the vertical colour profile (σ in photo px), resampled to a stop every `step`. */
function smooth(stops: readonly Stop[], sigma: number, step = 24): Stop[] {
  const out: Stop[] = [];
  const radius = Math.ceil(sigma * 3);
  for (let y = 0; y <= SKY_HEIGHT - 1 + step / 2; y += step) {
    const yy = Math.min(y, SKY_HEIGHT - 1);
    let r = 0;
    let g = 0;
    let b = 0;
    let weight = 0;
    for (let d = -radius; d <= radius; d += 4) {
      const w = Math.exp(-(d * d) / (2 * sigma * sigma));
      const c = colorAt(stops, Math.min(SKY_HEIGHT - 1, Math.max(0, yy + d)));
      r += c[0] * w;
      g += c[1] * w;
      b += c[2] * w;
      weight += w;
    }
    out.push([yy, Math.round(r / weight), Math.round(g / weight), Math.round(b / weight)]);
  }
  return out;
}

function edgeGradient(stops: readonly Stop[]): string {
  const list = stops.map(([y, r, g, b]) => `rgb(${r} ${g} ${b}) ${((y / SKY_HEIGHT) * 100).toFixed(1)}%`);
  return `linear-gradient(to bottom, ${list.join(', ')})`;
}

/**
 * Vertical gradients that continue the photo's left and right edge outwards, and
 * the plain dark sky they fade into with distance from the photo.
 */
export const skyEdges = {
  left: edgeGradient(smooth(EDGE_LEFT, 26)),
  right: edgeGradient(smooth(EDGE_RIGHT, 26)),
  far: edgeGradient(EDGE_FAR),
};

/* ---- Starfield ------------------------------------------------------------ */

const TILE_WIDTH = 900;
/** Stars stop here; the horizon masks in Hero.astro fade them out before. */
const STAR_REACH = 720;

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

/** Shortest decimal form: `.3`, `12`, `418.4`. */
const num = (v: number, digits = 1): string => String(+v.toFixed(digits)).replace(/^0\./, '.');

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
      const key = `${cls.size}|${tint}|${num(alpha, 2)}`;
      const attrs = `stroke="${tint}" stroke-width="${cls.size}" stroke-opacity="${num(alpha, 2)}"`;
      const stretch = 0.05 + rand() * 0.5 * cls.size;
      const group = groups.get(key) ?? { attrs, d: [] };
      group.d.push(`M${num(x)} ${num(y + 2)}h${num(stretch, 2)}`);
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
