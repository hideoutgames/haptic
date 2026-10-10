/**
 * Header behaviour: menu toggle (with the H → bar morph) plus keyboard and
 * outside-click handling. The menu works on its own; GSAP is only fetched, in
 * the background, to tween the logo morph.
 */
import { logoPaths } from './logo-geometry';

type Gsap = (typeof import('../../scripts/motion'))['gsap'];

const header = document.querySelector<HTMLElement>('[data-site-header]');
const button = header?.querySelector<HTMLButtonElement>('[data-menu-button]');
const menu = header?.querySelector<HTMLElement>('.menu');

if (header && button && menu) {
  initHeader(header, button, menu);
}

function initHeader(header: HTMLElement, button: HTMLButtonElement, menu: HTMLElement) {
  const layers = {
    white: header.querySelector<SVGPathElement>('[data-logo="white"]'),
    amber: header.querySelector<SVGPathElement>('[data-logo="amber"]'),
    red: header.querySelector<SVGPathElement>('[data-logo="red"]'),
  };

  let open = false;

  let openedWithPointer = false;

  // ---- H <-> bar morph ----------------------------------------------------
  const morph = { t: 0 };
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  // Until GSAP has loaded (or if it never does) the logo just snaps.
  let gsap: Gsap | undefined;
  import('../../scripts/motion').then(
    (motion) => (gsap = motion.gsap),
    () => {},
  );

  function renderLogo() {
    const d = logoPaths(morph.t);
    layers.white?.setAttribute('d', d.white);
    layers.amber?.setAttribute('d', d.amber);
    layers.red?.setAttribute('d', d.red);
  }

  function morphTo(target: number) {
    gsap?.killTweensOf(morph);
    if (!gsap || reducedMotion.matches) {
      morph.t = target;
      renderLogo();
      return;
    }
    gsap.to(morph, {
      t: target,
      duration: 0.32,
      ease: 'power2.inOut',
      onUpdate: renderLogo,
    });
  }

  // ---- Open / close -------------------------------------------------------
  function setOpen(next: boolean, { restoreFocus = false } = {}) {
    if (next === open) return;
    open = next;

    header.toggleAttribute('data-open', open);
    button.setAttribute('aria-expanded', String(open));
    morphTo(open ? 1 : 0);

    if (open) {
      menu.querySelector<HTMLElement>('a[href]')?.focus({ preventScroll: true });
    } else if (restoreFocus) {
      // Escape after a mouse/touch open: give focus back without a focus ring.
      button.toggleAttribute('data-quiet-focus', openedWithPointer);
      button.focus({ preventScroll: true });
    }
  }

  button.addEventListener('click', (event) => {
    // Keyboard-activated clicks have detail 0.
    if (!open) openedWithPointer = event.detail > 0;
    setOpen(!open);
  });
  button.addEventListener('blur', () => button.removeAttribute('data-quiet-focus'));

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && open) {
      event.preventDefault();
      setOpen(false, { restoreFocus: true });
    }
  });

  // Click/tap outside the header closes the menu.
  document.addEventListener('pointerdown', (event) => {
    if (open && !header.contains(event.target as Node)) setOpen(false);
  });

  // Tabbing past either end of the menu closes it (focus has left the header).
  header.addEventListener('focusout', (event) => {
    const next = event.relatedTarget as Node | null;
    if (open && next && !header.contains(next)) setOpen(false);
  });

  menu.addEventListener('click', (event) => {
    if ((event.target as Element).closest('a[href]')) setOpen(false);
  });

  // Back/forward cache can restore the page with the menu still open.
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) setOpen(false);
  });
}
