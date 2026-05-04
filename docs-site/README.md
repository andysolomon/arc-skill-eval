# Skeval docs site

Astro Starlight site for [`arc-skill-eval`](https://github.com/andysolomon/arc-skill-eval), branded **Skeval**. Deployed to GitHub Pages at `https://andysolomon.github.io/arc-skill-eval/`.

## Develop

From this directory:

```bash
npm install
npm run dev      # http://localhost:4321/arc-skill-eval/
npm run build    # produces ./dist
npm run preview  # preview the production build
npm run check    # astro check (TS + content config)
```

Or from the repo root, via the convenience aliases in the root `package.json`:

```bash
npm run docs:dev
npm run docs:build
npm run docs:preview
npm run docs:check
```

## Content layout

```
src/content/docs/
├── index.mdx                # Introduction (splash hero)
├── quickstart.mdx
├── concepts/                # auto-generated sidebar section
│   ├── index.md
│   ├── skills.md
│   ├── eval-cases.md
│   ├── assertions.md
│   ├── with-without-skill.md
│   ├── grading.md
│   └── artifacts.md
├── authoring-evals.mdx
├── cli-reference.md
├── examples/                # auto-generated sidebar section
│   ├── index.md
│   └── hello-world.mdx
└── blog/                    # auto-generated sidebar section
    ├── _bio.mdx             # author bio partial
    ├── index.mdx
    ├── 01-why-skill-evals-matter.mdx
    ├── 02-anatomy-of-evals-json.mdx       (draft)
    ├── 03-design-choices-and-pivots.mdx   (draft)
    └── 04-what-we-learned.mdx             (draft)
```

Blog posts marked `draft: true` in frontmatter are excluded from production builds. Flip to `false` and update `pubDate` to publish.

## Branding

Title **Skeval** / tagline **Skill Eval**. Accent color teal (`#0d9488`) via `src/styles/custom.css`. Placeholder monogram favicon at `public/favicon.svg`.

## Deploy

Pushes to `main` that touch `docs-site/**`, `docs/**`, or the workflow file trigger `.github/workflows/deploy-docs.yml`, which builds with `withastro/action@v3` and deploys with `actions/deploy-pages@v4`.

### One-time repo setup

In **Settings → Pages**, set the source to **GitHub Actions**. Without this, the deploy job will fail with "Pages site not configured."

## Audio narration

Docs pages can show an article reader powered by the browser's native Web Speech API (`speechSynthesis`). It uses the visitor's installed/system voices, so there are no API keys, model downloads, or generated audio files.

The reader is injected under the page title for normal docs pages. Use frontmatter to opt out on utility or index pages:

```yaml
audio: false
```

If a browser does not support Web Speech, the audio control hides itself.
