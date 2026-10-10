/**
 * MacBook Pro 16" (Space Black), modelled to scale in millimetres.
 *
 *   footprint 355.7 × 248.1, closed height 16.8 (base 10.7 on 0.6 feet, lid 5.2)
 *   display 3456 × 2234 (16.2"), 345.6 × 223.4 mm, notch, square bottom corners
 *
 * Frame: origin on the ground at the middle of the base; +X right, +Y up and
 * +Z towards the user. The lid is a group hinged at the back edge of the base:
 * `setOpen(degrees)` swings it from 0 (closed) to ~110.
 */
import {
  CylinderGeometry,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  CircleGeometry,
  Color,
  type Texture,
} from 'three';
import type { Materials } from './materials';
import { createKeyboard } from './keyboard';
import { coverUV, flatShape, roundedRectOutline, slab, translateOutline } from './shapes';

export const MAC = {
  width: 355.7,
  depth: 248.1,
  feet: 0.6,
  baseHeight: 10.7,
  lidThickness: 5.2,
  display: { w: 345.6, h: 223.4 },
  notch: { w: 36.7, h: 6.4 },
  cornerRadius: 12,
} as const;

const BASE_TOP = MAC.feet + MAC.baseHeight; // 11.3
const PIVOT_Y = BASE_TOP + 1.6;
/** Distance of the screen face in front of the hinge axis, inside the lid. */
const FACE_Z = 1.3;

export interface MacBook {
  group: Group;
  /** Hinge group; its rotation is driven by setOpen. */
  lid: Group;
  setOpen(degrees: number): void;
  /** 0 = display off, 1 = on. */
  setScreen(power: number): void;
  textures: Texture[];
}

