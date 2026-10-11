/**
 * Geometry of the header mark: the Block Berthold-style "H" and the bar it
 * turns into when the menu opens.
 *
 * The bar is the H turned on its side. The mark only ever turns clockwise:
 * opening the menu turns the H a quarter turn into the bar, and closing it
 * carries on for another quarter turn back into the H, so open and close
 * together read as one half turn (the H looks the same upside down). As it
 * turns, its stems slide together (the crossbar shortens and the counters
 * close) and it settles a little lower as the 30 × 10.75 bar, then the other
 * way on the next quarter. The shape is one 12-vertex rounded polygon drawn in
 * the H's own frame and then turned, so the chromatic-aberration fringes (the
 * polygon dilated across the stems) turn with it: beside the H, above and
 * below the bar, with no cross-fade between the two.
 *
 * logoPaths(phase) takes the mark's position in quarter turns (0 = H, 1 =
 * bar, 2 = the H again after half a turn, 3 = the bar, 4 = back to the start;
 * header.ts eases it), so the same function draws the static markup on the
 * server and every frame of the turn in the browser.
 *
 * Units are CSS px relative to the white ink's top-left corner at t = 0
 * (25 × 30), measured from the designer's clean export of the logo.
 */

export interface Fringe {
  /** Growth on the outside of the stems (beside the H, above and below the bar). */
  outer: number;
  /** Growth into the counters (smaller than outer in the mockup). */
  inner: number;
  /** Outer growth once the H has become the bar (measured on the bar). */
  bar: number;
}

export const WHITE: Fringe = { outer: 0, inner: 0, bar: 0 };
export const AMBER: Fringe = { outer: 2.4, inner: 1.7, bar: 2.4 };
export const RED: Fringe = { outer: 4.9, inner: 3.4, bar: 4.7 };

/** SVG viewBox: ink origin at (0, 0), room for fringes and blur on every side. */
export const LOGO_VIEWBOX = { x: -9.5, y: -2, w: 44, h: 39 };

/**
 * Blur filter region (user units). Larger than the viewBox because the mark
 * reaches past it on the diagonal mid-turn (the svg's overflow is visible);
 * offset from the viewBox by whole px so the blur stays aligned to pixels.
 */
export const FILTER_REGION = { x: -15.5, y: -8, w: 56, h: 58 };

/** Gaussian blur (user units) that softens the white ink and the fringe copies. */
export const BLUR = { ink: 0.25, fringe: 0.55 };

/**
 * Timing of one quarter turn (H → bar or bar → H), for header.ts: a prompt but
 * gentle start and a long, soft landing (the standard UI curve,
 * cubic-bezier(0.4, 0, 0.2, 1)).
 */
export const MORPH = { duration: 0.55, ease: cubicBezier(0.4, 0, 0.2, 1) };

// H silhouette
const W = 25;
const HEIGHT = 30;
const STEM = 7.3;
const COUNTER_TOP_END = 10.8; // bottom of the upper counter
const COUNTER_BOTTOM_START = 18.2; // top of the lower counter
const R_OUTER = 1.1;
const R_STEM_END = 0.9;
const R_FILLET = 2;

/**
 * Bar (open state): as long as the H is tall (30) and 10.75 thick, its centre
 * 10 px below the H's so it sits on the H's baseline. In the H's frame, before
 * the quarter turn, it is a 10.75-wide upright slab.
 */
const BAR = { h: 10.75, r: 1.8, drop: 10.075 };

/** Centre of the H, which the turn pivots round. */
const CX = W / 2;
const CY = HEIGHT / 2;

/** CSS-style cubic-bezier timing function (x1, x2 in [0, 1]), solved with Newton steps. */
function cubicBezier(x1: number, y1: number, x2: number, y2: number): (p: number) => number {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  return (p) => {
    if (p <= 0 || p >= 1) return Math.min(1, Math.max(0, p));
    let u = p;
    for (let n = 0; n < 8; n++) {
      const x = ((ax * u + bx) * u + cx) * u - p;
      const dx = (3 * ax * u + 2 * bx) * u + cx;
      if (Math.abs(x) < 1e-5 || Math.abs(dx) < 1e-6) break;
      u = Math.min(1, Math.max(0, u - x / dx));
    }
    return ((ay * u + by) * u + cy) * u;
  };
}

type Vertex = [x: number, y: number, radius: number];

const mix = (a: number, b: number, k: number) => a + (b - a) * k;

/**
 * The 12 polygon vertices in the H's (unturned) frame with the stems merged by
 * k, plus each counter's half-width (the room the inner fringes have). Every
 * vertex and radius moves in a straight line at a steady rate in k, so the
 * shape changes evenly from the H to the slab.
 */
