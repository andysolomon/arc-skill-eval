import { access } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";

import { piSdkRuntime } from "../pi/sdk-eval-case.js";
import { createClaudeCodeRuntime, type ClaudeInvoker } from "./claude-code/index.js";
import { createCodexRuntime, type CodexInvoker } from "./codex/index.js";
import { createCopilotRuntime, type CopilotInvoker } from "./copilot/index.js";
import { createCursorAgentRuntime, type CursorInvoker } from "./cursor-agent/index.js";
import type { AgentRuntime } from "./types.js";

/** CLI-selectable harness runtimes (`arc-skill-eval run --runtime`). */
export const CLI_RUNTIME_IDS = [
  "pi-sdk",
  "codex",
  "claude-code",
  "cursor-agent",
  "copilot",
] as const;

export type RuntimeId = (typeof CLI_RUNTIME_IDS)[number];

const DEFAULT_RUNTIME_ID: RuntimeId = "pi-sdk";

export interface ResolveRuntimeOptions {
  codexInvoker?: CodexInvoker;
  claudeInvoker?: ClaudeInvoker;
  cursorInvoker?: CursorInvoker;
  copilotInvoker?: CopilotInvoker;
}

export function isCliRuntimeId(value: string): value is RuntimeId {
  return (CLI_RUNTIME_IDS as readonly string[]).includes(value);
}

export function normalizeRuntimeId(value: string | undefined): RuntimeId {
  if (!value || value === DEFAULT_RUNTIME_ID) {
    return DEFAULT_RUNTIME_ID;
  }
  if (!isCliRuntimeId(value)) {
    throw new Error(`Unknown runtime: ${value}. Expected one of: ${CLI_RUNTIME_IDS.join(", ")}.`);
  }
  return value;
}

export function resolveRuntime(id: string | undefined, options: ResolveRuntimeOptions = {}): AgentRuntime {
  const runtimeId = normalizeRuntimeId(id);
  switch (runtimeId) {
    case "pi-sdk":
      return piSdkRuntime;
    case "codex":
      return createCodexRuntime({ invoker: options.codexInvoker });
    case "claude-code":
      return createClaudeCodeRuntime({ invoker: options.claudeInvoker });
    case "cursor-agent":
      return createCursorAgentRuntime({ invoker: options.cursorInvoker });
    case "copilot":
      return createCopilotRuntime({ invoker: options.copilotInvoker });
    default: {
      const _exhaustive: never = runtimeId;
      throw new Error(`Unhandled runtime: ${_exhaustive}`);
    }
  }
}

export async function assertRuntimeReady(
  id: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  const runtimeId = normalizeRuntimeId(id);
  switch (runtimeId) {
    case "pi-sdk":
      return;
    case "codex":
      await assertCodexReady(env);
      return;
    case "claude-code":
      await assertClaudeCodeReady(env);
      return;
    case "cursor-agent":
      await assertCursorAgentReady(env);
      return;
    case "copilot":
      await assertCopilotReady(env);
      return;
    default: {
      const _exhaustive: never = runtimeId;
      throw new Error(`Unhandled runtime: ${_exhaustive}`);
    }
  }
}

async function assertCodexReady(env: NodeJS.ProcessEnv): Promise<void> {
  if (!commandExistsOnPath("codex")) {
    throw new Error(
      "Codex runtime requires the `codex` CLI on PATH. Install Codex CLI or choose --runtime pi-sdk.",
    );
  }

  if (env.CODEX_API_KEY?.trim()) {
    return;
  }

  const codexHome = env.CODEX_HOME?.trim() || path.join(os.homedir(), ".codex");
  try {
    await access(path.join(codexHome, "auth.json"));
  } catch {
    throw new Error(
      "Codex runtime requires CODEX_API_KEY or an existing Codex login (auth.json under CODEX_HOME or ~/.codex).",
    );
  }
}

async function assertClaudeCodeReady(env: NodeJS.ProcessEnv): Promise<void> {
  if (!commandExistsOnPath("claude")) {
    throw new Error(
      "Claude Code runtime requires the `claude` CLI on PATH. Install Claude Code or choose --runtime pi-sdk.",
    );
  }

  if (env.ANTHROPIC_API_KEY?.trim()) {
    return;
  }

  const claudeHome = env.CLAUDE_CONFIG_DIR?.trim() || path.join(os.homedir(), ".claude");
  try {
    await access(claudeHome);
  } catch {
    throw new Error(
      "Claude Code runtime requires ANTHROPIC_API_KEY or an existing Claude login (~/.claude or CLAUDE_CONFIG_DIR).",
    );
  }
}

async function assertCursorAgentReady(env: NodeJS.ProcessEnv): Promise<void> {
  if (!commandExistsOnPath("cursor-agent") && !commandExistsOnPath("agent")) {
    throw new Error(
      "Cursor Agent runtime requires `cursor-agent` (or `agent`) on PATH. Install Cursor CLI or choose --runtime pi-sdk.",
    );
  }

  if (env.CURSOR_API_KEY?.trim()) {
    return;
  }

  // Browser/device login stores credentials under ~/.cursor
  const cursorHome = path.join(os.homedir(), ".cursor");
  try {
    await access(cursorHome);
  } catch {
    throw new Error(
      "Cursor Agent runtime requires CURSOR_API_KEY or an existing Cursor login (~/.cursor).",
    );
  }
}

async function assertCopilotReady(env: NodeJS.ProcessEnv): Promise<void> {
  if (!commandExistsOnPath("copilot")) {
    throw new Error(
      "Copilot runtime requires the `copilot` CLI on PATH. Install GitHub Copilot CLI or choose --runtime pi-sdk.",
    );
  }

  const token =
    env.COPILOT_GITHUB_TOKEN?.trim() || env.GH_TOKEN?.trim() || env.GITHUB_TOKEN?.trim();
  if (token) {
    return;
  }

  throw new Error(
    "Copilot runtime requires COPILOT_GITHUB_TOKEN, GH_TOKEN, or GITHUB_TOKEN (GitHub Copilot entitlement required).",
  );
}

function commandExistsOnPath(command: string): boolean {
  if (process.platform === "win32") {
    const result = spawnSync("where", [command], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    return result.status === 0;
  }
  const result = spawnSync("sh", ["-c", `command -v ${command}`], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  return result.status === 0;
}
