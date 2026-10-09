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

export function initSmoothScroll(): Lenis | null {
  if (lenis || prefersReducedMotion()) return lenis;

  lenis = new Lenis({
    anchors: true,
    lerp: 0.12,
    // Touch devices keep native momentum scrolling.
    syncTouch: false,
  });
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((time) => lenis?.raf(time * 1000));
  gsap.ticker.lagSmoothing(0);

  (window as unknown as { __lenis?: Lenis }).__lenis = lenis;
  return lenis;
}

export function getLenis(): Lenis | null {
  return lenis;
}

export { gsap, ScrollTrigger };
