import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import type { EvalTrace } from "../traces/types.js";
import type {
  ArcSkillEvalJsonReport,
  ArcSkillEvalReportStatus,
  BuildInvalidSkillInput,
  BuildJsonReportInput,
  BuildReportSkillInput,
  ReportCaseEntry,
  ReportInvalidSkillEntry,
  ReportRunIssue,
  ReportSkillEntry,
  ReportSummary,
  ReportTraceEntry,
  ReportUnscoredCaseEntry,
} from "./types.js";
import { ARC_SKILL_EVAL_REPORT_VERSION } from "./types.js";

export function buildJsonReport(input: BuildJsonReportInput): ArcSkillEvalJsonReport {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const runId = input.runId ?? randomUUID();
  const runIssues = [...(input.runIssues ?? [])];
  const reportTraces: ReportTraceEntry[] = [];
  const skills = input.skills.map((entry) =>
    buildReportSkillEntry({
      entry,
      reportTraces,
      runIssues,
    }),
  );
  const invalidSkills = (input.invalidSkills ?? []).map(buildInvalidSkillEntry);
  const summary = buildReportSummary(skills, invalidSkills);
  const status =
    input.status ??
    resolveReportStatus({
      partial: input.partial ?? false,
      skills,
      invalidSkills,
      runIssues,
    });

  return {
    reportVersion: ARC_SKILL_EVAL_REPORT_VERSION,
    generatedAt,
    runId,
    framework: {
      name: "arc-skill-eval",
      version: input.frameworkVersion ?? null,
    },
    source: input.source,
    status,
    summary,
    runIssues,
    invalidSkills,
    skills,
    traces: reportTraces,
  };
}

export function stringifyJsonReport(report: ArcSkillEvalJsonReport): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}

export async function writeJsonReport(
  report: ArcSkillEvalJsonReport,
  outputPath: string,
): Promise<string> {
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, stringifyJsonReport(report), "utf8");
  return outputPath;
}

function buildReportSkillEntry(options: {
  entry: BuildReportSkillInput;
  reportTraces: ReportTraceEntry[];
  runIssues: ReportRunIssue[];
}): ReportSkillEntry {
  const { entry, reportTraces, runIssues } = options;
  const traceMap = new Map(entry.traces.map((trace) => [trace.identity.case.caseId, trace]));
  const emittedTraceIds = new Set<string>();
  const caseEntries = entry.score.cases.map((caseScore) => {
    const traceId = createTraceId(entry.score.skill.skill, caseScore.caseId);
    const trace = traceMap.get(caseScore.caseId);

    if (trace) {
      reportTraces.push(buildReportTraceEntry(trace, traceId));
      emittedTraceIds.add(traceId);
    } else {
      runIssues.push({
        code: "report.missing-trace",
        severity: "warn",
        message: `Missing trace for ${entry.score.skill.skill} case ${caseScore.caseId}.`,
        details: {
          skill: entry.score.skill.skill,
          caseId: caseScore.caseId,
          traceId,
        },
      });
    }

    return buildReportCaseEntry(caseScore, traceId, trace ?? null);
  });
  const unscoredCases = (entry.unscoredCases ?? []).map((caseResult) => {
    const traceId = createTraceId(entry.score.skill.skill, caseResult.trace.identity.case.caseId);
    reportTraces.push(buildReportTraceEntry(caseResult.trace, traceId));
    emittedTraceIds.add(traceId);
    return buildReportUnscoredCaseEntry(caseResult, traceId);
  });

  for (const trace of entry.traces) {
    const traceId = createTraceId(trace.identity.skill.name, trace.identity.case.caseId);

    if (!emittedTraceIds.has(traceId)) {
      reportTraces.push(buildReportTraceEntry(trace, traceId));
      emittedTraceIds.add(traceId);
    }
  }

  return {
    skill: entry.score.skill.skill,
    relativeSkillDir: entry.files.relativeSkillDir,
    profile: entry.score.skill.profile,
    targetTier: entry.score.skill.targetTier,
    status: resolveSkillStatus(entry.score, caseEntries, unscoredCases),
    weights: entry.score.weights,
    thresholds: entry.score.thresholds ?? null,
    tier: {
      targetTier: entry.score.skill.targetTier,
      achievedTier: null,
      status: "not_computed",
    },
    baseline: {
      status: "not_configured",
    },
    models: collectDistinctModels(entry.traces),
    lanes: entry.score.lanes,
    cases: caseEntries,
    unscoredCases,
  };
}

function buildReportCaseEntry(
  caseScore: BuildReportSkillInput["score"]["cases"][number],
  traceId: string,
  trace: EvalTrace | null,
): ReportCaseEntry {
  return {
    ...caseScore,
    status: caseScore.passed ? "passed" : "failed",
    traceRef: traceId,
    trialStats: {
      trialCount: 1,
      completedTrialCount: caseScore.executionStatus === "completed" ? 1 : 0,
      failedTrialCount: caseScore.executionStatus === "failed" ? 1 : 0,
      aggregated: false,
      aggregationMethod: null,
    },
    model: trace?.identity.model ?? null,
  };
}

