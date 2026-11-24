---
name: verify-run-lifecycle
description: Model-check the TUI run console's run lifecycle (r, esc, close, late events from an old run, the elapsed clock) with the TLA+ spec in formal/RunConsole.tla. Use when a change touches useRunController in src/tui/RunConsole.tsx, runInProcess in src/tui/run-driver.ts, the run keys in src/tui/app.tsx, or the cancellation check in src/evals/eval-run/execute.ts, or when `npm run verify:formal` fails.
---

# Verify the run console lifecycle

`formal/RunConsole.tla` models every order in which the user's keys, each run's async steps, and the clock can happen, for up to 4 runs. TLC checks three rules in every reachable state:

| Rule | In plain words | Harm when broken | Past bug |
| --- | --- | --- | --- |
| `ConsoleShowsCurrentRun` | The console on screen shows only events from the run the user started last. | An old run's late `done` marks the new run complete. | 7b99dd9 |
| `ClosedRunsStop` | Every run the console no longer shows has been told to stop. | The run keeps calling the model and spending tokens in the background. | 7b99dd9 |
| `ClockShowsCurrentRun` | The elapsed time on screen is zero or was measured for the run on screen. | A run that fails before its first tick shows the previous run's time. | c08b456 |

The abort alone does not satisfy the first rule. `runInProcess` still emits `init` and `cancelled` after an abort, so the generation check in `start()` is what keeps them out.

## Coverage

Sync commit: `586986f`. At that commit the spec was confirmed to describe this code:

| Code | Model |
| --- | --- |
| `src/tui/RunConsole.tsx` `useRunController`: `start`, `close`, `cancel`, the emit callback, the clock effect | `Start`, `DoClose`, `Close`, `Cancel`, `Emit`, `Dispatch`, `Tick` |
| `src/tui/RunConsole.tsx` `reducer`: `init`, `done`, `error`, `cancelled`, `cancelling`, `reset` | `Reduce`, `InitialRun` |
| `src/tui/run-driver.ts` `runInProcess` | `SuiteRead`, `RunEnds`, `Endings` |
| `src/tui/app.tsx` run console keys (`runCtl.start`, `runCtl.cancel`, `runCtl.close`) | `Start`, `Cancel`, `Close` |
| `src/evals/eval-run/execute.ts` `executeEvalRun`'s signal check | `Endings` |

Each `\* code:` line in the spec names a file and a line of code that the step beside it models. `npm run verify:formal` fails when that text is gone, so an edit to modeled code forces a recheck.

## Does my change touch it?

```sh
git diff 586986f -- src/tui/RunConsole.tsx src/tui/run-driver.ts src/tui/app.tsx src/evals/eval-run/execute.ts
```

If the diff changes what one of the functions above does, or adds a way to start, stop or feed a run, recheck. A change elsewhere in those files (rendering, colors, flag parsing) does not need it.

## Run the check

```sh
npm run verify:formal
```

It needs Java 11 or later. Without one, run `mise exec java@temurin-21 -- npm run verify:formal`. It downloads `tla2tools.jar` v1.7.4 once, checks its SHA-256, and caches it in `~/.cache/arc-skill-eval/`. It takes a few seconds. TLC's full output for each config is in `test-artifacts/formal/<config>.out`.

Each `formal/*.cfg` says how it must end on its `\* expect:` line:

- `RunConsole.cfg` describes the code as it is and must pass every rule.
- `RunConsole.no-generation-guard.cfg`, `RunConsole.no-abort.cfg` and `RunConsole.no-clock-reset.cfg` each remove one guard and must break its rule. If one stops breaking, the check can no longer catch that bug.

Read every result, passing or failing, with the pstack `/statechart` skill. For a broken rule it gives the shortest path in plain words. For a passing run it draws how the console moves between states. Run it on a copy of the spec and config outside the repo.

## Real bug or modeling error

A broken rule comes with TLC's shortest path. Replay it against the code one step at a time: `Start` is pressing `r`, `Cancel` is esc while the run is going, `Close` is enter or esc once it has ended, `SuiteRead` is `readEvalsJson` settling, `RunEnds` is `runEvalsCommand` settling, `Tick` is the clock interval.

- Every step can happen in that order in the code: it is a real bug. Report it with the path in the code's words. Do not weaken a rule or the model to make it pass, and do not change product code to fix it unless asked.
- A step cannot happen in the code: the model is wrong. Fix the action and its `\* code:` lines, then rerun.

## When the change is intended

1. Change the actions so that each one does what its code now does, one synchronous JavaScript turn per action. Update their `\* code:` lines.
2. If the change removes a guard on purpose, `RunConsole.cfg` must still pass. If it cannot, the change breaks a rule; see above.
3. If the change adds a guard, add a constant for it and a `RunConsole.no-<guard>.cfg` that sets it to `FALSE` and expects the rule it protects to break.
4. Run `npm run verify:formal` until every config ends as expected.
5. Move the sync commit above to the commit you confirmed, and only after you read the code at that commit against every action.

## What it does not cover

- At most 4 runs per behavior. Each run sends `init` and one end event. `case-start`, `case-progress` and `case-done` go through the same emit callback as `init`, so the model leaves them out.
- React applies a dispatch and the clock effect it triggers before the next key or await. A clock tick between a commit and its effect cleanup is not modeled.
- Unmounting the browser (its abort in `useRunController`), the spinner frame, and the library's case pool, retries and `--case-timeout` are not modeled. The library is reduced to "ends with done or error, or cancelled once aborted".
- The web app's run page and the daemon (`web/daemon/src/runner.mjs`, `state.mjs`) are not modeled.
