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
				{ label: 'Dogfooding & Authoring Loop', link: '/dogfooding/' },
				{ label: 'Runtime & Models', link: '/runtime-and-models/' },
				{ label: 'Use it from an agent', link: '/agents/' },
				{ label: 'Web app', link: '/web-app/' },
				{ label: 'CLI reference', link: '/cli-reference/' },
				{ label: 'JSON output', link: '/json-output/' },
				{ label: 'Browse (TUI)', link: '/browse/' },
				{ label: 'Keybindings', link: '/keymap/' },
				{ label: 'Components & themes', link: '/components/' },
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
