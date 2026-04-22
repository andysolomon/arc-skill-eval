import type {
  EvalTrace,
  EvalTraceParityComparisonResult,
  EvalTraceParityMismatch,
} from "./types.js";

export function compareEvalTraceParity(input: {
  sdkTrace: EvalTrace;
  cliTrace: EvalTrace;
}): EvalTraceParityComparisonResult {
  const sdkProjection = projectParityComparableTrace(input.sdkTrace);
  const cliProjection = projectParityComparableTrace(input.cliTrace);
  const mismatches: EvalTraceParityMismatch[] = [];

  pushMismatchIfDifferent(mismatches, "skill.name", sdkProjection.skill.name, cliProjection.skill.name);
  pushMismatchIfDifferent(mismatches, "case.caseId", sdkProjection.case.caseId, cliProjection.case.caseId);
  pushMismatchIfDifferent(mismatches, "case.kind", sdkProjection.case.kind, cliProjection.case.kind);
  pushMismatchIfDifferent(mismatches, "case.lane", sdkProjection.case.lane, cliProjection.case.lane);
  pushMismatchIfDifferent(mismatches, "observations.assistantText", sdkProjection.observations.assistantText, cliProjection.observations.assistantText);
  pushMismatchIfDifferent(mismatches, "observations.toolCalls", sdkProjection.observations.toolCalls, cliProjection.observations.toolCalls);
  pushMismatchIfDifferent(mismatches, "observations.toolResults", sdkProjection.observations.toolResults, cliProjection.observations.toolResults);
  pushMismatchIfDifferent(mismatches, "observations.bashCommands", sdkProjection.observations.bashCommands, cliProjection.observations.bashCommands);
  pushMismatchIfDifferent(mismatches, "observations.touchedFiles", sdkProjection.observations.touchedFiles, cliProjection.observations.touchedFiles);
  pushMismatchIfDifferent(mismatches, "observations.writtenFiles", sdkProjection.observations.writtenFiles, cliProjection.observations.writtenFiles);
  pushMismatchIfDifferent(mismatches, "observations.editedFiles", sdkProjection.observations.editedFiles, cliProjection.observations.editedFiles);
  pushMismatchIfDifferent(mismatches, "observations.skillReads", sdkProjection.observations.skillReads, cliProjection.observations.skillReads);
  pushMismatchIfDifferent(mismatches, "observations.externalCalls", sdkProjection.observations.externalCalls, cliProjection.observations.externalCalls);

  return {
    matched: mismatches.length === 0,
    mismatches,
  };
}

function projectParityComparableTrace(trace: EvalTrace) {
  return {
    skill: {
      name: trace.identity.skill.name,
    },
    case: {
      caseId: trace.identity.case.caseId,
      kind: trace.identity.case.kind,
      lane: trace.identity.case.lane,
    },
    observations: {
      assistantText: normalizeText(trace.observations.assistantText),
      toolCalls: trace.observations.toolCalls.map((toolCall) => ({
        toolName: toolCall.toolName,
        inputSummary: normalizeOptionalText(toolCall.inputSummary),
      })),
      toolResults: trace.observations.toolResults.map((toolResult) => ({
        toolName: toolResult.toolName,
        isError: toolResult.isError,
      })),
      bashCommands: trace.observations.bashCommands.map(normalizeText),
      touchedFiles: trace.observations.touchedFiles.map((file) => ({
        path: normalizeText(file.path),
        toolName: file.toolName,
      })),
      writtenFiles: trace.observations.writtenFiles.map(normalizeText),
      editedFiles: trace.observations.editedFiles.map(normalizeText),
      skillReads: trace.observations.skillReads.map((skillRead) => ({
        path: normalizeText(skillRead.path),
        skillName: skillRead.skillName,
      })),
      externalCalls: trace.observations.externalCalls.map((externalCall) => ({
        system: externalCall.system,
        operation: externalCall.operation,
        target: normalizeOptionalText(externalCall.target),
      })),
    },
  };
}

function pushMismatchIfDifferent(
  mismatches: EvalTraceParityMismatch[],
  path: string,
  expected: unknown,
  actual: unknown,
): void {
  if (stableStringify(expected) === stableStringify(actual)) {
    return;
  }

  mismatches.push({
    path,
    message: `Mismatch at ${path}.`,
    expected,
    actual,
  });
}

function normalizeText(value: string): string {
  return value.replace(/\r\n/gu, "\n").trimEnd();
}

function normalizeOptionalText(value: string | undefined): string | undefined {
  return value === undefined ? undefined : normalizeText(value);
}

function stableStringify(value: unknown): string {
  return JSON.stringify(value);
}
