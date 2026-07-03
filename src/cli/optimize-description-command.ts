// `arc-skill-eval optimize-description` — measure and improve a skill's
// frontmatter description for routing accuracy (the skill-creator description
// optimization loop). This module ships in slices:
//   W-000035: --generate-only writes a reviewed routing eval set
//   W-000036: score the current/candidate description against the set
//   W-000037: iterative optimization with a train/test split
//   W-000038: --apply writes the winning description to SKILL.md

import { readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import type { ModelSelection } from "../contracts/types.js";
import { parseSkillFrontmatter } from "./create-command.js";
import { extractJsonObject, invokePiCompletion } from "./pi-completion.js";
import { CliCommandError } from "./types.js";

// ---------------------------------------------------------------- eval set

export type DescriptionEvalExpectation = "trigger" | "no-trigger";
export type DescriptionEvalSplit = "train" | "test";

export interface DescriptionEvalPrompt {
  id: string;
  prompt: string;
  expect: DescriptionEvalExpectation;
  split: DescriptionEvalSplit;
  note?: string;
}

export interface DescriptionEvalSet {
  version: "1";
  skill_name: string;
  prompts: DescriptionEvalPrompt[];
}

/**
 * Validate a parsed description-evals.json value, mirroring the evals.json
 * loader contract: every problem names the offending entry.
 */
export function validateDescriptionEvalSetValue(value: unknown, sourceDescription = "description-evals.json"): DescriptionEvalSet {
  const issues: string[] = [];
  const record = value as Record<string, unknown> | null;
  if (typeof record !== "object" || record === null || Array.isArray(record)) {
    throw new CliCommandError(`${sourceDescription}: expected a JSON object.`);
  }
  if (record.version !== "1") issues.push("`version` must be the string \"1\".");
  if (typeof record.skill_name !== "string" || record.skill_name.length === 0) {
    issues.push("`skill_name` must be a non-empty string.");
  }
  const prompts = record.prompts;
  if (!Array.isArray(prompts) || prompts.length === 0) {
    issues.push("`prompts` must be a non-empty array.");
  } else {
    const seenIds = new Set<string>();
    prompts.forEach((entry, index) => {
      const label = `prompts[${index}]`;
      const p = entry as Record<string, unknown> | null;
      if (typeof p !== "object" || p === null || Array.isArray(p)) {
        issues.push(`${label} must be an object.`);
        return;
      }
      if (typeof p.id !== "string" || p.id.length === 0) issues.push(`${label}.id must be a non-empty string.`);
      else if (seenIds.has(p.id)) issues.push(`${label}.id "${p.id}" is duplicated.`);
      else seenIds.add(p.id);
      if (typeof p.prompt !== "string" || p.prompt.trim().length === 0) issues.push(`${label}.prompt must be a non-empty string.`);
      if (p.expect !== "trigger" && p.expect !== "no-trigger") issues.push(`${label}.expect must be "trigger" or "no-trigger".`);
      if (p.split !== "train" && p.split !== "test") issues.push(`${label}.split must be "train" or "test".`);
      if (p.note !== undefined && typeof p.note !== "string") issues.push(`${label}.note must be a string when present.`);
    });
    if (issues.length === 0) {
      const asPrompts = prompts as unknown as DescriptionEvalPrompt[];
      if (!asPrompts.some((p) => p.split === "test")) issues.push("at least one prompt must be in the test split.");
      if (!asPrompts.some((p) => p.expect === "no-trigger")) issues.push("at least one prompt must expect no-trigger (adjacent negatives keep the optimizer honest).");
    }
  }

  if (issues.length > 0) {
    throw new CliCommandError(`Invalid ${sourceDescription}:\n- ${issues.join("\n- ")}`);
  }
  return record as unknown as DescriptionEvalSet;
}

export async function readDescriptionEvalSet(filePath: string): Promise<DescriptionEvalSet> {
  let raw: string;
  try {
    raw = await readFile(filePath, "utf8");
  } catch (error) {
    throw new CliCommandError(`Could not read eval set at ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new CliCommandError(`Eval set at ${filePath} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  return validateDescriptionEvalSetValue(parsed, filePath);
}

// ---------------------------------------------------------------- generation

export interface GenerateTriggerSetInput {
  skillName: string;
  skillText: string;
}

export function buildGenerateTriggerSetPrompt(input: GenerateTriggerSetInput): string {
  return [
    "You are generating a routing eval set for an agent skill's frontmatter description.",
    `The target skill is "${input.skillName}". Its SKILL.md is below.`,
    "Produce 12-20 realistic user prompts that test whether an agent should route to this skill:",
    "- should-trigger prompts (expect \"trigger\"): a mix of explicit phrasings that name the skill's domain and implicit phrasings that only describe the need.",
    "- should-not-trigger prompts (expect \"no-trigger\"): ADJACENT NEAR-MISSES — requests from a neighboring domain that a sloppy description would wrongly capture. Do not include obviously irrelevant tasks.",
    "Aim for roughly 60% trigger / 40% no-trigger.",
    "Assign each prompt a split: about 70% \"train\" and 30% \"test\", with both classes represented in both splits.",
    "Use short kebab-case ids. Add a brief `note` explaining why each no-trigger prompt is a near-miss.",
    "Return ONLY JSON with this exact shape (no markdown fences, no prose):",
    JSON.stringify(
      {
        version: "1",
        skill_name: input.skillName,
        prompts: [
          { id: "explicit-1", prompt: "…", expect: "trigger", split: "train" },
          { id: "near-miss-1", prompt: "…", expect: "no-trigger", split: "test", note: "adjacent because …" },
        ],
      },
      null,
      2,
    ),
    "",
    "=== TARGET SKILL.md ===",
    input.skillText,
    "=== END TARGET SKILL.md ===",
  ].join("\n");
}

export type TriggerSetGeneratorFn = (input: GenerateTriggerSetInput) => Promise<string>;

function parseGeneratedTriggerSet(rawResponse: string, skillName: string): DescriptionEvalSet {
  const jsonBlob = extractJsonObject(rawResponse);
  if (!jsonBlob) throw new CliCommandError("Trigger-set generator returned no JSON object.");
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonBlob);
  } catch (error) {
    throw new CliCommandError(`Trigger-set generator returned invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  // Models occasionally rename the skill; pin it to the real one before validation.
  if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
    (parsed as Record<string, unknown>).skill_name = skillName;
    (parsed as Record<string, unknown>).version = "1";
  }
  return validateDescriptionEvalSetValue(parsed, "trigger-set generator response");
}

// ---------------------------------------------------------------- command

export interface OptimizeDescriptionCommandOptions {
  skillDir: string;
  generateOnly?: boolean;
  evalSetPath?: string;
  /** Output path for --generate-only; defaults to <skillDir>/evals/description-evals.json. */
  output?: string;
  force?: boolean;
  model?: ModelSelection;
  agentDir?: string;
  maxIterations?: number;
  /** Injectable generator (tests); defaults to a single Pi completion. */
  generator?: TriggerSetGeneratorFn;
}

export interface GenerateTriggerSetResult {
  mode: "generate-only";
  skillDir: string;
  evalSetPath: string;
  triggerCount: number;
  noTriggerCount: number;
  trainCount: number;
  testCount: number;
}

export type OptimizeDescriptionCommandResult = GenerateTriggerSetResult;

export async function optimizeDescriptionCommand(options: OptimizeDescriptionCommandOptions): Promise<OptimizeDescriptionCommandResult> {
  const skillDir = path.resolve(options.skillDir);
  const skillPath = path.join(skillDir, "SKILL.md");

  if (!options.generateOnly) {
    throw new CliCommandError(
      "Scoring and optimization arrive in the next slices (W-000036/W-000037). For now run with --generate-only to produce a routing eval set.",
    );
  }

  let skillText: string;
  try {
    skillText = await readFile(skillPath, "utf8");
  } catch (error) {
    throw new CliCommandError(`Could not read SKILL.md at ${skillPath}: ${error instanceof Error ? error.message : String(error)}`);
  }
  const frontmatter = parseSkillFrontmatter(skillText, skillDir);

  const evalSetPath = path.resolve(options.output ?? path.join(skillDir, "evals", "description-evals.json"));
  if (!options.force && await fileExists(evalSetPath)) {
    throw new CliCommandError(`Refusing to overwrite existing eval set: ${evalSetPath}. Re-run with --force to overwrite.`);
  }

  const generator = options.generator ?? (async (input: GenerateTriggerSetInput) =>
    invokePiCompletion({
      prompt: buildGenerateTriggerSetPrompt(input),
      purpose: "trigger-set generation",
      model: options.model,
      agentDir: options.agentDir,
    }));

  const rawResponse = await generator({ skillName: frontmatter.name, skillText });
  const evalSet = parseGeneratedTriggerSet(rawResponse, frontmatter.name);

  const { mkdir } = await import("node:fs/promises");
  await mkdir(path.dirname(evalSetPath), { recursive: true });
  await writeFile(evalSetPath, `${JSON.stringify(evalSet, null, 2)}\n`, "utf8");

  return {
    mode: "generate-only",
    skillDir,
    evalSetPath,
    triggerCount: evalSet.prompts.filter((p) => p.expect === "trigger").length,
    noTriggerCount: evalSet.prompts.filter((p) => p.expect === "no-trigger").length,
    trainCount: evalSet.prompts.filter((p) => p.split === "train").length,
    testCount: evalSet.prompts.filter((p) => p.split === "test").length,
  };
}

async function fileExists(file: string): Promise<boolean> {
  try {
    return (await stat(file)).isFile();
  } catch {
    return false;
  }
}
