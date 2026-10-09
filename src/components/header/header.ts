/**
 * Header behaviour: menu toggle (with the H → bar morph), keyboard and
 * outside-click handling, and hide-on-scroll-down / show-on-scroll-up.
 */
import { gsap, prefersReducedMotion } from '../../scripts/motion';
import { logoPaths } from './logo-geometry';

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

  // ---- H <-> bar morph ----------------------------------------------------
  const morph = { t: 0 };

  function renderLogo() {
    const d = logoPaths(morph.t);
    layers.white?.setAttribute('d', d.white);
    layers.amber?.setAttribute('d', d.amber);
    layers.red?.setAttribute('d', d.red);
  }

  function morphTo(target: number) {
    gsap.killTweensOf(morph);
    if (prefersReducedMotion()) {
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
    button.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    morphTo(open ? 1 : 0);

    if (open) {
      setHidden(false);
      menu.querySelector<HTMLElement>('a[href]')?.focus({ preventScroll: true });
    } else if (restoreFocus) {
      button.focus({ preventScroll: true });
    }
  }

  button.addEventListener('click', () => setOpen(!open));

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

  // ---- Hide on scroll down, show on scroll up -----------------------------
  const TOP_ZONE = 48;
  const THRESHOLD = 10;
  let hidden = false;
  let lastY = window.scrollY;
  let run = 0; // signed distance scrolled since the direction last changed
  let frame = 0;

  function setHidden(next: boolean) {
    if (next === hidden) return;
    hidden = next;
    header.toggleAttribute('data-hidden', hidden);
  }

  function onScroll() {
    frame = 0;
    const y = window.scrollY;
    const dy = y - lastY;
    lastY = y;

    if (open || y < TOP_ZONE) {
      run = 0;
      setHidden(false);
      return;
    }
    run = Math.sign(dy) === Math.sign(run) ? run + dy : dy;
    if (run > THRESHOLD) setHidden(true);
    else if (run < -THRESHOLD) setHidden(false);
  }

  window.addEventListener(
    'scroll',
    () => {
      frame ||= requestAnimationFrame(onScroll);
    },
    { passive: true },
  );

  // Keyboard users tabbing to the button should always see it.
  header.addEventListener('focusin', () => setHidden(false));
}
