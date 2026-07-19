import { CliUsageError } from "../types.js";
import { readFlagValue } from "./shared.js";

export function parseImproveCommandArgs(args: string[]) {
  let feedbackPath: string | undefined;
  let dryRun = false;
  let summary = false;
  let apply = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]!;

    if (arg === "--dry-run") {
      dryRun = true;
      continue;
    }

    if (arg === "--summary") {
      summary = true;
      continue;
    }

    if (arg === "--apply") {
      apply = true;
      continue;
    }

    if (arg === "--from-feedback" || arg.startsWith("--from-feedback=")) {
      const parsed = readFlagValue(arg, args[index + 1]);
      feedbackPath = parsed.value;
      index += parsed.consumedNext ? 1 : 0;
      continue;
    }

    if (arg.startsWith("-")) {
      throw new CliUsageError(`Unknown flag: ${arg}.`);
    }

    throw new CliUsageError("improve requires --from-feedback <feedback.json>; positional arguments are not supported.");
  }

  if (!feedbackPath) throw new CliUsageError("Missing required --from-feedback flag.");
  return { feedbackPath, dryRun, summary, apply };
}
