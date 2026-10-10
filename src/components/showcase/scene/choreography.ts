/**
 * The scroll choreography, as pure functions of the scene state: given how far
 * each part of the sequence has progressed (all 0–1, scrubbed and eased by
 * GSAP), place and animate the three devices.
 *
 * The timeline owns the easing, so everything here is linear in the state
 * (a second ease on top would make each move start and stop twice as hard).
 * One idea per beat, and a device never turns about two axes at once: the lean
 * of the iPad and iPhone stays fixed while they yaw, and the MacBook turns
 * while it is shut and opens while it faces front.
 *
 * Final poses come from the layout (side-by-side on desktop, stacked on
 * phones). World units are millimetres; +X right, +Y up, +Z towards the camera.
 *
 * Nothing in here allocates: it runs on every drawn frame.
 */
import type { Group } from 'three';
import type { MacBook } from './macbook';
import type { IPhone } from './iphone';
import type { IPad } from './ipad';
import { LID_OPEN_ANGLE, SCREEN_ON_ANGLE, type SceneState } from './types';

export { finalState, initialState } from './types';
export type { SceneState } from './types';

export interface Pose {
  x: number;
  z: number;
  /** Radians about the vertical axis (+ turns the screen towards +X). */
  yaw: number;
  /** Radians leaning back (top away from the viewer). */
  pitch: number;
  roll?: number;
  /** Size of the device relative to life (1 if omitted). */
  scale?: number;
}

export interface Layout {
  id: 'wide' | 'stacked';
  fov: number;
  /** Camera elevation above the ground plane, radians. */
  elevation: number;
  azimuth: number;
  mac: { x: number; z: number; yaw: number; open: number };
  ipad: Pose;
  phone: Pose;
  /** While the MacBook is shut and turned: how far left it sits (mm), its start yaw and size. */
  entrance: { shiftX: number; yaw: number; scale: number };
  /**
   * The iPad's glide: where it starts relative to its resting place (mm; it
   * starts to the right, a little behind and slightly lifted), how far it
   * bulges towards the camera on the way (the arc), and how far it turns (rad).
   */
  glide: { dx: number; dz: number; lift: number; bulge: number; yaw: number };
  /**
   * Stacked only: the whole group sits this far towards the camera (mm) while
   * the MacBook is alone, so it is centred; it settles back as the others join.
   */
  settleZ: number;
}

const deg = (d: number) => (d * Math.PI) / 180;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp01 = (t: number) => Math.max(0, Math.min(1, t));
const smooth = (a: number, b: number, t: number) => {
  const x = clamp01((t - a) / (b - a));
  return x * x * (3 - 2 * x);
};

export const LAYOUTS: Record<Layout['id'], Layout> = {
  wide: {
    id: 'wide',
    fov: 24,
    elevation: deg(10),
    azimuth: 0,
    mac: { x: 0, z: 0, yaw: deg(0), open: LID_OPEN_ANGLE },
    ipad: { x: -110, z: 205, yaw: deg(5), pitch: deg(10), scale: 0.76 },
    phone: { x: -178, z: 335, yaw: deg(9), pitch: deg(7) },
    entrance: { shiftX: 85, yaw: deg(-38), scale: 1 },
    glide: { dx: 330, dz: -40, lift: 36, bulge: 34, yaw: deg(-18) },
    settleZ: 0,
  },
  stacked: {
    id: 'stacked',
    fov: 24,
    elevation: deg(25),
    azimuth: 0,
    mac: { x: 0, z: -20, yaw: deg(0), open: LID_OPEN_ANGLE },
    ipad: { x: -62, z: 270, yaw: deg(4), pitch: deg(16) },
    phone: { x: 112, z: 360, yaw: deg(-7), pitch: deg(12) },
    entrance: { shiftX: 0, yaw: deg(-27), scale: 0.84 },
    glide: { dx: 385, dz: -40, lift: 36, bulge: 30, yaw: deg(-18) },
    settleZ: 150,
  },
};

export interface Models {
  mac: MacBook;
  ipad: IPad;
  phone: IPhone;
}

/** Where the shadows sit and how strong they are; read back by the scene. */
export interface ShadowSpec {
  x: number;
  z: number;
  yaw: number;
  /** 0–1 */
  strength: number;
  /** Height of the device above the ground (mm), for spread. */
  lift: number;
}

export interface Placement {
  mac: ShadowSpec;
  ipad: ShadowSpec;
  phone: ShadowSpec;
}

