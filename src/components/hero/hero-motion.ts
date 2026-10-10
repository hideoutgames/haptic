/**
 * Hero motion hookup.
 *
 *  - Load-in: the hero's entrance is plain CSS keyframes that start at first
 *    paint. While the intro preloader is up (`html.is-loading`) the global rules
 *    in Preloader.astro hold every hero animation at its "from" state, and the
 *    hero title is already in place because the preloader's wordmark has played
 *    its intro. When the preloader releases the page (`ready`) the held
 *    animations start from zero, so the load-in begins at the reveal. Without
 *    the preloader (return visit, no JS) nothing is held and it starts at once.
 *  - Scroll parallax: the sky and glow drift down slightly slower than the
 *    page. Skipped entirely for reduced-motion users.
 */
import { gsap, ScrollTrigger, prefersReducedMotion } from '../../scripts/motion';
import { ready } from '../../scripts/preload';

/**
 * Re-measure scroll positions once the preloader lifts its scroll lock (the
 * page may have been laid out with the scrollbar gutter reserved, or without
 * the scrollbar, depending on the browser).
 */
export function initHeroLoadIn(): void {
  if (!document.documentElement.classList.contains('is-loading')) return;
  // Not at the reveal itself: the overlay fade and the load-in should get every frame.
  void ready.then(() => window.setTimeout(() => ScrollTrigger.refresh(), 1200));
}

export function initHeroParallax(hero: HTMLElement): void {
  if (prefersReducedMotion()) return;

  hero.querySelectorAll<HTMLElement>('[data-parallax]').forEach((layer) => {
    const speed = Number(layer.dataset.parallax) || 0;
    gsap.to(layer, {
      y: () => hero.offsetHeight * speed,
      ease: 'none',
      scrollTrigger: {
        trigger: hero,
        start: 'top top',
        end: 'bottom top',
        scrub: true,
        invalidateOnRefresh: true,
      },
    });
  });
}
