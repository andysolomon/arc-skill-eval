// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

export default defineConfig({
	site: 'https://andysolomon.github.io',
	base: '/arc-skill-eval/',
	integrations: [
		starlight({
			title: 'Skeval',
			description: 'Anthropic-standard skill evaluations for Claude skills.',
			components: {
				PageTitle: './src/components/PageTitle.astro',
			},
			logo: {
				src: './public/favicon.svg',
				replacesTitle: false,
			},
			customCss: ['./src/styles/custom.css'],
			social: [
				{
					icon: 'github',
					label: 'GitHub',
					href: 'https://github.com/andysolomon/arc-skill-eval',
				},
			],
			sidebar: [
				{ label: 'Introduction', link: '/' },
				{ label: 'Quickstart', link: '/quickstart/' },
				{
					label: 'Concepts',
					autogenerate: { directory: 'concepts' },
				},
				{ label: 'Authoring evals', link: '/authoring-evals/' },
				{ label: 'CLI reference', link: '/cli-reference/' },
				{
					label: 'Examples',
					autogenerate: { directory: 'examples' },
				},
				{
					label: 'Blog',
					autogenerate: { directory: 'blog' },
				},
				{ label: 'Inspiration & credits', link: '/inspiration/' },
			],
		}),
	],
});
