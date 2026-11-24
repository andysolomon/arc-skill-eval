import { CliUsageError, type ParsedCliCommand } from "../types.js";
import { parseAuditCommandArgs } from "./audit.js";
import { parseBrowseCommandArgs } from "./browse.js";
import { parseBundledCommandArgs } from "./bundled.js";
import { parseCreateCommandArgs } from "./create.js";
import { parseEmitCommandArgs } from "./emit.js";
import { parseImproveCommandArgs } from "./improve.js";
import { parseInitRuntimeCommandArgs } from "./init-runtime.js";
import { parseInstallSkillsCommandArgs } from "./install-skills.js";
import { parseOptimizeDescriptionCommandArgs } from "./optimize-description.js";
import { parsePackageCommandArgs } from "./package.js";
import { parseReviewCommandArgs } from "./review.js";
import { parseRunCommandArgs } from "./run.js";

export type CliCommandName = Exclude<ParsedCliCommand["command"], "help">;

/**
 * What `parseCliArgs` returns: a subcommand with its options, a help request
 * (for the whole CLI, or for one command when `topic` is set), or a version
 * request.
 */
export type ParsedCliInvocation =
  | Exclude<ParsedCliCommand, { command: "help" }>
  | { command: "help"; topic?: CliCommandName }
  | { command: "version" };

interface CommandHelp {
  usage: string;
  notes: string[];
}

const HELP_FLAGS = new Set(["--help", "-h"]);
const VERSION_FLAGS = new Set(["--version", "-v"]);

const MODEL_NOTE =
  "Model values use Pi's provider/model form, with an optional :thinking suffix, for example openai-codex/gpt-6-luna:medium.";
const SKILL_DIR_OR_REPO_NOTE =
  "<skill-dir-or-repo> is a skill directory that contains evals/evals.json, or a repo root. For a repo root, the CLI finds every directory that has both SKILL.md and evals/evals.json.";
const TTY_NOTE = "browse and create --interactive need a terminal and refuse to start without one.";

const JSON_NOTE =
  "--json (every command except browse) prints one JSON object on stdout with schemaVersion. Failures print {\"schemaVersion\":1,\"error\":{\"kind\",\"message\"}} instead. Exit code 1 means the run failed or the command errored. See docs/cli-json-contract.md.";

const GENERAL_NOTES = [
  JSON_NOTE,
  "<command> --help prints the usage for that command. --version prints the installed version.",
];

