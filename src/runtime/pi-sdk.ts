// Default AgentRuntime: translates protocol-neutral eval input into the
// preserved Pi SDK runner options, then forwards to runPiSdkCase.
//
// Compatibility metadata synthesized here (and nowhere on the standard
// eval path): profile=repo-mutation, targetTier=1, empty normalized
// legacy lanes, kind=execution, lane=execution-deterministic.

import { normalizeSkillEvalContract } from "../contracts/normalize.js";
import type { ValidatedSkillDiscovery } from "../load/source-types.js";
import { runPiSdkCase } from "../pi/sdk-runner.js";
import type { PiSdkExecutionCase, RunPiSdkCaseOptions } from "../pi/types.js";

import type { AgentRuntime, RuntimeCaseOptions, RuntimeExecutionCase, RuntimeSkillIdentity } from "./types.js";

export const piSdkRuntime: AgentRuntime = {
  id: "pi-sdk",
  runCase: (options) => runPiSdkCase(toPiSdkCaseOptions(options)),
};

/**
 * Convert eval-native runtime options into RunPiSdkCaseOptions.
 * Exported for focused adapter tests.
 */
export function toPiSdkCaseOptions(options: RuntimeCaseOptions): RunPiSdkCaseOptions & {
  createSession?: RuntimeCaseOptions["createSession"];
} {
  return {
    source: options.source,
    skill: toValidatedSkillDiscovery(options.skill),
    caseDefinition: toPiSdkExecutionCase(options.case),
    workspaceDir: options.workspaceDir,
    agentDir: options.agentDir,
    model: options.model,
    attachSkill: options.attachSkill,
    extraSkillPaths: options.extraSkillPaths,
    contextMode: options.contextMode,
    sandbox: options.sandbox,
    sandboxMocks: options.sandboxMocks,
    createSession: options.createSession,
  };
}

function toValidatedSkillDiscovery(skill: RuntimeSkillIdentity): ValidatedSkillDiscovery {
  const contract = normalizeSkillEvalContract({
    skill: skill.name,
    profile: "repo-mutation",
    targetTier: 1,
    routing: {
      explicit: [],
      implicitPositive: [],
      adjacentNegative: [],
    },
  });

  return {
    files: {
      skillName: skill.name,
      skillDir: skill.skillDir,
      relativeSkillDir: skill.relativeSkillDir,
      skillDefinitionPath: skill.skillDefinitionPath,
      evalDefinitionPath: skill.evalDefinitionPath,
    },
    contract,
  };
}

function toPiSdkExecutionCase(caseInput: RuntimeExecutionCase): PiSdkExecutionCase {
  return {
    kind: "execution",
    lane: "execution-deterministic",
    caseId: caseInput.caseId,
    prompt: caseInput.prompt,
    skillName: caseInput.skillName,
    contractModel: undefined,
    definition: {
      id: caseInput.caseId,
      prompt: caseInput.prompt,
      fixture: undefined,
    },
  };
}
