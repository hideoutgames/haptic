/**
 * Intro preloader: drives the ring, the number and the reveal.
 *
 * The overlay (Preloader.astro) is shown by CSS while <html> carries
 * `is-loading` (set before first paint by the inline script in Base.astro), and
 * its intro animation is pure CSS, so nothing here has to run for it to play.
 * This module only
 *
 *  - registers the start-up work it knows about with scripts/preload.ts (fonts,
 *    the hero's images, "all page scripts have run"); other modules, such as the
 *    3D showcase, register their own work with `track()` while they evaluate,
 *  - turns the combined progress into the ring and the number (see
 *    progress-model.ts),
 *  - locks scrolling while loading (the CSS locks the page, this stops Lenis),
 *  - and reveals the page: the whole overlay cross-fades to the hero underneath,
 *    whose title is identical to the overlay's wordmark, then `finish()` lets
 *    the hero's own load-in run.
 *
 * The page never hangs: after HARD_MS the count is forced to 100 and the page is
 * revealed whatever is still pending.
 */
import { finish, pending, progress, track } from '../../scripts/preload';
import { getLenis, prefersReducedMotion } from '../../scripts/motion';
import { createProgressModel } from './progress-model';

/** Minimum time the count takes from 0 to 100 (so the intro always reads). */
const MIN_MS = 1100;
const MIN_MS_REDUCED = 450;
/** Everything must stay done this long before it counts (catches late track() calls). */
const SETTLE_MS = 150;
/** The ring stays at 100 this long before the reveal starts. */
const HOLD_MS = 250;
/** Hard timeout: force 100 and reveal. */
const HARD_MS = 9000;
/** Reveal fade (keep in sync with --pre-fade in Preloader.astro). */
const FADE_MS = 900;
const SEEN_KEY = 'haptic:intro-seen';