/**
 * How far below the floor (mm) the MacBook and the iPhone start. The MacBook
 * mostly arrives with the page scrolling in, so it only lifts a little; the
 * iPhone starts just below the bottom edge of the frame (more would be time
 * spent out of sight).
 */
const MAC_RISE = 60;
const PHONE_RISE = 200;
/** The camera starts this much farther away (fraction of the framed distance) and dollies in. */
export const DOLLY = 0.035;

/** Reused result of applyState (nothing is allocated per frame). */
const placement: Placement = {
  mac: { x: 0, z: 0, yaw: 0, strength: 0, lift: 0 },
  ipad: { x: 0, z: 0, yaw: 0, strength: 0, lift: 0 },
  phone: { x: 0, z: 0, yaw: 0, strength: 0, lift: 0 },
};

/** Upright devices lean about the world X axis: the lean stays put while they yaw. */
function place(g: Group, x: number, y: number, z: number, yaw: number, pitch: number) {
  g.position.set(x, y, z);
  g.rotation.set(-pitch, yaw, 0, 'XYZ');
}

/** Offset of the whole group along Z for the current state (stacked layout). */
export function worldShift(s: SceneState, L: Layout): number {
  return L.settleZ * (1 - Math.max(s.ipad, s.open * 0.25));
}

/** Camera distance relative to the framed one: DOLLY farther at the start, 1 at the end. */
export function dollyFactor(s: SceneState): number {
  return 1 + DOLLY * (1 - clamp01(s.dolly));
}

export function applyState(models: Models, s: SceneState, L: Layout): Placement {
  const { mac, ipad, phone } = models;

  // ---- MacBook: rises shut and turned, turns to face front, then opens ----
  const rise = clamp01(s.rise);
  const turn = clamp01(s.turn);
  const macYaw = lerp(L.entrance.yaw, L.mac.yaw, turn);
  const macY = -(1 - rise) * MAC_RISE;
  mac.group.visible = rise > 0.001;
  // While the lid is shut and the MacBook is turned, it sits a little to the left, so it stays in frame.
  const macX = L.mac.x - (1 - turn) * L.entrance.shiftX;
  mac.group.position.set(macX, macY, L.mac.z);
  mac.group.rotation.set(0, macYaw, 0);
  mac.group.scale.setScalar(lerp(L.entrance.scale, 1, turn));
  const lid = L.mac.open * clamp01(s.open);
  mac.setOpen(lid);
  // The display lights up once the lid is past SCREEN_ON_ANGLE, as the timeline reaches it.
  mac.setScreen(clamp01(s.screen) * clamp01((lid - SCREEN_ON_ANGLE * 0.92) / (SCREEN_ON_ANGLE * 0.08)));

  // ---- iPad: glides in from the right on a shallow arc, turning a few degrees ----
  const e = clamp01(s.ipad);
  ipad.group.visible = e > 0.001;
  {
    const f = L.ipad;
    const g = L.glide;
    const x = f.x + g.dx * (1 - e);
    const z = f.z + g.dz * (1 - e) + g.bulge * Math.sin(Math.PI * e);
    const y = g.lift * (1 - e);
    place(ipad.group, x, y, z, f.yaw + g.yaw * (1 - e), f.pitch);
    ipad.group.scale.setScalar(f.scale ?? 1);
  }

  // ---- iPhone: rises into place with its back to the viewer, then turns to face front ----
  const q = clamp01(s.phone);
  phone.group.visible = q > 0.001;
  {
    const f = L.phone;
    const y = -(1 - q) * PHONE_RISE;
    place(phone.group, f.x, y, f.z, lerp(Math.PI, f.yaw, clamp01(s.flip)), f.pitch);
    phone.setEditor(s.phoneEditor);
  }

  const p = placement;
  p.mac.x = macX;
  p.mac.z = L.mac.z;
  p.mac.yaw = macYaw;
  p.mac.strength = smooth(-MAC_RISE, 0, macY);
  p.mac.lift = Math.max(0, macY);

  p.ipad.x = ipad.group.position.x;
  p.ipad.z = ipad.group.position.z;
  p.ipad.yaw = ipad.group.rotation.y;
  p.ipad.strength = ipad.group.visible ? 1 - smooth(0, 200, ipad.group.position.y) : 0;
  p.ipad.lift = ipad.group.position.y;

  p.phone.x = L.phone.x;
  p.phone.z = L.phone.z;
  p.phone.yaw = phone.group.rotation.y;
  p.phone.strength = phone.group.visible ? smooth(-200, -10, phone.group.position.y) : 0;
  p.phone.lift = Math.max(0, phone.group.position.y);
  return p;
}
