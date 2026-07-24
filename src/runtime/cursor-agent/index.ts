import { spawn } from "node:child_process";
import path from "node:path";

import type { ModelSelection } from "../../contracts/types.js";
import { buildRequestedContextManifest } from "../../pi/sdk-context-resources.js";
import { runtimeSkillToFiles } from "../../pi/sdk-eval-case.js";
import type { PiSdkExecutionCase } from "../../pi/types.js";
import type { AgentRuntime, RuntimeCaseOptions, RuntimeCaseResult } from "../types.js";
import { assertCliHarnessSandboxSupported, buildCliHarnessFailureMessage, harnessUsageModel } from "../cli-harness.js";
import { buildCliProcessForensics } from "../cli-redact.js";
import { parseCursorStreamJson } from "./parse-stream-json.js";
import { cleanupStagedCursorSkills, stageCursorSkills } from "./staging.js";

export interface CursorInvocationOptions {
  cwd: string;
  argv: string[];
  env: NodeJS.ProcessEnv;
  prompt: string;
}

export interface CursorInvocationResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
}

export type CursorInvoker = (options: CursorInvocationOptions) => Promise<CursorInvocationResult>;

export interface CreateCursorAgentRuntimeOptions {
  invoker?: CursorInvoker;
  /** Binary name on PATH. Defaults to `cursor-agent`. */
  binary?: string;
}

export function createCursorAgentRuntime(options: CreateCursorAgentRuntimeOptions = {}): AgentRuntime {
  const invoker = options.invoker ?? ((opts) => invokeDefaultCursor(opts, options.binary ?? "cursor-agent"));
  return {
    id: "cursor-agent",
    runCase: (runOptions) => runCursorAgentCase(runOptions, invoker),
  };
}

export const cursorAgentRuntime = createCursorAgentRuntime();

export function buildCursorPrintArgv(
  workspaceDir: string,
  prompt: string,
  model?: ModelSelection | null,
): string[] {
  const argv = [
    "-p",
    "--force",
    "--trust",
    "--workspace",
    workspaceDir,
    "--output-format",
    "stream-json",
  ];

  if (model?.id) {
    argv.push("--model", model.id);
  }

  argv.push(prompt);
  return argv;
}

async function runCursorAgentCase(
  options: RuntimeCaseOptions,
  invoker: CursorInvoker,
): Promise<RuntimeCaseResult> {
  assertCliHarnessSandboxSupported("cursor-agent", options.sandbox);
  const startedAt = new Date();
  const workspaceRoot = path.resolve(options.workspaceDir);
  const attachSkill = options.attachSkill ?? true;
  const extraSkillPaths = options.extraSkillPaths ?? [];

  const stagedPaths = await stageCursorSkills({
    workspaceDir: workspaceRoot,
    targetSkill: { name: options.skill.name, skillDir: options.skill.skillDir },
    attachSkill,
    extraSkillPaths,
  });

  const env = {
    ...process.env,
    ...(options.workspaceEnv ?? {}),
  };

  const argv = buildCursorPrintArgv(workspaceRoot, options.case.prompt, options.model ?? null);
  let invocation: CursorInvocationResult;

  try {
    invocation = await invoker({
      cwd: workspaceRoot,
      argv,
      env,
      prompt: options.case.prompt,
    });
  } catch (error) {
    await cleanupStagedCursorSkills(stagedPaths);
    throw error;
  }

  const finishedAt = new Date();
  const parsed = parseCursorStreamJson(invocation.stdout, `cursor-${options.case.caseId}`);
  const caseDefinition = toCompatibilityExecutionCase(options);
  const contextManifest = buildRequestedContextManifest({
    skillFiles: runtimeSkillToFiles(options.skill),
    agentDir: options.agentDir ?? "",
    attachSkill,
    extraSkillPaths,
    contextMode: options.contextMode ?? "isolated",
  });

  const modelSelection = options.model ?? null;
  const assistantText = parsed.assistantText;
  const exitCode = invocation.exitCode ?? 1;

  const result: RuntimeCaseResult = {
    source: options.source,
    skill: {
      name: options.skill.name,
      relativeSkillDir: options.skill.relativeSkillDir,
      profile: "repo-mutation",
      targetTier: 1,
    },
    caseDefinition,
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
      assistantText,
      messages: [{ role: "user", content: options.case.prompt }, ...parsed.messages],
      events: [
        ...parsed.events,
        buildCliProcessForensics("cursor-agent-process", exitCode, invocation.stderr, parsed.parseErrors),
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
    contextManifest,
    telemetry: {
      entries: [],
      toolCalls: parsed.toolCalls,
      toolResults: [],
      skillReads: [],
      bashCommands: [],
      touchedFiles: [],
      externalCalls: [],
    },
    cleanup: async () => {
      await cleanupStagedCursorSkills(stagedPaths);
      return { fixture: null, environment: { agentDirRemoved: false } };
    },
  };

  if (exitCode !== 0) {
    await cleanupStagedCursorSkills(stagedPaths);
    throw new Error(
      buildCliHarnessFailureMessage("Cursor Agent", options.case.caseId, exitCode, invocation.stderr),
    );
  }

  return result;
}

async function invokeDefaultCursor(
  options: CursorInvocationOptions,
  binary: string,
): Promise<CursorInvocationResult> {
  return await new Promise((resolve, reject) => {
    const child = spawn(binary, options.argv, {
      cwd: options.cwd,
      env: options.env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (exitCode) => {
      resolve({ stdout, stderr, exitCode });
    });
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
