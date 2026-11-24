import path from "node:path";

import { Data, Effect } from "effect";

import type { ModelSelection } from "../contracts/types.js";
import { releaseQuietly, runScopedHandoff } from "../effect/scope.js";
import { runProcessPromise } from "../effect/process.js";
import { buildRequestedContextManifest } from "../pi/sdk-context-resources.js";
import { runtimeSkillToFiles } from "../pi/sdk-eval-case.js";
import type { PiSdkExecutionCase, PiSessionTelemetryToolCall } from "../pi/types.js";
import type { EvalTraceRuntime } from "../traces/types.js";
import { assertCliHarnessSandboxSupported, buildCliHarnessFailureMessage, harnessUsageModel } from "./cli-harness.js";
import { buildCliProcessForensics } from "./cli-redact.js";
import type { RuntimeCaseOptions, RuntimeCaseResult } from "./types.js";

export interface CliInvocationOptions {
  cwd: string;
  argv: string[];
  env: NodeJS.ProcessEnv;
  prompt: string;
  signal?: AbortSignal;
}

export interface CliInvocationResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
}

export type CliInvoker = (options: CliInvocationOptions) => Promise<CliInvocationResult>;

export interface ParsedHarnessOutput {
  assistantText: string;
  messages: unknown[];
  events: unknown[];
  toolCalls: PiSessionTelemetryToolCall[];
  inputTokens: number;
  outputTokens: number;
  parseErrors: string[];
  sessionId: string;
}

export interface StageHarnessSkillsOptions {
  workspaceDir: string;
  targetSkill?: { name: string; skillDir: string };
  attachSkill: boolean;
  extraSkillPaths: string[];
}

export interface CliHarnessSpec {
  id: EvalTraceRuntime;
  label: string;
  sessionPrefix: string;
  buildArgv(workspaceDir: string, prompt: string, model: ModelSelection | null): string[];
  parse(stdout: string, fallbackSessionId: string): ParsedHarnessOutput;
  stageSkills(options: StageHarnessSkillsOptions): Promise<string[]>;
  cleanupStagedSkills(stagedPaths: string[]): Promise<void>;
  failOnUnparseableOutput: boolean;
}

/** The harness CLI exited non-zero. */
export class CliHarnessExitError extends Data.TaggedError("CliHarnessExitError")<{
  readonly label: string;
  readonly caseId: string;
  readonly exitCode: number;
  readonly stderr: string;
}> {
  override get message(): string {
    return buildCliHarnessFailureMessage(this.label, this.caseId, this.exitCode, this.stderr);
  }
}

/** The harness CLI exited zero but none of its output could be parsed. */
export class CliHarnessOutputError extends Data.TaggedError("CliHarnessOutputError")<{
  readonly label: string;
  readonly caseId: string;
  readonly unparseableLines: number;
}> {
  override get message(): string {
    return `${this.label} run failed for case ${this.caseId}: unable to parse ${this.unparseableLines} JSONL line(s).`;
  }
}

export function processInvoker(binary: string): CliInvoker {
  return (options) =>
    runProcessPromise(binary, options.argv, { cwd: options.cwd, env: options.env, signal: options.signal });
}

export async function runCliHarnessCase(
  spec: CliHarnessSpec,
  options: RuntimeCaseOptions,
  invoker: CliInvoker,
): Promise<RuntimeCaseResult> {
  assertCliHarnessSandboxSupported(spec.id, options.sandbox);

  const { value, release } = await runScopedHandoff(runCliHarnessCaseScoped(spec, options, invoker), {
    signal: options.signal,
  });

  return {
    ...value,
    cleanup: async () => {
      await release();
      return { fixture: null, environment: { agentDirRemoved: false } };
    },
  };
}

