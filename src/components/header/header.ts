/**
 * Header behaviour: menu toggle (with the H → bar morph), keyboard and
 * outside-click handling. The menu works on its own; GSAP is only fetched, in
 * the background, to tween the logo morph. The fade under the H and the page
 * tint behind the open menu are plain CSS (SiteHeader.astro).
 */
import { logoPaths, MORPH } from './logo-geometry';

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
  /** The menu was last opened with a mouse or a tap (not Enter or Space). */
  let openedWithPointer = false;

  // ---- H <-> bar morph ----------------------------------------------------
  /**
   * The current (or last) morph: from one end to the other (0 = H, 1 = bar)
   * and how far along it is in time (`at`, 0-1, linear). The mark is drawn at
   * the eased point between the two, so a fresh morph either way starts
   * promptly and lands softly. When `at` is 0 or 1 the mark is at rest.
   */
  const run = { from: 0, to: 0, at: 1 };
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  // Until GSAP has loaded (or if it never does) the logo just snaps.
  let gsap: Gsap | undefined;
  import('../../scripts/motion').then(
    (motion) => (gsap = motion.gsap),
    () => {},
  );

  function renderLogo() {
    const d = logoPaths(run.from + (run.to - run.from) * MORPH.ease(run.at));
    layers.white?.setAttribute('d', d.white);
    layers.amber?.setAttribute('d', d.amber);
    layers.red?.setAttribute('d', d.red);
  }

  let tween: ReturnType<Gsap['to']> | undefined;

  /**
   * Morph the mark towards `target` (0 or 1). Every call decides from the
   * state alone, never from whether a tween has started yet, so any sequence
   * of toggles (several in one frame, mid-morph, rapid clicks) ends with the
   * mark matching the last one.
   */
  function morphTo(target: number) {
    tween?.kill();
    tween = undefined;
    if (!gsap || reducedMotion.matches) {
      run.from = run.to = target;
      run.at = 1;
      renderLogo();
      return;
    }
    let end: number;
    if (run.at > 0 && run.at < 1) {
      // Turned round mid-morph: run time back towards where this morph began
      // (or on again towards its end). The mark heads there along the same
      // path at the speed it had, instead of stopping and easing off from rest.
      end = target === run.to ? 1 : 0;
    } else {
      const at = run.at === 1 ? run.to : run.from;
      if (at === target) return;
      run.from = at;
      run.to = target;
      run.at = 0;
      end = 1;
    }
    tween = gsap.to(run, {
      at: end,
      duration: Math.abs(end - run.at) * MORPH.duration,
      ease: 'none',
      onUpdate: renderLogo,
    });
  }

  // ---- Focus into the open menu ------------------------------------------
  let focusFrame = 0;

  /**
   * Move focus into the menu that just opened. A keyboard open goes to the
   * first link, with its ring. A pointer open goes to the panel itself
   * (tabindex -1, never a ring): screen readers still enter the menu and the
   * next Tab still lands on the first link, but no link shows a keyboard ring
   * nobody asked for (browsers draw one on any focus() that follows a key
   * press, so a click after closing with Escape would otherwise get it).
   *
   * The panel turns visible the moment `data-open` is set, in every motion
   * mode (MenuPanel.astro), so focus normally lands at once. Should anything
   * still delay that switch, focus() on the hidden panel does nothing: then
   * try again on the next frames, for as long as focus has not moved on.
   */
  function focusIntoMenu() {
    cancelAnimationFrame(focusFrame);
    const target = (!openedWithPointer && menu.querySelector<HTMLElement>('a[href]')) || menu;
    const from = document.activeElement;
    let frames = 0;
    const attempt = () => {
      if (!open || document.activeElement !== from) return;
      target.focus({ preventScroll: true });
      if (document.activeElement !== target && ++frames < 30) focusFrame = requestAnimationFrame(attempt);
    };
    attempt();
  }

  // ---- Open / close -------------------------------------------------------
  function setOpen(next: boolean, { restoreFocus = false } = {}) {
    if (next === open) return;
    open = next;

    header.toggleAttribute('data-open', open);
    button.setAttribute('aria-expanded', String(open));
    morphTo(open ? 1 : 0);

    if (open) {
      focusIntoMenu();
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
  // Shift+Tab from the H, the first stop on the page, takes focus out of the
  // page altogether (no relatedTarget): that closes it too, but focus that
  // leaves with the window (switching apps or tabs) leaves the menu open.
  let tabbing = false;
  header.addEventListener('keydown', (event) => {
    if (event.key !== 'Tab') return;
    tabbing = true;
    setTimeout(() => (tabbing = false));
  });
  header.addEventListener('focusout', (event) => {
    const next = event.relatedTarget as Node | null;
    if (open && (next ? !header.contains(next) : tabbing)) setOpen(false);
  });

  menu.addEventListener('click', (event) => {
    if ((event.target as Element).closest('a[href]')) setOpen(false);
  });

  // Back/forward cache can restore the page with the menu still open.
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) setOpen(false);
  });
}
