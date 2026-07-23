/**
 * Typed references to the design tokens emitted by @arc-skill-eval/tokens
 * (dist/web-theme.css, imported in styles.css). The CSS custom properties are
 * the contract; this module just gives inline styles autocomplete and a
 * single place to see every token name.
 *
 * Token values and usage rules: docs/web-app/design-system.md
 */

/** Semantic color roles — one per `--tt-<role>` palette variable. */
export const color = {
  bg: 'var(--tt-bg)',
  bgDark: 'var(--tt-bg-dark)',
  bgHi: 'var(--tt-bg-hi)',
  fg: 'var(--tt-fg)',
  fgDark: 'var(--tt-fg-dark)',
  comment: 'var(--tt-comment)',
  blue: 'var(--tt-blue)',
  cyan: 'var(--tt-cyan)',
  green: 'var(--tt-green)',
  magenta: 'var(--tt-magenta)',
  red: 'var(--tt-red)',
  orange: 'var(--tt-orange)',
  yellow: 'var(--tt-yellow)',
  teal: 'var(--tt-teal)',
  selection: 'var(--tt-selection)',
  border: 'var(--tt-border)',
  borderActive: 'var(--tt-border-active)',
  dim: 'var(--tt-dim)',
} as const;

/** Type scale (design.md §1.3). Keys mirror `--tt-text-*`. */
export const text = {
  '2xl': 'var(--tt-text-2xl)', // 24px — benchmark delta figure
  xl: 'var(--tt-text-xl)', // 22px — chapter titles, stat figures
  lg: 'var(--tt-text-lg)', // 20px — wizard step titles
  md: 'var(--tt-text-md)', // 17px — empty-state card titles
  base: 'var(--tt-text-base)', // 15px — brand wordmark
  bodyLg: 'var(--tt-text-body-lg)', // 14px — app root font size
  body: 'var(--tt-text-body)', // 13px — body copy, form values, console
  ui: 'var(--tt-text-ui)', // 12.5px — buttons, secondary body
  sm: 'var(--tt-text-sm)', // 12px — panel headers, metadata, status bar
  xs: 'var(--tt-text-xs)', // 11.5px — chips, helper copy
  '2xs': 'var(--tt-text-2xs)', // 11px — kickers, counts, badges
  '3xs': 'var(--tt-text-3xs)', // 10px — chevrons only
} as const;

/** Corner radii (design.md §1.5). Keys mirror `--tt-radius-*`. */
export const radius = {
  sm: 'var(--tt-radius-sm)', // 5px — badges, chips, brand mark
  md: 'var(--tt-radius-md)', // 6px — inputs, small buttons, list rows
  lg: 'var(--tt-radius-lg)', // 7px — buttons, pills, drop targets
  xl: 'var(--tt-radius-xl)', // 8px — panels, cards, code blocks
  '2xl': 'var(--tt-radius-2xl)', // 10px — empty-state hero cards
} as const;

/** Spacing scale (design.md §1.4), value-named: space[8] → var(--tt-space-8). */
export const space = {
  4: 'var(--tt-space-4)',
  6: 'var(--tt-space-6)',
  8: 'var(--tt-space-8)',
  10: 'var(--tt-space-10)',
  12: 'var(--tt-space-12)',
  14: 'var(--tt-space-14)',
  16: 'var(--tt-space-16)',
  20: 'var(--tt-space-20)',
  26: 'var(--tt-space-26)',
  32: 'var(--tt-space-32)',
} as const;

/** Kicker letter-spacing. */
export const tracking = {
  kicker: 'var(--tt-tracking-kicker)', // 0.05em — content-section kickers
  kickerWide: 'var(--tt-tracking-kicker-wide)', // 0.08em — rail/chapter kickers
} as const;

/** Line heights (unitless). */
export const leading = {
  body: 'var(--tt-leading-body)', // 1.6
  prose: 'var(--tt-leading-prose)', // 1.7
  code: 'var(--tt-leading-code)', // 1.9
} as const;

export const fontMono = 'var(--tt-font-mono)';
