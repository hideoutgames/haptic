/**
 * Scroll sequence for the device showcase.
 *
 *  1. As the section scrolls into view, the MacBook rises and settles.
 *  2. The section pins. Scrolling brings in the iPad, then the iPhone (which
 *     opens a project: its Projects screen fades into the editor), and the
 *     copy and the step indicator follow.
 *
 * Everything is scrubbed, so scrolling back plays it in reverse. Offsets use
 * xPercent/yPercent of each device, so the same timeline serves every layout.
 * With reduced motion nothing runs and the CSS shows the final state.
 *
 * There is a single matchMedia context on purpose. Reverting and rebuilding
 * the pin when the layout changes (rotation, resize, zoom) would reset the
 * scroll position to the top, so the layout-dependent pin length is read on
 * every refresh instead.
 */
import { STACKED_QUERY } from '../components/showcase/layout';
import { gsap, ScrollTrigger } from './motion';

/** Pin length as a multiple of the screen height. */
const PIN_SCREENS = { side: 3, stacked: 2.6 };

/** Timeline units; labels double as the step thresholds for the indicator. */
const T = { ipad: 1.2, phone: 5, open: 6.6, end: 9.2 };

export function initShowcase(root: HTMLElement): void {
  const pick = <E extends HTMLElement>(selector: string) => root.querySelector<E>(selector);
  const stage = pick('[data-stage]');
  const group = pick('[data-group]');
  const mac = pick('[data-device="mac"]');
  const ipad = pick('[data-device="ipad"]');
  const iphone = pick('[data-device="iphone"]');
  const projects = pick('[data-intro]');
  const fill = pick('[data-progress]');
  const copy = gsap.utils.toArray<HTMLElement>('[data-copy]', root);
  if (!stage || !group || !mac || !ipad || !iphone || !fill || copy.length < 3) return;

  const mm = gsap.matchMedia();

  mm.add('(prefers-reduced-motion: no-preference)', () => {
    const scrollY = window.scrollY;
    root.dataset.mode = 'pinned';
    root.dataset.step = '1';
    // Tells the inline script in the section that the sequence is running.
    root.dataset.ready = '1';

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

    // 2. Pinned: iPad, then iPhone.
    const tl = gsap.timeline({
      defaults: { ease: 'power2.inOut' },
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
          root.dataset.step = t >= T.phone ? '3' : t >= T.ipad ? '2' : '1';
        },
      },
    });

    tl.fromTo(fill, { scaleX: 0 }, { scaleX: 1, ease: 'none', duration: T.end }, 0);

    // iPad slides in from the lower right and settles over the MacBook.
    tl.fromTo(
      ipad,
      { opacity: 0, xPercent: 36, yPercent: 24, scale: 0.92, rotationY: -16, transformPerspective: 1800 },
      { opacity: 1, xPercent: 0, yPercent: 0, scale: 1, rotationY: 0, duration: 2.6, ease: 'power3.out' },
      T.ipad,
    );
    // Stacked layout: the group of devices (centred under the copy) follows
    // as they join. The CSS holds the offsets; on desktop they are 0.
    const settle = (name: string) => parseFloat(getComputedStyle(group).getPropertyValue(name)) || 0;
    tl.fromTo(
      group,
      { yPercent: () => settle('--settle-mac') },
      { yPercent: () => settle('--settle-ipad'), duration: 2.6, ease: 'power3.out' },
      T.ipad,
    );
    tl.to(copy[0], { opacity: 0, yPercent: -30, duration: 0.7 }, T.ipad);
    tl.to(copy[1], { opacity: 1, yPercent: 0, duration: 0.7 }, T.ipad + 0.35);

    // iPhone pops in front.
    tl.fromTo(
      iphone,
      { opacity: 0, xPercent: -6, yPercent: 16, scale: 0.6 },
      { opacity: 1, xPercent: 0, yPercent: 0, scale: 1, duration: 2.2, ease: 'back.out(1.5)' },
      T.phone,
    );
    tl.to(group, { yPercent: 0, duration: 2.2, ease: 'power2.out' }, T.phone);
    tl.to(copy[1], { opacity: 0, yPercent: -30, duration: 0.7 }, T.phone);
    tl.to(copy[2], { opacity: 1, yPercent: 0, duration: 0.7 }, T.phone + 0.35);

    // It arrives on the Projects screen, then opens the project.
    if (projects) {
      tl.fromTo(projects, { opacity: 1 }, { opacity: 0, duration: 1.4, ease: 'power1.inOut' }, T.open);
    }

    // Hold the finished composition for the last stretch of the pin.
    tl.set({}, {}, T.end);

    // Switching reduced motion off mid-page rebuilds the pin, which would
    // otherwise leave the page scrolled to the top.
    if (scrollY > 0) {
      ScrollTrigger.refresh();
      window.scrollTo(0, scrollY);
    }

    return () => {
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
