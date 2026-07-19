# Pilot: `arc-conventional-commits`

P4 reference pilot for repo-mutation skills with deterministic fixtures and compare-ready eval coverage.

## Skill location

The pilot skill is vendored at `pilots/arc-conventional-commits/` so a fresh clone can run the suite without checking out `arc-skills`. Canonical skill source remains [`andysolomon/arc-skills`](https://github.com/andysolomon/arc-skills); sync pilot fixtures when the upstream eval suite changes.

## Eval cohort (7 cases)

| Case | Type | Grading |
| --- | --- | --- |
| `trigger-explicit-named` | Trigger | LLM judge + string assertions |
| `trigger-implicit-release-automation` | Trigger | String assertions |
| `trigger-implicit-version-bump` | Trigger | String assertions |
| `trigger-negative-single-commit-message` | Adjacent negative | Regex + string |
| `execution-clean-repo` | Execution | File + regex assertions on `.releaserc.json` |
| `execution-migrate-standard-version` | Execution | File + regex + string assertions |
| `edge-monorepo-warning` | Edge | Regex + string assertions |

Fixtures live under `pilots/arc-conventional-commits/evals/files/`.

## Smoke run (single variant)

Requires Pi configured with a provider API key:

```bash
arc-skill-eval run pilots/arc-conventional-commits
```

Inspect artifacts under `pilots/arc-conventional-commits/evals-runs/<runId>/`.

## Compare run (with-skill vs without-skill)

```bash
arc-skill-eval run pilots/arc-conventional-commits --compare
```

Review `benchmark.json` at the run root for per-case and aggregate pass-rate deltas.

## Narrow runs while iterating

```bash
# One execution case with seeded fixtures
arc-skill-eval run pilots/arc-conventional-commits --case execution-clean-repo

# Trigger cohort only
arc-skill-eval run pilots/arc-conventional-commits \
  --case trigger-explicit-named \
  --case trigger-implicit-release-automation \
  --case trigger-implicit-version-bump \
  --case trigger-negative-single-commit-message
```

## Review loop

```bash
RUN_DIR=$(ls -td pilots/arc-conventional-commits/evals-runs/* | head -1)
arc-skill-eval review "$RUN_DIR"
```

Fill in `feedback.json`, then:

```bash
arc-skill-eval improve --from-feedback "$RUN_DIR/feedback.json" --summary
```

## CI coverage

`tests/pilot-arc-conventional-commits.test.mjs` validates discovery, eval shape, and fixture presence without calling a model.

## Acceptance checklist (P4)

- [x] Skill + `evals/evals.json` + fixtures committed under `pilots/`
- [x] Loader/discovery tests pass in CI
- [ ] Full `--compare` run produces `benchmark.json` with positive with-skill delta
- [ ] Gaps documented as eval or skill improvements after first live run

## Syncing from `arc-skills`

When upstream evals change:

```bash
rsync -a --delete \
  ../arc-skills/arc-conventional-commits/ \
  pilots/arc-conventional-commits/
```

Then re-run `npm test` and a local compare run.
