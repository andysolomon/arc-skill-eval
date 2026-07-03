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
import { parseSkillFrontmatter, type SkillFrontmatter } from "./create-command.js";
import { extractJsonObject, invokePiCompletion, invokePiCompletionDetailed } from "./pi-completion.js";
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

// ---------------------------------------------------------------- scoring

export interface RoutingSkillOption {
  name: string;
  description: string;
}

/**
 * One no-tools routing probe: numbered skill options plus "none", answer with
 * the exact name. The target's position rotates with promptIndex so a
 * position-biased model cannot inflate the score.
 */
export function buildRoutingProbePrompt(options: {
  userPrompt: string;
  target: RoutingSkillOption;
  distractors: RoutingSkillOption[];
  promptIndex: number;
}): string {
  const slots = options.distractors.length + 1;
  const targetSlot = ((options.promptIndex % slots) + slots) % slots;
  const ordered: RoutingSkillOption[] = [...options.distractors];
  ordered.splice(targetSlot, 0, options.target);

  return [
    "You are the routing gate for an AI agent. Skills are optional extensions; most requests need none of them.",
    "Given the user request and the available skills, decide which single skill (if any) should handle the request.",
    "Answer with ONLY the exact skill name, or the word none. No punctuation, no explanation.",
    "",
    "Available skills:",
    ...ordered.map((skill, index) => `${index + 1}. ${skill.name}: ${skill.description}`),
    "",
    `User request: ${options.userPrompt}`,
  ].join("\n");
}

/** Normalize a routing answer to a known skill name, "none", or null (unparseable). */
export function parseRoutingAnswer(raw: string, skillNames: string[]): string | null {
  const lines = raw.trim().split(/\r?\n/).map((line) => line.trim()).filter((line) => line.length > 0);
  const candidate = (lines.at(-1) ?? "").toLowerCase().replace(/^[^a-z0-9]*|[^a-z0-9]*$/g, "").replace(/^(skill|answer)[:\s]+/i, "");
  if (candidate === "none" || candidate === "no skill" || candidate === "n/a") return "none";
  for (const name of skillNames) {
    if (candidate === name.toLowerCase()) return name;
  }
  // Fall back to a whole-response scan for exactly one mentioned skill name.
  const haystack = raw.toLowerCase();
  const mentioned = skillNames.filter((name) => haystack.includes(name.toLowerCase()));
  if (mentioned.length === 1) return mentioned[0]!;
  if (mentioned.length === 0 && /\bnone\b/i.test(raw)) return "none";
  return null;
}

export interface RoutingVerdict {
  id: string;
  split: DescriptionEvalSplit;
  expect: DescriptionEvalExpectation;
  /** Parsed model choice: a skill name, "none", or null when unparseable. */
  got: string | null;
  correct: boolean;
}

export interface SplitScore {
  correct: number;
  total: number;
  accuracy: number;
}

export interface DescriptionScore {
  description: string;
  verdicts: RoutingVerdict[];
  train: SplitScore;
  test: SplitScore;
}

export type RoutingProberFn = (probePrompt: string) => Promise<string>;

function splitScore(verdicts: RoutingVerdict[], split: DescriptionEvalSplit): SplitScore {
  const inSplit = verdicts.filter((v) => v.split === split);
  const correct = inSplit.filter((v) => v.correct).length;
  return { correct, total: inSplit.length, accuracy: inSplit.length > 0 ? correct / inSplit.length : 0 };
}

/**
 * Score one description against the eval set. A "trigger" prompt is correct
 * when the model picks the target skill; a "no-trigger" prompt is correct
 * when it picks anything else (a distractor or none).
 */
export async function scoreDescription(options: {
  skillName: string;
  description: string;
  distractors: RoutingSkillOption[];
  evalSet: DescriptionEvalSet;
  prober: RoutingProberFn;
}): Promise<DescriptionScore> {
  const target: RoutingSkillOption = { name: options.skillName, description: options.description };
  const skillNames = [options.skillName, ...options.distractors.map((d) => d.name)];
  const verdicts: RoutingVerdict[] = [];

  for (const [index, entry] of options.evalSet.prompts.entries()) {
    const probe = buildRoutingProbePrompt({
      userPrompt: entry.prompt,
      target,
      distractors: options.distractors,
      promptIndex: index,
    });
    const answer = await options.prober(probe);
    const got = parseRoutingAnswer(answer, skillNames);
    const pickedTarget = got === options.skillName;
    verdicts.push({
      id: entry.id,
      split: entry.split,
      expect: entry.expect,
      got,
      correct: entry.expect === "trigger" ? pickedTarget : got !== null && !pickedTarget,
    });
  }

  return {
    description: options.description,
    verdicts,
    train: splitScore(verdicts, "train"),
    test: splitScore(verdicts, "test"),
  };
}

