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
import { parseCodexJsonl } from "./parse-jsonl.js";
import { cleanupStagedCodexSkills, stageCodexSkills } from "./staging.js";

export type CodexInvocationOptions = CliInvocationOptions;
export type CodexInvocationResult = CliInvocationResult;
export type CodexInvoker = CliInvoker;

export interface CreateCodexRuntimeOptions {
  invoker?: CodexInvoker;
}

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

const codexHarness: CliHarnessSpec = {
  id: "codex",
  label: "Codex",
  sessionPrefix: "codex",
  buildArgv: buildCodexExecArgv,
  parse: parseCodexJsonl,
  stageSkills: stageCodexSkills,
  cleanupStagedSkills: cleanupStagedCodexSkills,
  failOnUnparseableOutput: true,
};

export function createCodexRuntime(options: CreateCodexRuntimeOptions = {}): AgentRuntime {
  const invoker = options.invoker ?? processInvoker("codex");
  return {
    id: "codex",
    runCase: (runOptions) => runCliHarnessCase(codexHarness, runOptions, invoker),
  };
}

export const codexRuntime = createCodexRuntime();
