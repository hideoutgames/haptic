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
   * Where the mark is, in quarter turns clockwise (logo-geometry.ts): even =
   * the H, odd = the bar. It only ever grows: opening turns on to the next
   * odd number, closing to the next even one, so the mark always keeps
   * turning the same way. It is wrapped back into 0-4 whenever it comes to rest.
   */
  const mark = { phase: 0 };
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  // Until GSAP has loaded (or if it never does) the logo just snaps.
  let gsap: Gsap | undefined;
  import('../../scripts/motion').then(
    (motion) => (gsap = motion.gsap),
    () => {},
  );

  function renderLogo() {
    const d = logoPaths(mark.phase);
    layers.white?.setAttribute('d', d.white);
    layers.amber?.setAttribute('d', d.amber);
    layers.red?.setAttribute('d', d.red);
  }

  let tween: ReturnType<Gsap['to']> | undefined;

  /** Wrap the resting mark back into 0-4 (the drawing repeats every four quarters). */
  function settle() {
    mark.phase %= 4;
    tween = undefined;
  }

  /**
   * Turn the mark on to the bar (open) or the H (closed): the nearest such
   * position at or ahead of where it is, so it never turns back. Every call
   * decides from the position alone, never from whether a tween has started
   * yet, so any sequence of toggles ends with the mark matching the last one:
   * two in one frame leave it where it was, and a toggle mid-turn carries it on
   * round to the next matching position instead of reversing.
   */
  function morphTo(toBar: boolean) {
    const moving = !!tween;
    tween?.kill();
    tween = undefined;
    // Next odd (bar) or even (H) quarter at or ahead of the current position.
    const wanted = toBar ? 1 : 0;
    let target = Math.ceil(mark.phase - 1e-6);
    if (((target % 2) + 2) % 2 !== wanted) target += 1;
    if (!gsap || reducedMotion.matches) {
      mark.phase = target;
      settle();
      renderLogo();
      return;
    }
    if (target - mark.phase < 1e-6) {
      settle();
      return;
    }
    tween = gsap.to(mark, {
      phase: target,
      duration: (target - mark.phase) * MORPH.duration,
      // From rest: a prompt start and a soft landing. Already turning: carry the
      // motion on without easing in again.
      ease: moving ? 'power2.out' : MORPH.ease,
      onUpdate: renderLogo,
      onComplete: settle,
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
    morphTo(open);

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
  // A pointer user who then tabs through the menu is on the keyboard now:
  // Escape gives the focus back with its ring.
  header.addEventListener('keydown', (event) => {
    if (event.key === 'Tab') openedWithPointer = false;
  });

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
