# Learn chapters — DRAFT / spec (not wired into the app)

> **Status: draft.** The `.mdx` files in this directory are **not** loaded or
> rendered by the web app. They are kept as a longer-form draft / content spec.

## Where the real content lives

The Learn section renders **hardcoded TSX chapters**, not MDX. The authoritative
source — the content a user actually sees — is:

```
web/src/sections/learn/chapters/*.tsx      ← authoritative (rendered)
web/src/sections/learn/chapterList.ts       ← the seven-chapter rail
```

Edit those TSX files to change what ships. The chapter rail is seven chapters:
`overview · skill · create · assert · signal · run · pi`.

## Why the split exists

`section-learn.md` was written as a spec that assumed an MDX runtime
(`docs/web-app/learn/*.mdx` loaded at build time). The implementation instead
shipped hardcoded TSX chapters, so these MDX files were never wired in and have
drifted from what the app shows. Rather than maintain two divergent sources of
truth, we keep **TSX authoritative** and treat this directory as draft prose to
mine when deepening a chapter — never as the deployed content.

## If you want to wire MDX later

That is a real project, not a docs edit: add an MDX loader, reconcile these
seven files against the current TSX chapters (they have since diverged — e.g.
the TSX Assert chapter now teaches trace-graded behavior/safety assertions and
the soft/`--strict` gate), and delete the TSX chapters in the same change so
only one source of truth remains. Until then, do not assume anything here is
live.
