/**
 * Device-frame geometry, measured on the frame PNGs (source pixels).
 * `screen` is the transparent hole the editor screenshot shows through;
 * `radius` is [top, bottom] corner radius of that hole (a little under the
 * true value on purpose: the opaque bezel hides the difference, whereas a
 * larger radius would let the background peek through at the corners).
 * `bodies` are the silhouette rectangles that carry the soft drop shadow.
 */
export interface FrameGeometry {
  width: number;
  height: number;
  screen: { x: number; y: number; w: number; h: number };
  radius: [top: number, bottom: number];
  bodies: Array<{ x: number; y: number; w: number; h: number; r: number }>;
}

export const FRAMES = {
  mac: {
    width: 4256,
    height: 2834,
    screen: { x: 400, y: 300, w: 3456, h: 2234 },
    radius: [36, 0],
    // Lid, then the slightly wider base.
    bodies: [
      { x: 344, y: 244, w: 3568, h: 2420, r: 120 },
      { x: 18, y: 2656, w: 4220, h: 164, r: 80 },
    ],
  },
  ipad: {
    width: 2620,
    height: 1868,
    screen: { x: 100, y: 100, w: 2420, h: 1668 },
    radius: [52, 52],
    bodies: [{ x: 5, y: 5, w: 2606, h: 1855, r: 130 }],
  },
  iphone: {
    width: 1490,
    height: 2996,
    screen: { x: 100, y: 100, w: 1290, h: 2796 },
    radius: [205, 205],
    bodies: [{ x: 44, y: 53, w: 1402, h: 2892, r: 290 }],
  },
} satisfies Record<string, FrameGeometry>;

export type DeviceKind = keyof typeof FRAMES;

/** Source pixels the screenshot is allowed to run under the bezel. */
const OVERSCAN = 5;

const pct = (n: number, of: number) => `${+((n / of) * 100).toFixed(4)}%`;

/** Inline style that places the screenshot box inside the frame, as percentages. */
export function screenStyle(kind: DeviceKind): string {
  const { width, height, screen: s, radius } = FRAMES[kind];
  const o = OVERSCAN;
  const w = s.w + o * 2;
  const h = s.h + o * 2;
  const [top, bottom] = radius.map((r) => (r ? r + o : 0));
  const rx = (r: number) => pct(r, w);
  const ry = (r: number) => pct(r, h);
  return [
    `left:${pct(s.x - o, width)}`,
    `top:${pct(s.y - o, height)}`,
    `width:${pct(w, width)}`,
    `height:${pct(h, height)}`,
    `border-radius:${rx(top)} ${rx(top)} ${rx(bottom)} ${rx(bottom)} / ${ry(top)} ${ry(top)} ${ry(bottom)} ${ry(bottom)}`,
  ].join(';');
}

/** Inline styles for the silhouette elements that carry the drop shadow. */
export function bodyStyles(kind: DeviceKind): string[] {
  const { width, height, bodies } = FRAMES[kind];
  return bodies.map((b) =>
    [
      `left:${pct(b.x, width)}`,
      `top:${pct(b.y, height)}`,
      `width:${pct(b.w, width)}`,
      `height:${pct(b.h, height)}`,
      `border-radius:${pct(b.r, b.w)} / ${pct(b.r, b.h)}`,
    ].join(';'),
  );
}

/**
 * Backdrop bands of the mockup: [page y at 1280px wide, colour]. The gradient
 * is anchored to the MacBook's base (y 1813 in the mockup) so the blue/orange
 * horizon keeps its place relative to the devices at any viewport height.
 */
export const BAND_ANCHOR_Y = 1813;
export const BANDS: Array<[y: number, color: string]> = [
  [1260, '#0a1622'],
  [1350, '#0b1d2f'],
  [1440, '#0c2a46'],
  [1500, '#0c3659'],
  [1560, '#0d436f'],
  [1590, '#1c466c'],
  [1620, '#3a465d'],
  [1650, '#5a464f'],
  [1680, '#7a4640'],
  [1710, '#984530'],
  [1740, '#b84522'],
  [1770, '#d74415'],
  [1800, '#f1440b'],
  [1830, '#d53908'],
  [1860, '#a52c08'],
  [1890, '#7f2309'],
  [1920, '#5f1b09'],
  [1950, '#461509'],
  [1980, '#321109'],
  [2010, '#240e09'],
  [2040, '#1a0c09'],
  [2070, '#130b08'],
  [2100, '#0e0908'],
  [2160, '#0a0908'],
];

export function bandGradient(): string {
  const stops = BANDS.map(([y, color]) => {
    const d = y - BAND_ANCHOR_Y;
    return `${color} calc(var(--ay) ${d < 0 ? '-' : '+'} ${Math.abs(d)} * var(--kb))`;
  });
  return `linear-gradient(to bottom, ${stops.join(', ')})`;
}
