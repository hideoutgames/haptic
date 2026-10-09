/**
 * Scroll sequence for the device showcase.
 *
 *  1. As the section scrolls into view, the MacBook rises and settles.
 *  2. The section pins. Scrolling brings in the iPad, then the iPhone, and the
 *     copy and the step indicator follow.
 *
 * Everything is scrubbed, so scrolling back plays it in reverse. Offsets use
 * xPercent/yPercent of each device, so the same timeline serves desktop and
 * mobile. With reduced motion nothing runs and the CSS shows the final state.
 */
import { gsap, ScrollTrigger } from './motion';

const MEDIA = {
  desktop: '(min-width: 821px) and (prefers-reduced-motion: no-preference)',
  mobile: '(max-width: 820px) and (prefers-reduced-motion: no-preference)',
};

/** Pin length as a multiple of the screen height. */
const PIN_SCREENS = { desktop: 3, mobile: 2.6 };

/** Timeline units; labels double as the step thresholds for the indicator. */
const T = { ipad: 1.2, phone: 5, end: 9.2 };

export function initShowcase(root: HTMLElement): void {
  const pick = <E extends HTMLElement>(selector: string) => root.querySelector<E>(selector);
  const stage = pick('[data-stage]');
  const mac = pick('[data-device="mac"]');
  const ipad = pick('[data-device="ipad"]');
  const iphone = pick('[data-device="iphone"]');
  const fill = pick('[data-progress]');
  const copy = gsap.utils.toArray<HTMLElement>('[data-copy]', root);
  if (!stage || !mac || !ipad || !iphone || !fill || copy.length < 3) return;

  const mm = gsap.matchMedia();

  mm.add(MEDIA, (context) => {
    const mobile = !!context.conditions?.mobile;
    root.dataset.mode = 'pinned';
    root.dataset.step = '1';

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
        end: () => `+=${stage.offsetHeight * (mobile ? PIN_SCREENS.mobile : PIN_SCREENS.desktop)}`,
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
    tl.to(copy[0], { opacity: 0, yPercent: -30, duration: 0.7 }, T.ipad);
    tl.to(copy[1], { opacity: 1, yPercent: 0, duration: 0.7 }, T.ipad + 0.35);

    // iPhone pops in front.
    tl.fromTo(
      iphone,
      { opacity: 0, xPercent: -6, yPercent: 16, scale: 0.6 },
      { opacity: 1, xPercent: 0, yPercent: 0, scale: 1, duration: 2.2, ease: 'back.out(1.5)' },
      T.phone,
    );
    tl.to(copy[1], { opacity: 0, yPercent: -30, duration: 0.7 }, T.phone);
    tl.to(copy[2], { opacity: 1, yPercent: 0, duration: 0.7 }, T.phone + 0.35);

    // Hold the finished composition for the last stretch of the pin.
    tl.set({}, {}, T.end);

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
