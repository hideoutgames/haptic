/**
 * Scroll sequence for the device showcase: a slow, calm product film, one idea
 * per beat, each followed by a hold in which nothing moves while the copy is
 * read. In units of screen heights of scroll (the table under `T`):
 *
 *   before the pin  the MacBook arrives with the scrolling page, shut, and
 *                    turns gently from three-quarter view to face front
 *   0.05 – 1.05      the lid opens; the display lights once it is past 70 degrees
 *   1.22 – 1.45      hold: "Mac"
 *   1.45 – 2.25      the iPad glides in from the right on a shallow arc
 *   2.25 – 2.50      hold: "iPad"
 *   2.50 – 3.00      the iPhone rises into place, back to the viewer
 *   2.85 – 3.95      it turns slowly to face front, showing Projects
 *   3.80 – 4.20      Projects cross-fades to the editor
 *   4.20 – 4.50      final hold, then the pin releases
 *
 * Everything is eased with sine / power2 in-outs (no overshoot), scrubbed with
 * a long catch-up, and played in reverse when scrolling back. The camera
 * dollies in a few per cent over the whole pin.
 *
 * Two renderers share one timeline. The default is the 2D rig of the page (the
 * device-frame pictures, moved with xPercent/yPercent so the same timeline
 * serves every layout). When WebGL2 is available, the 3D scene
 * (components/showcase/scene, loaded lazily) replaces it: the same timeline
 * scrubs the scene's state object, and the 2D rig stays in the page, hidden,
 * as the fallback if the context is lost or the scene turns out too slow to
 * use (a software renderer on a weak machine). Without JS, with reduced
 * motion, or if the scene fails to start, the 2D composition stays. (The
 * stacked layout also lifts the 2D group as the devices join, to keep it
 * centred under the copy; the CSS says by how much.)
 *
 * There is a single matchMedia context on purpose. Reverting and rebuilding
 * the pin when the layout changes (rotation, resize, zoom) would reset the
 * scroll position to the top, so the layout-dependent pin length is read on
 * every refresh instead.
 *
 * Query flags for testing: `?no3d` keeps the 2D rig, `?force3d` never gives
 * up on the 3D scene (no safety net), `?quality=high|lite` forces a quality
 * tier, `?debug3d` exposes the scene as window.__haptic3d.
 */
import { probeGPU } from '../components/showcase/gpu';
import { STACKED_QUERY } from '../components/showcase/layout';
import {
  initialState,
  LID_OPEN_ANGLE,
  SCREEN_ON_ANGLE,
  type Quality,
  type SceneState,
  type ShowcaseScene,
} from '../components/showcase/scene/types';
import { getLenis, gsap, initSmoothScroll, ScrollTrigger } from './motion';
import { track } from './preload';

/** Pin length as a multiple of the screen height. */
const PIN_SCREENS = { side: 4.5, stacked: 3.95 };

/**
 * The pinned timeline, in units of the side layout's pin length divided by its
 * screen height (1 unit = one screen of scroll there; the stacked layout is
 * the same film, a little shorter). Labels double as the step thresholds.
 */
const T = {
  /** The lid opens slowly, the display lights as it passes SCREEN_ON_ANGLE. */
  open: 0.05,
  openDur: 1.0,
  screenDur: 0.5,
  /** The iPad glides in. */
  ipad: 1.45,
  ipadDur: 0.8,
  /** The iPhone rises, then turns from its back to its front. */
  phone: 2.5,
  phoneDur: 0.5,
  flip: 2.85,
  flipDur: 1.1,
  /** Projects cross-fades to the editor, starting in the tail of the turn. */
  editor: 3.8,
  editorDur: 0.4,
  /** End of the pin: everything is held from the last move to here. */
  end: 4.5,
};

/** How long a line of copy takes to fade out (and, after it, in). */
const COPY_FADE = 0.4;

/**
 * The copy and the indicator change when the next device is well on its way,
 * not before: the old line is gone by the time `copySwap` says (the device is
 * about 60 per cent in place, and on screen), then the new line fades in.
 */
const copySwap = {
  ipad: T.ipad + T.ipadDur * 0.57,
  phone: T.phone + T.phoneDur * 0.8,
};

/** Where the lid is at SCREEN_ON_ANGLE on a sine.inOut ease: the display lights up from here. */
const lidAtScreenOn = Math.acos(1 - (2 * SCREEN_ON_ANGLE) / LID_OPEN_ANGLE) / Math.PI;

/** The scene's drawing buffer may be asked about only in these query forms. */
const query = new URLSearchParams(location.search);
const qualityParam = (): Quality => {
  const q = query.get('quality');
  return q === 'high' || q === 'lite' ? q : 'auto';
};