function runCliHarnessCaseScoped(spec: CliHarnessSpec, options: RuntimeCaseOptions, invoker: CliInvoker) {
  return Effect.gen(function* () {
    const startedAt = new Date();
    const workspaceRoot = path.resolve(options.workspaceDir);
    const attachSkill = options.attachSkill ?? true;
    const extraSkillPaths = options.extraSkillPaths ?? [];
    const caseId = options.case.caseId;

    yield* Effect.acquireRelease(
      Effect.promise(() =>
        spec.stageSkills({
          workspaceDir: workspaceRoot,
          targetSkill: { name: options.skill.name, skillDir: options.skill.skillDir },
          attachSkill,
          extraSkillPaths,
        }),
      ),
      (stagedPaths) => releaseQuietly(() => spec.cleanupStagedSkills(stagedPaths)),
    );

    const invocation = yield* Effect.promise((signal) =>
      invoker({
        cwd: workspaceRoot,
        argv: spec.buildArgv(workspaceRoot, options.case.prompt, options.model ?? null),
        env: { ...process.env, ...(options.workspaceEnv ?? {}) },
        prompt: options.case.prompt,
        signal,
      }),
    );

    const finishedAt = new Date();
    const parsed = spec.parse(invocation.stdout, `${spec.sessionPrefix}-${caseId}`);
    const exitCode = invocation.exitCode ?? 1;
    const modelSelection = options.model ?? null;

    if (exitCode !== 0) {
      return yield* new CliHarnessExitError({ label: spec.label, caseId, exitCode, stderr: invocation.stderr });
    }
    if (spec.failOnUnparseableOutput && parsed.parseErrors.length > 0 && !parsed.assistantText.trim()) {
      return yield* new CliHarnessOutputError({ label: spec.label, caseId, unparseableLines: parsed.parseErrors.length });
    }

    const result: Omit<RuntimeCaseResult, "cleanup"> = {
      source: options.source,
      skill: {
        name: options.skill.name,
        relativeSkillDir: options.skill.relativeSkillDir,
        profile: "repo-mutation",
        targetTier: 1,
      },
      caseDefinition: toCompatibilityExecutionCase(options),
      workspaceDir: workspaceRoot,
      agentDir: options.agentDir ?? "",
      sessionDir: "",
      fixture: null,
      model: modelSelection,
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      durationMs: finishedAt.getTime() - startedAt.getTime(),
      session: {
        sessionId: parsed.sessionId,
        sessionFile: "",
        assistantText: parsed.assistantText,
        messages: [{ role: "user", content: options.case.prompt }, ...parsed.messages],
        events: [
          ...parsed.events,
          buildCliProcessForensics(`${spec.id}-process`, exitCode, invocation.stderr, parsed.parseErrors),
        ],
      },
      usage: {
        model: harnessUsageModel(modelSelection),
        thinkingLevel: null,
        inputTokens: parsed.inputTokens,
        outputTokens: parsed.outputTokens,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        totalTokens: parsed.inputTokens + parsed.outputTokens,
        estimatedCostUsd: 0,
        contextWindowTokens: null,
        contextWindowUsedPercent: null,
      },
      contextManifest: buildRequestedContextManifest({
        skillFiles: runtimeSkillToFiles(options.skill),
        agentDir: options.agentDir ?? "",
        attachSkill,
        extraSkillPaths,
        contextMode: options.contextMode ?? "isolated",
      }),
      telemetry: {
        entries: [],
        toolCalls: parsed.toolCalls,
        toolResults: [],
        skillReads: [],
        bashCommands: [],
        touchedFiles: [],
        externalCalls: [],
      },
    };
    return result;
  });
}

function toCompatibilityExecutionCase(options: RuntimeCaseOptions): PiSdkExecutionCase {
  return {
    kind: "execution",
    lane: "execution-deterministic",
    caseId: options.case.caseId,
    prompt: options.case.prompt,
    skillName: options.case.skillName,
    contractModel: undefined,
    definition: {
      id: options.case.caseId,
      prompt: options.case.prompt,
      fixture: undefined,
    },
  };
}
