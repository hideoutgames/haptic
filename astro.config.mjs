// @ts-check
import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://haptic.example',
  trailingSlash: 'ignore',
  devToolbar: { enabled: false },
  build: { inlineStylesheets: 'auto' },
});
