/**
 * The scroll choreography, as pure functions of the scene state: given how far
 * each part of the sequence has progressed (all 0–1, scrubbed by GSAP), place
 * and animate the three devices.
 *
 * Final poses come from the layout (side-by-side on desktop, stacked on
 * phones). World units are millimetres; +X right, +Y up, +Z towards the camera.
 */
import type { Group } from 'three';
import type { MacBook } from './macbook';
import type { IPhone } from './iphone';
import type { IPad } from './ipad';
import type { SceneState } from './types';

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
    mac: { x: 0, z: 0, yaw: deg(0), open: 105 },
    ipad: { x: -110, z: 205, yaw: deg(5), pitch: deg(10), scale: 0.76 },
    phone: { x: -178, z: 335, yaw: deg(9), pitch: deg(7) },
    entrance: { shiftX: 85, yaw: deg(-38), scale: 1 },
    settleZ: 0,
  },
  stacked: {
    id: 'stacked',
    fov: 24,
    elevation: deg(25),
    azimuth: 0,
    mac: { x: 0, z: -20, yaw: deg(0), open: 105 },
    ipad: { x: -62, z: 270, yaw: deg(4), pitch: deg(16) },
    phone: { x: 112, z: 360, yaw: deg(-7), pitch: deg(12) },
    entrance: { shiftX: 0, yaw: deg(-27), scale: 0.84 },
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

const MAC_RISE = 190;
/** How far to the right of its resting place (mm) the iPad starts its flight. */
const IPAD_REACH = 330;

function place(g: Group, x: number, y: number, z: number, yaw: number, pitch: number, roll = 0) {
  g.position.set(x, y, z);
  g.rotation.set(-pitch, yaw, roll, 'YXZ');
}

/** Offset of the whole group along Z for the current state (stacked layout). */
export function worldShift(s: SceneState, L: Layout): number {
  return L.settleZ * (1 - smooth(0, 1, Math.max(s.ipad, s.open * 0.25)));
}

export function applyState(models: Models, s: SceneState, L: Layout): Placement {
  const { mac, ipad, phone } = models;

  // ---- MacBook ----
  const macYaw = lerp(L.entrance.yaw, L.mac.yaw, s.turn);
  const macY = -(1 - s.rise) * MAC_RISE;
  mac.group.visible = s.rise > 0.001;
  // While the lid is shut and the MacBook is turned, it sits a little to the left, so it stays in frame.
  const macX = L.mac.x - (1 - s.turn) * L.entrance.shiftX;
  place(mac.group, macX, macY, L.mac.z, macYaw, (1 - s.rise) * deg(8));
  mac.group.scale.setScalar(lerp(L.entrance.scale, 1, smooth(0, 1, s.turn)));
  mac.setOpen(L.mac.open * s.open);
  mac.setScreen(smooth(0.15, 0.95, s.screen) * smooth(0.0, 0.35, s.open));

  // ---- iPad: arrives from the right and behind, sweeping round to settle in front ----
  const p = s.ipad;
  ipad.group.visible = p > 0.001;
  {
    const f = L.ipad;
    const t = clamp01(p);
    // The depth leads the sideways travel, so it clears the MacBook's base.
    // The timeline already eases `t`, so the sideways travel is linear in it: the
    // iPad is in frame soon after it starts to move, as the copy changes.
    const x = lerp(f.x + IPAD_REACH, f.x, t);
    const z = lerp(-240, f.z, 1 - Math.pow(1 - t, 3));
    const y = lerp(80, 0, smooth(0, 1, t)) + 55 * Math.sin(Math.PI * Math.min(1, t * 1.15));
    const yaw = lerp(deg(-64), f.yaw, smooth(0, 1, t));
    const pitch = lerp(deg(24), f.pitch, smooth(0, 1, t));
    const roll = lerp(deg(-10), 0, smooth(0, 1, t));
    place(ipad.group, x, y, z, yaw, pitch, roll);
    ipad.group.scale.setScalar(f.scale ?? 1);
  }

  // ---- iPhone: rises in front, turning from its back to its front ----
  const q = s.phone;
  phone.group.visible = q > 0.001;
  {
    const f = L.phone;
    const y = -(1 - clamp01(q)) * 260;
    const yaw = lerp(deg(180), f.yaw, clamp01(s.flip));
    const pitch = lerp(deg(-6), f.pitch, smooth(0.3, 1, s.flip));
    place(phone.group, f.x, y, f.z, yaw, pitch);
    phone.setEditor(s.phoneEditor);
  }

  return {
    mac: { x: macX, z: L.mac.z, yaw: macYaw, strength: smooth(-MAC_RISE, 0, macY), lift: Math.max(0, macY) },
    ipad: {
      x: ipad.group.position.x,
      z: ipad.group.position.z,
      yaw: ipad.group.rotation.y,
      strength: ipad.group.visible ? 1 - smooth(0, 200, ipad.group.position.y) : 0,
      lift: ipad.group.position.y,
    },
    phone: {
      x: L.phone.x,
      z: L.phone.z,
      yaw: phone.group.rotation.y,
      strength: phone.group.visible ? smooth(-200, -10, phone.group.position.y) : 0,
      lift: Math.max(0, phone.group.position.y),
    },
  };
}
