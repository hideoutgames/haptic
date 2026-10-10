/**
 * Scroll sequence for the device showcase.
 *
 *  1. As the section scrolls into view, the MacBook rises and settles.
 *  2. The section pins. Scrolling opens the MacBook, then brings in the iPad,
 *     then the iPhone (which turns round from its back and opens a project: its
 *     Projects screen fades into the editor); the copy and the step indicator
 *     follow.
 *
 * Everything is scrubbed, so scrolling back plays it in reverse.
 *
 * Two renderers share one timeline. The default is the 2D rig of the page (the
 * device-frame pictures, moved with xPercent/yPercent so the same timeline
 * serves every layout). When WebGL2 is available, the 3D scene
 * (components/showcase/scene, loaded lazily) replaces it: the same timeline
 * scrubs the scene's state object, and the 2D rig stays in the page, hidden,
 * as the fallback if the context is lost. Without JS, with reduced motion, or
 * if the scene fails to start, the 2D composition stays. (The stacked layout
 * also lifts the 2D group as the devices join, to keep it centred under the
 * copy; the CSS says by how much.)
 *
 * There is a single matchMedia context on purpose. Reverting and rebuilding
 * the pin when the layout changes (rotation, resize, zoom) would reset the
 * scroll position to the top, so the layout-dependent pin length is read on
 * every refresh instead.
 */
import { STACKED_QUERY } from '../components/showcase/layout';
import { initialState, type SceneState, type ShowcaseScene } from '../components/showcase/scene/types';
import { gsap, ScrollTrigger } from './motion';
import { track } from './preload';

/** Pin length as a multiple of the screen height. */
const PIN_SCREENS = { side: 3, stacked: 2.6 };

/** Timeline units; labels double as the step thresholds for the indicator. */
const T = {
  open: 0.0,
  openDur: 2.6,
  ipad: 2.5,
  ipadDur: 2.8,
  phone: 5.5,
  phoneDur: 2.4,
  flipDur: 2.9,
  editor: 7.9,
  editorDur: 1.3,
  end: 9.8,
};

