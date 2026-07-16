import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

const SITE_URL = 'https://nazet.jp';

export default defineConfig({
  site: SITE_URL,
  // Astro doesn't read PORT itself; honor it so tooling can assign a free port.
  server: process.env.PORT ? { port: Number(process.env.PORT) } : {},
  integrations: [sitemap()],
  i18n: {
    defaultLocale: 'ja',
    locales: ['ja', 'en'],
    routing: {
      prefixDefaultLocale: false,
    },
  },
});
