import { THINKING_LEVEL_VALUES, type ModelSelection, type ThinkingLevel } from "../contracts/types.js";
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
    case "init-runtime":
      return {
        command: "init-runtime",
        ...parseInitRuntimeCommandArgs(rest),
      };
    case "review":
      return {
        command: "review",
        ...parseReviewCommandArgs(rest),
      };
    case "create":
      return {
        command: "create",
        ...parseCreateCommandArgs(rest),
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
    "  arc-skill-eval run <skill-dir-or-repo> [--skill <name>]... [--case <id>]... [--model <provider/model[:thinking]>] [--judge-model <provider/model[:thinking]>] [--agent-dir <path>] [--output-dir <path>] [--iteration <name>] [--extra-skill <path>]... [--context-mode isolated|ambient] [--compare] [--json]",
    "  arc-skill-eval init-runtime <agent-dir> --provider <provider> --model <model> [--force]",
    "  arc-skill-eval review <run-dir> [--output <dir>] [--force]",
    "  arc-skill-eval create <skill-dir> [--guided] [--interactive] [--model <provider/model[:thinking]>] [--agent-dir <path>] [--dry-run] [--summary] [--force]",
    "",
    "Notes:",
    "  - <skill-dir-or-repo> is either a skill directory containing evals/evals.json,",
    "    or a repo root; in the repo case the CLI discovers every SKILL.md + evals/evals.json pair.",
    "  - run writes per-case assistant.md + outputs/ + timing.json + grading.json + observability artifacts under",
    "    <skillDir>/evals-runs/<runId>/eval-<id>/ (overridable via --output-dir).",
    "  - --model pins the skill runner model; --judge-model pins the LLM assertion judge.",
    "  - Model values use Pi's provider/model form, optionally with :thinking (for example openai-codex/gpt-5.5:medium).",
    "  - --agent-dir points Pi config/auth/model lookup at an eval-owned agent directory.",
    "  - --extra-skill loads explicit distractor/conflict skills for every variant.",
    "  - --context-mode ambient opts into normal Pi ambient resources; default is isolated.",
    "  - run exits with code 1 when any assertion fails or any case errors out.",
    "  - init-runtime writes a minimal Pi models.json and settings.json for eval-owned runtime config.",
    "  - review writes static review.html and feedback.json files for an eval run directory.",
    "  - create scaffolds a starter evals/evals.json next to a SKILL.md file; --guided asks a configured model to propose cases first and --interactive lets you review, edit, and select proposed cases before writing.",
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
  let agentDir: string | undefined;
  const extraSkillPaths: string[] = [];
  let contextMode: "isolated" | "ambient" | undefined;
  let model: ModelSelection | undefined;
  let judgeModel: ModelSelection | undefined;

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

    if (arg === "--agent-dir" || arg.startsWith("--agent-dir=")) {
      const parsed = readFlagValue(arg, args[index + 1]);
      agentDir = parsed.value;
      index += parsed.consumedNext ? 1 : 0;
      continue;
    }

    if (arg === "--model" || arg.startsWith("--model=")) {
      const parsed = readFlagValue(arg, args[index + 1]);
      model = parseModelSelectionFlag("--model", parsed.value);
      index += parsed.consumedNext ? 1 : 0;
      continue;
    }

    if (arg === "--judge-model" || arg.startsWith("--judge-model=")) {
      const parsed = readFlagValue(arg, args[index + 1]);
      judgeModel = parseModelSelectionFlag("--judge-model", parsed.value);
      index += parsed.consumedNext ? 1 : 0;
      continue;
    }

    if (arg === "--extra-skill" || arg.startsWith("--extra-skill=")) {
      const parsed = readFlagValue(arg, args[index + 1]);
      extraSkillPaths.push(parsed.value);
      index += parsed.consumedNext ? 1 : 0;
      continue;
    }

    if (arg === "--context-mode" || arg.startsWith("--context-mode=")) {
      const parsed = readFlagValue(arg, args[index + 1]);
      if (parsed.value !== "isolated" && parsed.value !== "ambient") {
        throw new CliUsageError(`Invalid --context-mode: ${parsed.value}. Expected isolated or ambient.`);
      }
      contextMode = parsed.value;
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

  return { input, skillNames, caseIds, outputDir, iteration, agentDir, extraSkillPaths, contextMode, model, judgeModel, compare, json };
}

function parseInitRuntimeCommandArgs(args: string[]) {
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

function parseCreateCommandArgs(args: string[]) {
  let skillDir: string | undefined;
  let force = false;
  let dryRun = false;
  let summary = false;
  let guided = false;
  let interactive = false;
  let model: ModelSelection | undefined;
  let agentDir: string | undefined;

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

    if (arg.startsWith("-")) {
      throw new CliUsageError(`Unknown flag: ${arg}.`);
    }

    if (skillDir !== undefined) {
      throw new CliUsageError("Only one <skill-dir> positional argument is allowed.");
    }

    skillDir = arg;
  }

  if (!skillDir) throw new CliUsageError("Missing required <skill-dir> argument.");
  if (interactive && !guided) throw new CliUsageError("--interactive is currently supported with --guided create mode. Use `arc-skill-eval create <skill-dir> --guided --interactive`.");
  return { skillDir, force, dryRun, summary, guided, interactive, ...(model ? { model } : {}), ...(agentDir ? { agentDir } : {}) };
}

function parseReviewCommandArgs(args: string[]) {
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

function parseModelSelectionFlag(flagName: string, rawValue: string): ModelSelection {
  const slashIndex = rawValue.indexOf("/");
  if (slashIndex <= 0 || slashIndex === rawValue.length - 1) {
    throw new CliUsageError(`Invalid ${flagName}: ${rawValue}. Expected provider/model or provider/model:thinking.`);
  }

  const provider = rawValue.slice(0, slashIndex);
  const modelAndMaybeThinking = rawValue.slice(slashIndex + 1);
  const lastColonIndex = modelAndMaybeThinking.lastIndexOf(":");

  if (lastColonIndex < 0) return { provider, id: modelAndMaybeThinking };

  const suffix = modelAndMaybeThinking.slice(lastColonIndex + 1);
  if (!isThinkingLevel(suffix)) {
    return { provider, id: modelAndMaybeThinking };
  }

  const id = modelAndMaybeThinking.slice(0, lastColonIndex);
  if (!id) {
    throw new CliUsageError(`Invalid ${flagName}: ${rawValue}. Expected provider/model or provider/model:thinking.`);
  }

  return { provider, id, thinking: suffix };
}

function isThinkingLevel(value: string): value is ThinkingLevel {
  return (THINKING_LEVEL_VALUES as readonly string[]).includes(value);
}
