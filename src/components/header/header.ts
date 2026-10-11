/**
 * Header behaviour: menu toggle (with the H → bar morph), keyboard and
 * outside-click handling, and where the fade under the H starts. The menu
 * works on its own; GSAP is only fetched, in the background, to tween the
 * logo morph.
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

  let tween: ReturnType<Gsap['to']> | undefined;
  /** Where the running tween started and where it ends (0 or 1 each). */
  let tweenFrom = 0;
  let tweenTo = 0;

  function morphTo(target: number) {
    if (!gsap || reducedMotion.matches) {
      tween?.kill();
      morph.t = target;
      renderLogo();
      return;
    }
    // Turned round mid-morph: play the running tween back from where it is.
    // The mark heads home at the speed it had, along the same path, instead
    // of stopping and easing off again from rest.
    if (tween?.isActive()) {
      if ((tween.reversed() ? tweenFrom : tweenTo) !== target) tween.reversed(!tween.reversed());
      return;
    }
    if (morph.t === target) return;
    // The same curve both ways: a prompt start and a long, soft landing.
    tweenFrom = morph.t;
    tweenTo = target;
    tween = gsap.to(morph, {
      t: target,
      duration: MORPH.duration,
      ease: MORPH.ease,
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

  // ---- Fade under the H -----------------------------------------------------
  // The fade covers what scrolls up after the hero's glow and lettering: its
  // mask starts at the top edge of the hero's editor window (--fade-from, in
  // viewport px; see SiteHeader.astro), so the hero itself is never shaded.
  // Pages without that window get the fade everywhere. Lenis scrolls the
  // window from GSAP's ticker, whose frame callback runs before the one
  // queued here, so the edge moves with the content in the same frame.
  const edge = document.querySelector<HTMLElement>('[data-hero] .hero__window');
  /** Document y of the edge; -Infinity: fade everywhere. */
  let edgeY = -Infinity;
  let fadeFrom = NaN;
  let queued = false;

  const updateFade = () => {
    queued = false;
    // Clamped: past the edge the whole fade shows; well below it, none.
    const y = Math.round(Math.min(Math.max(edgeY - window.scrollY, -200), 2000));
    if (y !== fadeFrom) header.style.setProperty('--fade-from', `${(fadeFrom = y)}px`);
  };

  const queueFade = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(updateFade);
  };

  if (edge) {
    // Layout position, which ignores the window's load-in transform. It moves
    // only when the hero is laid out again (width, fonts), and so does the
    // hero's size.
    const measure = () => {
      let y = 0;
      for (let el: HTMLElement | null = edge; el; el = el.offsetParent as HTMLElement | null) y += el.offsetTop;
      edgeY = y;
      queueFade();
    };
    new ResizeObserver(measure).observe(edge.closest('[data-hero]') ?? edge);
    window.addEventListener('scroll', queueFade, { passive: true });
  } else {
    updateFade();
  }
}
