/**
 * Geometry helpers for the device models: rounded outlines with continuous
 * (squircle-like) corners, a smooth bevelled slab (the body of every device)
 * and flat shapes with mapped UVs (screens).
 *
 * Everything is built in the XY plane with thickness along Z (front = +Z);
 * units are millimetres.
 */
import { BufferGeometry, Float32BufferAttribute, ShapeUtils, Vector2 } from 'three';

export type Radii = number | [tl: number, tr: number, br: number, bl: number];

const HALF_PI = Math.PI / 2;

/**
 * Closed counter-clockwise outline of a rounded rectangle centred on the
 * origin. `n` is the superellipse exponent of the corners (2 = circular arc;
 * a little more gives the continuous-curvature corner of Apple hardware).
 */
export function roundedRectOutline(w: number, h: number, radii: Radii, segments = 10, n = 2.6): Vector2[] {
  const [tl, tr, br, bl] = typeof radii === 'number' ? [radii, radii, radii, radii] : radii;
  const x0 = -w / 2;
  const x1 = w / 2;
  const y0 = -h / 2;
  const y1 = h / 2;
  const pts: Vector2[] = [];

  const corner = (cx: number, cy: number, r: number, sx: number, sy: number, a0: number) => {
    if (r <= 0) {
      pts.push(new Vector2(cx, cy));
      return;
    }
    for (let i = 0; i <= segments; i++) {
      const t = a0 + (i / segments) * HALF_PI;
      const c = Math.cos(t);
      const s = Math.sin(t);
      // Superellipse: |x|^n + |y|^n = r^n
      const ex = Math.sign(c) * Math.pow(Math.abs(c), 2 / n);
      const ey = Math.sign(s) * Math.pow(Math.abs(s), 2 / n);
      pts.push(new Vector2(cx + r * ex, cy + r * ey));
    }
    void sx;
    void sy;
  };

  // Counter-clockwise from the bottom-left corner.
  corner(x0 + bl, y0 + bl, bl, -1, -1, Math.PI);
  corner(x1 - br, y0 + br, br, 1, -1, -HALF_PI);
  corner(x1 - tr, y1 - tr, tr, 1, 1, 0);
  corner(x0 + tl, y1 - tl, tl, -1, 1, HALF_PI);
  // The corners start with the tangent point on the previous edge, so the
  // straight edges are implied. Drop accidental duplicates.
  return dedupe(pts);
}

/** Circle outline (counter-clockwise). */
export function circleOutline(r: number, segments = 32): Vector2[] {
  const pts: Vector2[] = [];
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    pts.push(new Vector2(Math.cos(a) * r, Math.sin(a) * r));
  }
  return pts;
}

function dedupe(pts: Vector2[]): Vector2[] {
  const out: Vector2[] = [];
  for (const p of pts) {
    const q = out[out.length - 1];
    if (!q || q.distanceToSquared(p) > 1e-8) out.push(p);
  }
  if (out.length > 1 && out[0].distanceToSquared(out[out.length - 1]) <= 1e-8) out.pop();
  return out;
}

/** Offsets an outline by (x, y). */
export function translateOutline(pts: Vector2[], x: number, y: number): Vector2[] {
  return pts.map((p) => new Vector2(p.x + x, p.y + y));
}

/**
 * Closed outline through `corners` (counter-clockwise) with every corner
 * rounded by a circular arc of radius `r`, convex or not: a profile such as
 * the iPad stand's rail, for `slab`.
 */
