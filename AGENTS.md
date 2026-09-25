# AGENTS.md

Guidance for coding agents working in this repository.

## Testing

- Never write unit tests after you write code.
- Highly prefer E2E tests as the sole testing mechanism. Use them to verify complex features work. At the end of E2E tests, produce a verifiable and repeatable artifact.
- If you must test a system in isolation, first write down all the ways it could fail, then write the code.

### Where tests live

- E2E: `web/tests/e2e/` (Playwright). CI runs them with `npm --prefix web run test:e2e`.
- Isolated tests: `tests/*.test.mjs` (`node --test` against `dist/`, run with `npm test`). This suite keeps only tests that catch real bugs the E2E suite would miss. Don't add tests that pin constants or copy, only check shapes, or exercise their own mocks.
