// Regenerate the browse keymap docs page from the canonical KEYMAP.
//   node scripts/gen-keymap-docs.mjs
// Writes docs-site/src/content/docs/keymap.md. Run it in the pre-commit hook
// (or CI) so the docs can never drift from src/tui/keymap.ts.

import { writeFile } from 'node:fs/promises';
import { keymapToMarkdown } from '../dist/tui/keymap.js';

const frontmatter = `---
title: Keybindings
description: Every keystroke in the arc-skill-eval browse TUI. Generated from src/tui/keymap.ts — do not edit by hand.
---

> This page is generated from \`src/tui/keymap.ts\` by \`scripts/gen-keymap-docs.mjs\`.
> The in-TUI help overlay (\`?\`) renders from the same source, so the two cannot drift.

`;

await writeFile(
  new URL('../docs-site/src/content/docs/keymap.md', import.meta.url),
  frontmatter + keymapToMarkdown(),
  'utf8',
);
console.log('wrote docs-site/src/content/docs/keymap.md');
