import { CliUsageError } from "../types.js";
import { readFlagValue } from "./shared.js";

export function parseReviewCommandArgs(args: string[]) {
  let runDir: string | undefined;
  let output: string | undefined;
  let force = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]!;

    if (arg === "--force") {
      force = true;
      continue;
    }

    if (arg === "--output" || arg.startsWith("--output=")) {
      const parsed = readFlagValue(arg, args[index + 1]);
      output = parsed.value;
      index += parsed.consumedNext ? 1 : 0;
      continue;
    }

    if (arg.startsWith("-")) {
      throw new CliUsageError(`Unknown flag: ${arg}.`);
    }

    if (runDir !== undefined) {
      throw new CliUsageError("Only one <run-dir> positional argument is allowed.");
    }

    runDir = arg;
  }

  if (!runDir) throw new CliUsageError("Missing required <run-dir> argument.");
  return { runDir, output, force };
}
