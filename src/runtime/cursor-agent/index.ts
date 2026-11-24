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
import { parseCursorStreamJson } from "./parse-stream-json.js";
import { cleanupStagedCursorSkills, stageCursorSkills } from "./staging.js";

export type CursorInvocationOptions = CliInvocationOptions;
export type CursorInvocationResult = CliInvocationResult;
export type CursorInvoker = CliInvoker;

export interface CreateCursorAgentRuntimeOptions {
  invoker?: CursorInvoker;
  binary?: string;
}

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

const cursorAgentHarness: CliHarnessSpec = {
  id: "cursor-agent",
  label: "Cursor Agent",
  sessionPrefix: "cursor",
  buildArgv: buildCursorPrintArgv,
  parse: parseCursorStreamJson,
  stageSkills: stageCursorSkills,
  cleanupStagedSkills: cleanupStagedCursorSkills,
  failOnUnparseableOutput: false,
};

export function createCursorAgentRuntime(options: CreateCursorAgentRuntimeOptions = {}): AgentRuntime {
  const invoker = options.invoker ?? processInvoker(options.binary ?? "cursor-agent");
  return {
    id: "cursor-agent",
    runCase: (runOptions) => runCliHarnessCase(cursorAgentHarness, runOptions, invoker),
  };
}

export const cursorAgentRuntime = createCursorAgentRuntime();
