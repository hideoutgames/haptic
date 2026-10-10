// @ts-check
import { defineConfig } from 'astro/config';

// The deploy workflow sets these for the target host (GitHub Pages project
// site: SITE_URL=https://hideoutgames.github.io, BASE_PATH=/haptic; custom
// domain: its own URL and "/"). Locally they fall back to the root.
export default defineConfig({
  site: process.env.SITE_URL ?? 'https://hideoutgames.github.io',
  base: process.env.BASE_PATH ?? '/',
  trailingSlash: 'ignore',
  devToolbar: { enabled: false },
  build: { inlineStylesheets: 'auto' },
});