export function initPreloader(root: HTMLElement): void {
  const html = document.documentElement;
  // Not shown (return visit, bfcache restore, preloader off): drop the markup.
  if (!html.classList.contains('is-loading')) {
    root.remove();
    return;
  }
  root.setAttribute('data-alive', '');

  const reduced = prefersReducedMotion();
  const bar = root.querySelector<HTMLElement>('[role="progressbar"]');
  const arc = root.querySelector<HTMLElement>('[data-arc]');
  const digits = root.querySelector<HTMLElement>('[data-digits]');
  const glow = root.querySelector<HTMLElement>('[data-glow]');
  const main = document.getElementById('main');

  // ---- Page state while loading ---------------------------------------------
  main?.setAttribute('aria-busy', 'true');
  // Everything behind the overlay is out of reach of keyboard and screen readers.
  const inerted = [...document.body.children].filter(
    (el): el is HTMLElement => el instanceof HTMLElement && el !== root && !el.matches('script, style, link') && !el.inert,
  );
  inerted.forEach((el) => (el.inert = true));

  // ---- Wordmark geometry -----------------------------------------------------
  // CSS already places the wordmark with the hero's own formulas; this reads the
  // real hero title so the hand-off stays exact whatever the hero's CSS does.
  const title = document.querySelector<HTMLElement>('[data-hero] .title');
  function measure(): void {
    if (!title) return;
    const box = title.getBoundingClientRect();
    if (!box.width) return;
    const style = root.style;
    // Position the wordmark with the same mechanism as the title: pixel snapping
    // differs between a layout offset and a transform, and the two must agree.
    // (Desktop: `left` = word centre and translateX(-50%); stacked layout: plain left edge.)
    const computed = getComputedStyle(title);
    const centred = computed.translate !== 'none';
    style.setProperty('--wm-x', `${centred ? box.left + box.width / 2 : box.left}px`);
    style.setProperty('--wm-tx', centred ? '-50%' : '0px');
    // The overlay is fixed: place the wordmark where the title sits at scroll 0.
    style.setProperty('--wm-y', `${box.top + window.scrollY}px`);
    style.setProperty('--wm-fs', computed.fontSize);
    // Same box width as the title, so the scaled colour copies land on the same pixels
    // (only meaningful once the display font has loaded).
    if (document.fonts?.check('1em "Block Berthold"', 'HAPTIC')) style.setProperty('--wm-w', `${box.width}px`);
    else style.removeProperty('--wm-w');
  }
  measure();
  let measureFrame = 0;
  const onResize = () => {
    cancelAnimationFrame(measureFrame);
    measureFrame = requestAnimationFrame(measure);
  };
  window.addEventListener('resize', onResize);

  // Once the letters have all risen, the wordmark becomes plain text again: one text
  // run, laid out exactly like the hero title's (separate inline-blocks round their
  // widths up and can end up a fraction of a pixel off).
  let wordmarkSettled = false;
  function settleWordmark(): void {
    if (wordmarkSettled) return;
    wordmarkSettled = true;
    root.querySelectorAll<HTMLElement>('.wm__ink, .wm__ca').forEach((el) => (el.textContent = el.textContent));
  }
  const lastLetter = root.querySelector('.wm__ink .ch:last-child');
  lastLetter?.addEventListener('animationend', settleWordmark, { once: true });

  // ---- Start-up work ----------------------------------------------------------
  trackFonts(measure);
  document.querySelectorAll<HTMLImageElement>('[data-hero] img').forEach((img) => {
    if (img.loading !== 'lazy') track(loadImage(img), 1);
  });
  // Every page script has evaluated (and had its chance to call track()) by DOMContentLoaded.
  track(scriptsReady(), 1);

  // ---- Progress loop -----------------------------------------------------------
  const model = createProgressModel({ minMs: reduced ? MIN_MS_REDUCED : MIN_MS });
  const started = performance.now();
  let forced = false;
  let revealed = false;
  let idleSince = 0;
  let holdSince = 0;
  let last = started;
  let lastAria = -1;
  let lastLabel = -1;
  let frame = 0;

  const hardTimer = window.setTimeout(() => (forced = true), HARD_MS);
  // requestAnimationFrame is paused in background tabs: reveal anyway after a grace period.
  const stallTimer = window.setTimeout(() => reveal(), HARD_MS + 3000);

  function tick(now: number): void {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    // Lenis is created by another script that may run after this one.
    getLenis()?.stop();

    const quiet = progress() >= 0.999 && pending() === 0;
    if (!quiet) idleSince = 0;
    else if (!idleSince) idleSince = now;

    // The count starts with the CSS intro (the inline script stamps data-t0).
    const t0 = Number(root.dataset.t0);
    const elapsed = Number.isFinite(t0) && t0 > 0 ? now - t0 : 0;

    const out = model.step(dt, {
      real: progress(),
      settled: idleSince > 0 && now - idleSince >= SETTLE_MS,
      elapsed,
      forced,
    });
    render(out.value, out.label);

    if (out.done) {
      holdSince ||= now;
      if (now - holdSince >= (forced ? 120 : HOLD_MS)) return reveal();
    }
    frame = requestAnimationFrame(tick);
  }

  function render(value: number, label: number): void {
    const p = value / 100;
    arc?.style.setProperty('--p', p.toFixed(4));
    if (glow) glow.style.opacity = String(0.3 + 0.7 * p);
    if (digits && label !== lastLabel) {
      digits.textContent = String(label);
      lastLabel = label;
    }
    // Screen readers get coarse updates only.
    const coarse = label >= 100 ? 100 : Math.floor(label / 10) * 10;
    if (bar && coarse !== lastAria) {
      bar.setAttribute('aria-valuenow', String(coarse));
      lastAria = coarse;
    }
  }

  // ---- Reveal --------------------------------------------------------------------
  function reveal(): void {
    if (revealed) return;
    revealed = true;
    cancelAnimationFrame(frame);
    cancelAnimationFrame(measureFrame);
    clearTimeout(hardTimer);
    clearTimeout(stallTimer);
    window.removeEventListener('resize', onResize);

    settleWordmark();
    render(100, 100);
    try {
      sessionStorage.setItem(SEEN_KEY, '1');
    } catch {
      /* private mode: the intro simply plays again next time */
    }
    inerted.forEach((el) => (el.inert = false));
    main?.removeAttribute('aria-busy');

    // The overlay stays up (fading) after `is-loading` goes away, so mark it first.
    root.classList.add('is-revealing');
    // Loaded scrolled (reload, back/forward, #anchor): the wordmark is not over the
    // hero title, so it fades out quickly instead of lingering over other content.
    if (window.scrollY > 1) root.classList.add('is-detached');
    // Scrolling unlocks, `ready` resolves, `haptic:ready` fires and the hero's load-in starts.
    finish();
    getLenis()?.start();
    // Unlocking can change the page's width (a scrollbar appearing where the
    // browser does not support scrollbar-gutter): keep the wordmark on the title.
    measure();

    window.setTimeout(() => root.remove(), reduced ? 400 : FADE_MS + 250);
  }

  frame = requestAnimationFrame(tick);
}

/** Display fonts and the UI font used by the number. */
function trackFonts(onLoaded: () => void): void {
  track(async (report) => {
    const fonts = document.fonts;
    if (!fonts?.load) return;
    let done = 0;
    const step = () => report(++done / 4);
    await Promise.all([
      fonts.load('172px "Block Berthold"', 'HAPTIC'),
      fonts.load('32px "Haptic Serif"', 'Hideout Presents'),
      fonts.load('500 16px "Onest Variable"', '0123456789%'),
    ].map((load) => load.then(step, step)));
    await fonts.ready;
    onLoaded();
  }, 1);
}

/** Resolves when the image is loaded and decoded (errors count as done). */
function loadImage(img: HTMLImageElement) {
  return async (report: (p: number) => void): Promise<void> => {
    if (!img.complete) {
      await new Promise<void>((resolve) => {
        img.addEventListener('load', () => resolve(), { once: true });
        img.addEventListener('error', () => resolve(), { once: true });
      });
    }
    report(0.7);
    await img.decode().catch(() => {});
  };
}

function scriptsReady(): Promise<void> {
  if (document.readyState === 'complete') return Promise.resolve();
  return new Promise((resolve) => {
    document.addEventListener('DOMContentLoaded', () => resolve(), { once: true });
    window.addEventListener('load', () => resolve(), { once: true });
  });
}
