import { CliUsageError } from "../types.js";
import { readFlagValue } from "./shared.js";

export function parseEmitCommandArgs(args: string[]) {
  let from: string | undefined;
  let out: string | undefined;
  let skillDir: string | undefined;
  let check = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]!;

    if (arg === "--check") {
      check = true;
      continue;
    }

    if (arg === "--from" || arg.startsWith("--from=")) {
      const parsed = readFlagValue(arg, args[index + 1]);
      from = parsed.value;
      index += parsed.consumedNext ? 1 : 0;
      continue;
    }

    if (arg === "--out" || arg.startsWith("--out=")) {
      const parsed = readFlagValue(arg, args[index + 1]);
      out = parsed.value;
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

  if (from === undefined && skillDir === undefined) {
    throw new CliUsageError("emit requires --from <suite> or a <skill-dir> positional argument.");
  }

  return {
    ...(from !== undefined ? { from } : {}),
    ...(out !== undefined ? { out } : {}),
    ...(skillDir !== undefined ? { skillDir } : {}),
    check,
  };
}
