import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

const SITE_URL = 'https://nazet.jp';

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
