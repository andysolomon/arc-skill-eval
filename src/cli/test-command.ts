import { randomUUID } from "node:crypto";
import path from "node:path";

import type { ModelSelection } from "../contracts/types.js";
import type { ValidatedSkillDiscovery } from "../load/source-types.js";
import {
  PiCliJsonCaseRunError,
  PiSdkCaseRunError,
  collectPiSdkRunnableCases,
  runPiCliJsonCase,
  runPiSdkCase,
  type PiSdkParityCase,
  type PiSdkRunnableCase,
} from "../pi/index.js";
import { buildJsonReport, writeHtmlReport, writeJsonReport, type ReportRunIssue } from "../reporting/index.js";
import { scoreDeterministicSkill, createWorkspaceContextFromPiSdkCaseResult } from "../scorers/index.js";
import {
  compareEvalTraceParity,
  normalizePiCliJsonCaseRunResult,
  normalizePiSdkCaseRunResult,
  type EvalTrace,
  type EvalTraceParityMismatch,
} from "../traces/index.js";
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
  caseDefinition: Exclude<PiSdkRunnableCase, { kind: "live-smoke" | "cli-parity" }>;
  trace: EvalTrace;
  executionStatus: "completed" | "failed";
  workspace?: ReturnType<typeof createWorkspaceContextFromPiSdkCaseResult>;
}

interface ExecutedUnscoredCase {
  trace: EvalTrace;
  executionStatus: "completed" | "failed";
}

interface ExecutedParityCase {
  caseId: string;
  sdkTrace: EvalTrace | null;
  cliTrace: EvalTrace | null;
  sdkExecutionStatus: "completed" | "failed";
  cliExecutionStatus: "completed" | "failed";
  comparisonStatus: "matched" | "mismatched" | "runtime_failed";
  mismatches: EvalTraceParityMismatch[];
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
      const parityCases: ExecutedParityCase[] = [];
      const cleanupTasks: Array<() => Promise<unknown>> = [];

