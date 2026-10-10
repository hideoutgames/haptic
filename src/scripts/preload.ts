/**
 * Page preloader registry.
 *
 * Sections hand their start-up work (fonts, hero images, the 3D scene) to
 * `track()`. The intro overlay (Preloader.astro) shows the combined progress
 * and calls `finish()` when everything is done or its timeout expires; then
 * `ready` resolves, `haptic:ready` fires on window and the `is-loading` class
 * is removed from <html>. Work tracked after `finish()` still runs, it just no
 * longer holds the page.
 *
 * Pages without the preloader never get the `is-loading` class (it is set by
 * the inline script in Base.astro only when `preload` is on), so `ready`
 * resolves immediately there.
 *
 * For modules that register work: call `track()` synchronously while your module
 * evaluates (not after an await or a timer). The preloader waits for
 * DOMContentLoaded, by which time every page script has evaluated, and then
 * treats work registered later than ~150 ms after everything else finished as
 * too late to hold the page (it still runs, it just no longer counts).
 */

type Entry = { weight: number; progress: number };

const entries: Entry[] = [];
const listeners = new Set<(progress: number) => void>();
let finished = false;
let resolveReady!: () => void;

/** Resolves once the intro is done and the page is revealed. */
export const ready: Promise<void> = new Promise((resolve) => (resolveReady = resolve));

/** Weighted progress of all tracked work, 0–1. */
export function progress(): number {
  const total = entries.reduce((sum, e) => sum + e.weight, 0);
  return total ? entries.reduce((sum, e) => sum + e.weight * e.progress, 0) / total : 0;
}

/** Number of tracked tasks that have not completed yet. */
export function pending(): number {
  return entries.filter((e) => e.progress < 1).length;
}

function emit(): void {
  const p = progress();
  listeners.forEach((cb) => cb(p));
}

/**
 * Track start-up work. Pass a promise, or a function receiving `report(0–1)`
 * for finer-grained progress. Rejections count as done (the page must not
 * hang on a failed asset); the returned promise still rejects for the caller.
 */
export function track<T>(
  work: Promise<T> | ((report: (p: number) => void) => Promise<T>),
  weight = 1,
): Promise<T> {
  const entry: Entry = { weight, progress: 0 };
  entries.push(entry);
  emit();
  const report = (p: number) => {
    entry.progress = Math.max(entry.progress, Math.min(1, p));
    emit();
  };
  let promise: Promise<T>;
  try {
    promise = typeof work === 'function' ? work(report) : work;
  } catch (error) {
    // A task that throws while starting must not hold the page.
    report(1);
    throw error;
  }
  const done = () => report(1);
  promise.then(done, done);
  return promise;
}

/** Subscribe to progress updates (called immediately with the current value). */
export function onProgress(cb: (progress: number) => void): () => void {
  listeners.add(cb);
  cb(progress());
  return () => listeners.delete(cb);
}

export function isFinished(): boolean {
  return finished;
}

/** Reveal the page. Called by the preloader; safe to call more than once. */
export function finish(): void {
  if (finished) return;
  finished = true;
  document.documentElement.classList.remove('is-loading');
  resolveReady();
  window.dispatchEvent(new Event('haptic:ready'));
}

const html = document.documentElement;
if (!html.classList.contains('is-loading')) {
  finish();
} else {
  // Something other than the preloader lifted the hold (its inline fail-safe, if
  // the preloader script never ran): still release `ready` for everyone waiting.
  const watcher = new MutationObserver(() => {
    if (!html.classList.contains('is-loading')) {
      watcher.disconnect();
      finish();
    }
  });
  watcher.observe(html, { attributes: true, attributeFilter: ['class'] });
}
