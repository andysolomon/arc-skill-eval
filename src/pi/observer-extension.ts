import path from "node:path";

import type { ExtensionAPI, ExtensionFactory } from "@mariozechner/pi-coding-agent";
import { isToolCallEventType } from "@mariozechner/pi-coding-agent";

import type { ValidatedSkillDiscovery } from "../load/source-types.js";
import type {
  PiSessionExternalCallSummary,
  PiSessionTelemetryEntry,
  PiSessionTelemetryFileTouch,
  PiSessionTelemetrySkillRead,
  PiSessionTelemetryToolCall,
  PiSessionTelemetryToolResult,
  PiSdkRunnableCase,
} from "./types.js";
import { PI_SESSION_TELEMETRY_CUSTOM_TYPE } from "./types.js";

export interface CreatePiSessionTelemetryObserverOptions {
  skill: ValidatedSkillDiscovery;
  caseDefinition: PiSdkRunnableCase;
}

export function createPiSessionTelemetryObserverExtension(
  options: CreatePiSessionTelemetryObserverOptions,
): ExtensionFactory {
  return function piSessionTelemetryObserver(pi: ExtensionAPI): void {
    let sequence = 0;

    pi.on("session_start", async (_event, ctx) => {
      appendTelemetry(pi, {
        sequence: ++sequence,
        timestamp: new Date().toISOString(),
        kind: "run-start",
        skillName: options.skill.contract.skill,
        caseId: options.caseDefinition.caseId,
        lane: options.caseDefinition.lane,
        sessionId: ctx.sessionManager.getSessionId(),
        data: {
          kind: options.caseDefinition.kind,
          relativeSkillDir: options.skill.files.relativeSkillDir,
        },
      });
    });

    pi.on("tool_call", async (event, ctx) => {
      const toolCall: PiSessionTelemetryToolCall = {
        toolCallId: event.toolCallId,
        toolName: event.toolName,
        inputSummary: summarizeToolInput(event.toolName, event.input),
      };

      appendTelemetry(pi, {
        sequence: ++sequence,
        timestamp: new Date().toISOString(),
        kind: "tool-call",
        skillName: options.skill.contract.skill,
        caseId: options.caseDefinition.caseId,
        lane: options.caseDefinition.lane,
        sessionId: ctx.sessionManager.getSessionId(),
        data: toolCall,
      });

      if (isToolCallEventType("read", event)) {
        const skillRead = toSkillReadTelemetry(ctx.cwd, event.toolCallId, event.input.path);

        if (skillRead !== null) {
          appendTelemetry(pi, {
            sequence: ++sequence,
            timestamp: new Date().toISOString(),
            kind: "skill-read",
            skillName: options.skill.contract.skill,
            caseId: options.caseDefinition.caseId,
            lane: options.caseDefinition.lane,
            sessionId: ctx.sessionManager.getSessionId(),
            data: skillRead,
          });
        }
      }

      if (isToolCallEventType("bash", event)) {
        appendTelemetry(pi, {
          sequence: ++sequence,
          timestamp: new Date().toISOString(),
          kind: "bash-command",
          skillName: options.skill.contract.skill,
          caseId: options.caseDefinition.caseId,
          lane: options.caseDefinition.lane,
          sessionId: ctx.sessionManager.getSessionId(),
          data: {
            toolCallId: event.toolCallId,
            command: event.input.command,
            timeout: event.input.timeout,
          },
        });

        for (const externalCall of summarizeExternalCalls(event.toolCallId, event.input.command)) {
          appendTelemetry(pi, {
            sequence: ++sequence,
            timestamp: new Date().toISOString(),
            kind: "external-call",
            skillName: options.skill.contract.skill,
            caseId: options.caseDefinition.caseId,
            lane: options.caseDefinition.lane,
            sessionId: ctx.sessionManager.getSessionId(),
            data: externalCall,
          });
        }
      }
    });

    pi.on("tool_result", async (event, ctx) => {
      const toolResult: PiSessionTelemetryToolResult = {
        toolCallId: event.toolCallId,
        toolName: event.toolName,
        isError: event.isError,
      };

      appendTelemetry(pi, {
        sequence: ++sequence,
        timestamp: new Date().toISOString(),
        kind: "tool-result",
        skillName: options.skill.contract.skill,
        caseId: options.caseDefinition.caseId,
        lane: options.caseDefinition.lane,
        sessionId: ctx.sessionManager.getSessionId(),
        data: toolResult,
      });

      if (event.isError) {
        return;
      }

      const fileTouch = toFileTouchTelemetry(ctx.cwd, event.toolCallId, event.toolName, event.input);

      if (fileTouch !== null) {
        appendTelemetry(pi, {
          sequence: ++sequence,
          timestamp: new Date().toISOString(),
          kind: "file-touch",
          skillName: options.skill.contract.skill,
          caseId: options.caseDefinition.caseId,
          lane: options.caseDefinition.lane,
          sessionId: ctx.sessionManager.getSessionId(),
          data: fileTouch,
        });
      }
    });
  };
}