      try {
        for (const caseDefinition of runnableCases) {
          if (caseDefinition.kind === "cli-parity") {
            const executedCase = await executeParityCase({
              source: loaded.result.source,
              skill,
              caseDefinition,
              model: options.model,
              appendSystemPrompt: options.appendSystemPrompt,
              createSession: options.createSession,
              invokePiCli: options.invokePiCli,
            });

            traces.push(...executedCase.traces);
            runIssues.push(...executedCase.runIssues);
            cleanupTasks.push(...executedCase.cleanups);
            parityCases.push(executedCase.parityCase);
            continue;
          }

          const executedCase = await executeSdkCase({
            source: loaded.result.source,
            skill,
            caseDefinition,
            model: options.model,
            appendSystemPrompt: options.appendSystemPrompt,
            createSession: options.createSession,
            allowSyntheticTraceOnUnknownError: true,
          });

          if (executedCase.trace) {
            traces.push(executedCase.trace);
          }

          if (executedCase.runIssue) {
            runIssues.push(executedCase.runIssue);
          }

          if (executedCase.cleanup) {
            cleanupTasks.push(executedCase.cleanup);
          }

          if (caseDefinition.kind === "live-smoke") {
            if (!executedCase.trace) {
              throw new Error(`Expected a trace for live-smoke case ${caseDefinition.caseId}.`);
            }

            unscoredCases.push({
              trace: executedCase.trace,
              executionStatus: executedCase.executionStatus,
            });
            continue;
          }

          if (!executedCase.trace) {
            throw new Error(`Expected a trace for deterministic case ${caseDefinition.caseId}.`);
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
          parityCases,
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

async function executeSdkCase(options: {
  source: ValidatedSkillDiscovery["files"] extends never ? never : Parameters<typeof runPiSdkCase>[0]["source"];
  skill: ValidatedSkillDiscovery;
  caseDefinition: PiSdkRunnableCase;
  model: ModelSelection | undefined;
  appendSystemPrompt: string[] | undefined;
  createSession: TestCommandOptions["createSession"];
  allowSyntheticTraceOnUnknownError: boolean;
}): Promise<{
  trace: EvalTrace | null;
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
        runIssue: createCaseRunIssue(options.skill, options.caseDefinition, error.message, "cli.case-run-failed"),
      };
    }

    const message = error instanceof Error ? error.message : `Unknown error while executing case ${options.caseDefinition.caseId}.`;

    return {
      trace: options.allowSyntheticTraceOnUnknownError
        ? createSyntheticFailedTrace(options.source, options.skill, options.caseDefinition, options.model)
        : null,
      executionStatus: "failed",
      runIssue: createCaseRunIssue(options.skill, options.caseDefinition, message, "cli.case-run-failed"),
    };
  }
}

async function executeParityCase(options: {
  source: ValidatedSkillDiscovery["files"] extends never ? never : Parameters<typeof runPiSdkCase>[0]["source"];
  skill: ValidatedSkillDiscovery;
  caseDefinition: PiSdkParityCase;
  model: ModelSelection | undefined;
  appendSystemPrompt: string[] | undefined;
  createSession: TestCommandOptions["createSession"];
  invokePiCli: TestCommandOptions["invokePiCli"];
}): Promise<{
  traces: EvalTrace[];
  cleanups: Array<() => Promise<unknown>>;
  runIssues: ReportRunIssue[];
  parityCase: ExecutedParityCase;
}> {
  const sdkRun = await executeSdkCase({
    source: options.source,
    skill: options.skill,
    caseDefinition: options.caseDefinition,
    model: options.model,
    appendSystemPrompt: options.appendSystemPrompt,
    createSession: options.createSession,
    allowSyntheticTraceOnUnknownError: false,
  });
  const cliRun = await executeCliParityCase(options);
  const traces = [sdkRun.trace, cliRun.trace].filter((trace): trace is EvalTrace => trace !== null);
  const cleanups = [sdkRun.cleanup, cliRun.cleanup].filter((cleanup): cleanup is () => Promise<unknown> => cleanup !== undefined);
  const runIssues = [sdkRun.runIssue, cliRun.runIssue].filter((issue): issue is ReportRunIssue => issue !== undefined);
  const mismatches: EvalTraceParityMismatch[] = [];
  let comparisonStatus: ExecutedParityCase["comparisonStatus"];

  if (sdkRun.executionStatus === "failed") {
    mismatches.push(createRuntimeMismatch("sdk-runtime-failed", "sdk", sdkRun.runIssue?.message ?? "Pi SDK parity run failed."));
  }

  if (cliRun.executionStatus === "failed") {
    mismatches.push(createRuntimeMismatch("cli-runtime-failed", "cli", cliRun.runIssue?.message ?? "Pi CLI parity run failed."));
  }

  if (mismatches.length > 0 || !sdkRun.trace || !cliRun.trace) {
    comparisonStatus = "runtime_failed";
  } else {
    const comparison = compareEvalTraceParity({
      sdkTrace: sdkRun.trace,
      cliTrace: cliRun.trace,
    });

    mismatches.push(...comparison.mismatches);
    comparisonStatus = comparison.matched ? "matched" : "mismatched";
  }

  return {
    traces,
    cleanups,
    runIssues,
    parityCase: {
      caseId: options.caseDefinition.caseId,
      sdkTrace: sdkRun.trace,
      cliTrace: cliRun.trace,
      sdkExecutionStatus: sdkRun.executionStatus,
      cliExecutionStatus: cliRun.executionStatus,
      comparisonStatus,
      mismatches,
    },
  };
}

async function executeCliParityCase(options: {
  source: ValidatedSkillDiscovery["files"] extends never ? never : Parameters<typeof runPiSdkCase>[0]["source"];
  skill: ValidatedSkillDiscovery;
  caseDefinition: PiSdkParityCase;
  model: ModelSelection | undefined;
  appendSystemPrompt: string[] | undefined;
  invokePiCli: TestCommandOptions["invokePiCli"];
}): Promise<{
  trace: EvalTrace | null;
  executionStatus: "completed" | "failed";
  cleanup?: () => Promise<unknown>;
  runIssue?: ReportRunIssue;
}> {
  try {
    const result = await runPiCliJsonCase({
      source: options.source,
      skill: options.skill,
      caseDefinition: options.caseDefinition,
      model: options.model,
      appendSystemPrompt: options.appendSystemPrompt,
      invokeCli: options.invokePiCli,
    });

    return {
      trace: normalizePiCliJsonCaseRunResult(result),
      executionStatus: "completed",
      cleanup: async () => await result.cleanup(),
    };
  } catch (error) {
    if (error instanceof PiCliJsonCaseRunError) {
      return {
        trace: normalizePiCliJsonCaseRunResult(error.result),
        executionStatus: "failed",
        cleanup: async () => await error.result.cleanup(),
        runIssue: createCaseRunIssue(options.skill, options.caseDefinition, error.message, "cli.parity-cli-run-failed"),
      };
    }

    const message = error instanceof Error ? error.message : `Unknown error while executing CLI parity case ${options.caseDefinition.caseId}.`;

    return {
      trace: null,
      executionStatus: "failed",
      runIssue: createCaseRunIssue(options.skill, options.caseDefinition, message, "cli.parity-cli-run-failed"),
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
      runtimeEvents: [],
      telemetryEntries: [],
    },
  };
}

function createCaseRunIssue(
  skill: ValidatedSkillDiscovery,
  caseDefinition: PiSdkRunnableCase,
  message: string,
  code: string,
): ReportRunIssue {
  return {
    code,
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

function createRuntimeMismatch(code: string, path: string, message: string): EvalTraceParityMismatch {
  return {
    code,
    path,
    message,
  };
}
