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
 * Colours are the mockup's measured means pre-darkened for the grain's lift
 * (base = (mockup - 8.8) / 0.956, see --c-bg in global.css).
 */
export const BAND_ANCHOR_Y = 1813;
export const BANDS: Array<[y: number, color: string]> = [
  [1260, '#010e1a'],
  [1350, '#021528'],
  [1440, '#032340'],
  [1500, '#032f54'],
  [1560, '#043d6b'],
  [1590, '#144068'],
  [1620, '#334058'],
  [1650, '#554049'],
  [1680, '#76403a'],
  [1710, '#963f29'],
  [1740, '#b73f1a'],
  [1770, '#d83e0d'],
  [1800, '#ff3e02'],
  [1830, '#d63200'],
  [1860, '#a32500'],
  [1890, '#7c1b00'],
  [1920, '#5a1300'],
  [1950, '#400d00'],
  [1980, '#2b0900'],
  [2010, '#1c0500'],
  [2040, '#120300'],
  [2070, '#0b0200'],
  [2100, '#050000'],
  [2160, '#010000'],
];

/**
 * Inline style for the backdrop. Stops above the anchor scale with --kb; the
 * tail below it uses --kt, the same scale squeezed so that the last stop (the
 * page colour) lands exactly on the bottom of the band area (--tail below the
 * anchor). The stage therefore always ends on the page colour, whatever the
 * viewport shape.
 */
export function bandStyle(): string {
  const tail = BANDS[BANDS.length - 1][0] - BAND_ANCHOR_Y;
  const stops = BANDS.map(([y, color]) => {
    const d = y - BAND_ANCHOR_Y;
    return d < 0
      ? `${color} calc(var(--ay) - ${-d} * var(--kb))`
      : `${color} calc(var(--ay) + ${d} * var(--kt))`;
  });
  return [
    `--kt: max(0px, min(var(--kb), calc(var(--tail) / ${tail})))`,
    `background: linear-gradient(to bottom, ${stops.join(', ')})`,
  ].join(';');
}
