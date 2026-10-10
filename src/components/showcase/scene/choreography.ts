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
}

export interface Layout {
  id: 'wide' | 'stacked';
  fov: number;
  /** Camera elevation above the ground plane, radians. */
  elevation: number;
  azimuth: number;
  /**
   * Where the camera looks (mm), if it should not follow the middle of the
   * devices: the MacBook, the anchor, then looks the same wherever the iPad
   * and iPhone stand. (Desktop: the middle of the composition the MacBook's
   * framing was tuned with.)
   */
  focus?: { x: number; y: number; z: number };
  mac: { x: number; z: number; yaw: number; open: number };
  ipad: Pose;
  phone: Pose;
  /** While the MacBook is shut and turned: how far left it sits (mm), its start yaw and size. */
  entrance: { shiftX: number; yaw: number; scale: number };
  /**
   * How the iPad arrives: it slides in on its stand along the ground, from the
   * left of the picture (so it never crosses the MacBook), and settles. It
   * starts `dx` (mm) left of its resting place, though the scene replaces that
   * with the distance that starts it just outside the canvas, which depends on
   * the screen; `dz` (mm) nearer the viewer, so it is pushed back into place;
   * and turned `yaw` (rad) further towards the way it is going than at rest,
   * so it turns to face the front as it settles.
   */
  arrival: { dx: number; dz: number; yaw: number };
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
    focus: { x: -18, y: 126, z: 77 },
    mac: { x: 0, z: 0, yaw: deg(0), open: LID_OPEN_ANGLE },
    // The iPad stands in the open lower left, to the left of the MacBook and in
    // front of it, turned a little in towards it. A true-size iPad standing
    // upright there would reach up into the copy, so it leans back on its
    // stand, and it stands far enough forward (lower on screen) that its top
    // edge stays well below the copy. The iPhone stands in front of the
    // MacBook's left edge, beside it, covering only a corner of the display.
    ipad: { x: -328, z: 238, yaw: deg(5), pitch: deg(54) },
    phone: { x: -124, z: 340, yaw: deg(4), pitch: deg(6) },
    entrance: { shiftX: 85, yaw: deg(-38), scale: 1 },
    arrival: { dx: 420, dz: 60, yaw: deg(17) },
    settleZ: 0,
  },
  stacked: {
    id: 'stacked',
    fov: 24,
    elevation: deg(25),
    azimuth: 0,
    mac: { x: 0, z: -20, yaw: deg(0), open: LID_OPEN_ANGLE },
    // In front of the MacBook's keyboard, below its display (a strip of the
    // keyboard still shows above it), leaning back on its stand.
    ipad: { x: -62, z: 310, yaw: deg(4), pitch: deg(46) },
    phone: { x: 112, z: 360, yaw: deg(-7), pitch: deg(12) },
    entrance: { shiftX: 0, yaw: deg(-27), scale: 0.84 },
    arrival: { dx: 340, dz: 40, yaw: deg(17) },
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
/**
 * The iPad's shadows fade in over this first part of its slide: their soft
 * edges reach a little past it, and would otherwise show at the edge of the
 * canvas a moment before the iPad does.
 */
const IPAD_SHADOW_IN = 0.1;
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

/**
 * A device standing on its stand leans about its own X axis and turns about the
 * world's vertical (not about its tilted one), so its bottom edge stays level
 * on the ground and the stand turns with it.
 */
function placeStanding(g: Group, x: number, y: number, z: number, yaw: number, pitch: number) {
  g.position.set(x, y, z);
  g.rotation.set(-pitch, yaw, 0, 'YXZ');
}

/** Offset of the whole group along Z for the current state (stacked layout). */
export function worldShift(s: SceneState, L: Layout): number {
  return L.settleZ * (1 - Math.max(s.ipad, s.open * 0.25));
}

/** Camera distance relative to the framed one: DOLLY farther at the start, 1 at the end. */
export function dollyFactor(s: SceneState): number {
  return 1 + DOLLY * (1 - clamp01(s.dolly));
}

/**
 * `arrivalDx` is how far left of its resting place the iPad starts (mm): the
 * scene passes the distance that starts it just outside the canvas.
 */
export function applyState(models: Models, s: SceneState, L: Layout, arrivalDx: number = L.arrival.dx): Placement {
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

  // ---- iPad: slides in on its stand along the ground from the left, turning to face the front ----
  const e = clamp01(s.ipad);
  const away = 1 - e;
  ipad.group.visible = e > 0.001;
  ipad.setLean(L.ipad.pitch);
  placeStanding(
    ipad.group,
    L.ipad.x - arrivalDx * away,
    ipad.restHeight,
    L.ipad.z + L.arrival.dz * away,
    L.ipad.yaw + L.arrival.yaw * away,
    L.ipad.pitch,
  );

  // ---- iPhone: rises into place with its back to the viewer, then turns to face front ----
  const q = clamp01(s.phone);
  phone.group.visible = q > 0.001;
  {
    const f = L.phone;
    const y = -(1 - q) * PHONE_RISE;
    place(phone.group, f.x, y, f.z, lerp(Math.PI, f.yaw, clamp01(s.flip)), f.pitch);
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
  p.ipad.strength = ipad.group.visible ? clamp01(e / IPAD_SHADOW_IN) : 0;
  p.ipad.lift = 0;

  p.phone.x = L.phone.x;
  p.phone.z = L.phone.z;
  p.phone.yaw = phone.group.rotation.y;
  p.phone.strength = phone.group.visible ? smooth(-200, -10, phone.group.position.y) : 0;
  p.phone.lift = Math.max(0, phone.group.position.y);
  return p;
}
