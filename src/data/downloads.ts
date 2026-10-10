/**
 * Every Haptic download in one place: the Download section and (later) the
 * Download page both read from here.
 *
 * TODO: all `href`s are placeholders ("#") until builds and store listings
 * exist. Replace them here; nothing else needs to change.
 */

export type PlatformId = 'mac' | 'windows' | 'linux' | 'ios' | 'android';
export type PlatformGroup = 'desktop' | 'mobile';
export type IconName = 'apple' | 'windows' | 'linux';
/** Official store badge artwork (src/assets/badges), used instead of a custom button. */
export type StoreId = 'appstore' | 'googleplay';

export interface Platform {
  id: PlatformId;
  /** Desktop builds are free; the mobile apps need Haptic Pro. */
  group: PlatformGroup;
  /** Small line above the name on the large button ("Download for"); with `name`, the badge's alt text. */
  lead: string;
  /** Large line on the button ("Mac", "Windows", "App Store"). */
  name: string;
  /** Label of the compact link in the "Other platforms" row. */
  short: string;
  /** Desktop platforms: the mark on the custom button and chip. */
  icon?: IconName;
  /** Mobile platforms: the store's official badge replaces both the large button and the chip. */
  store?: StoreId;
  href: string;
}

export const PLATFORMS: readonly Platform[] = [
  { id: 'mac', group: 'desktop', lead: 'Download for', name: 'Mac', short: 'macOS', icon: 'apple', href: '#' },
  { id: 'windows', group: 'desktop', lead: 'Download for', name: 'Windows', short: 'Windows', icon: 'windows', href: '#' },
  { id: 'linux', group: 'desktop', lead: 'Download for', name: 'Linux', short: 'Linux', icon: 'linux', href: '#' },
  { id: 'ios', group: 'mobile', lead: 'Download on the', name: 'App Store', short: 'iPhone & iPad', store: 'appstore', href: '#' },
  { id: 'android', group: 'mobile', lead: 'Get it on', name: 'Google Play', short: 'Android', store: 'googleplay', href: '#' },
];

export const PRICING_HREF = '/pricing';
