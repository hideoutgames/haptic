/**
 * Scroll sequence for the device showcase: a short, continuous product film.
 * Each device makes one eased gesture in which it travels and turns at the
 * same time, and the next gesture starts as the last one settles, so the film
 * flows instead of stopping and starting; it holds still only briefly, where
 * a line of copy is read. In screens of scroll from the start of the pin
 * (the table `T`; negative is before it, while the section scrolls in):
 *
 *   -0.45 – 0.30   the MacBook comes up with the page, shut, turning from
 *                  three-quarter view to face front (the turn ends at 0.20).
 *                  It is still rising when the pin stops the page, and
 *                  glides on to rest instead of stopping with it.
 *   -0.22 – 0.60   the lid lifts while the MacBook is still turning and
 *                  opens in one even swing; the display lights once it is
 *                  past 70 degrees
 *    0.60 – 0.70   hold: "Desktop"
 *    0.70 – 1.45   the iPad slides in on its stand from just outside the left
 *                  edge, turning to face the front as it goes ("Tablet" from
 *                  0.96, once it is well in view)
 *    1.45 – 1.50   hold: "Tablet" (the iPad's last stretch is a slow settle)
 *    1.50 – 2.20   the iPhone rises into place from just below the frame,
 *                  turning from its back to its front as it rises, showing
 *                  Projects ("Phone" from 1.72)
 *    2.20 – 2.50   final hold, then the pin releases
 *
 * One timeline runs the whole film, from the moment the section scrolls in
 * to the end of the pin, under one scrub (the pin is a ScrollTrigger of its
 * own), so the MacBook's arrival flows into the lid opening with no seam
 * where the pin starts. The eases are chosen per kind of move (`EASE`; no
 * overshoot), the scrub's catch-up smooths the scroll steps, and everything
 * plays in reverse when scrolling back. The camera dollies in a few per cent
 * over the whole film. (The scene fits where the iPad and the iPhone start to
 * each canvas, so each comes into view as its beat starts, whatever the
 * screen's shape.)
 *
 * The scrub's catch-up (`SCRUB`: an expo ease restarted on every scroll
 * update, in effect a lag of about 0.1 s on top of Lenis' own smoothing) turns
 * the wheel's steps into a glide. It is kept short because the film runs that
 * far behind the page: the page stops dead where the pin catches it, while the
 * film is still behind. With a longer catch-up (1.3 s), a brisk scroll reached
 * the pin before the MacBook's own move had got going, so the MacBook stopped
 * with the page and then surged as the film caught up, and the pin let go
 * before the iPhone had settled. The last move ends 0.3 screens before the pin
 * releases, which covers the lag up to brisk scrolling (2.5 screens a second).
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
 * tier, `?debug3d` exposes the scene, the state, the timeline (time 0 is
 * `T.arrive`) and the pin as window.__haptic3d.
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

/**
 * The film, in screens of scroll from the start of the pin (negative: before
 * it). One unit is one screen of scroll beside the copy; the stacked layout
 * plays the same film a little shorter (`STACKED_SCALE`). The pin lasts from
 * 0 to `end`.
 */
const T = {
  /**
   * The MacBook starts to come up when the section is this far from the top
   * of the screen. It rises and turns at once; the rise outlasts the turn and
   * runs on past the start of the pin, so the MacBook, which has been moving
   * up with the page, glides to rest instead of stopping dead with it.
   */
  arrive: -0.45,
  riseDur: 0.75,
  turnDur: 0.65,
  /**
   * The lid starts to lift while the MacBook is still turning, so arrival and
   * opening flow into each other; the display lights as it passes SCREEN_ON_ANGLE.
   */
  open: -0.22,
  openDur: 0.82,
  screenDur: 0.3,
  /** The iPad slides in from the left, turning to face the front as it goes. */
  ipad: 0.7,
  ipadDur: 0.75,
  /** The iPhone rises into place, turning from its back to its front as it rises. */
  phone: 1.5,
  phoneDur: 0.7,
  /** End of the pin: the finished composition is held from the last move to here. */
  end: 2.5,
};