/** Load distractor skill frontmatter from sibling skill dirs (deterministic order, capped). */
export async function loadDistractorSkills(options: {
  skillDir: string;
  targetName: string;
  explicitDirs?: string[];
  cap?: number;
}): Promise<RoutingSkillOption[]> {
  const { readdir } = await import("node:fs/promises");
  const cap = options.cap ?? 5;
  const targetDir = path.resolve(options.skillDir);
  const candidateDirs: string[] = [...(options.explicitDirs ?? []).map((dir) => path.resolve(dir))];

  const parent = path.dirname(targetDir);
  try {
    const entries = await readdir(parent, { withFileTypes: true });
    for (const entry of entries.filter((e) => e.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
      const dir = path.join(parent, entry.name);
      if (dir !== targetDir && !candidateDirs.includes(dir)) candidateDirs.push(dir);
    }
  } catch {
    // No sibling directory to scan — explicit distractors (if any) still apply.
  }

  const distractors: RoutingSkillOption[] = [];
  for (const dir of candidateDirs) {
    if (distractors.length >= cap) break;
    try {
      const skillText = await readFile(path.join(dir, "SKILL.md"), "utf8");
      const frontmatter = parseSkillFrontmatter(skillText, dir);
      if (frontmatter.name === options.targetName || !frontmatter.description) continue;
      distractors.push({ name: frontmatter.name, description: frontmatter.description });
    } catch {
      continue; // not a skill dir
    }
  }
  return distractors;
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
  /** Explicit distractor skill dirs (repeatable --distractor). */
  distractorDirs?: string[];
  /** Injectable generator (tests); defaults to a single Pi completion. */
  generator?: TriggerSetGeneratorFn;
  /** Injectable routing prober (tests); defaults to a single Pi completion per prompt. */
  prober?: RoutingProberFn;
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

export interface ScoreDescriptionResult {
  mode: "score";
  skillDir: string;
  skillName: string;
  evalSetPath: string;
  score: DescriptionScore;
  distractors: string[];
  probeCount: number;
  probeModel: string | null;
  totalTokens: number;
  totalCostUsd: number;
}

export type OptimizeDescriptionCommandResult = GenerateTriggerSetResult | ScoreDescriptionResult;

export async function optimizeDescriptionCommand(options: OptimizeDescriptionCommandOptions): Promise<OptimizeDescriptionCommandResult> {
  const skillDir = path.resolve(options.skillDir);
  const skillPath = path.join(skillDir, "SKILL.md");

  let skillText: string;
  try {
    skillText = await readFile(skillPath, "utf8");
  } catch (error) {
    throw new CliCommandError(`Could not read SKILL.md at ${skillPath}: ${error instanceof Error ? error.message : String(error)}`);
  }
  const frontmatter = parseSkillFrontmatter(skillText, skillDir);

  if (!options.generateOnly) {
    return runScoreMode(options, { skillDir, frontmatter });
  }

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

async function runScoreMode(
  options: OptimizeDescriptionCommandOptions,
  context: { skillDir: string; frontmatter: SkillFrontmatter },
): Promise<ScoreDescriptionResult> {
  if (options.maxIterations !== undefined) {
    throw new CliCommandError("--max-iterations (iterative optimization) arrives in the next slice (W-000037). Run without it to score the current description.");
  }
  if (!options.evalSetPath) {
    throw new CliCommandError("Scoring requires --eval-set <path>. Generate one first with --generate-only.");
  }
  const description = context.frontmatter.description;
  if (!description) {
    throw new CliCommandError(`SKILL.md at ${context.skillDir} has no frontmatter description to score.`);
  }

  const evalSetPath = path.resolve(options.evalSetPath);
  const evalSet = await readDescriptionEvalSet(evalSetPath);
  if (evalSet.skill_name !== context.frontmatter.name) {
    throw new CliCommandError(
      `Eval set ${evalSetPath} is for skill "${evalSet.skill_name}" but the target skill is "${context.frontmatter.name}".`,
    );
  }

  const distractors = await loadDistractorSkills({
    skillDir: context.skillDir,
    targetName: context.frontmatter.name,
    explicitDirs: options.distractorDirs,
  });

  let probeCount = 0;
  let totalTokens = 0;
  let totalCostUsd = 0;
  let probeModel: string | null = null;
  const prober: RoutingProberFn = options.prober ?? (async (probePrompt) => {
    const result = await invokePiCompletionDetailed({
      prompt: probePrompt,
      purpose: "routing probe",
      model: options.model,
      agentDir: options.agentDir,
    });
    probeModel = `${result.model.provider}/${result.model.id}`;
    totalTokens += result.usage.inputTokens + result.usage.outputTokens;
    totalCostUsd += result.usage.costUsd;
    return result.text;
  });
  const countingProber: RoutingProberFn = async (probePrompt) => {
    probeCount += 1;
    return prober(probePrompt);
  };

  const score = await scoreDescription({
    skillName: context.frontmatter.name,
    description,
    distractors,
    evalSet,
    prober: countingProber,
  });

  return {
    mode: "score",
    skillDir: context.skillDir,
    skillName: context.frontmatter.name,
    evalSetPath,
    score,
    distractors: distractors.map((d) => d.name),
    probeCount,
    probeModel,
    totalTokens,
    totalCostUsd,
  };
}

async function fileExists(file: string): Promise<boolean> {
  try {
    return (await stat(file)).isFile();
  } catch {
    return false;
  }
}
