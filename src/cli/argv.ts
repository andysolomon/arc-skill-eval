import { CliUsageError, type ParsedCliCommand } from "./types.js";

export function parseCliArgs(argv: string[]): ParsedCliCommand {
  if (argv.length === 0 || argv[0] === "help" || argv[0] === "--help" || argv[0] === "-h") {
    return { command: "help" };
  }

  const [commandName, ...rest] = argv;

  switch (commandName) {
    case "run":
      return {
        command: "run",
        ...parseRunCommandArgs(rest),
      };
    default:
      throw new CliUsageError(`Unknown command: ${commandName}. Run \`arc-skill-eval --help\` for usage.`);
  }
}

export function renderHelp(): string {
  return [
    "arc-skill-eval",
    "",
    "Usage:",
    "  arc-skill-eval run <skill-dir-or-repo> [--skill <name>]... [--case <id>]... [--output-dir <path>] [--iteration <name>] [--compare] [--json]",
    "",
    "Notes:",
    "  - <skill-dir-or-repo> is either a skill directory containing evals/evals.json,",
    "    or a repo root; in the repo case the CLI discovers every SKILL.md + evals/evals.json pair.",
    "  - run writes per-case assistant.md + outputs/ + timing.json + grading.json + observability artifacts under",
    "    <skillDir>/evals-runs/<runId>/eval-<id>/ (overridable via --output-dir).",
    "  - run exits with code 1 when any assertion fails or any case errors out.",
    "  - Format reference: https://platform.claude.com/docs/en/agents-and-tools/agent-skills",
  ].join("\n");
}

function parseRunCommandArgs(args: string[]) {
  const skillNames: string[] = [];
  const caseIds: string[] = [];
  let input: string | undefined;
  let json = false;
  let compare = false;
  let outputDir: string | undefined;
  let iteration: string | undefined;

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

    if (arg === "--iteration" || arg.startsWith("--iteration=")) {
      const parsed = readFlagValue(arg, args[index + 1]);
      iteration = parsed.value;
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

  return { input, skillNames, caseIds, outputDir, iteration, compare, json };
}

function readFlagValue(arg: string, nextArg: string | undefined): { value: string; consumedNext: boolean } {
  const separatorIndex = arg.indexOf("=");

  if (separatorIndex >= 0) {
    return { value: arg.slice(separatorIndex + 1), consumedNext: false };
  }

  if (nextArg === undefined) {
    throw new CliUsageError(`Flag ${arg} requires a value.`);
  }

  return { value: nextArg, consumedNext: true };
}