function buildReportUnscoredCaseEntry(
  input: NonNullable<BuildReportSkillInput["unscoredCases"]>[number],
  traceId: string,
): ReportUnscoredCaseEntry {
  return {
    caseId: input.trace.identity.case.caseId,
    kind: input.trace.identity.case.kind,
    lane: input.trace.identity.case.lane,
    executionStatus: input.executionStatus,
    status: input.executionStatus === "completed" ? "passed" : "failed",
    traceRef: traceId,
    model: input.trace.identity.model,
    reason: "not-deterministically-scored",
  };
}

function buildInvalidSkillEntry(input: BuildInvalidSkillInput): ReportInvalidSkillEntry {
  return {
    skill: input.files.skillName,
    relativeSkillDir: input.files.relativeSkillDir,
    skillDefinitionPath: input.files.skillDefinitionPath,
    evalDefinitionPath: input.files.evalDefinitionPath,
    issues: input.issues,
  };
}

function buildReportTraceEntry(trace: EvalTrace, traceId: string): ReportTraceEntry {
  return {
    traceId,
    skill: trace.identity.skill.name,
    caseId: trace.identity.case.caseId,
    kind: trace.identity.case.kind,
    lane: trace.identity.case.lane,
    identity: trace.identity,
    timing: trace.timing,
    observations: trace.observations,
    raw: {
      sessionId: trace.raw.sessionId,
      sessionFile: trace.raw.sessionFile,
      messageCount: trace.raw.messages.length,
      sdkEventCount: trace.raw.sdkEvents.length,
      telemetryEntryCount: trace.raw.telemetryEntries.length,
      hasMessages: trace.raw.messages.length > 0,
      hasSdkEvents: trace.raw.sdkEvents.length > 0,
      hasTelemetryEntries: trace.raw.telemetryEntries.length > 0,
    },
  };
}

function buildReportSummary(
  skills: ReportSkillEntry[],
  invalidSkills: ReportInvalidSkillEntry[],
): ReportSummary {
  const caseEntries = skills.flatMap((skill) => skill.cases);
  const unscoredCaseEntries = skills.flatMap((skill) => skill.unscoredCases);
  const laneSummaries = skills.flatMap((skill) => [skill.lanes.routing, skill.lanes.execution, skill.lanes.overall]);

  return {
    discoveredSkillCount: skills.length + invalidSkills.length,
    validSkillCount: skills.length,
    invalidSkillCount: invalidSkills.length,
    scoredSkillCount: skills.length,
    caseCount: caseEntries.length,
    passedCaseCount: caseEntries.filter((entry) => entry.passed).length,
    failedCaseCount: caseEntries.filter((entry) => !entry.passed).length,
    unscoredCaseCount: unscoredCaseEntries.length,
    executedCaseCount: caseEntries.length + unscoredCaseEntries.length,
    skillStatusCounts: {
      passed: skills.filter((entry) => entry.status === "passed").length,
      warn: skills.filter((entry) => entry.status === "warn").length,
      failed: skills.filter((entry) => entry.status === "failed").length,
      partial: skills.filter((entry) => entry.status === "partial").length,
    },
    caseStatusCounts: {
      passed: caseEntries.filter((entry) => entry.status === "passed").length,
      failed: caseEntries.filter((entry) => entry.status === "failed").length,
    },
    laneStatusCounts: {
      passed: laneSummaries.filter((entry) => entry.status === "passed").length,
      warn: laneSummaries.filter((entry) => entry.status === "warn").length,
      failed: laneSummaries.filter((entry) => entry.status === "failed").length,
      not_applicable: laneSummaries.filter((entry) => entry.status === "not_applicable").length,
    },
  };
}

function resolveSkillStatus(
  score: BuildReportSkillInput["score"],
  cases: ReportCaseEntry[],
  unscoredCases: ReportUnscoredCaseEntry[],
): ArcSkillEvalReportStatus {
  if (cases.some((entry) => entry.status === "failed") || unscoredCases.some((entry) => entry.status === "failed")) {
    return "failed";
  }

  if (score.lanes.overall.status === "failed") {
    return "failed";
  }

  if ([score.lanes.routing.status, score.lanes.execution.status, score.lanes.overall.status].includes("warn")) {
    return "warn";
  }

  if (unscoredCases.length > 0 && cases.length === 0 && score.lanes.overall.status === "not_applicable") {
    return "passed";
  }

  return "passed";
}

function resolveReportStatus(input: {
  partial: boolean;
  skills: ReportSkillEntry[];
  invalidSkills: ReportInvalidSkillEntry[];
  runIssues: ReportRunIssue[];
}): ArcSkillEvalReportStatus {
  if (input.partial) {
    return "partial";
  }

  if (input.runIssues.some((issue) => issue.severity === "error")) {
    return "failed";
  }

  if (input.skills.some((entry) => entry.status === "failed")) {
    return "failed";
  }

  if (input.invalidSkills.length > 0 || input.skills.some((entry) => entry.status === "warn") || input.runIssues.length > 0) {
    return "warn";
  }

  return "passed";
}

function createTraceId(skill: string, caseId: string): string {
  return `${skill}::${caseId}`;
}

function collectDistinctModels(traces: EvalTrace[]): Array<EvalTrace["identity"]["model"]> {
  const modelsByKey = new Map<string, EvalTrace["identity"]["model"]>();

  for (const trace of traces) {
    const model = trace.identity.model;
    const key = model ? JSON.stringify(model) : "null";

    if (!modelsByKey.has(key)) {
      modelsByKey.set(key, model);
    }
  }

  return [...modelsByKey.values()];
}
