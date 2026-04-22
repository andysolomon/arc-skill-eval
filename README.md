# arc-skill-eval

Pi-native library and CLI for evaluating skills that ship adjacent `SKILL.md` and `skill.eval.ts` files.

## Status
Current v1 foundation includes:
- skill discovery, contract validation, and contract normalization
- hermetic fixture materialization with first-class git state
- Pi SDK execution for routing, deterministic execution, CLI parity baselines, and live-smoke runs
- Pi CLI JSON execution for declared `cliParity[]` cases
- canonical trace normalization for SDK and CLI runs
- deterministic scoring for routing and execution lanes
- JSON-first reporting with optional single-file HTML rendering
- library-backed CLI commands for `list`, `validate`, and `test`
- semantic-release automation

## What this project does
`arc-skill-eval` evaluates participating Pi skills in a repo by:
1. discovering skill directories that contain both `SKILL.md` and `skill.eval.ts`
2. loading and validating the adjacent eval contract
3. executing declared cases through Pi runtimes
4. normalizing runtime artifacts into canonical traces
5. scoring deterministic lanes
6. emitting invocation-wide report artifacts

## Core docs
- `docs/skill-evals-v1.md`
- `docs/skill-eval-schema.md`
- `docs/framework-repo-structure.md`
- `docs/domain-model.md`

## Requirements
- Node.js `>=20`
- Pi installed/configured for real runtime execution
- Pi auth/model configuration available for live SDK or CLI runs

## Install as a CLI

### From a local checkout
```bash
npm install
npm run build
npm link
arc-skill-eval --help
```

### From a published package
```bash
npm install --global arc-skill-eval
arc-skill-eval --help
```

## Local development
```bash
npm install
npm run build
npm run typecheck
npm test
```

## CLI surface
```bash
arc-skill-eval list <repo-or-path>
arc-skill-eval validate <repo-or-path>
arc-skill-eval test <repo-or-path>
arc-skill-eval test <repo-or-path> --skill arc-planning-work
arc-skill-eval test <repo-or-path> --skill arc-planning-work --case routing-explicit-001
arc-skill-eval test <repo-or-path> --skill arc-planning-work --case cli-parity-001
```

### Source inputs
All commands accept the same `<repo-or-path>` input.

Examples:
```bash
arc-skill-eval test ../arc-skills
arc-skill-eval test github:andysolomon/arc-skills@main
```

## Typical workflow

### Discover participating skills
```bash
arc-skill-eval list ../arc-skills
```

### Validate contracts
```bash
arc-skill-eval validate ../arc-skills
arc-skill-eval validate ../arc-skills --skill arc-planning-work
```

### Run evals
```bash
arc-skill-eval test ../arc-skills
arc-skill-eval test ../arc-skills --skill arc-planning-work
arc-skill-eval test ../arc-skills --skill arc-planning-work --case execution-001
arc-skill-eval test ../arc-skills --html
```

### Machine-readable output
```bash
arc-skill-eval list ../arc-skills --json
arc-skill-eval validate ../arc-skills --json
arc-skill-eval test ../arc-skills --json
```

## Current v1 behavior
- `--skill <name>` is repeatable on `list`, `validate`, and `test`
- `--case <id>` is repeatable on `test`
- `test` runs deterministic lanes plus declared `cliParity[]` cases by default
- `--include-live-smoke` opt-ins live-smoke execution
- `test` always writes `report.json`
- `--html` additionally writes `report.html`
- default stdout is human-readable
- `--json` prints each command’s canonical payload directly
- exit codes are currently `0` or `1`

## Evaluation lanes
- **Routing:** explicit, implicit-positive, adjacent-negative, hard-negative
- **Deterministic execution:** fixture-backed execution cases with deterministic scoring
- **CLI parity:** same-invocation SDK-vs-CLI comparison for declared golden cases
- **Live smoke:** opt-in live runtime checks for cases that require them

## Reports
`arc-skill-eval test` produces an invocation-wide report.

Default artifact location:
```text
.arc-skill-eval/reports/<runId>/
```

Artifacts:
- `report.json` always
- `report.html` when `--html` is passed

The JSON report includes:
- top-level invocation metadata and status
- valid and invalid skills
- scored deterministic cases
- unscored executed cases such as live-smoke
- parity case results with mismatch diagnostics and paired trace refs
- shared canonical traces for SDK and CLI runs

## Library areas
Main code lives in:
- `src/load/`
- `src/contracts/`
- `src/fixtures/`
- `src/pi/`
- `src/traces/`
- `src/scorers/`
- `src/reporting/`
- `src/cli/`

## Notes
- deterministic scoring is currently implemented for routing and execution lanes
- CLI parity is currently a case-level drift signal, not a weighted score lane
- tier computation and pilot onboarding are later follow-up work
