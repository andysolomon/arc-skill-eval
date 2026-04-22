import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { materializeFixture, type MaterializedFixture } from "../fixtures/index.js";
import type { ValidatedSkillDiscovery } from "../load/source-types.js";
import {
  summarizeExternalCalls,
  summarizeToolInput,
  toFileTouchTelemetry,
  toSkillReadTelemetry,
} from "./telemetry-helpers.js";
import type {
  PiCliJsonCaseCleanupResult,
  PiCliJsonCaseRunResult,
  PiCliJsonInvocationResult,
  PiCliJsonInvoker,
  PiSdkParityCase,
  RunPiCliJsonCaseOptions,
} from "./types.js";

export class PiCliJsonCaseRunError extends Error {
  readonly result: PiCliJsonCaseRunResult;

  constructor(message: string, result: PiCliJsonCaseRunResult, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "PiCliJsonCaseRunError";
    this.result = result;
  }
}

export async function runPiCliJsonCase(
  options: RunPiCliJsonCaseOptions,
): Promise<PiCliJsonCaseRunResult> {
  const invokeCli = options.invokeCli ?? invokeDefaultPiCliJson;
  const materializedFixture = await maybeMaterializeParityFixture(options.skill, options.caseDefinition);
  const workspaceDir = materializedFixture?.workspaceDir ?? path.resolve(options.workspaceDir ?? options.source.repositoryRoot);
  const env = {
    ...process.env,
    ...(materializedFixture?.env ?? {}),
  };
  const requestedModel = options.model ?? options.skill.contract.model;
  const cleanup = createParityCleanup(materializedFixture);
  const startedAt = new Date();

  let invocation: PiCliJsonInvocationResult;

  try {
    invocation = await invokeCli({
      cwd: workspaceDir,
      argv: buildCliJsonArgv(options.skill, options.caseDefinition, requestedModel, options.appendSystemPrompt ?? []),
      env,
    });
  } catch (error) {
    await cleanup().catch(() => undefined);
    throw error;
  }

  const finishedAt = new Date();
  const parsed = parseCliJsonOutput({
    workspaceDir,
    skill: options.skill,
    caseDefinition: options.caseDefinition,
    stdout: invocation.stdout,
  });

  const result: PiCliJsonCaseRunResult = {
    source: options.source,
    skill: {
      name: options.skill.contract.skill,
      relativeSkillDir: options.skill.files.relativeSkillDir,
      profile: options.skill.contract.profile,
      targetTier: options.skill.contract.targetTier,
    },
    caseDefinition: options.caseDefinition,
    workspaceDir,
    fixture: snapshotFixture(materializedFixture),
    model: requestedModel ?? null,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs: finishedAt.getTime() - startedAt.getTime(),
    session: {
      sessionId: parsed.sessionId,
      sessionFile: parsed.sessionFile,
      assistantText: parsed.assistantText,
      messages: parsed.messages,
      events: parsed.events,
      stderr: invocation.stderr,
      exitCode: invocation.exitCode,
    },
    cleanup,
  };

  if ((invocation.exitCode ?? 1) !== 0) {
    throw new PiCliJsonCaseRunError(buildCliRuntimeFailureMessage(options.caseDefinition.caseId, invocation.stderr), result);
  }

  if (parsed.parseErrors.length > 0) {
    throw new PiCliJsonCaseRunError(
      `Pi CLI JSON run failed for case ${options.caseDefinition.caseId}: unable to parse ${parsed.parseErrors.length} JSON output line(s).`,
      result,
    );
  }

  return result;
}

function buildCliJsonArgv(
  skill: ValidatedSkillDiscovery,
  caseDefinition: PiSdkParityCase,
  model: RunPiCliJsonCaseOptions["model"],
  appendSystemPrompt: string[],
): string[] {
  const cliPath = resolvePiCliPath();
  const argv = [
    cliPath,
    "--mode",
    "json",
    "--no-session",
    "--no-extensions",
    "--no-prompt-templates",
    "--no-themes",
    "--no-context-files",
    "--skill",
    skill.files.skillDir,
  ];

  if (model) {
    argv.push("--provider", model.provider, "--model", model.id);

    if (model.thinking) {
      argv.push("--thinking", model.thinking);
    }
  }

  for (const instruction of appendSystemPrompt) {
    argv.push("--append-system-prompt", instruction);
  }

  argv.push(caseDefinition.prompt);

  return argv;
}

