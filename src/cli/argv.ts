import { CliUsageError, type ParsedCliCommand } from "./types.js";

export function parseCliArgs(argv: string[]): ParsedCliCommand {
  if (argv.length === 0 || argv[0] === "help" || argv[0] === "--help" || argv[0] === "-h") {
    return { command: "help" };
  }

  const [commandName, ...rest] = argv;

  switch (commandName) {
    case "list":
      return {
        command: "list",
        ...parseSharedCommandArgs(rest, {
          allowCase: false,
          allowHtml: false,
          allowLiveSmoke: false,
          allowOutputDir: false,
        }),
      };
    case "validate":
      return {
        command: "validate",
        ...parseSharedCommandArgs(rest, {
          allowCase: false,
          allowHtml: false,
          allowLiveSmoke: false,
          allowOutputDir: false,
        }),
      };
    case "test":
      return {
        command: "test",
        ...parseSharedCommandArgs(rest, {
          allowCase: true,
          allowHtml: true,
          allowLiveSmoke: true,
          allowOutputDir: true,
        }),
      };
    case "run":
      return {
        command: "run",
        ...parseSharedCommandArgs(rest, {
          allowCase: true,
          allowHtml: false,
          allowLiveSmoke: false,
          allowOutputDir: true,
        }),
      };
    default:
      throw new CliUsageError(`Unknown command: ${commandName}.`);
  }
}

export function renderHelp(): string {
  return [
    "arc-skill-eval",
    "",
    "Usage:",
    "  arc-skill-eval list <repo-or-path> [--skill <name>]... [--json]",
    "  arc-skill-eval validate <repo-or-path> [--skill <name>]... [--json]",
    "  arc-skill-eval test <repo-or-path> [--skill <name>]... [--case <id>]... [--include-live-smoke] [--output-dir <path>] [--html] [--json]",
    "  arc-skill-eval run <skill-dir-or-repo> [--skill <name>]... [--case <id>]... [--output-dir <path>] [--json]",
    "",
    "Notes:",
    "  - <repo-or-path> resolves to a local path first, then supported git references.",
    "  - test writes report.json by default and report.html when --html is set (legacy format).",
    "  - run reads evals/evals.json inside each skill dir and writes per-case grading.json + timing.json + outputs/ under <skill>/evals-runs/<runId>/.",
    "  - validate, test, and run exit with code 1 when any skill or assertion fails.",
  ].join("\n");
}

function parseSharedCommandArgs(
  args: string[],
  options: {
    allowCase: boolean;
    allowHtml: boolean;
    allowLiveSmoke: boolean;
    allowOutputDir: boolean;
  },
) {
  const skillNames: string[] = [];
  const caseIds: string[] = [];
  let input: string | undefined;
  let json = false;
  let html = false;
  let includeLiveSmoke = false;
  let outputDir: string | undefined;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]!;

    if (arg === "--json") {
      json = true;
      continue;
    }

    if (arg === "--html") {
      if (!options.allowHtml) {
        throw new CliUsageError("--html is only supported by the test command.");
      }

      html = true;
      continue;
    }

    if (arg === "--include-live-smoke") {
      if (!options.allowLiveSmoke) {
        throw new CliUsageError("--include-live-smoke is only supported by the test command.");
      }

      includeLiveSmoke = true;
      continue;
    }

    if (arg === "--skill" || arg.startsWith("--skill=")) {
      const parsed = readFlagValue(arg, args[index + 1]);
      skillNames.push(parsed.value);
      index += parsed.consumedNext ? 1 : 0;
      continue;
    }

    if (arg === "--case" || arg.startsWith("--case=")) {
      if (!options.allowCase) {
        throw new CliUsageError("--case is only supported by the test command.");
      }

      const parsed = readFlagValue(arg, args[index + 1]);
      caseIds.push(parsed.value);
      index += parsed.consumedNext ? 1 : 0;
      continue;
    }

    if (arg === "--output-dir" || arg.startsWith("--output-dir=")) {
      if (!options.allowOutputDir) {
        throw new CliUsageError("--output-dir is not supported for this command.");
      }

      const parsed = readFlagValue(arg, args[index + 1]);
      outputDir = parsed.value;
      index += parsed.consumedNext ? 1 : 0;
      continue;
    }

    if (arg.startsWith("-")) {
      throw new CliUsageError(`Unknown flag: ${arg}.`);
    }

    if (input !== undefined) {
      throw new CliUsageError("Only one <repo-or-path> positional argument is allowed.");
    }

    input = arg;
  }

  if (!input) {
    throw new CliUsageError("Missing required <repo-or-path> argument.");
  }

  return {
    input,
    skillNames,
    caseIds: options.allowCase ? caseIds : undefined,
    json,
    html: options.allowHtml ? html : undefined,
    includeLiveSmoke: options.allowLiveSmoke ? includeLiveSmoke : undefined,
    outputDir: options.allowOutputDir ? outputDir : undefined,
  };
}

function readFlagValue(arg: string, nextArg: string | undefined): { value: string; consumedNext: boolean } {
  const separatorIndex = arg.indexOf("=");

  if (separatorIndex >= 0) {
    const value = arg.slice(separatorIndex + 1);

    if (!value) {
      throw new CliUsageError(`Flag ${arg.slice(0, separatorIndex)} requires a value.`);
    }

    return {
      value,
      consumedNext: false,
    };
  }

  if (!nextArg || nextArg.startsWith("-")) {
    throw new CliUsageError(`Flag ${arg} requires a value.`);
  }

  return {
    value: nextArg,
    consumedNext: true,
  };
}