/** The stacked layout's film runs at this many screens per unit of `T`. */
const STACKED_SCALE = 0.9;

/**
 * The curves, by kind of move. The scene maps its state linearly, so these
 * are the curves the devices move with.
 */
const EASE = {
  /** The MacBook's rise and turn: gathers pace as it comes into view, settles gently. */
  move: 'power2.inOut',
  /**
   * The lid: an even swing about the hinge. (On screen its top edge travels
   * most while the lid is low and little once it is upright, so a steeper
   * curve would look abrupt at the start and idle at the end.)
   */
  lid: 'sine.inOut',
  /**
   * Entrances from outside the frame (the iPad, the iPhone): already moving
   * as they come into view, then slowing evenly to rest, like something
   * sliding to a stop. (A steeper ease-out would whip them in from the edge.)
   */
  enter: 'power1.out',
  /** Fades, the copy and the camera. */
  soft: 'sine.inOut',
};

/** The film's catch-up after the scroll (seconds): see the file header. */
const SCRUB = 0.8;

/**
 * Copy: the old line fades out over `out`, then the new one fades in over
 * `in`. The line changes as its device becomes the focus: once the device is
 * well into view (`copySwap`, the moment the new line starts to fade in).
 */
const COPY_FADE = { out: 0.16, in: 0.22 };
const copySwap = {
  ipad: T.ipad + T.ipadDur * 0.35,
  phone: T.phone + T.phoneDur * 0.32,
};

/** Where in its tween an eased value first reaches `share` (0–1), by bisection. */
const whenEased = (ease: string, share: number) => {
  const curve = gsap.parseEase(ease);
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (curve(mid) < share) lo = mid;
    else hi = mid;
  }
  return hi;
};

/** Where in the lid's tween it passes SCREEN_ON_ANGLE: the display lights up from here. */
const lidAtScreenOn = whenEased(EASE.lid, SCREEN_ON_ANGLE / LID_OPEN_ANGLE);

/** Timeline position of a time in `T` (the timeline starts at `T.arrive`). */
const at = (t: number) => t - T.arrive;

/**
 * The 2D rig (when there is no 3D scene) echoes the 3D moves with CSS
 * transforms: each picture turns about its vertical centre line, seen in this
 * perspective (px), from these angles (degrees; a flat picture turned much
 * further would show its edge, then its mirror image). Positive turns its
 * face to the right, as in the scene.
 */
