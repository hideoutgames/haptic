/**
 * Hero scroll parallax: the sky and glow drift down slightly slower than the
 * page. Skipped entirely for reduced-motion users.
 */
import { gsap, prefersReducedMotion } from '../../scripts/motion';

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
