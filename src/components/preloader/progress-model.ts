/**
 * The number shown inside the preloader ring.
 *
 * It follows the real progress from scripts/preload.ts but is shaped for
 * reading: it eases toward its target, never moves backwards (registering more
 * work late lowers the real progress), keeps creeping a little while real work
 * stalls so a slow network still looks alive, cannot outrun the clock during
 * the minimum on-screen time, and only reaches 100 when loading has really
 * settled (or the hard timeout forces it).
 *
 * Pure and DOM-free so it can be exercised in isolation.
 */

export interface ModelConfig {
  /** Minimum time (ms) the count takes from 0 to 100, even when everything is cached. */
  minMs: number;
  /** While real work stalls, the number may run at most this many points ahead of it. */
  headroom?: number;
  /** Creep speed (points per second) at the start of a stall; it slows toward the headroom. */
  creepRate?: number;
}

export interface ModelInput {
  /** Real weighted progress, 0–1. */
  real: number;
  /** All tracked work is done and stayed done for the settle period. */
  settled: boolean;
  /** Milliseconds since the intro started. */
  elapsed: number;
  /** The hard timeout has passed: finish regardless of real progress. */
  forced: boolean;
}

export interface ModelOutput {
  /** Continuous value, 0–100 (drives the ring). */
  value: number;
  /** Integer shown as the label; 100 only once `done`. */
  label: number;
  /** The count has reached 100 for real. */
  done: boolean;
}

export function createProgressModel(config: ModelConfig) {
  const headroom = config.headroom ?? 14;
  const creepRate = config.creepRate ?? 3.2;
  let shown = 0;
  let creep = 0;

  return {
    /** Advance by `dt` seconds. */
    step(dt: number, input: ModelInput): ModelOutput {
      // A frame timestamp can precede the previous reading: time never runs backwards here.
      dt = Math.max(0, dt);
      const real = Math.min(1, Math.max(0, input.real)) * 100;

      // Creep: follows real progress, then drifts ahead of it ever more slowly.
      creep = Math.max(creep, real);
      creep += creepRate * Math.max(0, 1 - (creep - real) / headroom) * dt;
      creep = Math.min(creep, 96);

      const finishing = input.forced || (input.settled && input.elapsed >= config.minMs);
      let target = finishing ? 100 : Math.min(creep, 99);
      // The clock sets the pace in the first moments (and for fully cached loads).
      if (!input.forced) target = Math.min(target, (Math.max(0, input.elapsed) / config.minMs) * 100);

      if (target > shown) {
        const k = input.forced ? 14 : finishing ? 9 : 5.5;
        const eased = (target - shown) * (1 - Math.exp(-k * dt));
        // A floor speed so the last fraction does not crawl.
        const floor = (finishing ? 55 : 6) * dt;
        shown = Math.min(target, shown + Math.max(eased, floor));
      }
      shown = Math.min(100, Math.max(0, shown));

      const done = finishing && shown >= 99.5;
      if (done) shown = 100;
      return { value: shown, label: done ? 100 : Math.min(99, Math.floor(shown)), done };
    },
  };
}