/** WebGL2 is required by the 3D scene; probed on a throwaway canvas. */
function hasWebGL2(): boolean {
  try {
    const probe = document.createElement('canvas');
    const gl = probe.getContext('webgl2');
    if (!gl) return false;
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return true;
  } catch {
    return false;
  }
}

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
    const invalidate = () => scene?.invalidate();

    // Copy that is not the current step waits below its slot.
    gsap.set(copy.slice(1), { opacity: 0, yPercent: 30 });

    // 1. The MacBook rises into place while the section scrolls in.
    gsap.fromTo(
      mac,
      {
        opacity: 0,
        yPercent: 16,
        scale: 0.9,
        rotationX: 20,
        transformPerspective: 1800,
        transformOrigin: '50% 100%',
      },
      {
        opacity: 1,
        yPercent: 0,
        scale: 1,
        rotationX: 0,
        ease: 'power2.out',
        scrollTrigger: { trigger: root, start: 'top 95%', end: 'top top', scrub: 0.8 },
      },
    );
    gsap.fromTo(
      S,
      { rise: 0 },
      {
        rise: 1,
        ease: 'power2.out',
        onUpdate: invalidate,
        scrollTrigger: { trigger: root, start: 'top 95%', end: 'top top', scrub: 0.8 },
      },
    );

    // 2. Pinned: the MacBook opens, then the iPad, then the iPhone.
    const tl = gsap.timeline({
      defaults: { ease: 'power2.inOut' },
      onUpdate: invalidate,
      scrollTrigger: {
        trigger: root,
        start: 'top top',
        end: () => {
          const screens = matchMedia(STACKED_QUERY).matches ? PIN_SCREENS.stacked : PIN_SCREENS.side;
          return `+=${stage.offsetHeight * screens}`;
        },
        pin: stage,
        scrub: 0.8,
        invalidateOnRefresh: true,
        onUpdate: ({ progress }) => {
          const t = progress * T.end;
          root.dataset.step = t >= T.phone ? '3' : t >= T.ipad + 0.2 ? '2' : '1';
        },
      },
    });

    tl.fromTo(fill, { scaleX: 0 }, { scaleX: 1, ease: 'none', duration: T.end }, 0);

    // 3D: the lid opens while the MacBook turns to face the viewer, and the
    // display lights up as it opens.
    tl.fromTo(S, { open: 0 }, { open: 1, duration: T.openDur, ease: 'power2.inOut' }, T.open);
    tl.fromTo(S, { turn: 0 }, { turn: 1, duration: T.openDur * 1.1, ease: 'power2.inOut' }, T.open);
    tl.fromTo(S, { screen: 0 }, { screen: 1, duration: 1.5, ease: 'power1.inOut' }, T.open + 0.9);

    // iPad slides in from the lower right and settles over the MacBook.
    tl.fromTo(
      ipad,
      { opacity: 0, xPercent: 36, yPercent: 24, scale: 0.92, rotationY: -16, transformPerspective: 1800 },
      { opacity: 1, xPercent: 0, yPercent: 0, scale: 1, rotationY: 0, duration: T.ipadDur, ease: 'power3.out' },
      T.ipad,
    );
    tl.fromTo(S, { ipad: 0 }, { ipad: 1, duration: T.ipadDur, ease: 'power2.inOut' }, T.ipad);
    // Stacked layout: the group of devices (centred under the copy) follows
    // as they join. The CSS holds the offsets; on desktop they are 0.
    const settle = (name: string) => parseFloat(getComputedStyle(group).getPropertyValue(name)) || 0;
    tl.fromTo(
      group,
      { yPercent: () => settle('--settle-mac') },
      { yPercent: () => settle('--settle-ipad'), duration: T.ipadDur, ease: 'power3.out' },
      T.ipad,
    );
    tl.to(copy[0], { opacity: 0, yPercent: -30, duration: 0.7 }, T.ipad);
    tl.to(copy[1], { opacity: 1, yPercent: 0, duration: 0.7 }, T.ipad + 0.35);

    // iPhone pops in front (3D: rises and turns from its back to its front).
    tl.fromTo(
      iphone,
      { opacity: 0, xPercent: -6, yPercent: 16, scale: 0.6 },
      { opacity: 1, xPercent: 0, yPercent: 0, scale: 1, duration: T.phoneDur, ease: 'back.out(1.5)' },
      T.phone,
    );
    tl.fromTo(S, { phone: 0 }, { phone: 1, duration: T.phoneDur, ease: 'power3.out' }, T.phone);
    tl.fromTo(S, { flip: 0 }, { flip: 1, duration: T.flipDur, ease: 'power2.inOut' }, T.phone + 0.15);
    tl.to(group, { yPercent: 0, duration: T.phoneDur, ease: 'power2.out' }, T.phone);
    tl.to(copy[1], { opacity: 0, yPercent: -30, duration: 0.7 }, T.phone);
    tl.to(copy[2], { opacity: 1, yPercent: 0, duration: 0.7 }, T.phone + 0.35);

    // It arrives on the Projects screen, then opens the project.
    if (projects) {
      tl.fromTo(projects, { opacity: 1 }, { opacity: 0, duration: T.editorDur, ease: 'power1.inOut' }, T.editor);
    }
    tl.fromTo(S, { phoneEditor: 0 }, { phoneEditor: 1, duration: T.editorDur, ease: 'power1.inOut' }, T.editor);

    // Hold the finished composition for the last stretch of the pin.
    tl.set({}, {}, T.end);

    // Switching reduced motion off mid-page rebuilds the pin, which would
    // otherwise leave the page scrolled to the top.
    if (scrollY > 0) {
      ScrollTrigger.refresh();
      window.scrollTo(0, scrollY);
    }

    // ---- 3D scene ----
    if (canvas && rig && hasWebGL2()) {
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
            // the heading, and its right side bleeds off the screen a little, as in the mockup.
            area: {
              left: r.left - s.left + 40 * k,
              right: width + 56 * k,
              top: Math.max(76, ay - 455 * k),
              bottom: Math.min(height - 20, ay + 185 * k),
              alignX: 'right' as const,
              groundY: ay + 8 * k,
            },
          };
        };

        const created = await createShowcaseScene({
          canvas,
          urls,
          state: S,
          report: (p) => report(0.05 + p * 0.95),
          measure,
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

        // Draw on demand: only when the scrubbed state changed or the size did, and only on screen.
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
        if (new URLSearchParams(location.search).has('debug3d')) {
          (window as unknown as { __haptic3d?: unknown }).__haptic3d = { scene: created, state: S };
        }
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