export function filletedOutline(corners: Array<[number, number]>, r: number, segments = 3): Vector2[] {
  const out: Vector2[] = [];
  const n = corners.length;
  for (let i = 0; i < n; i++) {
    const [px, py] = corners[i];
    const [ax, ay] = corners[(i + n - 1) % n];
    const [bx, by] = corners[(i + 1) % n];
    const la = Math.hypot(ax - px, ay - py);
    const lb = Math.hypot(bx - px, by - py);
    const ux = (ax - px) / la;
    const uy = (ay - py) / la;
    const vx = (bx - px) / lb;
    const vy = (by - py) / lb;
    // Half the angle between the two edges, the tangent points and the arc's centre.
    const half = Math.acos(Math.max(-1, Math.min(1, ux * vx + uy * vy))) / 2;
    const d = r / Math.tan(half);
    const bl = Math.hypot(ux + vx, uy + vy);
    const cx = px + ((ux + vx) / bl) * (r / Math.sin(half));
    const cy = py + ((uy + vy) / bl) * (r / Math.sin(half));
    const a0 = Math.atan2(py + uy * d - cy, px + ux * d - cx);
    let a1 = Math.atan2(py + vy * d - cy, px + vx * d - cx);
    // The short way round, from the incoming edge to the outgoing one.
    if (a1 - a0 > Math.PI) a1 -= Math.PI * 2;
    if (a0 - a1 > Math.PI) a1 += Math.PI * 2;
    for (let k = 0; k <= segments; k++) {
      const a = a0 + ((a1 - a0) * k) / segments;
      out.push(new Vector2(cx + r * Math.cos(a), cy + r * Math.sin(a)));
    }
  }
  return out;
}

export interface SlabOptions {
  /** Counter-clockwise outline in the XY plane. */
  outline: Vector2[];
  /** Total thickness along Z (centred on 0). */
  thickness: number;
  /** Edge radius at the +Z face and at the -Z face. */
  topRadius: number;
  bottomRadius?: number;
  /** Segments around each rounded edge. */
  segments?: number;
}

/**
 * A slab with rounded edges: smooth analytic normals, three groups
 * (0 = +Z face, 1 = -Z face, 2 = edge: bevels and side wall), so one mesh can
 * carry glass on the front, metal on the edge and another finish on the back.
 */
