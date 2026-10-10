/**
 * Frame-time governor. It watches the interval between animation frames while
 * the scene is being drawn (scrolling, and the scrub catching up) and decides:
 *
 *  - `lower`: the interval has stayed above `slowMs` for a whole window of
 *    frames, so the drawing buffer should shrink one step (the scene maps the
 *    steps to pixel ratios: 2, 1.5, 1.25, 1);
 *  - `raise`: it has been comfortably fast for a long stretch, so try one step
 *    up. If that step turns out too slow, it is never tried again (no
 *    flapping between two sizes);
 *  - `unusable`, once: the median of the first frames is so slow (software
 *    rendering on a weak machine) that the page should go back to its 2D rig.
 *
 * It is pure arithmetic on timestamps and allocates nothing after the
 * constructor, so it can run on every frame.
 */

export type Verdict = 'ok' | 'lower' | 'raise' | 'unusable';

export interface GovernorConfig {
  /** Frame interval (ms) above which the resolution is lowered, if it stays there for `window` frames. */
  slowMs: number;
  /** Frames considered (a rolling window; the median is used). */
  window: number;
  /** Median interval (ms) that counts as comfortably fast. 0 turns raising off. */
  fastMs: number;
  /** Fast frames needed before trying a higher resolution. */
  raiseAfter: number;
  /** Number of resolution steps below the first one. */
  steps: number;
  /** Median interval (ms) over the first `netFrames` frames above which the scene is declared unusable. */
  netMs: number;
  /** 0 turns the safety net off. */
  netFrames: number;
}

export const GPU_CONFIG: GovernorConfig = { slowMs: 22, window: 20, fastMs: 18, raiseAfter: 150, steps: 3, netMs: 90, netFrames: 30 };
/** A software renderer cannot reach 60 fps; the aim is only to stay usable. */
export const SOFTWARE_CONFIG: GovernorConfig = { slowMs: 50, window: 20, fastMs: 0, raiseAfter: 0, steps: 3, netMs: 90, netFrames: 30 };

/** Gaps longer than this are not animation (tab in the background, a long task). */
const MAX_GAP = 250;
/** Frames ignored after the drawing buffer changed (it is reallocated and cleared). */
const SETTLE = 3;

export class FrameGovernor {
  /** 0 = the largest drawing buffer; `cfg.steps` = the smallest. */
  level = 0;
  /** The best level that is still allowed (raised after a failed attempt to climb). */
  ceiling = 0;

  private readonly ring: Float32Array;
  private readonly scratch: Float32Array;
  private readonly net: Float32Array;
  private count = 0;
  private head = 0;
  private skip = 0;
  private fastFrames = 0;
  /**
   * The current level was reached by a raise. If it has to be left again,
   * however much later (the scroll reached a heavier part of the scene), it
   * is not tried again: otherwise the light and heavy parts of the sequence
   * would switch the resolution back and forth every few seconds, which
   * shows as the fine detail (key legends, grilles) popping.
   */
  private probing = false;
  private netCount = 0;
  private netOpen: boolean;
  private lastNow = -1;
  private lastDrew = false;

  /** Last values, for the debug overlay and tests. */
  lastMedian = 0;
  netMedian = 0;

  /** Number of steps below level 0 that this screen offers (a small canvas may have fewer). */
  private steps: number;

  constructor(private readonly cfg: GovernorConfig) {
    this.steps = cfg.steps;
    this.ring = new Float32Array(cfg.window);
    this.scratch = new Float32Array(cfg.window);
    this.net = new Float32Array(Math.max(1, cfg.netFrames));
    this.netOpen = cfg.netFrames > 0;
  }

  /** The ladder of drawing-buffer sizes changed length (new canvas size or pixel ratio). */
  setSteps(steps: number): void {
    this.steps = Math.max(0, Math.min(this.cfg.steps, steps));
    this.level = Math.min(this.level, this.steps);
    this.ceiling = Math.min(this.ceiling, this.steps);
  }

  /** Forget the recent frames (the drawing buffer or the layout just changed). */
  reset(): void {
    this.count = 0;
    this.head = 0;
    this.fastFrames = 0;
    this.skip = SETTLE;
  }

  /** Start of a new animated stretch after a pause: the gap before it is not a frame time. */
  rest(): void {
    this.lastDrew = false;
  }

  /**
   * One call per animation frame. `drew` is whether this frame rendered the
   * scene. The interval since the previous frame is only a frame time if the
   * previous frame drew: an idle gap says nothing about the cost of drawing.
   */
  frame(now: number, drew: boolean): Verdict {
    const dt = now - this.lastNow;
    const valid = this.lastDrew && this.lastNow >= 0 && dt > 0 && dt < MAX_GAP;
    this.lastNow = now;
    this.lastDrew = drew;
    if (!valid) return 'ok';
    if (this.skip > 0) {
      this.skip--;
      return 'ok';
    }

    this.ring[this.head] = dt;
    this.head = (this.head + 1) % this.cfg.window;
    if (this.count < this.cfg.window) this.count++;

    if (this.netOpen) {
      this.net[this.netCount++] = dt;
      if (this.netCount >= this.cfg.netFrames) {
        this.netOpen = false;
        this.netMedian = median(this.net.subarray(0, this.netCount), this.net);
        if (this.netMedian > this.cfg.netMs) return 'unusable';
      }
    }

    if (this.count < this.cfg.window) return 'ok';
    this.scratch.set(this.ring);
    const m = (this.lastMedian = median(this.scratch, this.scratch));

    if (m > this.cfg.slowMs && this.level < this.steps) {
      // A step up that was too slow: remember not to try it again.
      if (this.probing) this.ceiling = this.level + 1;
      this.probing = false;
      this.level++;
      this.reset();
      return 'lower';
    }

    if (this.cfg.fastMs > 0 && m <= this.cfg.fastMs && this.level > this.ceiling) {
      if (++this.fastFrames >= this.cfg.raiseAfter) {
        this.level--;
        this.probing = true;
        this.reset();
        return 'raise';
      }
    } else {
      this.fastFrames = 0;
    }
    return 'ok';
  }
}

/** Median of `values`; sorts a copy in `work` (same length or larger) so `values` stays intact. */
function median(values: Float32Array, work: Float32Array): number {
  if (values.length === 0) return 0;
  const w = work === values ? values : work.subarray(0, values.length);
  if (w !== values) w.set(values);
  w.sort();
  const mid = w.length >> 1;
  return w.length % 2 ? w[mid] : (w[mid - 1] + w[mid]) / 2;
}
