/**
 * The scroll choreography, as pure functions of the scene state: given how far
 * each part of the sequence has progressed (all 0–1, scrubbed and eased by
 * GSAP), place and animate the three devices.
 *
 * The timeline owns the easing, so everything here is linear in the state
 * (a second ease on top would make each move start and stop twice as hard).
 * Each device makes one gesture in which travel and turn happen together:
 * the iPad turns to face the front while it slides in, the iPhone turns from
 * its back to its front while it rises (both follow a single state value, so
 * they cannot drift apart), and the MacBook turns while it rises, its lid
 * starting to open as the turn settles. The lean of the iPad and iPhone stays
 * fixed while they yaw.
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
  /** As the MacBook arrives (shut and turned): how far left it sits (mm), its start yaw and size. */
  entrance: { shiftX: number; yaw: number; scale: number };
  /**
   * How the iPad arrives: it slides in on its stand along the ground, from the
   * left of the picture (so it never crosses the MacBook), and turns to face
   * the front as it goes, travel and turn as one move. It starts turned `yaw`
   * (rad) further than at rest, its screen towards the way it is going, so it
   * comes into view side-on, its screen seen at a glancing angle, and opens up
   * towards the viewer as it slides into place. How far left of its resting
   * place it starts depends on the screen: the scene fits the distance that
   * starts it just outside the canvas (`Starts`), and `dx` (mm) is only where
   * that search starts. It starts `dz` (mm) nearer the viewer, so it is
   * pushed back into place.
   */
  arrival: { dx: number; dz: number; yaw: number };
  /**
   * Stacked only: the whole group sits this far towards the camera (mm) while
   * the MacBook is alone, so it is centred; it settles back as the others
   * join (`worldShift`).
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
    arrival: { dx: 300, dz: 60, yaw: deg(105) },
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
    arrival: { dx: 260, dz: 40, yaw: deg(105) },
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
 * Where the iPad and the iPhone start their entrances (mm). Each starts just
 * out of sight, so that it comes into view at the very start of its beat,
 * neither popping in partly on screen (too short a way in) nor spending the
 * first part of its beat out of sight (too long a one). Where that is depends
 * on the shape of the screen, so the scene fits both to the canvas
 * (`fitStarts` in index.ts); the layout gives only where those searches start.
 */
export interface Starts {
  /** How far left of its resting place the iPad starts its slide. */
  ipadDx: number;
  /** How far below the ground the iPhone starts its rise. */
  phoneDrop: number;
}

/**
 * How far below the floor (mm) the MacBook starts. It mostly arrives with the
 * page scrolling in, so it only lifts a little (the last of it after the pin
 * has stopped the page, so it glides to rest).
 */
const MAC_RISE = 60;
/** Where the search for the iPhone's start (`Starts.phoneDrop`) begins (mm below the ground). */
export const PHONE_DROP = 200;
/**
 * The iPhone's contact shadow fades in over the last this many mm of its rise,
 * or over all of it if it starts nearer: the shadow lies in view, where the
 * iPhone comes to rest, while the iPhone itself is still out of sight.
 */
const PHONE_SHADOW_IN = 200;
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

/**
 * Offset of the whole group along Z for the current state (stacked layout).
 * It has a state value of its own, so the timeline can ease it as one slow
 * drift from the lid opening to the iPad's arrival (tied to the iPad's own
 * value, the MacBook would set off with the iPad's entrance speed).
 */
export function worldShift(s: SceneState, L: Layout): number {
  return L.settleZ * (1 - clamp01(s.settle));
}

/** Camera distance relative to the framed one: DOLLY farther at the start, 1 at the end. */
export function dollyFactor(s: SceneState): number {
  return 1 + DOLLY * (1 - clamp01(s.dolly));
}

/** `starts`: where the iPad and the iPhone start on this canvas (the scene fits them). */
export function applyState(models: Models, s: SceneState, L: Layout, starts: Starts): Placement {
  const { mac, ipad, phone } = models;

  // ---- MacBook: rises and turns to face front at once; the lid opens as the turn settles ----
  const rise = clamp01(s.rise);
  const turn = clamp01(s.turn);
  const macYaw = lerp(L.entrance.yaw, L.mac.yaw, turn);
  const macY = -(1 - rise) * MAC_RISE;
  mac.group.visible = rise > 0.001;
  // While it is turned, it sits a little to the left, so it stays in frame.
  const macX = L.mac.x - (1 - turn) * L.entrance.shiftX;
  mac.group.position.set(macX, macY, L.mac.z);
  mac.group.rotation.set(0, macYaw, 0);
  mac.group.scale.setScalar(lerp(L.entrance.scale, 1, turn));
  const lid = L.mac.open * clamp01(s.open);
  mac.setOpen(lid);
  // The display lights up once the lid is past SCREEN_ON_ANGLE, as the timeline reaches it.
  mac.setScreen(clamp01(s.screen) * clamp01((lid - SCREEN_ON_ANGLE * 0.92) / (SCREEN_ON_ANGLE * 0.08)));

  // ---- iPad: slides in on its stand along the ground from the left, turning to face the front as it goes ----
  const e = clamp01(s.ipad);
  const away = 1 - e;
  ipad.group.visible = e > 0.001;
  ipad.setLean(L.ipad.pitch);
  placeStanding(
    ipad.group,
    L.ipad.x - starts.ipadDx * away,
    ipad.restHeight,
    L.ipad.z + L.arrival.dz * away,
    L.ipad.yaw + L.arrival.yaw * away,
    L.ipad.pitch,
  );

  // ---- iPhone: rises into place from just below the frame, turning from its back to its front as it rises ----
  const q = clamp01(s.phone);
  phone.group.visible = q > 0.001;
  const phoneY = -(1 - q) * starts.phoneDrop;
  place(phone.group, L.phone.x, phoneY, L.phone.z, lerp(Math.PI, L.phone.yaw, q), L.phone.pitch);

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
  p.phone.strength = phone.group.visible ? smooth(-Math.min(starts.phoneDrop, PHONE_SHADOW_IN), -10, phoneY) : 0;
  p.phone.lift = Math.max(0, phoneY);
  return p;
}
