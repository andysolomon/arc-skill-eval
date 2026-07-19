import { CliUsageError } from "../types.js";
import { readFlagValue } from "./shared.js";

export function parseAuditCommandArgs(args: string[]) {
  let input: string | undefined;
  let json = false;
  let output: string | undefined;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]!;

    if (arg === "--json") {
      json = true;
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

    if (input !== undefined) {
      throw new CliUsageError("Only one <skill-dir-or-repo> positional argument is allowed.");
    }

    input = arg;
  }

  if (!input) throw new CliUsageError("Missing required <skill-dir-or-repo> argument.");
  return { input, json, output };
}
