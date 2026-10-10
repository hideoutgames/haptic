/**
 * Camera framing. The camera looks at the finished composition from a fixed
 * direction; its distance and view offset are solved so that the composition's
 * screen-space bounds land in a target rectangle of the canvas (which comes
 * from the page layout), whatever the canvas aspect.
 */
import { Box3, PerspectiveCamera, Vector3, type Object3D } from 'three';
import type { Area } from './types';

const corners = (box: Box3): Vector3[] => {
  const { min, max } = box;
  const out: Vector3[] = [];
  for (const x of [min.x, max.x]) for (const y of [min.y, max.y]) for (const z of [min.z, max.z]) out.push(new Vector3(x, y, z));
  return out;
};

/** Bounds of the world-space bounding boxes of the given objects, as eight-corner point sets. */
export function pointsOf(objects: Object3D[]): Vector3[] {
  const pts: Vector3[] = [];
  for (const o of objects) {
    o.updateWorldMatrix(true, true);
    pts.push(...corners(new Box3().setFromObject(o)));
  }
  return pts;
}

export function frameCamera(
  camera: PerspectiveCamera,
  size: { width: number; height: number },
  opts: {
    fov: number;
    elevation: number;
    azimuth: number;
    /** The whole composition (vertical limits). */
    points: Vector3[];
    /** The part whose width fills the area (defaults to all points). */
    widthPoints?: Vector3[];
    ground: Vector3;
    area: Area;
  },
): { centre: Vector3; dir: Vector3; distance: number } {
  const { width: W, height: H } = size;
  const { points, ground, area } = opts;
  const widthPoints = opts.widthPoints ?? points;
  camera.fov = opts.fov;
  camera.aspect = W / H;
  camera.near = 300;
  camera.far = 9000;
  camera.clearViewOffset();

  const centre = new Box3().setFromPoints(points).getCenter(new Vector3());
  const dir = new Vector3(
    Math.sin(opts.azimuth) * Math.cos(opts.elevation),
    Math.sin(opts.elevation),
    Math.cos(opts.azimuth) * Math.cos(opts.elevation),
  );

  const project = (p: Vector3) => {
    const v = p.clone().project(camera);
    return { x: ((v.x + 1) / 2) * W, y: ((1 - v.y) / 2) * H };
  };
  const measure = () => {
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const p of points) {
      const q = project(p);
      minY = Math.min(minY, q.y);
      maxY = Math.max(maxY, q.y);
      minX = Math.min(minX, q.x);
      maxX = Math.max(maxX, q.x);
    }
    let wMin = Infinity;
    let wMax = -Infinity;
    for (const p of widthPoints) {
      const q = project(p);
      wMin = Math.min(wMin, q.x);
      wMax = Math.max(wMax, q.x);
    }
    return { minX, maxX, minY, maxY, wMin, wMax, ground: project(ground) };
  };

  let distance = 2200;
  const place = () => {
    camera.position.copy(centre).addScaledVector(dir, distance);
    camera.lookAt(centre);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);
  };

  const areaW = Math.max(40, area.right - area.left);
  const areaH = Math.max(40, area.bottom - area.top);
  for (let i = 0; i < 6; i++) {
    place();
    const b = measure();
    let s = areaW / Math.max(1, b.wMax - b.wMin);
    if (area.groundY !== undefined) {
      const above = Math.max(1, b.ground.y - b.minY);
      const below = Math.max(1, b.maxY - b.ground.y);
      s = Math.min(s, (area.groundY - area.top) / above, (area.bottom - area.groundY) / below);
    } else {
      s = Math.min(s, areaH / Math.max(1, b.maxY - b.minY));
    }
    distance /= s;
  }
  place();

  const b = measure();
  const dx = area.alignX === 'right' ? area.right - b.wMax : (area.left + area.right) / 2 - (b.wMin + b.wMax) / 2;
  const dy = area.groundY !== undefined ? area.groundY - b.ground.y : (area.top + area.bottom) / 2 - (b.minY + b.maxY) / 2;
  camera.setViewOffset(W, H, -dx, -dy, W, H);
  camera.updateMatrixWorld(true);
  return { centre, dir, distance };
}
