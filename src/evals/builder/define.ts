/**
 * `defineSkillEval` — a typed, programmatic authoring layer that emits the same
 * `evals/evals.json` the runtime already consumes. This is NOT Eve's
 * `defineEval`: there is no `test(t)`, no live session driver, no second runner.
 * `toJSON()` builds an `EvalsJsonFile` and validates it with the loader's own
 * validator, so authoring errors (duplicate ids, bad assertion shapes) surface
 * at build time instead of at run time. See `docs/eve-eval-leverage.md`.
 */

import { validateEvalsJsonValue } from "../loader.js";
import type { EvalAssertion, EvalCase, EvalsJsonFile } from "../types.js";
import type { WorkspaceMountMode, WorkspaceSetup } from "../../contracts/types.js";
import { AssertionBuilder, type AssertionInput } from "./assertions.js";

/** A case whose `assertions` may be builders, strings, or raw assertion objects. */
export interface CaseInput extends Omit<EvalCase, "assertions"> {
  assertions?: AssertionInput[];
}

export interface DefineSkillEvalInput {
  skill_name: string;
  /** Optional forward-compat suite version, emitted verbatim. */
  version?: string;
  cases: CaseInput[];
}

/** A built suite. Branded so `JSON.stringify(suite)` and `suite.toJSON()` agree. */
export interface SkillEvalSuite {
  readonly skill_name: string;
  /** Assemble and validate the `evals.json` shape. Throws on invalid suites. */
  toJSON(): EvalsJsonFile;
}

/**
 * Author a skill eval suite in TypeScript. The result is emit-only — feed
 * `suite.toJSON()` (or `JSON.stringify(suite, null, 2)`) to `evals/evals.json`;
 * the runner still discovers and runs that JSON, never this module.
 */
export function defineSkillEval(input: DefineSkillEvalInput): SkillEvalSuite {
  const build = (): EvalsJsonFile => {
    const evals: EvalCase[] = input.cases.map((entry) => {
      const caseId = String(entry.id);
      const { assertions, ...rest } = entry;
      const finalized: EvalAssertion[] = (assertions ?? []).map((assertion, index) =>
        assertion instanceof AssertionBuilder ? assertion.finalize(caseId, index) : assertion,
      );
      return {
        ...rest,
        ...(finalized.length > 0 ? { assertions: finalized } : {}),
      };
    });

    const file = {
      ...(input.version !== undefined ? { version: input.version } : {}),
      skill_name: input.skill_name,
      evals,
    };

    // Reuse the loader's validator so emit fails early on duplicate case ids,
    // malformed assertions, or bad setup shapes. Returns a frozen EvalsJsonFile.
    return validateEvalsJsonValue(file, "defineSkillEval");
  };

  return {
    skill_name: input.skill_name,
    toJSON: build,
  };
}

/**
 * Identity helper for authoring a single case with full type-checking and
 * assertion-builder inference. Purely ergonomic — returns its input.
 */
export function evalCase(input: CaseInput): CaseInput {
  return input;
}

/** Build a `seeded` workspace setup from a single fixture source. */
export function seeded(opts: { from: string; to?: string; mountMode?: WorkspaceMountMode }): WorkspaceSetup {
  return {
    kind: "seeded",
    sources: [{ from: opts.from, ...(opts.to !== undefined ? { to: opts.to } : {}) }],
    ...(opts.mountMode !== undefined ? { mountMode: opts.mountMode } : {}),
  };
}
