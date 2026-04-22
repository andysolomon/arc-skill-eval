import path from "node:path";

import type { NormalizedSkillEvalContract } from "../contracts/types.js";
import type {
  DiscoveredSkillFiles,
  RepoSourceDescriptor,
  ValidatedSkillDiscovery,
} from "../load/source-types.js";
import type { PiSdkRunnableCase } from "../pi/types.js";
import { runPiSdkCase } from "../pi/sdk-runner.js";
import type { EvalTrace } from "../traces/types.js";
import { normalizePiSdkCaseRunResult } from "../traces/normalize-sdk.js";
import type { DeterministicWorkspaceContext } from "../scorers/types.js";
import { createWorkspaceContextFromPiSdkCaseResult } from "../scorers/workspace.js";

export interface RunCaseViaPiOptions {
  contract: NormalizedSkillEvalContract;
  caseDefinition: PiSdkRunnableCase;
  source: RepoSourceDescriptor;
  skillFiles: DiscoveredSkillFiles;
}

export interface RunCaseViaPiResult {
  trace: EvalTrace;
  workspace: DeterministicWorkspaceContext | null;
  cleanup: () => Promise<void>;
}

/**
 * Execute a case through the real Pi SDK and return artifacts shaped
 * for the Evalite task. Caller is responsible for calling `cleanup()`
 * after scoring so the temp workspace is torn down.
 */
export async function runCaseViaPi(
  options: RunCaseViaPiOptions,
): Promise<RunCaseViaPiResult> {
  const validated: ValidatedSkillDiscovery = {
    files: options.skillFiles,
    contract: options.contract,
  };

  const caseResult = await runPiSdkCase({
    source: options.source,
    skill: validated,
    caseDefinition: options.caseDefinition,
  });

  const trace = normalizePiSdkCaseRunResult(caseResult);
  const workspace = createWorkspaceContextFromPiSdkCaseResult(caseResult);

  return {
    trace,
    workspace,
    cleanup: async () => {
      await caseResult.cleanup();
    },
  };
}

export function buildSkillFiles(options: {
  skillDir: string;
  repositoryRoot: string;
  skillName: string;
}): DiscoveredSkillFiles {
  const absSkillDir = path.resolve(options.skillDir);
  const absRepoRoot = path.resolve(options.repositoryRoot);
  const relativeSkillDir = path.relative(absRepoRoot, absSkillDir) || ".";
  return {
    skillName: options.skillName,
    skillDir: absSkillDir,
    relativeSkillDir,
    skillDefinitionPath: path.join(absSkillDir, "SKILL.md"),
    evalDefinitionPath: path.join(absSkillDir, "skill.eval.ts"),
  };
}
