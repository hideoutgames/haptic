/**
 * Prefix a site-relative path with the configured base, so links and
 * public assets keep working when the site is served from a sub-path
 * (GitHub Pages project site: /haptic/).
 */
export function withBase(path: string): string {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  if (!path.startsWith('/')) return path;
  return `${base}${path}` || '/';
}
