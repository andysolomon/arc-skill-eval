import { randomUUID } from "node:crypto";
import path from "node:path";

import type { ModelSelection } from "../contracts/types.js";
import type { ValidatedSkillDiscovery } from "../load/source-types.js";
import {
  PiSdkCaseRunError,
  collectPiSdkRunnableCases,
  runPiSdkCase,
  type PiSdkRunnableCase,
} from "../pi/index.js";
import { buildJsonReport, writeHtmlReport, writeJsonReport, type ReportRunIssue } from "../reporting/index.js";
import { scoreDeterministicSkill, createWorkspaceContextFromPiSdkCaseResult } from "../scorers/index.js";
import { normalizePiSdkCaseRunResult, type EvalTrace } from "../traces/index.js";
import {
  CliCommandError,
  type TestCommandArtifacts,
  type TestCommandOptions,
  type TestCommandResult,
} from "./types.js";
import {
  collectMissingCaseIds,
  ensureNonEmptySelection,
  loadRepoForValidation,
  resolveFrameworkVersion,
  resolveReportOutputDir,
  selectValidatedSkills,
} from "./shared.js";

interface ExecutedDeterministicCase {
  caseDefinition: Exclude<PiSdkRunnableCase, { kind: "live-smoke" }>;
  trace: EvalTrace;
  executionStatus: "completed" | "failed";
  workspace?: ReturnType<typeof createWorkspaceContextFromPiSdkCaseResult>;
}

interface ExecutedUnscoredCase {
  trace: EvalTrace;
  executionStatus: "completed" | "failed";
}

export async function runTestCommand(options: TestCommandOptions): Promise<TestCommandResult> {
  const loaded = await loadRepoForValidation(options.input);

  try {
    const selected = selectValidatedSkills(loaded.result, options.skillNames);
    ensureNonEmptySelection(
      selected.skills,
      `No participating skills found in ${loaded.result.source.displayName}.`,
    );

    const missingCaseIds = collectMissingCaseIds(
      selected.validSkills,
      options.caseIds,
      options.includeLiveSmoke ?? false,
      collectRunnableCaseIds,
    );

    if (missingCaseIds.length > 0) {
      throw new CliCommandError(`Unknown case id(s): ${missingCaseIds.join(", ")}.`);
    }

    const runIssues: ReportRunIssue[] = [];
    const reportSkills: Parameters<typeof buildJsonReport>[0]["skills"] = [];
    let runnableCaseCount = 0;

    for (const skill of selected.validSkills) {
      const runnableCases = selectRunnableCases(skill, options.caseIds, options.includeLiveSmoke ?? false);
      runnableCaseCount += runnableCases.length;

      if (runnableCases.length === 0) {
        continue;
      }

      const traces: EvalTrace[] = [];
      const deterministicCases: ExecutedDeterministicCase[] = [];
      const unscoredCases: ExecutedUnscoredCase[] = [];
      const cleanupTasks: Array<() => Promise<unknown>> = [];

      try {
        for (const caseDefinition of runnableCases) {
          const executedCase = await executeCase({
            source: loaded.result.source,
            skill,
            caseDefinition,
            model: options.model,
            appendSystemPrompt: options.appendSystemPrompt,
            createSession: options.createSession,
          });

          traces.push(executedCase.trace);

          if (executedCase.runIssue) {
            runIssues.push(executedCase.runIssue);
          }

          if (executedCase.cleanup) {
            cleanupTasks.push(executedCase.cleanup);
          }

          if (caseDefinition.kind === "live-smoke") {
            unscoredCases.push({
              trace: executedCase.trace,
              executionStatus: executedCase.executionStatus,
            });
            continue;
          }

          deterministicCases.push({
            caseDefinition,
            trace: executedCase.trace,
            executionStatus: executedCase.executionStatus,
            workspace: executedCase.workspace,
          });
        }

        const score = await scoreDeterministicSkill({
          contract: skill.contract,
          cases: deterministicCases,
          skillFiles: skill.files,
        });

        reportSkills.push({
          files: skill.files,
          score,
          traces,
          unscoredCases,
        });
      } finally {
        const cleanupResults = await Promise.allSettled(cleanupTasks.map(async (cleanup) => await cleanup()));

        for (const cleanupResult of cleanupResults) {
          if (cleanupResult.status === "rejected") {
            runIssues.push({
              code: "cli.cleanup-failed",
              severity: "warn",
              message: cleanupResult.reason instanceof Error ? cleanupResult.reason.message : "Case cleanup failed.",
            });
          }
        }
      }
    }

    if (runnableCaseCount === 0 && selected.invalidSkills.length === 0) {
      throw new CliCommandError("No runnable cases matched the requested selection.");
    }

    const runId = options.runId ?? randomUUID();
    const report = buildJsonReport({
      source: loaded.result.source,
      skills: reportSkills,
      invalidSkills: selected.invalidSkills,
      runIssues,
      runId,
      generatedAt: options.generatedAt,
      frameworkVersion: await resolveFrameworkVersion(),
    });
    const artifacts = await writeReportArtifacts(report, options.outputDir, options.html ?? false);

    return {
      report,
      artifacts,
    };
  } finally {
    await loaded.cleanup();
  }
}

