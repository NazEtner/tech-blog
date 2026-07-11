import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// TODO: replace with the real custom domain once it's decided (needed for
// correct absolute URLs in the sitemap and RSS feeds).
const SITE_URL = 'https://example.com';

export default defineConfig({
  site: SITE_URL,
  integrations: [sitemap()],
  i18n: {
    defaultLocale: 'ja',
    locales: ['ja', 'en'],
    routing: {
      prefixDefaultLocale: false,
    },
  },
});
