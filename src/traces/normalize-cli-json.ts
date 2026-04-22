import { collectCliJsonTelemetryLikeObservations, type PiCliJsonCaseRunResult } from "../pi/index.js";
import type { EvalTrace } from "./types.js";

export function normalizePiCliJsonCaseRunResult(result: PiCliJsonCaseRunResult): EvalTrace {
  const observations = collectCliJsonTelemetryLikeObservations({
    workspaceDir: result.workspaceDir,
    events: result.session.events,
  });

  return {
    identity: {
      runtime: "pi-cli-json",
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
      toolCalls: observations.toolCalls,
      toolResults: observations.toolResults,
      bashCommands: observations.bashCommands,
      touchedFiles: observations.touchedFiles,
      writtenFiles: observations.touchedFiles.filter((file) => file.toolName === "write").map((file) => file.path),
      editedFiles: observations.touchedFiles.filter((file) => file.toolName === "edit").map((file) => file.path),
      skillReads: observations.skillReads,
      externalCalls: observations.externalCalls,
    },
    raw: {
      sessionId: result.session.sessionId,
      sessionFile: result.session.sessionFile,
      messages: result.session.messages,
      runtimeEvents: result.session.events,
      telemetryEntries: [],
    },
  };
}
