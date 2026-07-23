# Web app design system

The web app is a terminal-native TUI aesthetic rendered for the browser. The
design-language spec lives in the handoff:
`docs/Arc skill eval web design/design_handoff_arc_skill_eval/design.md`
(component recipes, interaction rules, motion, overlays, copy voice). The
prototype `arc-skill-eval-app.dc.html` is the source of truth for layout.

This document covers the **implemented token system** — where tokens live, what
they're named, and how to consume them.

## Where tokens live

| Layer | Location | Role |
|---|---|---|
| Source of truth | `packages/tokens/src/tokens.ts` | Typed palettes (`themes`) + dimension scales (`dimensions`, `fontFamilyMono`) |
| Build | `packages/tokens/scripts/build.mjs` | Emits `dist/web-theme.css` (runs automatically before `dev`/`build`/`preview` in `web/`) |
| Runtime contract | `@arc-skill-eval/tokens/web-theme.css` | Plain `:root` CSS custom properties, imported by `web/src/styles.css` |
| Web helper | `web/src/design/tokens.ts` | Typed `var(--tt-*)` references for inline styles (`color`, `text`, `radius`, `space`, `tracking`, `leading`, `fontMono`) |

Themes (`tokyonight` default, `gruvbox`, `nord`) swap via `data-theme` on the
document root; only the color variables change per theme — dimensions are
theme-independent.

## Color — semantic roles (`--tt-<role>`)

Components consume the **role**, never a hex value. Semantics are stable across
themes.

| Token | Role |
|---|---|
| `--tt-bg` / `--tt-bg-dark` / `--tt-bg-hi` | app background / recessed surfaces (headers, code blocks, rails) / row hover |
| `--tt-selection` | selected row, active segmented-control background |
| `--tt-fg` / `--tt-fg-dark` | primary text, headings / body & secondary text |
| `--tt-comment` | supporting copy, labels, metadata |
| `--tt-dim` | decorative glyphs only: tree lines, empty bar cells — never sentences |
| `--tt-border` / `--tt-border-active` | default 1px borders / focused panel border, hover border, primary-outline buttons |
| `--tt-blue` | links, active nav, primary actions |
| `--tt-cyan` | section kickers, hosted accent, deterministic-assertion accent |
| `--tt-green` | pass, `with_skill`, `$` prompt, localhost accent, cost |
| `--tt-orange` | `without_skill` baseline, warnings |
| `--tt-red` | fail, errors |
| `--tt-yellow` | run ids, JSON keys, feedback accent |
| `--tt-magenta` | judge-assertion accent, improve accent |
| `--tt-teal` | file paths, directories, brand mark |

Tinted fills use `color-mix`, never new hexes:
`color-mix(in srgb, var(--tt-green) 14%, var(--tt-bg))`.

## Type scale (`--tt-text-<step>`)

One family everywhere: `--tt-font-mono` (JetBrains Mono stack).

| Step | px | Usage |
|---|---|---|
| `2xl` | 24 | benchmark delta figure |
| `xl` | 22 | chapter titles, stat-card figures |
| `lg` | 20 | wizard step titles |
| `md` | 17 | empty-state card titles |
| `base` | 15 | brand wordmark |
| `body-lg` | 14 | app root font size |
| `body` | 13 | body copy, form values, console output |
| `ui` | 12.5 | buttons, secondary body |
| `sm` | 12 | panel headers, metadata, status bar |
| `xs` | 11.5 | chips, helper copy |
| `2xs` | 11 | kickers, counts, badges |
| `3xs` | 10 | chevrons only |

Kickers: 11–12px, weight 700, ALL-CAPS via `text-transform`, letter-spacing
`--tt-tracking-kicker` (0.05em, content sections) or `--tt-tracking-kicker-wide`
(0.08em, nav rails / chapter numbers). Line heights: `--tt-leading-body` 1.6,
`--tt-leading-prose` 1.7, `--tt-leading-code` 1.9.

## Spacing (`--tt-space-<n>`) and radii (`--tt-radius-<step>`)

Spacing scale (value-named): 4 / 6 / 8 / 10 / 12 / 14 / 16 / 20 / 26 / 32.
Layout is always flex/grid + `gap`.

| Radius | px | Usage |
|---|---|---|
| `sm` | 5 | badges, chips, brand mark |
| `md` | 6 | inputs, small buttons, list rows |
| `lg` | 7 | buttons, pill containers, drop targets |
| `xl` | 8 | panels, cards, code blocks |
| `2xl` | 10 | empty-state hero cards |

Layout constants: `--tt-header-h` 50px, `--tt-statusbar-h` 25px,
`--tt-app-min-w` 1140px. No shadows anywhere — hierarchy comes from surface
color and 1px borders.

## How to consume

**CSS classes** (`styles.css`): reference the custom properties directly.

```css
.panel {
  border: 1px solid var(--tt-border);
  border-radius: var(--tt-radius-xl);
  font-size: var(--tt-text-sm);
}
```

**Inline styles** (the dominant pattern — components transcribe the prototype):
import the typed helper.

```tsx
import { color, radius, text } from '@/design/tokens';

<div style={{
  border: `1px solid ${color.border}`,
  borderRadius: radius.xl,
  color: color.fgDark,
  fontSize: text.ui,
}} />
```

Rules:

- Never write a hex color in `web/src` — always a semantic role.
- A `fontSize`/`borderRadius` that lands on a scale step uses the token; values
  intentionally off-scale (rare, prototype-exact) stay literal.
- New shared components/styles must consume tokens. Screens transcribed from
  the prototype may keep literal px where they predate the token layer;
  migrate opportunistically when touching them.
- Adding a token: edit `packages/tokens/src/tokens.ts` (it feeds both the CSS
  build and the types), then mirror the reference in `web/src/design/tokens.ts`.

## Contrast: `--tt-comment` / `--tt-dim`

The palette uses the AA-adjusted `--tt-comment`/`--tt-dim` values from
`design.md` §1.2 rather than the prototype's darker originals — the prototype's
`--tt-comment` (e.g. tokyonight `#565f89`, nord `#4c566a`) was illegible for
long-form copy, especially in nord. `--tt-comment` now sits at body-text
lightness per theme (tokyonight `#a9b1d6`, gruvbox `#d5c4a1`, nord `#d8dee9`),
and `--tt-dim` is lifted to `#8a93c4` / `#a89984` / `#94a1bd`. This is the one
deliberate deviation from the prototype's exact colors, made for readability.
`--tt-dim` remains decoration-only (tree lines, empty bar cells, chevrons);
`--tt-comment` carries supporting copy.
