/**
 * iPhone Air, Space Black, modelled to scale in millimetres.
 *
 *   156.2 × 74.7 × 5.64, polished titanium frame, 6.5" display with rounded
 *   corners and Dynamic Island, and the camera plateau across the top of the
 *   back, which carries the single lens and flash.
 *
 * Frame: portrait, origin at the middle of the bottom edge, +Y up, front
 * (screen) towards +Z. Standing on `y = 0`.
 */
import { CircleGeometry, Color, CylinderGeometry, Group, Mesh, MeshBasicMaterial, TorusGeometry, type Texture } from 'three';
import type { Materials } from './materials';
import { coverUV, flatShape, roundedRectOutline, slab, translateOutline } from './shapes';

export const IPHONE = {
  width: 74.7,
  height: 156.2,
  thickness: 5.64,
  display: { w: 70.6, h: 153.2, r: 10.2 },
  cornerRadius: 12.6,
  plateau: { h: 38, raise: 2.1 },
} as const;

export interface IPhone {
  group: Group;
  /** Crossfade between the Projects screen (0) and the editor (1). */
  setEditor(amount: number): void;
}

export function createIPhone(
  m: Materials,
  editor: Texture,
  projects: Texture,
  sizes: { editor: { w: number; h: number }; projects: { w: number; h: number } },
): IPhone {
  const group = new Group();
  const { width: W, height: H, thickness: T } = IPHONE;
  const front = T / 2;
  const back = -T / 2;

  const body = new Mesh(
    slab({ outline: roundedRectOutline(W, H, IPHONE.cornerRadius, 14, 2.7), thickness: T, topRadius: 1.35, bottomRadius: 1.35, segments: 6 }),
    [m.glassBlack, m.backGlass, m.titanium],
  );
  body.position.set(0, H / 2, 0);
  group.add(body);

  // ---- Screen ----
  const { w: dw, h: dh, r } = IPHONE.display;
  const screenOutline = translateOutline(roundedRectOutline(dw, dh, r, 12, 2.6), 0, H / 2);
  const uvFor = (s: { w: number; h: number }) => coverUV({ width: dw, height: dh, texW: s.w, texH: s.h, anchorY: 0.5, centerY: H / 2 });
  const editorMat = new MeshBasicMaterial({ map: editor, toneMapped: false });
  const editorMesh = new Mesh(flatShape({ outline: screenOutline, uv: uvFor(sizes.editor) }), editorMat);
  editorMesh.position.z = front + 0.05;
  group.add(editorMesh);

  const projectsMat = new MeshBasicMaterial({ map: projects, toneMapped: false, transparent: true, depthWrite: false });
  const projectsMesh = new Mesh(flatShape({ outline: screenOutline, uv: uvFor(sizes.projects) }), projectsMat);
  projectsMesh.position.z = front + 0.08;
  projectsMesh.renderOrder = 1;
  group.add(projectsMesh);

  // Dynamic Island.
  const island = new Mesh(
    flatShape({ outline: translateOutline(roundedRectOutline(20.6, 6.3, 3.15, 8, 2), 0, H / 2 + dh / 2 - 3.2 - 3.15), uv: () => [0, 0] }),
    m.unlit('#000000'),
  );
  island.position.z = front + 0.12;
  group.add(island);

  const glare = new Mesh(
    flatShape({ outline: translateOutline(roundedRectOutline(W - 2.5, H - 2.5, IPHONE.cornerRadius - 1.25, 14, 2.7), 0, H / 2), uv: () => [0, 0] }),
    m.glassReflection,
  );
  glare.position.z = front + 0.2;
  glare.renderOrder = 3;
  group.add(glare);

  // ---- Camera plateau across the top of the back ----
  const { h: ph, raise } = IPHONE.plateau;
  const embed = 1.6;
  const plateauThickness = raise + embed;
  const plateau = new Mesh(
    slab({
      outline: translateOutline(roundedRectOutline(W - 0.04, ph, [IPHONE.cornerRadius - 0.02, IPHONE.cornerRadius - 0.02, 7.5, 7.5], 12, 2.6), 0, H - ph / 2),
      thickness: plateauThickness,
      topRadius: 1.0,
      bottomRadius: 0.2,
      segments: 5,
    }),
    // Group order: +Z face (back glass, outwards), -Z face (inside the body), edge.
    [m.plateauGlass, m.titanium, m.titanium],
  );
  // Slab +Z is the plateau's outer face; flip it to point out of the back.
  const plateauHolder = new Group();
  plateauHolder.rotation.y = Math.PI;
  plateauHolder.position.z = back + embed - plateauThickness / 2;
  plateauHolder.add(plateau);
  group.add(plateauHolder);

  // Lens and flash, in the plateau's own frame (viewed from behind, x mirrored).
  const lensZ = back - raise;
  const lensGroup = new Group();
  lensGroup.rotation.y = Math.PI;
  lensGroup.position.set(0, H - ph / 2, lensZ);
  group.add(lensGroup);
  const lensX = -15.5; // the lens sits on the left when seen from behind
  const ring = new Mesh(new CylinderGeometry(10.8, 10.8, 1.0, 64), m.titanium);
  ring.rotation.x = Math.PI / 2;
  ring.position.set(lensX, 0, 0.45);
  lensGroup.add(ring);
  const well = new Mesh(new CircleGeometry(9.1, 48), m.lens);
  well.position.set(lensX, 0, 1.0);
  lensGroup.add(well);
  // Polished bezel around the glass, and a fine ring between glass and well.
  const bezel = new Mesh(new TorusGeometry(9.5, 0.55, 12, 64), m.titanium);
  bezel.position.set(lensX, 0, 1.0);
  lensGroup.add(bezel);
  const fine = new Mesh(new TorusGeometry(6.35, 0.16, 8, 64), m.titanium);
  fine.position.set(lensX, 0, 1.04);
  lensGroup.add(fine);
  const glass = new Mesh(new CircleGeometry(6.2, 40), m.lensCoat);
  glass.position.set(lensX, 0, 1.03);
  lensGroup.add(glass);
  const core = new Mesh(new CircleGeometry(3.1, 32), m.lens);
  core.position.set(lensX, 0, 1.06);
  lensGroup.add(core);
  const flash = new Mesh(new CircleGeometry(1.7, 24), m.flash);
  flash.position.set(14, 6.5, 0.05);
  lensGroup.add(flash);
  const mic = new Mesh(new CircleGeometry(0.9, 12), m.blackMatte);
  mic.position.set(14, -4.5, 0.05);
  lensGroup.add(mic);

  const tint = new Color();
  const setEditor = (amount: number) => {
    const a = Math.max(0, Math.min(1, amount));
    projectsMat.opacity = 1 - a;
    projectsMesh.visible = a < 0.999;
    void tint;
  };
  setEditor(1);

  return { group, setEditor };
}