/** How long the scene may take to start before the 2D rig is kept. */
const SCENE_TIMEOUT = 20000;

export function initShowcase(root: HTMLElement): void {
  const pick = <E extends HTMLElement>(selector: string) => root.querySelector<E>(selector);
  const stage = pick('[data-stage]');
  const group = pick('[data-group]');
  const mac = pick('[data-device="mac"]');
  const ipad = pick('[data-device="ipad"]');
  const iphone = pick('[data-device="iphone"]');
  const projects = pick('[data-intro]');
  const fill = pick('[data-progress]');
  const rig = pick('.rig');
  const copy = gsap.utils.toArray<HTMLElement>('[data-copy]', root);
  if (!stage || !group || !mac || !ipad || !iphone || !fill || copy.length < 3) return;

  const mm = gsap.matchMedia();

  mm.add('(prefers-reduced-motion: no-preference)', () => {
    const scrollY = window.scrollY;
    root.dataset.mode = 'pinned';
    root.dataset.step = '1';
    // Tells the inline script in the section that the sequence is running.
    root.dataset.ready = '1';

    // Looked up per run: a torn-down scene leaves its canvas with a lost
    // context, so teardown swaps in a fresh one (see the cleanup below).
    const canvas = pick<HTMLCanvasElement>('[data-scene-canvas]');

    // The 3D scene (if it starts) is driven by this state object.
    const S: SceneState = initialState();
    let scene: ShowcaseScene | null = null;
    let cancelled = false;
    const cleanups: Array<() => void> = [];

    // Copy that is not the current step waits below its slot.
    gsap.set(copy.slice(1), { opacity: 0, yPercent: 20 });

    // 1. Before the pin, as the section scrolls into view: the MacBook rises
    // (shut, three-quarter view) and turns to face front. Ends as the pin starts.
    const enter = gsap.timeline({
      defaults: { ease: 'sine.inOut' },
      scrollTrigger: { trigger: root, start: 'top 45%', end: 'top top', scrub: 1.3 },
    });
    enter.fromTo(
      mac,
      { opacity: 0, yPercent: 16, scale: 0.92, rotationX: 14, transformPerspective: 1800, transformOrigin: '50% 100%' },
      { opacity: 1, yPercent: 0, scale: 1, rotationX: 0, duration: 1 },
      0,
    );
    enter.fromTo(S, { rise: 0 }, { rise: 1, duration: 1 }, 0);
    enter.fromTo(S, { turn: 0 }, { turn: 1, duration: 1 }, 0);

    // 2. Pinned: the lid opens, the iPad glides in, the iPhone rises and turns.
    //
    // The default pin switches the stage to position: fixed, which Chromium
    // reports as a layout shift of about 1 each time the pin starts and ends
    // (nothing moves, but it counts against the page's field CLS). Where Lenis
    // drives the scroll, from the main thread in the same frame, the pin is a
    // transform instead. Touch devices scroll natively, off the main thread,
    // and would see a transform-pinned stage lag behind: they keep the default.
    // This script runs before the layout's own, so Lenis may not exist yet:
    // initSmoothScroll is idempotent, and asking for it here settles the question.
    const smoothScrolled = !!(getLenis() ?? initSmoothScroll()) && !matchMedia('(any-pointer: coarse)').matches;
    const tl = gsap.timeline({
      defaults: { ease: 'sine.inOut' },
      scrollTrigger: {
        trigger: root,
        start: 'top top',
        end: () => {
          const screens = matchMedia(STACKED_QUERY).matches ? PIN_SCREENS.stacked : PIN_SCREENS.side;
          return `+=${stage.offsetHeight * screens}`;
        },
        pin: stage,
        pinType: smoothScrolled ? 'transform' : 'fixed',
        // A long catch-up: the film glides after the scroll instead of following it.
        scrub: 1.3,
        invalidateOnRefresh: true,
      },
      // The step follows the scrubbed timeline (not the raw scroll position), so
      // the indicator changes with the copy.
      onUpdate: () => {
        const t = tl.time();
        const step = t >= copySwap.phone ? '3' : t >= copySwap.ipad ? '2' : '1';
        if (root.dataset.step !== step) root.dataset.step = step;
      },
    });

    // Progress: a third of the bar per step, switching with the copy.
    tl.fromTo(fill, { scaleX: 0 }, { scaleX: 1 / 3, ease: 'none', duration: copySwap.ipad }, 0);
    tl.to(fill, { scaleX: 2 / 3, ease: 'none', duration: copySwap.phone - copySwap.ipad }, copySwap.ipad);
    tl.to(fill, { scaleX: 1, ease: 'none', duration: T.end - copySwap.phone }, copySwap.phone);

    // Camera: a very slow dolly-in over the whole pin, for depth.
    tl.fromTo(S, { dolly: 0 }, { dolly: 1, ease: 'sine.inOut', duration: T.end }, 0);

    // The lid opens slowly; the display fades on once it is past SCREEN_ON_ANGLE.
    tl.fromTo(S, { open: 0 }, { open: 1, duration: T.openDur }, T.open);
    tl.fromTo(S, { screen: 0 }, { screen: 1, duration: T.screenDur }, T.open + T.openDur * lidAtScreenOn);

    // The iPad glides in from the right on a shallow arc and settles over the MacBook.
    tl.fromTo(
      ipad,
      { xPercent: 36, yPercent: 24, scale: 0.92, rotationY: -16, transformPerspective: 1800 },
      { xPercent: 0, yPercent: 0, scale: 1, rotationY: 0, duration: T.ipadDur },
      T.ipad,
    );
    tl.fromTo(ipad, { opacity: 0 }, { opacity: 1, duration: T.ipadDur * 0.4 }, T.ipad);
    tl.fromTo(S, { ipad: 0 }, { ipad: 1, duration: T.ipadDur }, T.ipad);
    // Stacked layout: the group of devices (centred under the copy) follows
    // as they join. The CSS holds the offsets; on desktop they are 0.
    const settle = (name: string) => parseFloat(getComputedStyle(group).getPropertyValue(name)) || 0;
    tl.fromTo(
      group,
      { yPercent: () => settle('--settle-mac') },
      { yPercent: () => settle('--settle-ipad'), duration: T.ipadDur },
      T.ipad,
    );

    // The iPhone rises into place (3D: back to the viewer), then turns to its front.
    tl.fromTo(
      iphone,
      { xPercent: -6, yPercent: 16, scale: 0.7 },
      { xPercent: 0, yPercent: 0, scale: 1, duration: T.phoneDur },
      T.phone,
    );
    tl.fromTo(iphone, { opacity: 0 }, { opacity: 1, duration: T.phoneDur * 0.45 }, T.phone);
    tl.fromTo(S, { phone: 0 }, { phone: 1, duration: T.phoneDur }, T.phone);
    tl.fromTo(S, { flip: 0 }, { flip: 1, duration: T.flipDur }, T.flip);
    tl.to(group, { yPercent: 0, duration: T.phoneDur }, T.phone);

    // It arrives on the Projects screen, then opens the project.
    if (projects) {
      tl.fromTo(projects, { opacity: 1 }, { opacity: 0, duration: T.editorDur }, T.editor);
    }
    tl.fromTo(S, { phoneEditor: 0 }, { phoneEditor: 1, duration: T.editorDur }, T.editor);

    // Copy: the old line is gone completely before the next one fades in.
    const swap = (from: HTMLElement, to: HTMLElement, at: number) => {
      tl.to(from, { opacity: 0, yPercent: -20, duration: COPY_FADE }, at - COPY_FADE);
      tl.to(to, { opacity: 1, yPercent: 0, duration: COPY_FADE }, at);
    };
    swap(copy[0], copy[1], copySwap.ipad);
    swap(copy[1], copy[2], copySwap.phone);

    // Hold the finished composition for the last stretch of the pin.
    tl.set({}, {}, T.end);

    // Switching reduced motion off mid-page rebuilds the pin, which would
    // otherwise leave the page scrolled to the top.
    if (scrollY > 0) {
      ScrollTrigger.refresh();
      window.scrollTo(0, scrollY);
    }

    // `?debug3d`: the state, the timelines and (once it exists) the scene, for tests.
    const debug = query.has('debug3d') ? { scene: null as ShowcaseScene | null, state: S, timeline: tl, enter, gsap } : null;
    if (debug) (window as unknown as { __haptic3d?: unknown }).__haptic3d = debug;

    // ---- 3D scene ----
    const gpu = canvas && rig && !query.has('no3d') ? probeGPU() : null;
    if (canvas && rig && gpu?.webgl2) {
      const startScene = async (report: (p: number) => void): Promise<void> => {
        const urls = {
          tablet: root.dataset.texTablet ?? '',
          phone: root.dataset.texPhone ?? '',
          projects: root.dataset.texProjects ?? '',
        };
        if (!urls.tablet || !urls.phone || !urls.projects) return;

        const { createShowcaseScene } = await import('../components/showcase/scene');
        report(0.05);
        if (cancelled) return;

        const measure = () => {
          const s = stage.getBoundingClientRect();
          const r = rig.getBoundingClientRect();
          const width = stage.clientWidth;
          const height = stage.clientHeight;
          const stacked = matchMedia(STACKED_QUERY).matches;
          if (stacked) {
            const top = r.top - s.top;
            return {
              width,
              height,
              stacked,
              area: { left: 14, right: width - 14, top: top + 28, bottom: r.bottom - s.top - 22, alignX: 'center' as const },
            };
          }
          // The 2D rig is 723 composition pixels wide: that gives the scale.
          const k = r.width / 723;
          const ay = r.top - s.top + 479 * k;
          return {
            width,
            height,
            stacked,
            // The MacBook (not the whole group) fills this: its left edge clears
            // the heading, and its right side bleeds off the screen, as in the mockup.
            area: {
              left: r.left - s.left + 5 * k,
              right: width + 130 * k,
              top: Math.max(76, ay - 455 * k),
              bottom: Math.min(height - 20, ay + 260 * k),
              alignX: 'right' as const,
              groundY: ay + 80 * k,
            },
          };
        };

        // Gives the 3D scene up: back to the 2D rig, which has followed the same timeline.
        let dropped = false;
        const drop = (why: string) => {
          if (dropped) return;
          dropped = true;
          delete root.dataset.scene;
          root.dataset.sceneDropped = why;
          // Outside the frame callback that reported it.
          setTimeout(() => cleanups.forEach((fn) => fn()), 0);
        };

        const created = await createShowcaseScene({
          canvas,
          urls,
          state: S,
          software: gpu.software,
          quality: qualityParam(),
          safetyNet: !query.has('force3d'),
          report: (p) => report(0.05 + p * 0.95),
          measure,
          onUnusable: drop,
          onContextLost: () => delete root.dataset.scene,
          onContextRestored: () => {
            root.dataset.scene = 'on';
            created.invalidate();
          },
        });
        if (cancelled) {
          created.dispose();
          return;
        }
        scene = created;

        // Draw on demand: whenever the scrubbed state moved or the size did, and only on screen.
        const tick = () => {
          scene?.renderIfDirty();
        };
        gsap.ticker.add(tick);
        const io = new IntersectionObserver(
          (entries) => {
            // The latest entry is the current state (a batch can hold several).
            const on = entries[entries.length - 1]?.isIntersecting ?? false;
            scene?.setActive(on);
            if (on) scene?.invalidate();
          },
          { rootMargin: '80px 0px' },
        );
        io.observe(stage);
        // The pinned stage is resized by ScrollTrigger a moment after the
        // window (its refresh is debounced), so measure again once it has
        // settled: on every refresh, and once more shortly after any resize.
        const fit = () => scene?.resize();
        const fitLater = gsap.delayedCall(0.3, fit).pause();
        const ro = new ResizeObserver(() => {
          fit();
          fitLater.restart(true);
        });
        ro.observe(stage);
        ro.observe(rig);
        ScrollTrigger.addEventListener('refresh', fit);

        cleanups.push(() => {
          gsap.ticker.remove(tick);
          io.disconnect();
          ro.disconnect();
          fitLater.kill();
          ScrollTrigger.removeEventListener('refresh', fit);
          delete root.dataset.scene;
          scene?.dispose();
          scene = null;
        });

        created.invalidate();
        root.dataset.scene = 'on';
        root.dataset.quality = created.internals.lite ? 'lite' : 'high';
        if (debug) debug.scene = created;
      };

      const safeStart = (report: (p: number) => void) =>
        Promise.race([startScene(report), new Promise<void>((resolve) => setTimeout(resolve, SCENE_TIMEOUT))]).catch(() => {
          // Any failure leaves the 2D rig in place.
        });

      if (document.documentElement.classList.contains('is-loading')) {
        // The intro waits for the scene: start now and report progress to it.
        void track((report) => safeStart(report), 3);
      } else {
        // Otherwise start when the section is about to come into view.
        const near = new IntersectionObserver(
          (entries) => {
            if (!entries.some((e) => e.isIntersecting)) return;
            near.disconnect();
            void safeStart(() => {});
          },
          { rootMargin: '150% 0px' },
        );
        near.observe(root);
        cleanups.push(() => near.disconnect());
      }
    }

    return () => {
      cancelled = true;
      cleanups.forEach((fn) => fn());
      if (canvas?.isConnected) canvas.replaceWith(canvas.cloneNode(false));
      delete root.dataset.mode;
      root.dataset.step = '1';
    };
  });

  // Images are lazy and fonts swap in late; re-measure once they settle.
  const refresh = gsap.delayedCall(0.15, () => ScrollTrigger.refresh()).pause();
  const refreshSoon = () => refresh.restart(true);
  root.querySelectorAll('img').forEach((img) => {
    if (!img.complete) img.addEventListener('load', refreshSoon, { once: true });
  });
  document.fonts?.ready.then(refreshSoon);
}
