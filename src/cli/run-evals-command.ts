import {
  runEval,
  type EvalRunOptions,
  type EvalRunResult,
  type EvalRunSummary,
  type SkillRunResult,
  EvalRunError,
} from "../evals/eval-run/index.js";
import type { CaseRunArtifacts, CaseRunComparison, VariantRunArtifacts } from "../evals/case-pipeline.js";
import { EvalsJsonValidationError } from "../evals/loader.js";
import { CliCommandError } from "./types.js";

export type RunEvalsCommandOptions = EvalRunOptions;

export type { CaseRunArtifacts, CaseRunComparison, VariantRunArtifacts, SkillRunResult };

export type RunEvalsCommandSummary = EvalRunSummary;
export type RunEvalsCommandResult = EvalRunResult;

/**
 * Discover skills at `input`, load each `evals/evals.json`, run every
 * selected case through the Pi-backed runner, grade the outputs, and
 * write per-case `assistant.md` + `outputs/` + `timing.json` +
 * `grading.json` + observability artifacts. The
 * command never throws on per-case failures — they are recorded in
 * `errors[]` so a partial run still produces artifacts for the cases
 * that succeeded.
 */
export async function runEvalsCommand(options: RunEvalsCommandOptions): Promise<RunEvalsCommandResult> {
  try {
    return await runEval(options);
  } catch (error) {
    if (error instanceof EvalRunError) {
      throw new CliCommandError(error.message);
    }
    // Show what is wrong with the file, not a stack trace with only a count.
    if (error instanceof EvalsJsonValidationError) {
      throw new CliCommandError(`${error.message}\n${error.issues.map((issue) => `- ${issue}`).join("\n")}`);
    }
    throw error;
  }
}
