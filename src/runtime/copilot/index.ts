import { spawn } from "node:child_process";
import path from "node:path";

import type { ModelSelection } from "../../contracts/types.js";
import { buildRequestedContextManifest } from "../../pi/sdk-context-resources.js";
import { runtimeSkillToFiles } from "../../pi/sdk-eval-case.js";
import type { PiSdkExecutionCase } from "../../pi/types.js";
import type { AgentRuntime, RuntimeCaseOptions, RuntimeCaseResult } from "../types.js";
import { assertCliHarnessSandboxSupported, buildCliHarnessFailureMessage, harnessUsageModel } from "../cli-harness.js";
import { buildCliProcessForensics } from "../cli-redact.js";
import { parseCopilotJsonl } from "./parse-jsonl.js";
import { cleanupStagedCopilotSkills, stageCopilotSkills } from "./staging.js";

export interface CopilotInvocationOptions {
  cwd: string;
  argv: string[];
  env: NodeJS.ProcessEnv;
  prompt: string;
}

export interface CopilotInvocationResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
}

export type CopilotInvoker = (options: CopilotInvocationOptions) => Promise<CopilotInvocationResult>;

export interface CreateCopilotRuntimeOptions {
  invoker?: CopilotInvoker;
}

export function createCopilotRuntime(options: CreateCopilotRuntimeOptions = {}): AgentRuntime {
  const invoker = options.invoker ?? invokeDefaultCopilot;
  return {
    id: "copilot",
    runCase: (runOptions) => runCopilotCase(runOptions, invoker),
  };
}

export const copilotRuntime = createCopilotRuntime();

export function buildCopilotPrintArgv(prompt: string, model?: ModelSelection | null): string[] {
  const argv = ["-p", prompt, "--autopilot", "--allow-all", "--output-format=json"];
  if (model?.id) {
    argv.push("--model", model.id);
  }
  return argv;
}

async function runCopilotCase(
  options: RuntimeCaseOptions,
  invoker: CopilotInvoker,
): Promise<RuntimeCaseResult> {
  assertCliHarnessSandboxSupported("copilot", options.sandbox);
  const startedAt = new Date();
  const workspaceRoot = path.resolve(options.workspaceDir);
  const attachSkill = options.attachSkill ?? true;
  const extraSkillPaths = options.extraSkillPaths ?? [];

  const stagedPaths = await stageCopilotSkills({
    workspaceDir: workspaceRoot,
    targetSkill: { name: options.skill.name, skillDir: options.skill.skillDir },
    attachSkill,
    extraSkillPaths,
  });

  const env = {
    ...process.env,
    ...(options.workspaceEnv ?? {}),
  };

  const argv = buildCopilotPrintArgv(options.case.prompt, options.model ?? null);
  let invocation: CopilotInvocationResult;

  try {
    invocation = await invoker({
      cwd: workspaceRoot,
      argv,
      env,
      prompt: options.case.prompt,
    });
  } catch (error) {
    await cleanupStagedCopilotSkills(stagedPaths);
    throw error;
  }

  const finishedAt = new Date();
  const parsed = parseCopilotJsonl(invocation.stdout, `copilot-${options.case.caseId}`);
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
        buildCliProcessForensics("copilot-process", exitCode, invocation.stderr, parsed.parseErrors),
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
      await cleanupStagedCopilotSkills(stagedPaths);
      return { fixture: null, environment: { agentDirRemoved: false } };
    },
  };

  if (exitCode !== 0) {
    await cleanupStagedCopilotSkills(stagedPaths);
    throw new Error(
      buildCliHarnessFailureMessage("Copilot", options.case.caseId, exitCode, invocation.stderr),
    );
  }

  return result;
}

async function invokeDefaultCopilot(options: CopilotInvocationOptions): Promise<CopilotInvocationResult> {
  return await new Promise((resolve, reject) => {
    const child = spawn("copilot", options.argv, {
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
