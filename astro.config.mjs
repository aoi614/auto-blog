// @ts-check

import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import { defineConfig } from 'astro/config';

// https://astro.build/config
export default defineConfig({
	site: 'https://aoi614.github.io',
	base: '/auto-blog',
	integrations: [mdx(), sitemap()],
});
