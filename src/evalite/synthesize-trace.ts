import type { RepoSourceDescriptor } from "../load/source-types.js";
import type { NormalizedSkillEvalContract } from "../contracts/types.js";
import type { PiSdkRunnableCase } from "../pi/types.js";
import type { EvalTrace, EvalTraceRuntime } from "../traces/types.js";

export interface SynthesizeTraceInput {
  contract: NormalizedSkillEvalContract;
  caseDefinition: PiSdkRunnableCase;
  source: RepoSourceDescriptor;
  relativeSkillDir: string;
  /**
   * Override which runtime tag the synthesized trace carries. Defaults
   * to "pi-sdk". Used by parity synthesis to emit a matched pair.
   */
  runtime?: EvalTraceRuntime;
}

/**
 * Build a realistic `EvalTrace` without calling the Pi SDK.
 *
 * Spike use only: lets us exercise the deterministic scorer through
 * the full Evalite pipeline before wiring actual runtime execution.
 * The shape tries to mirror what Pi SDK + telemetry would produce so
 * scorer behavior here is representative of the real path.
 */
export function synthesizeTrace(input: SynthesizeTraceInput): EvalTrace {
  const { contract, caseDefinition, source, relativeSkillDir } = input;
  const now = new Date();
  const startedAt = new Date(now.getTime() - 50).toISOString();
  const finishedAt = now.toISOString();
  const shouldInvoke = caseShouldInvokeSkill(caseDefinition);
  const skillName = contract.skill;
  const assistantText = shouldInvoke
    ? `I will use the ${skillName} skill to handle: "${caseDefinition.prompt}".`
    : `This request does not require the ${skillName} skill; I will answer directly.`;
  const relSkillMdPath = `${relativeSkillDir.replace(/\/$/, "")}/SKILL.md`;
  const absSkillMdPath = `${source.repositoryRoot.replace(/\/$/, "")}/${relSkillMdPath}`;

  return {
    identity: {
      runtime: input.runtime ?? "pi-sdk",
      source,
      skill: {
        name: skillName,
        relativeSkillDir,
        profile: contract.profile,
        targetTier: contract.targetTier,
      },
      case: {
        caseId: caseDefinition.caseId,
        kind: caseDefinition.kind,
        lane: caseDefinition.lane,
        prompt: caseDefinition.prompt,
      },
      model: null,
    },
    timing: {
      startedAt,
      finishedAt,
      durationMs: 50,
    },
    observations: {
      assistantText,
      toolCalls: [],
      toolResults: [],
      bashCommands: [],
      touchedFiles: [],
      writtenFiles: [],
      editedFiles: [],
      skillReads: shouldInvoke
        ? [
            {
              toolCallId: `spike-skill-read-${caseDefinition.caseId}`,
              path: relSkillMdPath,
              absolutePath: absSkillMdPath,
              skillName,
            },
          ]
        : [],
      externalCalls: [],
    },
    raw: {
      sessionId: `spike-${caseDefinition.caseId}`,
      sessionFile: undefined,
      messages: [],
      runtimeEvents: [],
      telemetryEntries: [],
    },
  };
}

function caseShouldInvokeSkill(caseDefinition: PiSdkRunnableCase): boolean {
  switch (caseDefinition.lane) {
    case "routing-explicit":
    case "routing-implicit-positive":
    case "execution-deterministic":
      return true;
    case "routing-adjacent-negative":
    case "routing-hard-negative":
      return false;
    default:
      return true;
  }
}
