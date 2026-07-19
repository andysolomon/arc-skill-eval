import { CliUsageError } from "../types.js";

export function parseBrowseCommandArgs(args: string[]) {
  let input: string | undefined;
  let noBaseline = false;

  for (const arg of args) {
    if (arg === "--no-baseline") {
      noBaseline = true;
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

  return { input, noBaseline };
}
