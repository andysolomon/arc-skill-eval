import type { ModelSelection } from "../../contracts/types.js";
import { CliUsageError } from "../types.js";
import { parseModelSelectionFlag, readFlagValue } from "./shared.js";

export function parseCreateCommandArgs(args: string[]) {
  let skillDir: string | undefined;
  let force = false;
  let dryRun = false;
  let summary = false;
  let guided = false;
  let interactive = false;
  let model: ModelSelection | undefined;
  let agentDir: string | undefined;
  let authoringSkillPath: string | undefined;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]!;

    if (arg === "--force") {
      force = true;
      continue;
    }

    if (arg === "--dry-run") {
      dryRun = true;
      continue;
    }

    if (arg === "--summary") {
      summary = true;
      continue;
    }

    if (arg === "--guided") {
      guided = true;
      continue;
    }

    if (arg === "--interactive") {
      interactive = true;
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

    if (arg === "--authoring-skill" || arg.startsWith("--authoring-skill=")) {
      const parsed = readFlagValue(arg, args[index + 1]);
      authoringSkillPath = parsed.value;
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
  if (interactive && !guided) {
    throw new CliUsageError(
      "--interactive is currently supported with --guided create mode. Use `arc-skill-eval create <skill-dir> --guided --interactive`.",
    );
  }
  return {
    skillDir,
    force,
    dryRun,
    summary,
    guided,
    interactive,
    ...(model ? { model } : {}),
    ...(agentDir ? { agentDir } : {}),
    ...(authoringSkillPath ? { authoringSkillPath } : {}),
  };
}