async function writeReportArtifacts(
  report: ReturnType<typeof buildJsonReport>,
  outputDir: string | undefined,
  emitHtml: boolean,
): Promise<TestCommandArtifacts> {
  const resolvedOutputDir = resolveReportOutputDir(outputDir, report.runId);
  const jsonReportPath = await writeJsonReport(report, path.join(resolvedOutputDir, "report.json"));
  const htmlReportPath = emitHtml
    ? await writeHtmlReport(report, path.join(resolvedOutputDir, "report.html"))
    : null;

  return {
    outputDir: resolvedOutputDir,
    jsonReportPath,
    htmlReportPath,
  };
}

function collectRunnableCaseIds(skill: ValidatedSkillDiscovery, includeLiveSmoke: boolean): string[] {
  return collectRunnableCases(skill, includeLiveSmoke).map((caseDefinition) => caseDefinition.caseId);
}

function selectRunnableCases(
  skill: ValidatedSkillDiscovery,
  requestedCaseIds: string[] | undefined,
  includeLiveSmoke: boolean,
): PiSdkRunnableCase[] {
  const runnableCases = collectRunnableCases(skill, includeLiveSmoke);

  if (!requestedCaseIds?.length) {
    return runnableCases;
  }

  const requested = new Set(requestedCaseIds);
  return runnableCases.filter((caseDefinition) => requested.has(caseDefinition.caseId));
}

function collectRunnableCases(skill: ValidatedSkillDiscovery, includeLiveSmoke: boolean): PiSdkRunnableCase[] {
  return collectPiSdkRunnableCases(skill.contract).filter(
    (caseDefinition) => includeLiveSmoke || caseDefinition.kind !== "live-smoke",
  );
}

async function executeCase(options: {
  source: ValidatedSkillDiscovery["files"] extends never ? never : Parameters<typeof runPiSdkCase>[0]["source"];
  skill: ValidatedSkillDiscovery;
  caseDefinition: PiSdkRunnableCase;
  model: ModelSelection | undefined;
  appendSystemPrompt: string[] | undefined;
  createSession: TestCommandOptions["createSession"];
}): Promise<{
  trace: EvalTrace;
  executionStatus: "completed" | "failed";
  workspace?: ReturnType<typeof createWorkspaceContextFromPiSdkCaseResult>;
  cleanup?: () => Promise<unknown>;
  runIssue?: ReportRunIssue;
}> {
  try {
    const result = await runPiSdkCase({
      source: options.source,
      skill: options.skill,
      caseDefinition: options.caseDefinition,
      model: options.model,
      appendSystemPrompt: options.appendSystemPrompt,
      createSession: options.createSession,
    });

    return {
      trace: normalizePiSdkCaseRunResult(result),
      executionStatus: "completed",
      workspace:
        options.caseDefinition.kind === "execution"
          ? createWorkspaceContextFromPiSdkCaseResult(result)
          : undefined,
      cleanup: async () => await result.cleanup(),
    };
  } catch (error) {
    if (error instanceof PiSdkCaseRunError) {
      return {
        trace: normalizePiSdkCaseRunResult(error.result),
        executionStatus: "failed",
        workspace:
          options.caseDefinition.kind === "execution"
            ? createWorkspaceContextFromPiSdkCaseResult(error.result)
            : undefined,
        cleanup: async () => await error.result.cleanup(),
        runIssue: createCaseRunIssue(options.skill, options.caseDefinition, error.message),
      };
    }

    const message = error instanceof Error ? error.message : `Unknown error while executing case ${options.caseDefinition.caseId}.`;

    return {
      trace: createSyntheticFailedTrace(options.source, options.skill, options.caseDefinition, options.model),
      executionStatus: "failed",
      runIssue: createCaseRunIssue(options.skill, options.caseDefinition, message),
    };
  }
}

function createSyntheticFailedTrace(
  source: Parameters<typeof runPiSdkCase>[0]["source"],
  skill: ValidatedSkillDiscovery,
  caseDefinition: PiSdkRunnableCase,
  model: ModelSelection | undefined,
): EvalTrace {
  const startedAt = new Date().toISOString();

  return {
    identity: {
      runtime: "pi-sdk",
      source,
      skill: {
        name: skill.contract.skill,
        relativeSkillDir: skill.files.relativeSkillDir,
        profile: skill.contract.profile,
        targetTier: skill.contract.targetTier,
      },
      case: {
        caseId: caseDefinition.caseId,
        kind: caseDefinition.kind,
        lane: caseDefinition.lane,
        prompt: caseDefinition.prompt,
      },
      model: model ?? caseDefinition.contractModel ?? skill.contract.model ?? null,
    },
    timing: {
      startedAt,
      finishedAt: startedAt,
      durationMs: 0,
    },
    observations: {
      assistantText: "",
      toolCalls: [],
      toolResults: [],
      bashCommands: [],
      touchedFiles: [],
      writtenFiles: [],
      editedFiles: [],
      skillReads: [],
      externalCalls: [],
    },
    raw: {
      sessionId: `synthetic-${skill.contract.skill}-${caseDefinition.caseId}`,
      sessionFile: undefined,
      messages: [],
      sdkEvents: [],
      telemetryEntries: [],
    },
  };
}

function createCaseRunIssue(
  skill: ValidatedSkillDiscovery,
  caseDefinition: PiSdkRunnableCase,
  message: string,
): ReportRunIssue {
  return {
    code: "cli.case-run-failed",
    severity: "error",
    message: `Case ${caseDefinition.caseId} for skill ${skill.contract.skill} failed: ${message}`,
    details: {
      skill: skill.contract.skill,
      caseId: caseDefinition.caseId,
      lane: caseDefinition.lane,
      kind: caseDefinition.kind,
    },
  };
}
