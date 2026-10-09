/**
 * Geometry of the header mark: the Block Berthold-style "H" and the bar it
 * morphs into when the menu opens.
 *
 * Everything is one 12-vertex rounded polygon whose vertices interpolate
 * between the H and the bar (t = 0 → 1), so the same function draws the static
 * markup on the server and every frame of the morph in the browser. The
 * chromatic-aberration fringes are the same polygon dilated: horizontally
 * for the H, vertically for the bar, cross-fading with t.
 *
 * Units are CSS px relative to the white ink's top-left corner at t = 0
 * (25 × 30), measured from the designer's clean export of the logo.
 */

export interface Fringe {
  /** Horizontal growth on the outside of the stems. */
  outer: number;
  /** Horizontal growth on the counter side (smaller than outer in the mockup). */
  inner: number;
  /** Vertical growth of the bar's top and bottom edges. */
  vertical: number;
}

export const WHITE: Fringe = { outer: 0, inner: 0, vertical: 0 };
export const AMBER: Fringe = { outer: 2.3, inner: 1.65, vertical: 2.3 };
export const RED: Fringe = { outer: 4.75, inner: 3.35, vertical: 4.55 };

/** SVG viewBox: ink origin at (0, 0), room for fringes and blur on every side. */
export const LOGO_VIEWBOX = { x: -9, y: -2, w: 43, h: 39 };

/** Gaussian blur (user units) that softens the white ink and the fringe copies. */
export const BLUR = { ink: 0.25, fringe: 0.55 };

// H silhouette
const W = 25;
const HEIGHT = 30;
const STEM = 7.3;
const COUNTER_TOP_END = 10.8; // bottom of the upper counter
const COUNTER_BOTTOM_START = 18.2; // top of the lower counter
const R_OUTER = 1.1;
const R_STEM_END = 0.9;
const R_FILLET = 2;

// Bar (open state): 30 × 10.6, bottom-aligned with the H
const BAR = { x0: -2.5, x1: 27.5, y0: 19.4, y1: 30, r: 1.8, innerL: 10, innerR: 15 };

type Vertex = [x: number, y: number, radius: number];

/** The 12 polygon vertices at morph position t, before dilation. */
function vertices(t: number): Vertex[] {
  const m = (a: number, b: number) => a + (b - a) * t;
  const { x0, x1, y0, y1, innerL, innerR, r } = BAR;
  const sR = W - STEM;
  // prettier-ignore
  return [
    [m(0, x0),   m(0, y0),                       m(R_OUTER, r)],
    [m(STEM, innerL), m(0, y0),                  m(R_STEM_END, 0)],
    [m(STEM, innerL), m(COUNTER_TOP_END, y0),    m(R_FILLET, 0)],
    [m(sR, innerR),   m(COUNTER_TOP_END, y0),    m(R_FILLET, 0)],
    [m(sR, innerR),   m(0, y0),                  m(R_STEM_END, 0)],
    [m(W, x1),   m(0, y0),                       m(R_OUTER, r)],
    [m(W, x1),   m(HEIGHT, y1),                  m(R_OUTER, r)],
    [m(sR, innerR),   m(HEIGHT, y1),             m(R_STEM_END, 0)],
    [m(sR, innerR),   m(COUNTER_BOTTOM_START, y1), m(R_FILLET, 0)],
    [m(STEM, innerL), m(COUNTER_BOTTOM_START, y1), m(R_FILLET, 0)],
    [m(STEM, innerL), m(HEIGHT, y1),             m(R_STEM_END, 0)],
    [m(0, x0),   m(HEIGHT, y1),                  m(R_OUTER, r)],
  ];
}

/** Push each vertex outward by the fringe's horizontal/vertical growth. */
function dilate(v: Vertex[], f: Fringe, t: number): Vertex[] {
  const o = f.outer * (1 - t);
  const i = f.inner * (1 - t);
  const y = f.vertical * t;
  // x offset / y offset per vertex index
  const dx = [-o, i, i, -i, -i, o, o, -i, -i, i, i, -o];
  const dy = [-y, -y, -y, -y, -y, -y, y, y, y, y, y, y];
  return v.map(([x, yy, r], k) => [x + dx[k], yy + dy[k], r]);
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

/** Path data for the three stacked layers (red below amber below white). */
export function logoPaths(t: number): LogoPaths {
  const base = vertices(t);
  return {
    white: roundedPath(base),
    amber: roundedPath(dilate(base, AMBER, t)),
    red: roundedPath(dilate(base, RED, t)),
  };
}
