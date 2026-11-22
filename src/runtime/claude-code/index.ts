import type { ModelSelection } from "../../contracts/types.js";
import {
  processInvoker,
  runCliHarnessCase,
  type CliHarnessSpec,
  type CliInvocationOptions,
  type CliInvocationResult,
  type CliInvoker,
} from "../cli-harness-case.js";
import type { AgentRuntime } from "../types.js";
import { parseClaudeStreamJson } from "./parse-stream-json.js";
import { cleanupStagedClaudeSkills, stageClaudeSkills } from "./staging.js";

export type ClaudeInvocationOptions = CliInvocationOptions;
export type ClaudeInvocationResult = CliInvocationResult;
export type ClaudeInvoker = CliInvoker;

export interface CreateClaudeCodeRuntimeOptions {
  invoker?: ClaudeInvoker;
}

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

const claudeCodeHarness: CliHarnessSpec = {
  id: "claude-code",
  label: "Claude Code",
  sessionPrefix: "claude",
  buildArgv: (_workspaceDir, prompt, model) => buildClaudePrintArgv(prompt, model),
  parse: parseClaudeStreamJson,
  stageSkills: stageClaudeSkills,
  cleanupStagedSkills: cleanupStagedClaudeSkills,
  failOnUnparseableOutput: true,
};

export function createClaudeCodeRuntime(options: CreateClaudeCodeRuntimeOptions = {}): AgentRuntime {
  const invoker = options.invoker ?? processInvoker("claude");
  return {
    id: "claude-code",
    runCase: (runOptions) => runCliHarnessCase(claudeCodeHarness, runOptions, invoker),
  };
}

export const claudeCodeRuntime = createClaudeCodeRuntime();