function resolvePiCliPath(): string {
  const entryUrl = import.meta.resolve("@mariozechner/pi-coding-agent");
  const entryPath = fileURLToPath(entryUrl);
  return path.join(path.dirname(entryPath), "cli.js");
}

async function invokeDefaultPiCliJson(options: {
  cwd: string;
  argv: string[];
  env: NodeJS.ProcessEnv;
}): Promise<PiCliJsonInvocationResult> {
  return await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, options.argv, {
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
      resolve({
        stdout,
        stderr,
        exitCode,
      });
    });
  });
}

function parseCliJsonOutput(options: {
  workspaceDir: string;
  skill: ValidatedSkillDiscovery;
  caseDefinition: PiSdkParityCase;
  stdout: string;
}): {
  sessionId: string;
  sessionFile: string | undefined;
  assistantText: string;
  messages: unknown[];
  events: unknown[];
  parseErrors: string[];
} {
  const lines = options.stdout
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const parseErrors: string[] = [];
  const events: unknown[] = [];
  const messages: unknown[] = [];
  let assistantText = "";
  let sessionId = `cli-${options.skill.contract.skill}-${options.caseDefinition.caseId}`;
  let sessionFile: string | undefined;

  for (const line of lines) {
    let parsed: unknown;

    try {
      parsed = JSON.parse(line);
    } catch {
      parseErrors.push(line);
      continue;
    }

    if (isSessionHeader(parsed)) {
      sessionId = parsed.id;
      sessionFile = typeof parsed.sessionFile === "string" ? parsed.sessionFile : undefined;
      continue;
    }

    events.push(snapshotValue(parsed));

    if (isTextDeltaEvent(parsed)) {
      assistantText += parsed.assistantMessageEvent.delta;
    }

    if (isMessageEndEvent(parsed)) {
      messages.push(snapshotValue(parsed.message));
    }
  }

  if (assistantText.length === 0) {
    assistantText = collectAssistantTextFromMessages(messages);
  }

  return {
    sessionId,
    sessionFile,
    assistantText,
    messages,
    events,
    parseErrors,
  };
}

async function maybeMaterializeParityFixture(
  skill: ValidatedSkillDiscovery,
  caseDefinition: PiSdkParityCase,
): Promise<MaterializedFixture | null> {
  const fixture = caseDefinition.definition.fixture;

  if (!fixture) {
    return null;
  }

  return await materializeFixture({
    skillFiles: skill.files,
    fixture,
  });
}

function createParityCleanup(
  materializedFixture: MaterializedFixture | null,
): () => Promise<PiCliJsonCaseCleanupResult> {
  let cleanupPromise: Promise<PiCliJsonCaseCleanupResult> | undefined;

  return async () => {
    cleanupPromise ??= (async () => ({
      fixture: materializedFixture ? await materializedFixture.cleanup() : null,
    }))();

    return await cleanupPromise;
  };
}

function snapshotFixture(materializedFixture: MaterializedFixture | null): PiCliJsonCaseRunResult["fixture"] {
  if (!materializedFixture) {
    return null;
  }

  return {
    kind: materializedFixture.kind,
    sourcePath: materializedFixture.sourcePath,
    workspaceDir: materializedFixture.workspaceDir,
    env: snapshotValue(materializedFixture.env),
    setup: snapshotValue(materializedFixture.setup),
    git: snapshotValue(materializedFixture.git),
    external: snapshotValue(materializedFixture.external),
    initialSnapshot: snapshotValue(materializedFixture.initialSnapshot),
  };
}

function collectAssistantTextFromMessages(messages: unknown[]): string {
  return messages
    .flatMap((message) => {
      if (!isAssistantMessage(message)) {
        return [];
      }

      if (!Array.isArray(message.content)) {
        return [];
      }

      return message.content
        .filter((content): content is { type: "text"; text: string } => {
          if (typeof content !== "object" || content === null) {
            return false;
          }

          const candidate = content as { type?: unknown; text?: unknown };
          return candidate.type === "text" && typeof candidate.text === "string";
        })
        .map((content) => content.text);
    })
    .join("");
}

function isAssistantMessage(message: unknown): message is { role: "assistant"; content: unknown[] } {
  return typeof message === "object" && message !== null && "role" in message && message.role === "assistant" && "content" in message;
}

function isSessionHeader(value: unknown): value is { type: "session"; id: string; sessionFile?: string } {
  return typeof value === "object" && value !== null && "type" in value && value.type === "session" && "id" in value && typeof value.id === "string";
}

