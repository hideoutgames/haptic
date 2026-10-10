/**
 * Types and state shared between the scroll script (which must not pull in
 * three.js) and the lazily loaded scene.
 */
import type { ScreenUrls } from './textures-types';

export interface SceneState {
  /** MacBook arrives (rises, closed, at a three-quarter angle). */
  rise: number;
  /** MacBook turns from three-quarter to frontal. */
  turn: number;
  /** Lid opens. */
  open: number;
  /** Display powers on. */
  screen: number;
  /** iPad flies in. */
  ipad: number;
  /** iPhone rises. */
  phone: number;
  /** iPhone turns from its back to its front. */
  flip: number;
  /** iPhone screen: Projects (0) to the editor (1). */
  phoneEditor: number;
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
});

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

export interface SceneOptions {
  canvas: HTMLCanvasElement;
  urls: ScreenUrls;
  /** Progress of the start-up work, 0–1. */
  report?: (progress: number) => void;
  /** The state object the scroll timeline scrubs (shared, so it can exist before the scene does). */
  state?: SceneState;
  /** Debugging: accept a software WebGL renderer (otherwise creating the scene fails on one). */
  allowSoftware?: boolean;
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
  /** Draw now if something changed and the scene is active. Returns whether it drew. */
  renderIfDirty(): boolean;
  /** Debug: render with some state values pinned (null clears). */
  setOverride(values: Partial<SceneState> | null): void;
  /** Re-measure the canvas and refit the camera. */
  resize(): void;
  dispose(): void;
  /** Debugging handle (renderer, camera, models, materials); not part of the API. */
  internals: Record<string, unknown>;
}
