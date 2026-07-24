import { spawn } from "node:child_process";
import path from "node:path";

import type { ModelSelection } from "../../contracts/types.js";
import { buildRequestedContextManifest } from "../../pi/sdk-context-resources.js";
import { runtimeSkillToFiles } from "../../pi/sdk-eval-case.js";
import type { PiSdkExecutionCase } from "../../pi/types.js";
import type { AgentRuntime, RuntimeCaseOptions, RuntimeCaseResult } from "../types.js";
import { assertCliHarnessSandboxSupported, buildCliHarnessFailureMessage, harnessUsageModel } from "../cli-harness.js";
import { buildCliProcessForensics } from "../cli-redact.js";
import { parseCodexJsonl } from "./parse-jsonl.js";
import { cleanupStagedCodexSkills, stageCodexSkills } from "./staging.js";

export interface CodexInvocationOptions {
  cwd: string;
  argv: string[];
  env: NodeJS.ProcessEnv;
  prompt: string;
}

export interface CodexInvocationResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
}

export type CodexInvoker = (options: CodexInvocationOptions) => Promise<CodexInvocationResult>;

export interface CreateCodexRuntimeOptions {
  invoker?: CodexInvoker;
}

export function createCodexRuntime(options: CreateCodexRuntimeOptions = {}): AgentRuntime {
  const invoker = options.invoker ?? invokeDefaultCodex;
  return {
    id: "codex",
    runCase: (runOptions) => runCodexCase(runOptions, invoker),
  };
}

export const codexRuntime = createCodexRuntime();

export function buildCodexExecArgv(workspaceDir: string, prompt: string, model?: ModelSelection | null): string[] {
  const argv = [
    "exec",
    "-C",
    workspaceDir,
    "--sandbox",
    "workspace-write",
    "--ephemeral",
    "--json",
    "--skip-git-repo-check",
    "-c",
    'approval_policy="never"',
  ];

  if (model?.id) {
    argv.push("-m", model.id);
  }

  argv.push(prompt);
  return argv;
}

async function runCodexCase(options: RuntimeCaseOptions, invoker: CodexInvoker): Promise<RuntimeCaseResult> {
  assertCliHarnessSandboxSupported("codex", options.sandbox);
  const startedAt = new Date();
  const workspaceRoot = path.resolve(options.workspaceDir);
  const attachSkill = options.attachSkill ?? true;
  const extraSkillPaths = options.extraSkillPaths ?? [];

  const stagedPaths = await stageCodexSkills({
    workspaceDir: workspaceRoot,
    targetSkill: { name: options.skill.name, skillDir: options.skill.skillDir },
    attachSkill,
    extraSkillPaths,
  });

  const env = {
    ...process.env,
    ...(options.workspaceEnv ?? {}),
  };

  const argv = buildCodexExecArgv(workspaceRoot, options.case.prompt, options.model ?? null);
  let invocation: CodexInvocationResult;

  try {
    invocation = await invoker({
      cwd: workspaceRoot,
      argv,
      env,
      prompt: options.case.prompt,
    });
  } catch (error) {
    await cleanupStagedCodexSkills(stagedPaths);
    throw error;
  }

  const finishedAt = new Date();
  const fallbackSessionId = `codex-${options.case.caseId}`;
  const parsed = parseCodexJsonl(invocation.stdout, fallbackSessionId);
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
    buildCliProcessForensics("codex-process", exitCode, invocation.stderr, parsed.parseErrors),
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
      messages: [
        { role: "user", content: options.case.prompt },
        ...parsed.messages,
      ],
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
      await cleanupStagedCodexSkills(stagedPaths);
      return { fixture: null, environment: { agentDirRemoved: false } };
    },
  };

  if (exitCode !== 0) {
    await cleanupStagedCodexSkills(stagedPaths);
    throw new Error(
      buildCliHarnessFailureMessage("Codex", options.case.caseId, exitCode, invocation.stderr),
    );
  }

  if (parsed.parseErrors.length > 0 && !assistantText.trim()) {
    await cleanupStagedCodexSkills(stagedPaths);
    throw new Error(
      `Codex run failed for case ${options.case.caseId}: unable to parse ${parsed.parseErrors.length} JSONL line(s).`,
    );
  }

  return result;
}

async function invokeDefaultCodex(options: CodexInvocationOptions): Promise<CodexInvocationResult> {
  return await new Promise((resolve, reject) => {
    const child = spawn("codex", options.argv, {
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