function vertices(k: number): { v: Vertex[]; counter: number } {
  // Stems slide together until they meet in the middle as the slab.
  const left = mix(0, CX - BAR.h / 2, k);
  const right = mix(W, CX + BAR.h / 2, k);
  const stemL = mix(STEM, CX, k);
  const stemR = mix(W - STEM, CX, k);
  // The counters get shallower as fast as they get narrower: each shrinks to
  // nothing in proportion (never a slit between the stems, never a sudden
  // snap shut at the end).
  const top = mix(COUNTER_TOP_END, 0, k);
  const bottom = mix(COUNTER_BOTTOM_START, HEIGHT, k);
  const rOuter = mix(R_OUTER, BAR.r, k);
  const rEnd = R_STEM_END * (1 - k);
  const rFillet = R_FILLET * (1 - k);
  // prettier-ignore
  const v: Vertex[] = [
    [left, 0, rOuter],
    [stemL, 0, rEnd],
    [stemL, top, rFillet],
    [stemR, top, rFillet],
    [stemR, 0, rEnd],
    [right, 0, rOuter],
    [right, HEIGHT, rOuter],
    [stemR, HEIGHT, rEnd],
    [stemR, bottom, rFillet],
    [stemL, bottom, rFillet],
    [stemL, HEIGHT, rEnd],
    [left, HEIGHT, rOuter],
  ];
  return { v, counter: (stemR - stemL) / 2 };
}

/**
 * Push each vertex sideways (in the H's frame) by the fringe's growth: outward
 * on the outer edges, into the counters on the stems' inner edges. The inner
 * growth never exceeds half a counter, so a closing counter never turns
 * inside out.
 */
function dilate(v: Vertex[], f: Fringe, k: number, counter: number): Vertex[] {
  const o = mix(f.outer, f.bar, k);
  const i = Math.min(f.inner, counter);
  const dx = [-o, i, i, -i, -i, o, o, -i, -i, i, i, -o];
  return v.map(([x, y, r], n) => [x + dx[n], y, r]);
}

/**
 * The same polygon turned half round the H's centre, with its vertices
 * renumbered so each keeps its role (vertex 0 is still the top-left corner).
 * Drawn half a turn further on, it is the upright H again: the second quarter
 * of each half turn morphs towards this one, so the H lands upright (the
 * crossbar sits a little above the middle, so the plain H would land a pixel
 * off). The bar is symmetric, so both halves meet it in the same place.
 */
function halfTurned(v: Vertex[]): Vertex[] {
  return v.map((_, n) => {
    const [x, y, r] = v[(n + 6) % 12];
    return [2 * CX - x, 2 * CY - y, r];
  });
}

/** Turn the polygon by `angle` round the H's centre and move it down by `dy`. */
function place(v: Vertex[], angle: number, dy: number): Vertex[] {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return v.map(([x, y, r]) => {
    const px = x - CX;
    const py = y - CY;
    return [CX + px * c - py * s, CY + dy + px * s + py * c, r];
  });
}

const K = 0.5523; // circular-arc cubic handle length

const f = (n: number) => +n.toFixed(3);

/** Closed path through the polygon with each corner rounded by its radius. */
function roundedPath(v: Vertex[]): string {
  const n = v.length;
  let d = '';
  for (let k = 0; k < n; k++) {
    const [px, py] = v[(k + n - 1) % n];
    const [cx, cy, cr] = v[k];
    const [qx, qy] = v[(k + 1) % n];
    const l1 = Math.hypot(px - cx, py - cy);
    const l2 = Math.hypot(qx - cx, qy - cy);
    const r = Math.min(cr, l1 / 2, l2 / 2);
    // Tangent points on the incoming / outgoing edges.
    const ax = l1 ? cx + ((px - cx) / l1) * r : cx;
    const ay = l1 ? cy + ((py - cy) / l1) * r : cy;
    const bx = l2 ? cx + ((qx - cx) / l2) * r : cx;
    const by = l2 ? cy + ((qy - cy) / l2) * r : cy;
    d += `${k ? 'L' : 'M'}${f(ax)} ${f(ay)}`;
    if (r > 0.001) {
      d += `C${f(ax + (cx - ax) * K)} ${f(ay + (cy - ay) * K)} ${f(bx + (cx - bx) * K)} ${f(by + (cy - by) * K)} ${f(bx)} ${f(by)}`;
    }
  }
  return d + 'Z';
}

export interface LogoPaths {
  white: string;
  amber: string;
  red: string;
}

/**
 * Path data for the three stacked layers (red below amber below white) with the
 * mark `phase` quarter turns round (any number; it repeats every 4). The turn,
 * the drop and the change of shape all run on the phase itself, in step: a
 * third of the way round the H is a third of the way to the bar. So each
 * quarter turn is one motion with the tween's easing.
 */
export function logoPaths(phase: number): LogoPaths {
  const p = ((phase % 4) + 4) % 4;
  // How far the shape is from the H (0) towards the bar (1): up over the first
  // quarter of each half turn, back down over the second.
  const q = p % 2;
  const t = q <= 1 ? q : 2 - q;
  const angle = (Math.PI / 2) * p;
  const dy = BAR.drop * t;
  const { v, counter } = vertices(t);
  // The H this quarter starts from or lands on: upright once it has turned a
  // whole number of turns, upside down halfway (see halfTurned).
  const landsHalfway = p > 1 && p <= 3;
  const shape = landsHalfway ? halfTurned(v) : v;
  const layer = (fringe: Fringe) => roundedPath(place(dilate(shape, fringe, t, counter), angle, dy));
  return { white: layer(WHITE), amber: layer(AMBER), red: layer(RED) };
}