const COMMAND_HELP: Record<CliCommandName, CommandHelp> = {
  run: {
    usage:
      "run <skill-dir-or-repo> [--skill <name>]... [--case <id>]... [--runtime pi-sdk|codex|claude-code|cursor-agent|copilot] [--model <provider/model[:thinking]>] [--judge-model <provider/model[:thinking]>] [--agent-dir <path>] [--output-dir <path>] [--iteration <name>] [--extra-skill <path>]... [--context-mode isolated|ambient] [--sandbox none|just-bash] [--case-timeout <seconds>] [--concurrency <n>] [--trials <n>] [--compare] [--strict] [--stamp] [--laminar] [--json]",
    notes: [
      SKILL_DIR_OR_REPO_NOTE,
      "run writes assistant.md, outputs/, timing.json, grading.json and observability files for each case under <skillDir>/evals-runs/<runId>/eval-<id>/. --output-dir changes that location.",
      "--runtime picks the agent harness. The default is pi-sdk. codex, claude-code, cursor-agent and copilot each read their own API key env vars, listed in docs/multi-harness-runtimes.md.",
      "--model pins the model that runs the skill. --judge-model pins the model that grades LLM assertions.",
      MODEL_NOTE,
      "--compare runs each case once with the skill and once without it, and writes benchmark.json.",
      "--extra-skill loads a distractor or conflicting skill into every variant.",
      "--context-mode ambient loads Pi's normal ambient resources. The default is isolated.",
      "--sandbox just-bash runs eligible cases in an isolated just-bash environment and overrides each case's `sandbox` field. The default is none, which runs each case in a temporary workspace.",
      "--case-timeout <seconds> stops a case whose agent runs longer than that and records the case as an error.",
      "--concurrency <n> runs up to n cases at once (default 1). Results keep evals.json order.",
      "--trials <n> runs every case n times (default 1) and writes trials.json. It lists each assertion that passed in some trials and failed in others, and with --compare it gives the median delta and its spread across trials. A delta no larger than its spread is not a measured difference. A hard failure in any trial fails the run. Later trials write under trial-<k>/ in the run directory.",
      "--stamp writes evals/sync.json when every case of the suite passes. It records a hash of each skill file and suite file, so audit can report a skill that changed after its suite last passed. A failing run or a run narrowed with --case is not stamped.",
      "--laminar exports eval traces to Laminar. It needs LMNR_PROJECT_API_KEY and reads LMNR_BASE_URL and LMNR_PROJECT_NAME when they are set. It is off by default.",
      "run exits with code 1 when any hard assertion fails or any case errors out. --strict also fails the run on soft assertion misses.",
    ],
  },
  "init-runtime": {
    usage: "init-runtime <agent-dir> --provider <provider> --model <model> [--force] [--json]",
    notes: ["init-runtime writes a minimal Pi models.json and settings.json into <agent-dir> for eval runs to use."],
  },
  review: {
    usage: "review <run-dir> [--output <dir>] [--force] [--json]",
    notes: ["review writes static review.html and feedback.json files for an eval run directory. --output writes them to another directory."],
  },
  improve: {
    usage: "improve --from-feedback <feedback.json> [--dry-run] [--summary | --json] [--apply]",
    notes: ["improve proposes eval suite changes from review feedback. --apply writes validated metadata updates to evals/evals.json."],
  },
  create: {
    usage:
      "create <skill-dir> [--guided] [--interactive] [--model <provider/model[:thinking]>] [--agent-dir <path>] [--authoring-skill <path>] [--dry-run] [--summary | --json] [--force]",
    notes: [
      "create writes a starter evals/evals.json next to a SKILL.md file.",
      "--guided asks a configured model to propose cases. The model reads the bundled arc-creating-evals skill first, or the skill at --authoring-skill.",
      "--interactive works with --guided and lets you review, edit and select the proposed cases before anything is written.",
      MODEL_NOTE,
      TTY_NOTE,
    ],
  },
  browse: {
    usage: "browse [<skill-dir-or-repo>] [--no-baseline]",
    notes: [
      "browse opens an interactive terminal browser (Ink TUI) over the runs under evals-runs/. It defaults to the current directory.",
      "--no-baseline hides the without_skill comparison rows in the detail pane.",
      SKILL_DIR_OR_REPO_NOTE,
      TTY_NOTE,
    ],
  },
  audit: {
    usage: "audit <skill-dir-or-repo> [--json] [--output <path>]",
    notes: [
      "audit runs deterministic skill-quality checks on frontmatter, sprawl, eval coverage, local links and duplicate skill families.",
      "For a skill with a suite, audit also sets up each case's workspace and grades the script assertions before any agent runs. An assertion that already passes cannot fail, and is reported. audit compares evals/sync.json with the files on disk and reports a skill or suite that changed since `run --stamp`. No model is called.",
      "--output also writes the report to <path>, as Markdown or, with --json, as JSON.",
      SKILL_DIR_OR_REPO_NOTE,
    ],
  },
  "optimize-description": {
    usage:
      "optimize-description <skill-dir> (--generate-only [--output <path>] [--force] | --eval-set <path> [--distractor <skill-dir>]... [--max-iterations <n> [--apply]]) [--model <provider/model[:thinking]>] [--agent-dir <path>] [--json]",
    notes: [
      "--generate-only asks a configured model for prompts that should trigger the skill and nearby prompts that should not. It writes them with train and test split tags to <skillDir>/evals/description-evals.json for you to review.",
      "--eval-set scores the current frontmatter description. Each prompt gets one routing probe with no tools, which shows the target description next to sibling and --distractor descriptions in rotated order. The report lists a verdict per prompt and train and test accuracy.",
      "--max-iterations <n> proposes new descriptions from train-split failures and picks the winner by held-out test accuracy. SKILL.md changes only with --apply, which checks that the rewritten file reads back cleanly and restores the original if it does not.",
      MODEL_NOTE,
    ],
  },
  package: {
    usage: "package <skill-dir> [--output <path>] [--force] [--json]",
    notes: [
      "package validates SKILL.md and evals/evals.json, then bundles the skill directory and a sha256 manifest.json into <name>.skill.tgz. It leaves out evals-runs/, node_modules/, dot-files and earlier *.skill.tgz files.",
      "--output sets the artifact path. --force overwrites an existing artifact.",
    ],
  },
  bundled: {
    usage: "bundled [<skill-name>] [--json]",
    notes: [
      "bundled prints absolute paths to the skills shipped in the npm package. Use it in shell substitution, for example arc-skill-eval run \"$(arc-skill-eval bundled hello-world)\".",
    ],
  },
  emit: {
    usage: "emit (<skill-dir> | --from <suite.eval.ts>) [--out <evals/evals.json>] [--check] [--json]",
    notes: [
      "emit compiles a typed defineSkillEval suite into evals/evals.json. The suite is a .eval.ts file that default-exports the suite, imported from arc-skill-eval/evals. emit transpiles TypeScript in-process and validates the result with the same loader the runner uses.",
      "With <skill-dir>, emit reads evals/evals.eval.ts and writes evals/evals.json.",
      "--check compares the committed JSON with the suite, writes nothing, and exits 1 if they differ. Use it in CI.",
    ],
  },
  "install-skills": {
    usage:
      "install-skills [--target <project-root>] [--harness claude-code|codex|cursor-agent|copilot|pi]... [--skill <name>]... [--force] [--json]",
    notes: [
      "install-skills copies the bundled agent skills (arc-creating-evals, arc-running-evals) into .agents/skills and .claude/skills under --target, which defaults to the current directory. Any harness can then drive arc-skill-eval.",
      "--harness limits the install to the folders that harness reads. An existing install is skipped unless you pass --force.",
      "--skill installs a named bundled skill instead of the default pair, such as arc-maintaining-evals or arc-evals-lite.",
    ],
  },
};