function isTextDeltaEvent(
  event: unknown,
): event is { type: "message_update"; assistantMessageEvent: { type: "text_delta"; delta: string } } {
  return (
    typeof event === "object" &&
    event !== null &&
    "type" in event &&
    event.type === "message_update" &&
    "assistantMessageEvent" in event &&
    typeof event.assistantMessageEvent === "object" &&
    event.assistantMessageEvent !== null &&
    "type" in event.assistantMessageEvent &&
    event.assistantMessageEvent.type === "text_delta" &&
    "delta" in event.assistantMessageEvent &&
    typeof event.assistantMessageEvent.delta === "string"
  );
}

function isMessageEndEvent(event: unknown): event is { type: "message_end"; message: unknown } {
  return typeof event === "object" && event !== null && "type" in event && event.type === "message_end" && "message" in event;
}

function buildCliRuntimeFailureMessage(caseId: string, stderr: string): string {
  const trimmedStderr = stderr.trim();

  if (trimmedStderr.length > 0) {
    return `Pi CLI JSON run failed for case ${caseId}: ${trimmedStderr}`;
  }

  return `Pi CLI JSON run failed for case ${caseId}.`;
}

function snapshotValue<T>(value: T): T {
  try {
    return structuredClone(value);
  } catch {
    return value;
  }
}

export function collectCliJsonTelemetryLikeObservations(options: {
  workspaceDir: string;
  events: unknown[];
}) {
  const toolCalls = [];
  const toolResults = [];
  const bashCommands = [];
  const touchedFiles = [];
  const skillReads = [];
  const externalCalls = [];
  // tool_execution_end only carries the result + isError; the original
  // args (file path, command string, etc.) arrived with the matching
  // tool_execution_start. Pair them by toolCallId so downstream helpers
  // like toFileTouchTelemetry still see the path.
  const argsByToolCallId = new Map<string, Record<string, unknown>>();

  for (const event of options.events) {
    if (isToolCallEvent(event)) {
      argsByToolCallId.set(event.toolCallId, event.args);

      toolCalls.push({
        toolCallId: event.toolCallId,
        toolName: event.toolName,
        inputSummary: summarizeToolInput(event.toolName, event.args),
      });

      if (event.toolName === "bash" && typeof event.args.command === "string") {
        bashCommands.push(event.args.command);
        externalCalls.push(...summarizeExternalCalls(event.toolCallId, event.args.command));
      }

      if (event.toolName === "read" && typeof event.args.path === "string") {
        const skillRead = toSkillReadTelemetry(options.workspaceDir, event.toolCallId, event.args.path);

        if (skillRead) {
          skillReads.push(skillRead);
        }
      }

      continue;
    }

    if (isToolResultEvent(event)) {
      toolResults.push({
        toolCallId: event.toolCallId,
        toolName: event.toolName,
        isError: event.isError,
      });

      if (!event.isError) {
        const args = argsByToolCallId.get(event.toolCallId) ?? {};
        const fileTouch = toFileTouchTelemetry(options.workspaceDir, event.toolCallId, event.toolName, args);

        if (fileTouch) {
          touchedFiles.push(fileTouch);
        }
      }
    }
  }

  return {
    toolCalls,
    toolResults,
    bashCommands,
    touchedFiles,
    skillReads,
    externalCalls,
  };
}

function isToolCallEvent(
  event: unknown,
): event is { type: "tool_execution_start"; toolCallId: string; toolName: string; args: Record<string, unknown> } {
  return (
    typeof event === "object" &&
    event !== null &&
    "type" in event &&
    event.type === "tool_execution_start" &&
    "toolCallId" in event &&
    typeof event.toolCallId === "string" &&
    "toolName" in event &&
    typeof event.toolName === "string" &&
    "args" in event &&
    typeof event.args === "object" &&
    event.args !== null
  );
}

function isToolResultEvent(
  event: unknown,
): event is {
  type: "tool_execution_end";
  toolCallId: string;
  toolName: string;
  isError: boolean;
} {
  return (
    typeof event === "object" &&
    event !== null &&
    "type" in event &&
    event.type === "tool_execution_end" &&
    "toolCallId" in event &&
    typeof event.toolCallId === "string" &&
    "toolName" in event &&
    typeof event.toolName === "string" &&
    "isError" in event &&
    typeof event.isError === "boolean"
  );
}
