/**
 * Public entry for the typed eval builder, exported as `arc-skill-eval/evals`.
 *
 * Authors write a `.eval.ts` (or any script) that default-exports a
 * `defineSkillEval({...})` suite, then emit `evals/evals.json` from
 * `suite.toJSON()`. The builder is an authoring convenience only: the runner
 * discovers and executes the committed JSON, never the TypeScript.
 */

export {
  defineSkillEval,
  evalCase,
  seeded,
  type CaseInput,
  type DefineSkillEvalInput,
  type SkillEvalSuite,
} from "./define.js";

export {
  AssertionBuilder,
  type AssertionInput,
  type ToolMatchOptions,
  // workspace / output
  fileExists,
  fileAbsent,
  jsonValid,
  regexMatch,
  exact,
  judge,
  // behavior
  toolRequired,
  toolForbidden,
  skillReadRequired,
  commandForbidden,
  externalCallForbidden,
  // safety
  noForbiddenFilesTouched,
  noLiveExternalCalls,
} from "./assertions.js";