const FORMAT_REFERENCE = "Format reference: https://platform.claude.com/docs/en/agents-and-tools/agent-skills";

export function isCliCommandName(value: string): value is CliCommandName {
  return Object.hasOwn(COMMAND_HELP, value);
}

export function parseCliArgs(argv: string[]): ParsedCliInvocation {
  const rootArgs = argv.filter((arg) => arg !== "--json");
  const first = rootArgs[0];

  if (first === undefined || HELP_FLAGS.has(first)) {
    return { command: "help" };
  }

  if (VERSION_FLAGS.has(first)) {
    return { command: "version" };
  }

  if (first === "help") {
    const topic = rootArgs[1];
    if (topic === undefined || HELP_FLAGS.has(topic)) return { command: "help" };
    if (!isCliCommandName(topic)) throw unknownCommand(topic);
    return { command: "help", topic };
  }

  const [commandName, ...rest] = argv;

  if (commandName === undefined || !isCliCommandName(commandName)) {
    throw unknownCommand(commandName ?? first);
  }

  if (rest.some((arg) => HELP_FLAGS.has(arg))) {
    return { command: "help", topic: commandName };
  }

  switch (commandName) {
    case "run":
      return { command: "run", ...parseRunCommandArgs(rest) };
    case "init-runtime":
      return { command: "init-runtime", ...parseInitRuntimeCommandArgs(rest) };
    case "review":
      return { command: "review", ...parseReviewCommandArgs(rest) };
    case "improve":
      return { command: "improve", ...parseImproveCommandArgs(rest) };
    case "create":
      return { command: "create", ...parseCreateCommandArgs(rest) };
    case "browse":
      return { command: "browse", ...parseBrowseCommandArgs(rest) };
    case "audit":
      return { command: "audit", ...parseAuditCommandArgs(rest) };
    case "optimize-description":
      return { command: "optimize-description", ...parseOptimizeDescriptionCommandArgs(rest) };
    case "package":
      return { command: "package", ...parsePackageCommandArgs(rest) };
    case "bundled":
      return { command: "bundled", ...parseBundledCommandArgs(rest) };
    case "emit":
      return { command: "emit", ...parseEmitCommandArgs(rest) };
    case "install-skills":
      return { command: "install-skills", ...parseInstallSkillsCommandArgs(rest) };
  }
}

function unknownCommand(name: string): CliUsageError {
  return new CliUsageError(`Unknown command: ${name}. Run \`arc-skill-eval --help\` for usage.`);
}

function renderNotes(notes: Iterable<string>): string[] {
  return [...notes].map((note) => `  - ${note}`);
}

/**
 * Render help text. With a command name, print only that command's usage and
 * notes; without one, print every command.
 */
export function renderHelp(topic?: CliCommandName): string {
  if (topic) {
    const help = COMMAND_HELP[topic];
    return [
      `arc-skill-eval ${topic}`,
      "",
      "Usage:",
      `  arc-skill-eval ${help.usage}`,
      "",
      "Notes:",
      ...renderNotes(topic === "browse" ? help.notes : [...help.notes, JSON_NOTE]),
    ].join("\n");
  }

  const commands = Object.values(COMMAND_HELP);
  const notes = new Set([...GENERAL_NOTES, ...commands.flatMap((help) => help.notes), FORMAT_REFERENCE]);
  return [
    "arc-skill-eval",
    "",
    "Usage:",
    ...commands.map((help) => `  arc-skill-eval ${help.usage}`),
    "  arc-skill-eval <command> --help",
    "  arc-skill-eval --version",
    "",
    "Notes:",
    ...renderNotes(notes),
  ].join("\n");
}
