import { SANDBOX_MODE_VALUES, type ModelSelection, type SandboxMode } from "../../contracts/types.js";
import { isCliRuntimeId } from "../../runtime/registry.js";
import { CliUsageError } from "../types.js";
import { isSandboxMode, parseModelSelectionFlag, readFlagValue } from "./shared.js";

export function parseRunCommandArgs(args: string[]) {
  const skillNames: string[] = [];
  const caseIds: string[] = [];
  let input: string | undefined;
  let json = false;
  let compare = false;
  let strict = false;
  let laminar = false;
  let outputDir: string | undefined;
  let iteration: string | undefined;
  let agentDir: string | undefined;
  const extraSkillPaths: string[] = [];
  let contextMode: "isolated" | "ambient" | undefined;
  let sandbox: SandboxMode | undefined;
  let model: ModelSelection | undefined;
  let judgeModel: ModelSelection | undefined;
  let runtime: string | undefined;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]!;

    if (arg === "--json") {
      json = true;
      continue;
    }

    if (arg === "--compare") {
      compare = true;
      continue;
    }

    if (arg === "--strict") {
      strict = true;
      continue;
    }

    if (arg === "--laminar") {
      laminar = true;
      continue;
    }

    if (arg === "--skill" || arg.startsWith("--skill=")) {
      const parsed = readFlagValue(arg, args[index + 1]);
      skillNames.push(parsed.value);
      index += parsed.consumedNext ? 1 : 0;
      continue;
    }

    if (arg === "--case" || arg.startsWith("--case=")) {
      const parsed = readFlagValue(arg, args[index + 1]);
      caseIds.push(parsed.value);
      index += parsed.consumedNext ? 1 : 0;
      continue;
    }

    if (arg === "--output-dir" || arg.startsWith("--output-dir=")) {
      const parsed = readFlagValue(arg, args[index + 1]);
      outputDir = parsed.value;
      index += parsed.consumedNext ? 1 : 0;
      continue;
    }

    if (arg === "--agent-dir" || arg.startsWith("--agent-dir=")) {
      const parsed = readFlagValue(arg, args[index + 1]);
      agentDir = parsed.value;
      index += parsed.consumedNext ? 1 : 0;
      continue;
    }

    if (arg === "--model" || arg.startsWith("--model=")) {
      const parsed = readFlagValue(arg, args[index + 1]);
      model = parseModelSelectionFlag("--model", parsed.value);
      index += parsed.consumedNext ? 1 : 0;
      continue;
    }

    if (arg === "--judge-model" || arg.startsWith("--judge-model=")) {
      const parsed = readFlagValue(arg, args[index + 1]);
      judgeModel = parseModelSelectionFlag("--judge-model", parsed.value);
      index += parsed.consumedNext ? 1 : 0;
      continue;
    }

    if (arg === "--extra-skill" || arg.startsWith("--extra-skill=")) {
      const parsed = readFlagValue(arg, args[index + 1]);
      extraSkillPaths.push(parsed.value);
      index += parsed.consumedNext ? 1 : 0;
      continue;
    }

    if (arg === "--context-mode" || arg.startsWith("--context-mode=")) {
      const parsed = readFlagValue(arg, args[index + 1]);
      if (parsed.value !== "isolated" && parsed.value !== "ambient") {
        throw new CliUsageError(`Invalid --context-mode: ${parsed.value}. Expected isolated or ambient.`);
      }
      contextMode = parsed.value;
      index += parsed.consumedNext ? 1 : 0;
      continue;
    }

    if (arg === "--sandbox" || arg.startsWith("--sandbox=")) {
      const parsed = readFlagValue(arg, args[index + 1]);
      if (!isSandboxMode(parsed.value)) {
        throw new CliUsageError(
          `Invalid --sandbox: ${parsed.value}. Expected ${SANDBOX_MODE_VALUES.join(" or ")}.`,
        );
      }
      sandbox = parsed.value;
      index += parsed.consumedNext ? 1 : 0;
      continue;
    }

    if (arg === "--iteration" || arg.startsWith("--iteration=")) {
      const parsed = readFlagValue(arg, args[index + 1]);
      iteration = parsed.value;
      index += parsed.consumedNext ? 1 : 0;
      continue;
    }

    if (arg === "--runtime" || arg.startsWith("--runtime=")) {
      const parsed = readFlagValue(arg, args[index + 1]);
      if (!isCliRuntimeId(parsed.value)) {
        throw new CliUsageError(
          `Invalid --runtime: ${parsed.value}. Expected pi-sdk, codex, claude-code, cursor-agent, or copilot.`,
        );
      }
      runtime = parsed.value;
      index += parsed.consumedNext ? 1 : 0;
      continue;
    }

    if (arg.startsWith("-")) {
      throw new CliUsageError(`Unknown flag: ${arg}.`);
    }

    if (input !== undefined) {
      throw new CliUsageError("Only one <skill-dir-or-repo> positional argument is allowed.");
    }

    input = arg;
  }

  if (!input) {
    throw new CliUsageError("Missing required <skill-dir-or-repo> argument.");
  }

  return {
    input,
    skillNames,
    caseIds,
    outputDir,
    iteration,
    agentDir,
    extraSkillPaths,
    contextMode,
    sandbox,
    model,
    judgeModel,
    runtime,
    compare,
    strict,
    laminar,
    json,
  };
}
