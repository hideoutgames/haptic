/**
 * Types and state shared between the scroll script (which must not pull in
 * three.js) and the lazily loaded scene.
 */
import type { ScreenUrls } from './textures-types';

/** How far the MacBook lid opens (degrees), and the angle past which its display starts to light up. */
export const LID_OPEN_ANGLE = 105;
export const SCREEN_ON_ANGLE = 70;

/**
 * Every field runs 0 to 1 and is scrubbed by the scroll timeline, which also
 * does the easing: the scene maps these values to poses linearly, so a
 * motion looks like the curve the timeline gave it.
 */
export interface SceneState {
  /** MacBook arrives: rises, closed, from below the frame. */
  rise: number;
  /** MacBook turns from three-quarter to frontal (closed). */
  turn: number;
  /** Lid opens. */
  open: number;
  /** Display powers on. */
  screen: number;
  /** iPad glides in. */
  ipad: number;
  /** iPhone rises. */
  phone: number;
  /** iPhone turns from its back to its front. */
  flip: number;
  /** iPhone screen: Projects (0) to the editor (1). */
  phoneEditor: number;
  /** Camera: a very slow dolly-in over the whole sequence (1 = the framed distance). */
  dolly: number;
}

export const initialState = (): SceneState => ({
  rise: 0,
  turn: 0,
  open: 0,
  screen: 0,
  ipad: 0,
  phone: 0,
  flip: 0,
  phoneEditor: 0,
  dolly: 0,
});

export const finalState = (): SceneState => ({
  rise: 1,
  turn: 1,
  open: 1,
  screen: 1,
  ipad: 1,
  phone: 1,
  flip: 1,
  phoneEditor: 1,
  dolly: 1,
});

/** The fields of SceneState, in a fixed order (change detection without allocating). */
export const STATE_KEYS = Object.keys(initialState()) as Array<keyof SceneState>;

export interface Area {
  left: number;
  right: number;
  top: number;
  bottom: number;
  /** Horizontal alignment of the composition inside the area. */
  alignX: 'right' | 'center';
  /**
   * If set, the composition's ground point is placed on this y (px) and the
   * area's top/bottom limit the space above and below it. Otherwise the
   * composition is centred vertically in the area.
   */
  groundY?: number;
}

export type { ScreenUrls };

/** `auto` picks `lite` on a software renderer and `high` everywhere else. */
export type Quality = 'auto' | 'high' | 'lite';

export interface SceneOptions {
  canvas: HTMLCanvasElement;
  urls: ScreenUrls;
  /** Progress of the start-up work, 0–1. */
  report?: (progress: number) => void;
  /** The state object the scroll timeline scrubs (shared, so it can exist before the scene does). */
  state?: SceneState;
  /**
   * The GPU is a software renderer (SwiftShader, llvmpipe, WARP …): start with
   * the cheap settings. Decided by the page, which probes the GPU first.
   */
  software?: boolean;
  /** Debugging: force a quality tier whatever the GPU is. */
  quality?: Quality;
  /**
   * Safety net: if the first animated frames turn out too slow to be usable,
   * the scene calls `onUnusable` once (the page then drops back to the 2D
   * rig). Off for debugging (`?force3d`).
   */
  safetyNet?: boolean;
  onUnusable?: (reason: string) => void;
  /** CSS size of the canvas and where the finished composition should land in it. */
  measure: () => { width: number; height: number; stacked: boolean; area: Area };
  onContextLost?: () => void;
  onContextRestored?: () => void;
}

export interface ShowcaseScene {
  state: SceneState;
  /** Mark the scene as changed; it is drawn on the next `renderIfDirty`. */
  invalidate(): void;
  /** Only an active scene draws (off-screen sections stay idle). */
  setActive(active: boolean): void;
  /**
   * Called once per animation frame: draws if the scrubbed state (or the size)
   * changed and the scene is active, and feeds the frame-time governor.
   * Returns whether it drew.
   */
  renderIfDirty(now?: number): boolean;
  /** Debug: render with some state values pinned (null clears). */
  setOverride(values: Partial<SceneState> | null): void;
  /** Re-measure the canvas and refit the camera. */
  resize(): void;
  dispose(): void;
  /** Debugging handle (renderer, camera, models, materials); not part of the API. */
  internals: Record<string, unknown>;
}
