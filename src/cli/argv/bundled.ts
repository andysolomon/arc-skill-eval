import { CliUsageError } from "../types.js";

export function parseBundledCommandArgs(args: string[]) {
  let skillName: string | undefined;
  let json = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]!;

    if (arg === "--json") {
      json = true;
      continue;
    }

    if (arg.startsWith("-")) {
      throw new CliUsageError(`Unknown flag: ${arg}.`);
    }

    if (skillName !== undefined) {
      throw new CliUsageError("Only one <skill-name> positional argument is allowed.");
    }

    skillName = arg;
  }

  return { skillName, json };
}
