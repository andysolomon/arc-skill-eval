import { spawn } from "node:child_process";
import path from "node:path";

import type { ModelSelection } from "../../contracts/types.js";
import { buildRequestedContextManifest } from "../../pi/sdk-context-resources.js";
import { runtimeSkillToFiles } from "../../pi/sdk-eval-case.js";
import type { PiSdkExecutionCase } from "../../pi/types.js";
import type { AgentRuntime, RuntimeCaseOptions, RuntimeCaseResult } from "../types.js";
import { assertCliHarnessSandboxSupported, buildCliHarnessFailureMessage, harnessUsageModel } from "../cli-harness.js";
import { buildCliProcessForensics } from "../cli-redact.js";
import { parseClaudeStreamJson } from "./parse-stream-json.js";
import { cleanupStagedClaudeSkills, stageClaudeSkills } from "./staging.js";

export interface ClaudeInvocationOptions {
  cwd: string;
  argv: string[];
  env: NodeJS.ProcessEnv;
  prompt: string;
}

export interface ClaudeInvocationResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
}

export type ClaudeInvoker = (options: ClaudeInvocationOptions) => Promise<ClaudeInvocationResult>;

export interface CreateClaudeCodeRuntimeOptions {
  invoker?: ClaudeInvoker;
}

export function createClaudeCodeRuntime(options: CreateClaudeCodeRuntimeOptions = {}): AgentRuntime {
  const invoker = options.invoker ?? invokeDefaultClaude;
  return {
    id: "claude-code",
    runCase: (runOptions) => runClaudeCodeCase(runOptions, invoker),
  };
}

export const claudeCodeRuntime = createClaudeCodeRuntime();

export function buildClaudePrintArgv(prompt: string, model?: ModelSelection | null): string[] {
  const argv = [
    "-p",
    prompt,
    "--output-format",
    "stream-json",
    "--permission-mode",
    "bypassPermissions",
    "--dangerously-skip-permissions",
    "--no-session-persistence",
    "--verbose",
  ];

  if (model?.id) {
    argv.push("--model", model.id);
  }

  return argv;
}

async function runClaudeCodeCase(
  options: RuntimeCaseOptions,
  invoker: ClaudeInvoker,
): Promise<RuntimeCaseResult> {
  assertCliHarnessSandboxSupported("claude-code", options.sandbox);
  const startedAt = new Date();
  const workspaceRoot = path.resolve(options.workspaceDir);
  const attachSkill = options.attachSkill ?? true;
  const extraSkillPaths = options.extraSkillPaths ?? [];

  const stagedPaths = await stageClaudeSkills({
    workspaceDir: workspaceRoot,
    targetSkill: { name: options.skill.name, skillDir: options.skill.skillDir },
    attachSkill,
    extraSkillPaths,
  });

  const env = {
    ...process.env,
    ...(options.workspaceEnv ?? {}),
  };

  const argv = buildClaudePrintArgv(options.case.prompt, options.model ?? null);
  let invocation: ClaudeInvocationResult;

  try {
    invocation = await invoker({
      cwd: workspaceRoot,
      argv,
      env,
      prompt: options.case.prompt,
    });
  } catch (error) {
    await cleanupStagedClaudeSkills(stagedPaths);
    throw error;
  }

  const finishedAt = new Date();
  const fallbackSessionId = `claude-${options.case.caseId}`;
  const parsed = parseClaudeStreamJson(invocation.stdout, fallbackSessionId);
  const caseDefinition = toCompatibilityExecutionCase(options);
  const contextManifest = buildRequestedContextManifest({
    skillFiles: runtimeSkillToFiles(options.skill),
    agentDir: options.agentDir ?? "",
    attachSkill,
    extraSkillPaths,
    contextMode: options.contextMode ?? "isolated",
  });

  const inputTokens = parsed.inputTokens;
  const outputTokens = parsed.outputTokens;
  const modelSelection = options.model ?? null;
  const assistantText = parsed.assistantText;
  const exitCode = invocation.exitCode ?? 1;

  const forensicsEvents = [
    ...parsed.events,
    buildCliProcessForensics("claude-code-process", exitCode, invocation.stderr, parsed.parseErrors),
  ];

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
      events: forensicsEvents,
    },
    usage: {
      model: harnessUsageModel(modelSelection),
      thinkingLevel: null,
      inputTokens,
      outputTokens,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      totalTokens: inputTokens + outputTokens,
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
      await cleanupStagedClaudeSkills(stagedPaths);
      return { fixture: null, environment: { agentDirRemoved: false } };
    },
  };

  if (exitCode !== 0) {
    await cleanupStagedClaudeSkills(stagedPaths);
    throw new Error(
      buildCliHarnessFailureMessage("Claude Code", options.case.caseId, exitCode, invocation.stderr),
    );
  }

  if (parsed.parseErrors.length > 0 && !assistantText.trim()) {
    await cleanupStagedClaudeSkills(stagedPaths);
    throw new Error(
      `Claude Code run failed for case ${options.case.caseId}: unable to parse ${parsed.parseErrors.length} JSONL line(s).`,
    );
  }

  return result;
}

async function invokeDefaultClaude(options: ClaudeInvocationOptions): Promise<ClaudeInvocationResult> {
  return await new Promise((resolve, reject) => {
    const child = spawn("claude", options.argv, {
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
