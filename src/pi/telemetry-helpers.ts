import path from "node:path";

import type {
  PiSessionExternalCallSummary,
  PiSessionTelemetryFileTouch,
  PiSessionTelemetrySkillRead,
} from "./types.js";

export function summarizeToolInput(toolName: string, input: Record<string, unknown>): string | undefined {
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

export function toSkillReadTelemetry(cwd: string, toolCallId: string, inputPath: string): PiSessionTelemetrySkillRead | null {
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

export function toFileTouchTelemetry(
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

export function summarizeExternalCalls(toolCallId: string, command: string): PiSessionExternalCallSummary[] {
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