export function createMacBook(m: Materials, screen: Texture, tabletSize: { w: number; h: number }, lite = false): MacBook {
  const group = new Group();
  const { width: W, depth: D } = MAC;

  // ---- Base ----
  const baseOutline = roundedRectOutline(W, D, MAC.cornerRadius, 12);
  const base = new Mesh(slab({ outline: baseOutline, thickness: MAC.baseHeight, topRadius: 1.7, bottomRadius: 2.1, segments: 6 }), [
    m.aluminium,
    m.aluminiumDark,
    m.aluminium,
  ]);
  base.rotation.x = -Math.PI / 2;
  base.position.y = MAC.feet + MAC.baseHeight / 2;
  group.add(base);

  // Rubber feet.
  const footGeo = new CylinderGeometry(7.5, 7.5, MAC.feet + 0.4, 24);
  for (const [fx, fz] of [
    [-145, -100],
    [145, -100],
    [-145, 100],
    [145, 100],
  ]) {
    const foot = new Mesh(footGeo, m.rubber);
    foot.position.set(fx, (MAC.feet - 0.4) / 2 + 0.2, fz);
    group.add(foot);
  }

  // ---- Deck ----
  const deck = new Group();
  deck.position.y = BASE_TOP;
  group.add(deck);

  const flat = (outline: ReturnType<typeof roundedRectOutline>, mat: Mesh['material'], y: number) => {
    const mesh = new Mesh(flatShape({ outline, uv: () => [0, 0] }), mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = y;
    deck.add(mesh);
    return mesh;
  };

  // Keyboard well, keys and legends.
  const keyboard = createKeyboard(m.keycap, lite);
  const kbBackZ = -D / 2 + 13;
  const wellW = keyboard.width + 11;
  const wellD = keyboard.depth + 10;
  const well = flat(roundedRectOutline(wellW, wellD, 5, 8), m.blackMatte, 0.03);
  well.position.z = kbBackZ + keyboard.depth / 2;
  keyboard.group.position.set(0, 0.05, kbBackZ);
  deck.add(keyboard.group);

  // Trackpad (a hairline dark frame, then the glass).
  const tpW = 160;
  const tpD = 100;
  const tpZ = D / 2 - 12 - tpD / 2;
  const tpFrame = flat(roundedRectOutline(tpW + 1.4, tpD + 1.4, 6.6, 8), m.blackMatte, 0.03);
  tpFrame.position.z = tpZ;
  const tp = flat(roundedRectOutline(tpW, tpD, 6, 8), m.trackpad, 0.06);
  tp.position.z = tpZ;

  // Hinge vent: the black strip behind the keys, and the hinge barrel.
  const vent = flat(roundedRectOutline(W - 40, 6.5, 3, 6), m.blackMatte, 0.03);
  vent.position.z = -D / 2 + 5.2;
  const barrel = new Mesh(new CylinderGeometry(3.1, 3.1, W - 56, 24), m.hinge);
  barrel.rotation.z = Math.PI / 2;
  barrel.position.set(0, 1.5, -D / 2 + 3.4);
  deck.add(barrel);

  // Speaker grilles on both sides of the keyboard (left out when rendering in software).
  if (!lite) {
    const holeGeo = new CircleGeometry(0.5, 8);
    const cols = 6;
    const rows = 42;
    const grille = new InstancedMesh(holeGeo, m.blackMatte, cols * rows * 2);
    const mm = new Matrix4();
    let gi = 0;
    const gx = wellW / 2 + 5.5;
    for (const side of [-1, 1]) {
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const x = side * (gx + c * 2.1 + (r % 2) * 1.05);
          const z = kbBackZ + 6 + r * 2.35;
          mm.makeRotationX(-Math.PI / 2);
          mm.setPosition(x, 0.06, z);
          grille.setMatrixAt(gi++, mm);
        }
      }
    }
    grille.instanceMatrix.needsUpdate = true;
    deck.add(grille);
  }

  // ---- Lid (upright frame: x right, y up the lid, z out of the screen) ----
  const lid = new Group();
  lid.position.set(0, PIVOT_Y, -D / 2);
  group.add(lid);

  const shellOutline = roundedRectOutline(W, D, MAC.cornerRadius, 12);
  const shellThickness = MAC.lidThickness;
  const shell = new Mesh(slab({ outline: shellOutline, thickness: shellThickness, topRadius: 1.15, bottomRadius: 1.6, segments: 6 }), [
    m.glassBlack,
    m.aluminium,
    m.aluminium,
  ]);
  // Screen face at z = FACE_Z, outer face at FACE_Z - thickness.
  shell.position.set(0, D / 2, FACE_Z - shellThickness / 2);
  lid.add(shell);

  const faceZ = FACE_Z;
  const displayTop = D - 4.6;
  const dispW = MAC.display.w;
  const dispH = MAC.display.h;

  // The editor screenshot, as it is: top-aligned and as wide as the display
  // (the part that does not fit is cut off at the bottom), so its own status
  // bar sits where the macOS menu bar would. Rounded top corners, square bottom.
  const contentOutline = translateOutline(roundedRectOutline(dispW, dispH, [4.2, 4.2, 0, 0], 8), 0, displayTop - dispH / 2);
  const contentMat = new MeshBasicMaterial({ map: screen, toneMapped: false });
  const content = new Mesh(
    flatShape({
      outline: contentOutline,
      uv: coverUV({
        width: dispW,
        height: dispH,
        texW: tabletSize.w,
        texH: tabletSize.h,
        anchorY: 0,
        centerY: displayTop - dispH / 2,
      }),
    }),
    contentMat,
  );
  content.position.z = faceZ + 0.06;
  lid.add(content);

  // The notch: a black tab hanging from the top edge, with the camera in it.
  const { w: nW, h: nH } = MAC.notch;
  const notchOutline = translateOutline(roundedRectOutline(nW, nH, [0, 0, 3.4, 3.4], 8), 0, displayTop - nH / 2);
  const notch = new Mesh(flatShape({ outline: notchOutline, uv: () => [0, 0] }), m.unlit('#000000'));
  notch.position.z = faceZ + 0.1;
  lid.add(notch);
  const cam = new Mesh(new CircleGeometry(1.15, 20), m.lens);
  cam.position.set(0, displayTop - nH / 2 + 0.3, faceZ + 0.14);
  lid.add(cam);

  // Reflection layer over the whole glass.
  const glare = new Mesh(
    flatShape({ outline: translateOutline(roundedRectOutline(W - 2.6, D - 2.6, MAC.cornerRadius - 1.3, 12), 0, D / 2), uv: () => [0, 0] }),
    m.glassReflectionMac,
  );
  glare.position.z = faceZ + 0.2;
  glare.renderOrder = 3;
  lid.add(glare);

  const tint = new Color();
  const setScreen = (power: number) => {
    // Display fades up from black; slightly non-linear so the first moments are dark.
    contentMat.color.copy(tint.setScalar(Math.pow(Math.max(0, Math.min(1, power)), 1.4)));
  };
  setScreen(0);

  const setOpen = (degrees: number) => {
    // Upright frame at 0 rad is a 90 degree opening.
    lid.rotation.x = Math.PI / 2 - (degrees * Math.PI) / 180;
  };
  setOpen(0);

  return { group, lid, setOpen, setScreen, textures: [] };
}
