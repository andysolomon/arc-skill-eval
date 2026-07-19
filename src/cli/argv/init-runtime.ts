import { CliUsageError } from "../types.js";
import { readFlagValue } from "./shared.js";

export function parseInitRuntimeCommandArgs(args: string[]) {
  let targetDir: string | undefined;
  let provider: string | undefined;
  let model: string | undefined;
  let force = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]!;

    if (arg === "--force") {
      force = true;
      continue;
    }

    if (arg === "--provider" || arg.startsWith("--provider=")) {
      const parsed = readFlagValue(arg, args[index + 1]);
      provider = parsed.value;
      index += parsed.consumedNext ? 1 : 0;
      continue;
    }

    if (arg === "--model" || arg.startsWith("--model=")) {
      const parsed = readFlagValue(arg, args[index + 1]);
      model = parsed.value;
      index += parsed.consumedNext ? 1 : 0;
      continue;
    }

    if (arg.startsWith("-")) {
      throw new CliUsageError(`Unknown flag: ${arg}.`);
    }

    if (targetDir !== undefined) {
      throw new CliUsageError("Only one <agent-dir> positional argument is allowed.");
    }

    targetDir = arg;
  }

  if (!targetDir) throw new CliUsageError("Missing required <agent-dir> argument.");
  if (!provider) throw new CliUsageError("Missing required --provider flag.");
  if (!model) throw new CliUsageError("Missing required --model flag.");

  return { targetDir, provider, model, force };
}