function appendTelemetry(pi: ExtensionAPI, entry: PiSessionTelemetryEntry): void {
  pi.appendEntry(PI_SESSION_TELEMETRY_CUSTOM_TYPE, entry);
}

function summarizeToolInput(toolName: string, input: Record<string, unknown>): string | undefined {
  switch (toolName) {
    case "bash":
      return truncateText(typeof input.command === "string" ? input.command : undefined, 240);
    case "read":
    case "edit":
    case "write":
    case "grep":
    case "find":
    case "ls":
      return typeof input.path === "string" ? input.path : undefined;
    default:
      return truncateText(safeJsonStringify(input), 240);
  }
}

function toSkillReadTelemetry(cwd: string, toolCallId: string, inputPath: string): PiSessionTelemetrySkillRead | null {
  const absolutePath = path.resolve(cwd, inputPath);

  if (path.basename(absolutePath) !== "SKILL.md") {
    return null;
  }

  return {
    toolCallId,
    path: inputPath,
    absolutePath,
    skillName: path.basename(path.dirname(absolutePath)),
  };
}

function toFileTouchTelemetry(
  cwd: string,
  toolCallId: string,
  toolName: string,
  input: Record<string, unknown>,
): PiSessionTelemetryFileTouch | null {
  if ((toolName !== "edit" && toolName !== "write") || typeof input.path !== "string") {
    return null;
  }

  return {
    toolCallId,
    toolName: toolName as "edit" | "write",
    path: input.path,
    absolutePath: path.resolve(cwd, input.path),
  };
}

function summarizeExternalCalls(toolCallId: string, command: string): PiSessionExternalCallSummary[] {
  const externalCalls: PiSessionExternalCallSummary[] = [];

  if (/\bgh\s+/u.test(command)) {
    const operation = command.match(/\bgh\s+([a-z-]+)/u)?.[1] ?? "command";
    externalCalls.push({ toolCallId, system: "github-cli", operation });
  }

  if (/\bcurl\s+/u.test(command) || /\bwget\s+/u.test(command)) {
    for (const url of extractUrls(command)) {
      externalCalls.push({
        toolCallId,
        system: "http",
        operation: /\bcurl\s+/u.test(command) ? "curl" : "wget",
        target: url.host,
      });
    }
  }

  if (/\bgit\s+(clone|fetch|pull|push)\b/u.test(command)) {
    const operation = command.match(/\bgit\s+(clone|fetch|pull|push)\b/u)?.[1] ?? "remote";
    externalCalls.push({ toolCallId, system: "git-remote", operation });
  }

  return dedupeExternalCalls(externalCalls);
}

function dedupeExternalCalls(calls: PiSessionExternalCallSummary[]): PiSessionExternalCallSummary[] {
  const seen = new Set<string>();
  const deduped: PiSessionExternalCallSummary[] = [];

  for (const call of calls) {
    const key = `${call.toolCallId}:${call.system}:${call.operation}:${call.target ?? ""}`;

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push(call);
  }

  return deduped;
}

function extractUrls(command: string): URL[] {
  const urls: URL[] = [];

  for (const match of command.matchAll(/https?:\/\/[^\s"'`]+/gu)) {
    try {
      urls.push(new URL(match[0]));
    } catch {
      // Ignore invalid URLs.
    }
  }

  return urls;
}

function truncateText(value: string | undefined, maxLength: number): string | undefined {
  if (value === undefined || value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength - 1)}…`;
}

function safeJsonStringify(value: unknown): string | undefined {
  try {
    return JSON.stringify(value);
  } catch {
    return undefined;
  }
}
