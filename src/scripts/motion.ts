/**
 * Shared motion setup: one GSAP + ScrollTrigger registration and one Lenis
 * smooth-scroll instance for the whole page. Components import from here
 * instead of registering plugins themselves.
 */
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';

gsap.registerPlugin(ScrollTrigger);

export const prefersReducedMotion = (): boolean =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

let lenis: Lenis | null = null;

/**
 * Same-page #hash links glide with Lenis instead of jumping. The native jump is
 * cancelled (Lenis' own `anchors` option leaves it running): it would push a
 * history entry whose saved scroll position is already the target, so Back
 * would change the URL but leave the page where it is. Without Lenis (reduced
 * motion) the links keep their native behaviour.
 */
function smoothScrollToHash(e: MouseEvent): void {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  const link = (e.target as Element | null)?.closest?.('a');
  if (!link || link.origin !== location.origin || link.pathname !== location.pathname || !link.hash) return;
  const target = document.getElementById(link.hash.slice(1));
  if (!target) return;

  e.preventDefault();
  lenis?.scrollTo(target);
  // Move focus to the target, as the native jump would (no ring: it's no control).
  target.tabIndex = -1;
  target.style.outline = 'none';
  target.focus({ preventScroll: true });
}

export function initSmoothScroll(): Lenis | null {
  if (lenis || prefersReducedMotion()) return lenis;

  lenis = new Lenis({
    lerp: 0.088,
    // Touch devices keep native momentum scrolling.
    syncTouch: false,
  });
  lenis.on('scroll', ScrollTrigger.update);
  window.addEventListener('click', smoothScrollToHash);
  gsap.ticker.add((time) => lenis?.raf(time * 1000));
  gsap.ticker.lagSmoothing(0);

  (window as unknown as { __lenis?: Lenis }).__lenis = lenis;
  return lenis;
}

export function getLenis(): Lenis | null {
  return lenis;
}

export { gsap, ScrollTrigger };
