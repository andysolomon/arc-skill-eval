import path from "node:path";

import type { NormalizedSkillEvalContract } from "../contracts/types.js";
import type {
  DiscoveredSkillFiles,
  RepoSourceDescriptor,
  ValidatedSkillDiscovery,
} from "../load/source-types.js";
import type { PiSdkParityCase, PiSdkRunnableCase } from "../pi/types.js";
import { runPiSdkCase } from "../pi/sdk-runner.js";
import { runPiCliJsonCase } from "../pi/cli-json-runner.js";
import type { EvalTrace, EvalTraceParityComparisonResult } from "../traces/types.js";
import { normalizePiSdkCaseRunResult } from "../traces/normalize-sdk.js";
import { normalizePiCliJsonCaseRunResult } from "../traces/normalize-cli-json.js";
import { compareEvalTraceParity } from "../traces/compare-parity.js";
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

export interface RunParityCaseViaPiOptions {
  contract: NormalizedSkillEvalContract;
  caseDefinition: PiSdkParityCase;
  source: RepoSourceDescriptor;
  skillFiles: DiscoveredSkillFiles;
}

export interface RunParityCaseViaPiResult {
  sdkTrace: EvalTrace;
  cliTrace: EvalTrace;
  comparison: EvalTraceParityComparisonResult;
  cleanup: () => Promise<void>;
}

/**
 * Execute a `cli-parity` case through both the Pi SDK and the Pi CLI
 * JSON runtime, normalize each side, and compare them. Caller must
 * call `cleanup()` to tear down both temp workspaces.
 */
export async function runParityCaseViaPi(
  options: RunParityCaseViaPiOptions,
): Promise<RunParityCaseViaPiResult> {
  const validated: ValidatedSkillDiscovery = {
    files: options.skillFiles,
    contract: options.contract,
  };

  // Fresh workspaces per runtime — required because the SDK and CLI
  // paths materialize fixtures independently and could otherwise
  // trample each other's state.
  const sdkResult = await runPiSdkCase({
    source: options.source,
    skill: validated,
    caseDefinition: options.caseDefinition,
  });

  let cliResult;
  try {
    cliResult = await runPiCliJsonCase({
      source: options.source,
      skill: validated,
      caseDefinition: options.caseDefinition,
    });
  } catch (error) {
    await sdkResult.cleanup().catch(() => undefined);
    throw error;
  }

  const sdkTrace = normalizePiSdkCaseRunResult(sdkResult);
  const cliTrace = normalizePiCliJsonCaseRunResult(cliResult);
  const comparison = compareEvalTraceParity({ sdkTrace, cliTrace });

  return {
    sdkTrace,
    cliTrace,
    comparison,
    cleanup: async () => {
      await Promise.all([
        sdkResult.cleanup().catch(() => undefined),
        cliResult.cleanup().catch(() => undefined),
      ]);
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
