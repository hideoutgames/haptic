/**
 * iPad Pro 11" (M4), Space Black, modelled to scale in millimetres.
 *
 *   249.7 × 177.5 × 5.3, display 2420 × 1668 (232.8 × 160.5 mm), rounded
 *   display corners, rear camera and LiDAR in the corner of the back.
 *
 * Frame: landscape, origin at the middle of the bottom edge, +Y up, front
 * (screen) towards +Z.
 *
 * It is shown leaning back on a folding stand of the same Space Black
 * aluminium: a slim rail on the ground that its bottom edge sits on, with a
 * low lip in front that stops it sliding; a strip that runs back from the rail
 * along the ground; and a leg hinged to the end of the strip that props the
 * iPad up from behind. From the front only the rail shows, a thin line under
 * the iPad; the rest is hidden beneath it. The leg's length depends on the
 * lean, so the stand is fitted to one (`setLean`), and the group rests on it
 * with its origin `restHeight` above the ground.
 */
import { CircleGeometry, CylinderGeometry, Group, Mesh, MeshBasicMaterial, Color, type Texture } from 'three';
import type { Materials } from './materials';
import { coverUV, filletedOutline, flatShape, roundedRectOutline, slab, translateOutline } from './shapes';

export const IPAD = {
  width: 249.7,
  height: 177.5,
  thickness: 5.3,
  display: { w: 232.8, h: 160.5, r: 6.6 },
  cornerRadius: 12.5,
  /** Radius of the rounded edge between the faces and the side wall. */
  edgeRadius: 0.7,
} as const;

/**
 * The stand (mm). The rail is `w` wide and `depth` deep; its base is `base`
 * high and the lip on its front edge rises `lip` above that, `lipThickness`
 * thick, so the whole rail stands under 5 mm tall and stays below the display
 * glass (which starts 8.5 mm above the iPad's edge). The leg meets the back of
 * the iPad at `at` of its height and is hinged to the strip `hinge` behind
 * the bottom edge; `barrel` is the radius of its hinge and of the pad it
 * presses against the iPad with.
 */
export const STAND = {
  rail: { w: 214, depth: 15, base: 2.2, lip: 2.4, lipThickness: 2.6 },
  strip: { w: 120, thickness: 1.6 },
  leg: { w: 120, thickness: 2.4, at: 0.58, hinge: 116, barrel: 2.2 },
} as const;

/** Length of the leg's and strip's geometry; they are stretched to the length a lean needs. */
const UNIT = 100;
/** Room left between the lip and the iPad's bottom edge (mm). */
const PLAY = 0.1;

export interface IPad {
  group: Group;
  /** 0 = display off, 1 = on. */
  setScreen(power: number): void;
  /**
   * Fits the stand to a lean (radians back from upright) and sets
   * `restHeight`. Does nothing if the lean is unchanged, so the frame loop may
   * call it.
   */
  setLean(lean: number): void;
  /** Height of the group's origin above the ground with the iPad resting on its stand at the current lean. */
  readonly restHeight: number;
}

