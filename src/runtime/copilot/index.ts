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
import { parseCopilotJsonl } from "./parse-jsonl.js";
import { cleanupStagedCopilotSkills, stageCopilotSkills } from "./staging.js";

export type CopilotInvocationOptions = CliInvocationOptions;
export type CopilotInvocationResult = CliInvocationResult;
export type CopilotInvoker = CliInvoker;

export interface CreateCopilotRuntimeOptions {
  invoker?: CopilotInvoker;
}

export function buildCopilotPrintArgv(prompt: string, model?: ModelSelection | null): string[] {
  const argv = ["-p", prompt, "--autopilot", "--allow-all", "--output-format=json"];
  if (model?.id) {
    argv.push("--model", model.id);
  }
  return argv;
}

const copilotHarness: CliHarnessSpec = {
  id: "copilot",
  label: "Copilot",
  sessionPrefix: "copilot",
  buildArgv: (_workspaceDir, prompt, model) => buildCopilotPrintArgv(prompt, model),
  parse: parseCopilotJsonl,
  stageSkills: stageCopilotSkills,
  cleanupStagedSkills: cleanupStagedCopilotSkills,
  failOnUnparseableOutput: false,
};

export function createCopilotRuntime(options: CreateCopilotRuntimeOptions = {}): AgentRuntime {
  const invoker = options.invoker ?? processInvoker("copilot");
  return {
    id: "copilot",
    runCase: (runOptions) => runCliHarnessCase(copilotHarness, runOptions, invoker),
  };
}

export const copilotRuntime = createCopilotRuntime();
