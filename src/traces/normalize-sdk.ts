import type { PiSessionTelemetrySnapshot, PiSdkCaseRunResult, PiSdkSkillRunResult } from "../pi/types.js";
import type { EvalTrace } from "./types.js";

export function normalizePiSdkCaseRunResult(result: PiSdkCaseRunResult): EvalTrace {
  const telemetry = toTelemetrySnapshot(result.telemetry);

  return {
    identity: {
      runtime: "pi-sdk",
      source: result.source,
      skill: {
        name: result.skill.name,
        relativeSkillDir: result.skill.relativeSkillDir,
        profile: result.skill.profile,
        targetTier: result.skill.targetTier,
      },
      case: {
        caseId: result.caseDefinition.caseId,
        kind: result.caseDefinition.kind,
        lane: result.caseDefinition.lane,
        prompt: result.caseDefinition.prompt,
      },
      model: result.model,
    },
    timing: {
      startedAt: result.startedAt,
      finishedAt: result.finishedAt,
      durationMs: result.durationMs,
    },
    observations: {
      assistantText: result.session.assistantText,
      toolCalls: telemetry.toolCalls,
      toolResults: telemetry.toolResults,
      bashCommands: telemetry.bashCommands,
      touchedFiles: telemetry.touchedFiles,
      writtenFiles: collectFilePathsByToolName(telemetry, "write"),
      editedFiles: collectFilePathsByToolName(telemetry, "edit"),
      skillReads: telemetry.skillReads,
      externalCalls: telemetry.externalCalls,
    },
    raw: {
      sessionId: result.session.sessionId,
      sessionFile: result.session.sessionFile,
      messages: result.session.messages,
      sdkEvents: result.session.events,
      telemetryEntries: telemetry.entries,
    },
  };
}

export function normalizePiSdkSkillRunResult(result: PiSdkSkillRunResult): EvalTrace[] {
  return result.results.map((caseResult) => normalizePiSdkCaseRunResult(caseResult));
}

function toTelemetrySnapshot(telemetry: PiSdkCaseRunResult["telemetry"]): PiSessionTelemetrySnapshot {
  return (
    telemetry ?? {
      entries: [],
      toolCalls: [],
      toolResults: [],
      skillReads: [],
      bashCommands: [],
      touchedFiles: [],
      externalCalls: [],
    }
  );
}

function collectFilePathsByToolName(
  telemetry: PiSessionTelemetrySnapshot,
  toolName: "edit" | "write",
): string[] {
  return telemetry.touchedFiles.filter((file) => file.toolName === toolName).map((file) => file.path);
}
