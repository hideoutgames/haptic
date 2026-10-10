/**
 * OS detection for the Download section.
 *
 * Prefers User-Agent Client Hints (`navigator.userAgentData.platform`) and falls
 * back to parsing the UA string. iPadOS 13+ reports itself as a Mac, so a
 * "Mac" with a touch screen is treated as an iPad.
 */
import type { PlatformId } from '../data/downloads';

interface NavigatorLike {
  userAgent: string;
  maxTouchPoints?: number;
  userAgentData?: { platform?: string };
}

/** Maps a `userAgentData.platform` value, or null when it is empty or unknown. */
function fromClientHint(platform: string | undefined): PlatformId | null {
  switch (platform?.toLowerCase()) {
    case 'macos':
      return 'mac';
    case 'ios':
      return 'ios';
    case 'android':
      return 'android';
    case 'windows':
      return 'windows';
    case 'linux':
      return 'linux';
    default:
      return null;
  }
}

function fromUserAgent(ua: string, touchPoints: number): PlatformId | null {
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios';
  if (/Android/i.test(ua)) return 'android'; // before Linux: Android UAs contain "Linux"
  if (/Windows/i.test(ua)) return 'windows';
  if (/Macintosh|Mac OS X/i.test(ua)) return touchPoints > 1 ? 'ios' : 'mac';
  if (/CrOS/i.test(ua)) return null;
  if (/Linux|X11/i.test(ua)) return 'linux';
  return null;
}

/** The visitor's platform, or null when it cannot be told (offer everything). */
export function detectPlatform(nav: NavigatorLike = navigator): PlatformId | null {
  const touchPoints = nav.maxTouchPoints ?? 0;
  const hinted = fromClientHint(nav.userAgentData?.platform);
  // A hinted "macOS" can still be an iPad pretending to be a Mac.
  if (hinted === 'mac' && touchPoints > 1) return 'ios';
  return hinted ?? fromUserAgent(nav.userAgent, touchPoints);
}

/**
 * Promotes the detected platform inside `root`: shows only its large button,
 * hides its compact link, and switches the note. Elements opt in with
 * `data-platform-id`, `data-group` and `data-note`. Without a detected platform
 * the server-rendered default (all desktop buttons) stays as it is.
 */
export function promotePlatform(root: HTMLElement, id: PlatformId | null): void {
  root.dataset.platform = id ?? 'any';
  if (!id) return;

  let group: string | undefined;
  root.querySelectorAll<HTMLElement>('[data-primary][data-platform-id]').forEach((el) => {
    const match = el.dataset.platformId === id;
    el.hidden = !match;
    if (match) group = el.dataset.group;
  });
  root.querySelectorAll<HTMLElement>('[data-secondary][data-platform-id]').forEach((el) => {
    el.hidden = el.dataset.platformId === id;
  });
  root.querySelectorAll<HTMLElement>('[data-note]').forEach((el) => {
    el.dataset.active = String(el.dataset.note === group);
  });
}

export function initPlatformPicker(root: HTMLElement): void {
  promotePlatform(root, detectPlatform());
}
