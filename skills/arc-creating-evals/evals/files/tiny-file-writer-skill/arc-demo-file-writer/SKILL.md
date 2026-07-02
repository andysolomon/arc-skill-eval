---
name: arc-demo-file-writer
description: >
  Creates a short project summary file from local notes. Use when the user asks to summarize notes into notes/summary.md, create a project summary, or turn raw notes into a concise markdown artifact. Do not use for general prose editing or unrelated documentation tasks.
---

# ARC Demo File Writer

Creates `notes/summary.md` from `notes/input.md` in the current workspace.

## Workflow

1. Read `notes/input.md`.
2. Create the `notes/` directory if missing.
3. Write `notes/summary.md` with:
   - `# Project Summary` heading
   - `## Key Points` section
   - 3-5 bullets derived from the input notes
   - `## Open Questions` section if the input includes unresolved questions
4. Summarize what file was written.

## Quality rules

- Do not call external services.
- Keep the summary under 250 words.
- If `notes/input.md` is missing, ask the user for the notes instead of inventing content.