export function createIPad(m: Materials, screen: Texture, texSize: { w: number; h: number }): IPad {
  const group = new Group();
  const { width: W, height: H, thickness: T } = IPAD;
  const front = T / 2;

  const body = new Mesh(
    slab({ outline: roundedRectOutline(W, H, IPAD.cornerRadius, 12, 2.5), thickness: T, topRadius: IPAD.edgeRadius, bottomRadius: IPAD.edgeRadius, segments: 4 }),
    [m.glassBlack, m.aluminium, m.aluminium],
  );
  body.position.set(0, H / 2, 0);
  group.add(body);

  // Display.
  const { w: dw, h: dh, r } = IPAD.display;
  const outline = translateOutline(roundedRectOutline(dw, dh, r, 10), 0, H / 2);
  const mat = new MeshBasicMaterial({ map: screen, toneMapped: false });
  const display = new Mesh(
    flatShape({
      outline,
      uv: coverUV({ width: dw, height: dh, texW: texSize.w, texH: texSize.h, anchorY: 0.5, centerY: H / 2 }),
    }),
    mat,
  );
  display.position.z = front + 0.05;
  group.add(display);

  const glare = new Mesh(
    flatShape({ outline: translateOutline(roundedRectOutline(W - 2.2, H - 2.2, IPAD.cornerRadius - 1.1, 12, 2.5), 0, H / 2), uv: () => [0, 0] }),
    // Leaning back far, the glass faces the bright horizon as the MacBook's lid does: the weaker layer.
    m.glassReflectionMac,
  );
  glare.position.z = front + 0.12;
  glare.renderOrder = 3;
  group.add(glare);

  // Front camera: a dot in the middle of the top edge.
  const cam = new Mesh(new CircleGeometry(1.0, 16), m.lens);
  cam.position.set(0, H - (H - dh) / 4, front + 0.1);
  group.add(cam);

  // Rear camera module, top-left of the back as seen from behind.
  const back = new Group();
  back.rotation.y = Math.PI;
  back.position.set(W / 2 - 24, H - 24, -T / 2);
  const plate = new Mesh(
    slab({ outline: roundedRectOutline(35, 35, 8.5, 10, 2.4), thickness: 1.8, topRadius: 0.55, bottomRadius: 0.2, segments: 4 }),
    [m.backGlass, m.aluminium, m.aluminium],
  );
  plate.position.z = 0.6;
  back.add(plate);
  const ring = new Mesh(new CylinderGeometry(9.6, 9.6, 1.1, 40), m.titanium);
  ring.rotation.x = Math.PI / 2;
  ring.position.set(-3.6, 3.6, 1.6);
  back.add(ring);
  const lensGlass = new Mesh(new CircleGeometry(7.5, 40), m.lens);
  lensGlass.position.set(-3.6, 3.6, 2.2);
  back.add(lensGlass);
  const lensInner = new Mesh(new CircleGeometry(3.8, 32), m.lensCoat);
  lensInner.position.set(-3.6, 3.6, 2.23);
  back.add(lensInner);
  const lidar = new Mesh(new CircleGeometry(3.7, 28), m.lens);
  lidar.position.set(9, -9, 1.55);
  back.add(lidar);
  const flash = new Mesh(new CircleGeometry(2.1, 20), m.flash);
  flash.position.set(9.5, 8.5, 1.55);
  back.add(flash);
  group.add(back);

  // ---- Stand ----
  // Its frame is level (setLean cancels the group's lean) with the origin on
  // the ground below the iPad's bottom edge, so every length below is a real
  // height or depth (+Z towards the viewer).
  const stand = new Group();
  group.add(stand);
  const { rail: R, strip: P, leg: L } = STAND;
  const metal = m.aluminium;

  // The rail: an L-shaped section (base and lip), drawn in a side view with
  // the depth along X and the height along Y, and extruded across the width
  // with square, softened ends. Its origin is the foot of the lip's back face.
  const railMesh = new Mesh(
    slab({
      outline: filletedOutline(
        [
          [R.lipThickness - R.depth, 0],
          [R.lipThickness, 0],
          [R.lipThickness, R.base + R.lip],
          [0, R.base + R.lip],
          [0, R.base],
          [R.lipThickness - R.depth, R.base],
        ],
        0.7,
      ),
      thickness: R.w,
      topRadius: 0.6,
      segments: 3,
    }),
    metal,
  );
  // Side view: X of the section runs towards the viewer, and the extrusion across the width.
  railMesh.rotation.y = -Math.PI / 2;
  stand.add(railMesh);

  // The strip and the leg: flat bars of unit length, stretched to fit the lean.
  const bar = (w: number, thickness: number) =>
    slab({ outline: roundedRectOutline(w, UNIT, 2.5, 6), thickness, topRadius: 0.5, segments: 3 });
  const strip = new Mesh(bar(P.w, P.thickness), metal);
  const leg = new Mesh(bar(L.w, L.thickness), metal);
  // The hinge at the back of the strip and the pad at the top of the leg.
  const barrelGeometry = new CylinderGeometry(L.barrel, L.barrel, L.w + 4, 16);
  barrelGeometry.rotateZ(Math.PI / 2);
  const hinge = new Mesh(barrelGeometry, metal);
  const pad = new Mesh(barrelGeometry, m.rubber);
  // The strip lies flat, its length running back, and the hinge sits on the ground behind the iPad.
  strip.rotation.x = -Math.PI / 2;
  hinge.position.set(0, L.barrel, -L.hinge);
  stand.add(strip, leg, hinge, pad);

  let lean = NaN;
  let restHeight = 0;
  const setLean = (l: number) => {
    if (l === lean) return;
    lean = l;
    const sin = Math.sin(l);
    const cos = Math.cos(l);
    // The lowest point of the leaning iPad is on the rounded edge between its
    // back and its bottom edge, where the edge's slope matches the lean: that
    // point rests on the rail's base.
    const e = IPAD.edgeRadius;
    const lowest = (T / 2) * sin + e - e * (cos + sin);
    restHeight = R.base + lowest + 0.02; // (a hair above it)
    stand.rotation.set(l, 0, 0);
    stand.position.set(0, -restHeight * cos, -restHeight * sin);

    // The lip stands just in front of where the iPad's bottom edge (a line rising
    // forwards at the lean) passes the lip's height, so the edge rests against it.
    railMesh.position.z = (R.base + R.lip - restHeight) / Math.tan(l) + PLAY;

    // The pad presses on the back of the iPad, `at` of the way up it.
    const up = H * L.at;
    const off = T / 2 + L.barrel;
    const padY = restHeight + up * cos - off * sin;
    const padZ = -up * sin - off * cos;
    pad.position.set(0, padY, padZ);
    // The leg runs from the hinge to the pad; the strip from under the rail to the hinge.
    const dy = padY - L.barrel;
    const dz = padZ + L.hinge;
    leg.position.set(0, (padY + L.barrel) / 2, (padZ - L.hinge) / 2);
    leg.rotation.set(Math.atan2(dz, dy), 0, 0);
    leg.scale.set(1, Math.hypot(dy, dz) / UNIT, 1);
    const stripFront = railMesh.position.z - R.depth / 2;
    strip.position.set(0, P.thickness / 2, (stripFront - L.hinge) / 2);
    strip.scale.set(1, (L.hinge + stripFront) / UNIT, 1);
  };

  const tint = new Color();
  const setScreen = (power: number) => {
    mat.color.copy(tint.setScalar(Math.pow(Math.max(0, Math.min(1, power)), 1.4)));
  };
  setScreen(1);
  setLean(Math.PI / 4);

  return {
    group,
    setScreen,
    setLean,
    get restHeight() {
      return restHeight;
    },
  };
}
