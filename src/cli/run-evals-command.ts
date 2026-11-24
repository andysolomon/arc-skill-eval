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
 * Runs and grades every selected case and writes its artifacts. A per-case
 * failure never throws: it is recorded in `errors[]`, so a partial run still
 * writes artifacts for the cases that succeeded.
 */
export async function runEvalsCommand(options: RunEvalsCommandOptions): Promise<RunEvalsCommandResult> {
  try {
    return await runEval(options);
  } catch (error) {
    if (error instanceof EvalRunError) {
      throw new CliCommandError(error.message);
    }
    if (error instanceof EvalsJsonValidationError) {
      throw new CliCommandError(`${error.message}\n${error.issues.map((issue) => `- ${issue}`).join("\n")}`);
    }
    throw error;
  }
}
