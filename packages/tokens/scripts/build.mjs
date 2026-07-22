import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const packageDir = resolve(scriptDir, '..');
const tokenSourcePath = resolve(packageDir, 'src/tokens.ts');
const templatePath = resolve(packageDir, 'tailwind-theme.css.template');
const outputPath = resolve(packageDir, 'dist/web-theme.css');

const source = await readFile(tokenSourcePath, 'utf8');
const template = await readFile(templatePath, 'utf8');

const themesMatch = source.match(
  /export const themes = (\{[\s\S]*?\n\}) as const satisfies Themes;/,
);

const defaultThemeMatch = source.match(
  /export const defaultTheme = '([^']+)' satisfies ThemeName;/,
);

if (!themesMatch?.[1] || !defaultThemeMatch?.[1]) {
  throw new Error('Unable to extract themes/defaultTheme from src/tokens.ts');
}

const themes = Function(`"use strict"; return (${themesMatch[1]});`)();
const defaultTheme = defaultThemeMatch[1];
const roles = Object.keys(themes[defaultTheme] ?? {});

if (roles.length === 0) {
  throw new Error(`Default theme "${defaultTheme}" is missing or empty`);
}

const renderVars = (themeName, palette) =>
  roles
    .map((role) => {
      const value = palette[role];

      if (typeof value !== 'string' || !/^#[0-9a-f]{6}$/i.test(value)) {
        throw new Error(`Invalid hex token ${themeName}.${role}: ${String(value)}`);
      }

      return [
        `  --tt-${themeName}-${toKebab(role)}: ${value};`,
        `  --color-tt-${themeName}-${toKebab(role)}: ${value};`,
      ].join('\n');
    })
    .join('\n');

const renderAssignments = (themeName) =>
  roles
    .map((role) => {
      const kebabRole = toKebab(role);

      return [
        `  --tt-${kebabRole}: var(--tt-${themeName}-${kebabRole});`,
        `  --color-tt-${kebabRole}: var(--color-tt-${themeName}-${kebabRole});`,
      ].join('\n');
    })
    .join('\n');

const themeVariables = Object.entries(themes)
  .map(([themeName, palette]) => renderVars(themeName, palette))
  .join('\n');

const themeBlocks = Object.keys(themes)
  .filter((themeName) => themeName !== defaultTheme)
  .map((themeName) => `[data-theme="${themeName}"] {\n${renderAssignments(themeName)}\n}`)
  .join('\n\n');

const output = renderTemplate(template, {
  defaultTheme,
  themeVariables,
  defaultAssignments: renderAssignments(defaultTheme),
  themeBlocks,
}).trimEnd() + '\n';

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, output, 'utf8');

function renderTemplate(input, values) {
  return input.replaceAll(/\{\{(\w+)\}\}/g, (_match, key) => {
    const value = values[key];

    if (typeof value !== 'string') {
      throw new Error(`Unknown template token: ${key}`);
    }

    return value;
  });
}

function toKebab(value) {
  return value.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`);
}
