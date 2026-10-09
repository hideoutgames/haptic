/**
 * Every Haptic download in one place: the Download section and (later) the
 * Download page both read from here.
 *
 * TODO: all `href`s are placeholders ("#") until builds and store listings
 * exist. Replace them here; nothing else needs to change.
 */

export type PlatformId = 'mac' | 'windows' | 'linux' | 'ios' | 'android';
export type PlatformGroup = 'desktop' | 'mobile';
export type IconName = 'apple' | 'windows' | 'linux' | 'googleplay' | 'appstore' | 'android';

export interface Platform {
  id: PlatformId;
  /** Desktop builds are free; mobile apps need a subscription. */
  group: PlatformGroup;
  /** Small line above the name on the large button ("Download for"). */
  lead: string;
  /** Large line on the button ("Mac", "App Store"). */
  name: string;
  /** Label of the compact link in the "Other platforms" row. */
  short: string;
  icon: IconName;
  /** Icon of the compact link (differs where the large button shows a store mark). */
  shortIcon: IconName;
  href: string;
}

export const PLATFORMS: readonly Platform[] = [
  { id: 'mac', group: 'desktop', lead: 'Download for', name: 'Mac', short: 'macOS', icon: 'apple', shortIcon: 'apple', href: '#' },
  { id: 'windows', group: 'desktop', lead: 'Download for', name: 'Windows', short: 'Windows', icon: 'windows', shortIcon: 'windows', href: '#' },
  { id: 'linux', group: 'desktop', lead: 'Download for', name: 'Linux', short: 'Linux', icon: 'linux', shortIcon: 'linux', href: '#' },
  { id: 'ios', group: 'mobile', lead: 'Download on the', name: 'App Store', short: 'iPhone & iPad', icon: 'apple', shortIcon: 'appstore', href: '#' },
  { id: 'android', group: 'mobile', lead: 'Get it on', name: 'Google Play', short: 'Android', icon: 'googleplay', shortIcon: 'android', href: '#' },
];

export const PRICING_HREF = '/pricing';
