import { CliUsageError, type ParsedCliCommand } from "../types.js";
import { parseAuditCommandArgs } from "./audit.js";
import { parseBrowseCommandArgs } from "./browse.js";
import { parseBundledCommandArgs } from "./bundled.js";
import { parseCreateCommandArgs } from "./create.js";
import { parseEmitCommandArgs } from "./emit.js";
import { parseImproveCommandArgs } from "./improve.js";
import { parseInitRuntimeCommandArgs } from "./init-runtime.js";
import { parseOptimizeDescriptionCommandArgs } from "./optimize-description.js";
import { parsePackageCommandArgs } from "./package.js";
import { parseReviewCommandArgs } from "./review.js";
import { parseRunCommandArgs } from "./run.js";

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
    case "improve":
      return {
        command: "improve",
        ...parseImproveCommandArgs(rest),
      };
    case "create":
      return {
        command: "create",
        ...parseCreateCommandArgs(rest),
      };
    case "browse":
      return {
        command: "browse",
        ...parseBrowseCommandArgs(rest),
      };
    case "audit":
      return {
        command: "audit",
        ...parseAuditCommandArgs(rest),
      };
    case "optimize-description":
      return {
        command: "optimize-description",
        ...parseOptimizeDescriptionCommandArgs(rest),
      };
    case "package":
      return {
        command: "package",
        ...parsePackageCommandArgs(rest),
      };
    case "bundled":
      return {
        command: "bundled",
        ...parseBundledCommandArgs(rest),
      };
    case "emit":
      return {
        command: "emit",
        ...parseEmitCommandArgs(rest),
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
    "  arc-skill-eval run <skill-dir-or-repo> [--skill <name>]... [--case <id>]... [--runtime pi-sdk|codex|claude-code|cursor-agent|copilot] [--model <provider/model[:thinking]>] [--judge-model <provider/model[:thinking]>] [--agent-dir <path>] [--output-dir <path>] [--iteration <name>] [--extra-skill <path>]... [--context-mode isolated|ambient] [--sandbox none|just-bash] [--compare] [--strict] [--laminar] [--json]",
    "  arc-skill-eval init-runtime <agent-dir> --provider <provider> --model <model> [--force]",
    "  arc-skill-eval review <run-dir> [--output <dir>] [--force]",
    "  arc-skill-eval improve --from-feedback <feedback.json> [--dry-run] [--summary] [--apply]",
    "  arc-skill-eval create <skill-dir> [--guided] [--interactive] [--model <provider/model[:thinking]>] [--agent-dir <path>] [--authoring-skill <path>] [--dry-run] [--summary] [--force]",
    "  arc-skill-eval browse [<skill-dir-or-repo>] [--no-baseline]",
    "  arc-skill-eval audit <skill-dir-or-repo> [--json] [--output <path>]",
    "  arc-skill-eval optimize-description <skill-dir> (--generate-only [--output <path>] [--force] | --eval-set <path> [--distractor <skill-dir>]... [--max-iterations <n> [--apply]]) [--model <provider/model[:thinking]>] [--agent-dir <path>]",
    "  arc-skill-eval package <skill-dir> [--output <path>] [--force]",
    "  arc-skill-eval bundled [<skill-name>] [--json]",
    "  arc-skill-eval emit (<skill-dir> | --from <suite.eval.ts>) [--out <evals/evals.json>] [--check]",
    "",
    "Notes:",
    "  - <skill-dir-or-repo> is either a skill directory containing evals/evals.json,",
    "    or a repo root; in the repo case the CLI discovers every SKILL.md + evals/evals.json pair.",
    "  - run writes per-case assistant.md + outputs/ + timing.json + grading.json + observability artifacts under",
    "    <skillDir>/evals-runs/<runId>/eval-<id>/ (overridable via --output-dir).",
    "  - --runtime selects the agent harness (default pi-sdk). Alternatives: codex, claude-code, cursor-agent, copilot — each uses BYOK env vars (see docs/multi-harness-runtimes.md).",
    "  - --model pins the skill runner model; --judge-model pins the LLM assertion judge.",
    "  - Model values use Pi's provider/model form, optionally with :thinking (for example openai-codex/gpt-5.5:medium).",
    "  - --extra-skill loads explicit distractor/conflict skills for every variant.",
    "  - --context-mode ambient opts into normal Pi ambient resources; default is isolated.",
    "  - --sandbox just-bash runs eligible cases in an isolated just-bash environment and overrides each case's `sandbox` field; default is none (the temp-workspace runner).",
    "  - --laminar opts into exporting eval traces to Laminar; it requires LMNR_PROJECT_API_KEY and optionally honors LMNR_BASE_URL / LMNR_PROJECT_NAME. Disabled by default.",
    "  - run exits with code 1 when any assertion fails or any case errors out.",
    "  - init-runtime writes a minimal Pi models.json and settings.json for eval-owned runtime config.",
    "  - review writes static review.html and feedback.json files for an eval run directory.",
    "  - improve proposes eval suite changes from review feedback; --apply writes validated metadata updates.",
    "  - create scaffolds a starter evals/evals.json next to a SKILL.md file; --guided asks a configured model to propose cases using the bundled arc-creating-evals skill first and --interactive lets you review, edit, and select proposed cases before writing.",
    "  - browse opens an interactive terminal run browser (Ink TUI) over the artifacts under evals-runs/; defaults to the current directory.",
    "  - browse --no-baseline hides the without_skill comparison rows in the detail pane.",
    "  - audit performs deterministic skill-quality checks: frontmatter, sprawl, eval coverage, local links, and duplicate families.",
    "  - optimize-description --generate-only asks a configured model for should-trigger and adjacent should-not-trigger routing prompts, writes <skillDir>/evals/description-evals.json with train/test split tags, and asks you to review it.",
    "  - optimize-description --eval-set scores the skill's current frontmatter description: one no-tools routing probe per prompt (target + sibling/--distractor skill descriptions, rotated ordering), reporting per-prompt verdicts and train/test accuracy.",
    "  - optimize-description --max-iterations N proposes improved descriptions from train-split failures and selects the winner by held-out test accuracy; SKILL.md changes only with --apply (which verifies the rewrite reads back cleanly and restores the original otherwise).",
    "  - package validates SKILL.md and evals/evals.json first, then bundles the skill directory plus a sha256 manifest.json into <name>.skill.tgz (excluding evals-runs/, node_modules/, dot-files, and prior *.skill.tgz artifacts); --output overrides the artifact path and --force overwrites an existing artifact.",
    "  - bundled prints absolute paths to skills shipped with the npm package; use in shell substitution, e.g. arc-skill-eval run \"$(arc-skill-eval bundled hello-world)\".",
    "  - emit compiles a typed `defineSkillEval` suite (a .eval.ts that default-exports the suite; imported from arc-skill-eval/evals) into evals/evals.json, validating it through the same loader the runner uses. TypeScript suites are transpiled in-process. With <skill-dir> it resolves evals/evals.eval.ts → evals/evals.json; --check verifies the committed JSON matches the suite and exits 1 on drift (writes nothing) — ideal for CI.",
    "  - Format reference: https://platform.claude.com/docs/en/agents-and-tools/agent-skills",
  ].join("\n");
}