export function slab({ outline, thickness, topRadius, bottomRadius = topRadius, segments = 5 }: SlabOptions): BufferGeometry {
  const n = outline.length;
  const half = thickness / 2;

  // Outward unit normal per vertex (average of the two adjacent edges) and the
  // miter vector that offsets the outline inwards by exactly one unit.
  const outward: Vector2[] = [];
  const miter: Vector2[] = [];
  for (let i = 0; i < n; i++) {
    const p0 = outline[(i + n - 1) % n];
    const p1 = outline[i];
    const p2 = outline[(i + 1) % n];
    const e0 = new Vector2(p1.x - p0.x, p1.y - p0.y).normalize();
    const e1 = new Vector2(p2.x - p1.x, p2.y - p1.y).normalize();
    const n0 = new Vector2(e0.y, -e0.x);
    const n1 = new Vector2(e1.y, -e1.x);
    const nv = n0.clone().add(n1);
    const len = nv.length() || 1;
    outward.push(nv.clone().multiplyScalar(1 / len));
    const d = 1 + n0.dot(n1);
    miter.push(nv.multiplyScalar(1 / Math.max(d, 0.2)));
  }

  // Profile, from the front face round the edge to the back face:
  // [inset, z, normal-outward, normal-z].
  const profile: Array<[number, number, number, number]> = [];
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * HALF_PI;
    profile.push([topRadius * (1 - Math.sin(a)), half - topRadius * (1 - Math.cos(a)), Math.sin(a), Math.cos(a)]);
  }
  for (let i = segments; i >= 0; i--) {
    const a = (i / segments) * HALF_PI;
    profile.push([bottomRadius * (1 - Math.sin(a)), -half + bottomRadius * (1 - Math.cos(a)), Math.sin(a), -Math.cos(a)]);
  }

  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  for (const [inset, z, no, nz] of profile) {
    for (let i = 0; i < n; i++) {
      const p = outline[i];
      const m = miter[i];
      const o = outward[i];
      const x = p.x - m.x * inset;
      const y = p.y - m.y * inset;
      positions.push(x, y, z);
      normals.push(o.x * no, o.y * no, nz);
      uvs.push(x, y);
    }
  }

  const sideIdx: number[] = [];
  for (let j = 0; j < profile.length - 1; j++) {
    for (let i = 0; i < n; i++) {
      const i2 = (i + 1) % n;
      const a = j * n + i;
      const b = j * n + i2;
      const d = (j + 1) * n + i;
      const c = (j + 1) * n + i2;
      sideIdx.push(a, d, b, b, d, c);
    }
  }

  const tris = ShapeUtils.triangulateShape(outline.map((p) => p.clone()), []);
  const lastRing = (profile.length - 1) * n;
  const topIdx: number[] = [];
  const botIdx: number[] = [];
  for (const [a, b, c] of tris) {
    topIdx.push(a, b, c);
    botIdx.push(lastRing + a, lastRing + c, lastRing + b);
  }
  // triangulateShape does not promise an orientation: make the front cap face +Z.
  if (tris.length) {
    const [a, b, c] = tris[0];
    const cross =
      (outline[b].x - outline[a].x) * (outline[c].y - outline[a].y) -
      (outline[b].y - outline[a].y) * (outline[c].x - outline[a].x);
    if (cross < 0) {
      for (let i = 0; i < topIdx.length; i += 3) {
        [topIdx[i + 1], topIdx[i + 2]] = [topIdx[i + 2], topIdx[i + 1]];
        [botIdx[i + 1], botIdx[i + 2]] = [botIdx[i + 2], botIdx[i + 1]];
      }
    }
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
  geometry.setIndex([...topIdx, ...botIdx, ...sideIdx]);
  geometry.addGroup(0, topIdx.length, 0);
  geometry.addGroup(topIdx.length, botIdx.length, 1);
  geometry.addGroup(topIdx.length + botIdx.length, sideIdx.length, 2);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

export interface FlatOptions {
  outline: Vector2[];
  /** Maps a point of the outline to texture coordinates. */
  uv: (x: number, y: number) => [number, number];
}

/** A flat, front-facing (+Z) shape with custom UVs: the display of a device. */
export function flatShape({ outline, uv }: FlatOptions): BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  for (const p of outline) {
    positions.push(p.x, p.y, 0);
    normals.push(0, 0, 1);
    uvs.push(...uv(p.x, p.y));
  }
  const tris = ShapeUtils.triangulateShape(outline.map((p) => p.clone()), []);
  const idx: number[] = [];
  for (const [a, b, c] of tris) idx.push(a, b, c);
  if (tris.length) {
    const [a, b, c] = tris[0];
    const cross =
      (outline[b].x - outline[a].x) * (outline[c].y - outline[a].y) -
      (outline[b].y - outline[a].y) * (outline[c].x - outline[a].x);
    if (cross < 0) for (let i = 0; i < idx.length; i += 3) [idx[i + 1], idx[i + 2]] = [idx[i + 2], idx[i + 1]];
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
  geometry.setIndex(idx);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

/**
 * UV mapping that shows a texture over a w × h rectangle like CSS
 * `object-fit: cover`, with an optional crop (fractions of the texture,
 * measured from the top/bottom/left/right) and vertical anchoring.
 */
export function coverUV(opts: {
  /** Rectangle the texture is shown in (centred on the origin). */
  width: number;
  height: number;
  /** Texture size in pixels. */
  texW: number;
  texH: number;
  /** Rows (px) of the texture that must never show at the top/bottom. */
  cropTop?: number;
  cropBottom?: number;
  /** 0 = keep the top of the visible area, 1 = keep the bottom (for the part that does not fit). */
  anchorY?: number;
  /** Extra offset of the rectangle's centre, so shapes can be smaller than the screen. */
  centerX?: number;
  centerY?: number;
}): (x: number, y: number) => [number, number] {
  const { width, height, texW, texH, cropTop = 0, cropBottom = 0, anchorY = 0, centerX = 0, centerY = 0 } = opts;
  const srcH = texH - cropTop - cropBottom;
  const srcAspect = texW / srcH;
  const dstAspect = width / height;
  let uSpan = 1;
  let vSpanPx = srcH;
  if (srcAspect > dstAspect) uSpan = dstAspect / srcAspect; // source wider: crop the sides
  else vSpanPx = texW / dstAspect; // source taller: crop top/bottom
  const u0 = (1 - uSpan) / 2;
  const slack = srcH - vSpanPx;
  const topPx = cropTop + slack * anchorY;
  return (x, y) => {
    const fx = (x - centerX) / width + 0.5;
    const fy = (y - centerY) / height + 0.5; // 0 at the bottom, 1 at the top
    const u = u0 + fx * uSpan;
    // Row from the top of the texture, then flipped to GL's bottom-up v.
    const row = topPx + (1 - fy) * vSpanPx;
    return [u, 1 - row / texH];
  };
}
