/**
 * Inline style helper. Foldkit's `h.Style` takes string values; the design
 * code (ported from the React app) writes numbers for pixel lengths the way
 * React inline styles do. `sx` applies React's rule: a number becomes `<n>px`
 * unless the property is unitless (lineHeight, fontWeight, zIndex, flex, ...).
 * `undefined` / `false` entries are dropped so styles can be composed with
 * conditionals.
 */

export type StyleValue = string | number | undefined | false;
export type StyleInput = Readonly<Record<string, StyleValue>>;

const UNITLESS = new Set([
  'animationIterationCount',
  'aspectRatio',
  'columnCount',
  'columns',
  'flex',
  'flexGrow',
  'flexShrink',
  'fontWeight',
  'gridColumn',
  'gridColumnEnd',
  'gridColumnStart',
  'gridRow',
  'gridRowEnd',
  'gridRowStart',
  'lineClamp',
  'lineHeight',
  'opacity',
  'order',
  'orphans',
  'scale',
  'tabSize',
  'widows',
  'zIndex',
  'zoom',
  'fillOpacity',
  'strokeOpacity',
  'strokeWidth',
]);

export const sx = (...inputs: ReadonlyArray<StyleInput | undefined | false>): Record<string, string> => {
  const out: Record<string, string> = {};
  inputs.forEach((input) => {
    if (!input) {
      return;
    }
    Object.entries(input).forEach(([key, value]) => {
      if (value === undefined || value === false) {
        return;
      }
      out[key] =
        typeof value === 'number' && !UNITLESS.has(key) && !key.startsWith('--') && value !== 0
          ? `${value}px`
          : String(value);
    });
  });
  return out;
};
