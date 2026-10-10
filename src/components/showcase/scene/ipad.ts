/**
 * iPad Pro 11" (M4), Space Black, modelled to scale in millimetres.
 *
 *   249.7 × 177.5 × 5.3, display 2420 × 1668 (232.8 × 160.5 mm), rounded
 *   display corners, rear camera and LiDAR in the corner of the back.
 *
 * Frame: landscape, origin at the middle of the bottom edge, +Y up, front
 * (screen) towards +Z. Standing on `y = 0`.
 */
import { CircleGeometry, CylinderGeometry, Group, Mesh, MeshBasicMaterial, Color, type Texture } from 'three';
import type { Materials } from './materials';
import { coverUV, flatShape, roundedRectOutline, slab, translateOutline } from './shapes';

export const IPAD = {
  width: 249.7,
  height: 177.5,
  thickness: 5.3,
  display: { w: 232.8, h: 160.5, r: 6.6 },
  cornerRadius: 12.5,
} as const;

export interface IPad {
  group: Group;
  /** The device's centre, for pivots and fitting. */
  setScreen(power: number): void;
}

export function createIPad(m: Materials, screen: Texture, texSize: { w: number; h: number }): IPad {
  const group = new Group();
  const { width: W, height: H, thickness: T } = IPAD;
  const front = T / 2;

  const body = new Mesh(
    slab({ outline: roundedRectOutline(W, H, IPAD.cornerRadius, 12, 2.5), thickness: T, topRadius: 0.7, bottomRadius: 0.7, segments: 4 }),
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
    m.glassReflection,
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

  const tint = new Color();
  const setScreen = (power: number) => {
    mat.color.copy(tint.setScalar(Math.pow(Math.max(0, Math.min(1, power)), 1.4)));
  };
  setScreen(1);

  return { group, setScreen };
}
