import type { DiscoveredSkillFiles } from "../load/source-types.js";
import type { AgentRuntime, RuntimeCaseOptions, RuntimeSkillIdentity } from "../runtime/types.js";
import { runPiSdkEvalCase } from "./sdk-runner.js";
import type { PiSdkExecutionCase, RunPiSdkEvalCaseOptions } from "./types.js";

export type PiSdkEvalSkill = RunPiSdkEvalCaseOptions["skill"];
export type PiSdkEvalCase = RunPiSdkEvalCaseOptions["evalCase"];

export function runtimeSkillToFiles(skill: RuntimeSkillIdentity): DiscoveredSkillFiles {
  return {
    skillName: skill.name,
    skillDir: skill.skillDir,
    relativeSkillDir: skill.relativeSkillDir,
    skillDefinitionPath: skill.skillDefinitionPath,
    evalDefinitionPath: skill.evalDefinitionPath,
  };
}

/**
 * Trace/result compatibility projection for eval-native runs. Kind/lane exist
 * only at the Pi result boundary — not via NormalizedSkillEvalContract.
 */
export function buildEvalCompatibilityCaseDefinition(evalCase: PiSdkEvalCase): PiSdkExecutionCase {
  return {
    kind: "execution",
    lane: "execution-deterministic",
    caseId: evalCase.caseId,
    prompt: evalCase.prompt,
    skillName: evalCase.skillName,
    contractModel: undefined,
    definition: {
      id: evalCase.caseId,
      prompt: evalCase.prompt,
      fixture: undefined,
    },
  };
}

/** Translate protocol-neutral runtime input into eval-native Pi runner options. */
export function toPiSdkEvalCaseOptions(
  options: RuntimeCaseOptions,
): RunPiSdkEvalCaseOptions & { createSession?: RuntimeCaseOptions["createSession"] } {
  return {
    source: options.source,
    skill: { files: runtimeSkillToFiles(options.skill) },
    evalCase: {
      caseId: options.case.caseId,
      prompt: options.case.prompt,
      skillName: options.case.skillName,
    },
    workspaceDir: options.workspaceDir,
    workspaceEnv: options.workspaceEnv,
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

/** Default AgentRuntime: translates protocol-neutral eval input into the eval-native Pi runner. */
export const piSdkRuntime: AgentRuntime = {
  id: "pi-sdk",
  runCase: (options) => runPiSdkEvalCase(toPiSdkEvalCaseOptions(options)),
};