const PERSPECTIVE = 1800;
const TURN_2D = { mac: -24, ipad: 62, iphone: 70 };

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
  const fill = pick('[data-progress]');
  const rig = pick('.rig');
  const copy = gsap.utils.toArray<HTMLElement>('[data-copy]', root);
  if (!stage || !group || !mac || !ipad || !iphone || !fill || copy.length < 3) return;

  /**
   * The xPercent that puts a device of the 2D rig just past the left edge of
   * the stage (by 2% of its width) as it starts: turned `turn` degrees about
   * its vertical centre line and scaled `scale`, seen in PERSPECTIVE.
   * Measured without its transforms (which offsets ignore), so a tween can
   * start from it again on every refresh.
   */
  const offStageLeft = (el: HTMLElement, turn: number, scale: number) => {
    let left = 0;
    for (let e: HTMLElement | null = el; e && e !== stage; e = e.offsetParent as HTMLElement | null) left += e.offsetLeft;
    const width = el.offsetWidth;
    // GSAP writes the perspective first, so it applies after the translation,
    // about the element's centre: a point x from the centre and z towards the
    // viewer is drawn at x·P/(P − z). The turned right edge sits half·cos(a)
    // right of the centre and half·sin(a) away from the viewer; solve for the
    // translation that draws it at the stage's left edge.
    const half = (width / 2) * scale;
    const a = (turn * Math.PI) / 180;
    const depthScale = PERSPECTIVE / (PERSPECTIVE + half * Math.sin(a));
    const translate = -(left + width / 2 + width * 0.02) / depthScale - half * Math.cos(a);
    return (translate / width) * 100;
  };

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

    /** Pixels of scroll per unit of `T` (one screen, a little less when stacked). */
    const unit = () => stage.offsetHeight * (matchMedia(STACKED_QUERY).matches ? STACKED_SCALE : 1);

    // The film: one timeline from the moment the section is `-T.arrive` units
    // from the top of the screen to the end of the pin, scrubbed by the scroll.
    const tl = gsap.timeline({
      defaults: { ease: EASE.move },
      scrollTrigger: {
        trigger: root,
        start: () => `top ${-T.arrive * unit()}px`,
        end: () => `+=${(T.end - T.arrive) * unit()}`,
        scrub: SCRUB,
        invalidateOnRefresh: true,
      },
      // The step follows the scrubbed timeline (not the raw scroll position), so
      // the indicator changes with the copy.
      onUpdate: () => {
        const t = tl.time() + T.arrive;
        const step = t >= copySwap.phone ? '3' : t >= copySwap.ipad ? '2' : '1';
        if (root.dataset.step !== step) root.dataset.step = step;
      },
    });

    // The pin: the stage holds still from the top of the section for `T.end` units.
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
    const pin = ScrollTrigger.create({
      trigger: root,
      start: 'top top',
      end: () => `+=${T.end * unit()}`,
      pin: stage,
      pinType: smoothScrolled ? 'transform' : 'fixed',
    });

    // Progress: a third of the bar per step, switching with the copy.
    tl.fromTo(fill, { scaleX: 0 }, { scaleX: 1 / 3, ease: 'none', duration: copySwap.ipad }, at(0));
    tl.to(fill, { scaleX: 2 / 3, ease: 'none', duration: copySwap.phone - copySwap.ipad }, at(copySwap.ipad));
    tl.to(fill, { scaleX: 1, ease: 'none', duration: T.end - copySwap.phone }, at(copySwap.phone));

    // Camera: a very slow dolly-in over the whole film, for depth.
    tl.fromTo(S, { dolly: 0 }, { dolly: 1, ease: EASE.soft, duration: T.end - T.arrive }, 0);

    // 1. The MacBook comes up with the page, shut, and turns from three-quarter
    // view to face front (the 2D picture rises and turns a little). The rise
    // runs on past the start of the pin: as the page stops, the MacBook keeps
    // gliding up for a moment and settles. The lid starts to open as the turn
    // settles, so arrival and opening read as one gesture; the display fades
    // on once the lid is past SCREEN_ON_ANGLE.
    tl.fromTo(
      mac,
      { yPercent: 16, scale: 0.92, rotationX: 14, rotationY: TURN_2D.mac, transformPerspective: PERSPECTIVE, transformOrigin: '50% 100%' },
      { yPercent: 0, scale: 1, rotationX: 0, rotationY: 0, duration: T.riseDur },
      at(T.arrive),
    );
    tl.fromTo(mac, { opacity: 0 }, { opacity: 1, ease: EASE.soft, duration: T.riseDur * 0.5 }, at(T.arrive));
    tl.fromTo(S, { rise: 0 }, { rise: 1, duration: T.riseDur }, at(T.arrive));
    tl.fromTo(S, { turn: 0 }, { turn: 1, duration: T.turnDur }, at(T.arrive));
    tl.fromTo(S, { open: 0 }, { open: 1, ease: EASE.lid, duration: T.openDur }, at(T.open));
    tl.fromTo(S, { screen: 0 }, { screen: 1, ease: EASE.soft, duration: T.screenDur }, at(T.open + T.openDur * lidAtScreenOn));

    // Stacked layout: the 3D group, brought nearer while the MacBook is alone,
    // settles back to make room in one slow drift, from the lid opening to the
    // iPad's arrival. (The 2D group keeps itself centred as the devices join:
    // `settle` below.)
    tl.fromTo(S, { settle: 0 }, { settle: 1, ease: EASE.soft, duration: T.ipad + T.ipadDur * 0.8 - T.open }, at(T.open));

    // 2. The iPad slides in from just outside the left edge of the stage, a
    // little nearer the viewer, its screen turned towards the way it is going,
    // and turns to face the front as it slides into place: one move. It starts
    // out of sight, so it is shown at once.
    tl.fromTo(
      ipad,
      {
        xPercent: () => offStageLeft(ipad, TURN_2D.ipad, 1.04),
        yPercent: 6,
        scale: 1.04,
        rotationY: TURN_2D.ipad,
        transformPerspective: PERSPECTIVE,
      },
      { xPercent: 0, yPercent: 0, scale: 1, rotationY: 0, ease: EASE.enter, duration: T.ipadDur },
      at(T.ipad),
    );
    tl.fromTo(ipad, { opacity: 0 }, { opacity: 1, duration: T.ipadDur * 0.05 }, at(T.ipad));
    tl.fromTo(S, { ipad: 0 }, { ipad: 1, ease: EASE.enter, duration: T.ipadDur }, at(T.ipad));
    // Stacked layout: the group of devices (centred under the copy) follows
    // as they join. The CSS holds the offsets; on desktop they are 0.
    const settle = (name: string) => parseFloat(getComputedStyle(group).getPropertyValue(name)) || 0;
    tl.fromTo(
      group,
      { yPercent: () => settle('--settle-mac') },
      { yPercent: () => settle('--settle-ipad'), duration: T.ipadDur },
      at(T.ipad),
    );

    // 3. The iPhone rises into place from just below the frame, turning as it
    // rises (3D: from its back to its front; 2D: from turned to the right,
    // fading in as it rises).
    tl.fromTo(
      iphone,
      { xPercent: -6, yPercent: 16, scale: 0.7, rotationY: TURN_2D.iphone, transformPerspective: PERSPECTIVE },
      { xPercent: 0, yPercent: 0, scale: 1, rotationY: 0, ease: EASE.enter, duration: T.phoneDur },
      at(T.phone),
    );
    tl.fromTo(iphone, { opacity: 0 }, { opacity: 1, duration: T.phoneDur * 0.3 }, at(T.phone));
    tl.fromTo(S, { phone: 0 }, { phone: 1, ease: EASE.enter, duration: T.phoneDur }, at(T.phone));
    tl.to(group, { yPercent: 0, duration: T.phoneDur }, at(T.phone));

    // Copy: the old line is gone completely before the next one fades in.
    const swap = (from: HTMLElement, to: HTMLElement, t: number) => {
      tl.to(from, { opacity: 0, yPercent: -20, ease: EASE.soft, duration: COPY_FADE.out }, at(t - COPY_FADE.out));
      tl.to(to, { opacity: 1, yPercent: 0, ease: EASE.soft, duration: COPY_FADE.in }, at(t));
    };
    swap(copy[0], copy[1], copySwap.ipad);
    swap(copy[1], copy[2], copySwap.phone);

    // Hold the finished composition for the last stretch of the pin.
    tl.set({}, {}, at(T.end));

    // Switching reduced motion off mid-page rebuilds the pin, which would
    // otherwise leave the page scrolled to the top.
    if (scrollY > 0) {
      ScrollTrigger.refresh();
      window.scrollTo(0, scrollY);
    }

    // `?debug3d`: the state, the timelines and (once it exists) the scene, for tests.
    const debug = query.has('debug3d') ? { scene: null as ShowcaseScene | null, state: S, timeline: tl, pin, gsap } : null;
    if (debug) (window as unknown as { __haptic3d?: unknown }).__haptic3d = debug;

    // ---- 3D scene ----
    const gpu = canvas && rig && !query.has('no3d') ? probeGPU() : null;
    if (canvas && rig && gpu?.webgl2) {
      const startScene = async (report: (p: number) => void): Promise<void> => {
        const urls = {
          tablet: root.dataset.texTablet ?? '',
          projects: root.dataset.texProjects ?? '',
        };
        if (!urls.tablet || !urls.projects) return;

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
            // the heading, and its right side bleeds off the frame (the screen, up
            // to 1600px wide), as in the mockup.
            area: {
              left: r.left - s.left + 5 * k,
              // Just inside the rig's right edge, which bleeds off the frame (see the CSS).
              right: r.right - s.left - 4 * k,
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
