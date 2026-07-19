import type { ModelSelection } from "../../contracts/types.js";
import { CliUsageError } from "../types.js";
import { parseModelSelectionFlag, readFlagValue } from "./shared.js";

export function parseOptimizeDescriptionCommandArgs(args: string[]) {
  let skillDir: string | undefined;
  let generateOnly = false;
  let evalSetPath: string | undefined;
  let output: string | undefined;
  let force = false;
  let model: ModelSelection | undefined;
  let agentDir: string | undefined;
  let maxIterations: number | undefined;
  let apply = false;
  const distractorDirs: string[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]!;

    if (arg === "--generate-only") {
      generateOnly = true;
      continue;
    }

    if (arg === "--apply") {
      apply = true;
      continue;
    }

    if (arg === "--distractor" || arg.startsWith("--distractor=")) {
      const parsed = readFlagValue(arg, args[index + 1]);
      distractorDirs.push(parsed.value);
      index += parsed.consumedNext ? 1 : 0;
      continue;
    }

    if (arg === "--force") {
      force = true;
      continue;
    }

    if (arg === "--eval-set" || arg.startsWith("--eval-set=")) {
      const parsed = readFlagValue(arg, args[index + 1]);
      evalSetPath = parsed.value;
      index += parsed.consumedNext ? 1 : 0;
      continue;
    }

    if (arg === "--output" || arg.startsWith("--output=")) {
      const parsed = readFlagValue(arg, args[index + 1]);
      output = parsed.value;
      index += parsed.consumedNext ? 1 : 0;
      continue;
    }

    if (arg === "--model" || arg.startsWith("--model=")) {
      const parsed = readFlagValue(arg, args[index + 1]);
      model = parseModelSelectionFlag("--model", parsed.value);
      index += parsed.consumedNext ? 1 : 0;
      continue;
    }

    if (arg === "--agent-dir" || arg.startsWith("--agent-dir=")) {
      const parsed = readFlagValue(arg, args[index + 1]);
      agentDir = parsed.value;
      index += parsed.consumedNext ? 1 : 0;
      continue;
    }

    if (arg === "--max-iterations" || arg.startsWith("--max-iterations=")) {
      const parsed = readFlagValue(arg, args[index + 1]);
      const parsedNumber = Number(parsed.value);
      if (!Number.isInteger(parsedNumber) || parsedNumber < 1) {
        throw new CliUsageError(`Invalid --max-iterations: ${parsed.value}. Expected a positive integer.`);
      }
      maxIterations = parsedNumber;
      index += parsed.consumedNext ? 1 : 0;
      continue;
    }

    if (arg.startsWith("-")) {
      throw new CliUsageError(`Unknown flag: ${arg}.`);
    }

    if (skillDir !== undefined) {
      throw new CliUsageError("Only one <skill-dir> positional argument is allowed.");
    }

    skillDir = arg;
  }

  if (!skillDir) throw new CliUsageError("Missing required <skill-dir> argument.");
  if (!generateOnly && !evalSetPath) {
    throw new CliUsageError(
      "optimize-description requires --generate-only (to create a routing eval set) or --eval-set <path> (to score/optimize against one).",
    );
  }
  if (apply && maxIterations === undefined) {
    throw new CliUsageError("--apply writes the optimization winner, so it requires --max-iterations.");
  }

  return {
    skillDir,
    generateOnly,
    evalSetPath,
    output,
    force,
    maxIterations,
    apply,
    distractorDirs,
    ...(model ? { model } : {}),
    ...(agentDir ? { agentDir } : {}),
  };
}
