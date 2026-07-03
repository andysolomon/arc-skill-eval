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

// ---------------------------------------------------------------- optimization loop

export interface ProposeDescriptionInput {
  skillName: string;
  currentDescription: string;
  /** Train-split failures of the description being improved, with prompt text. */
  failures: Array<{ prompt: string; expect: DescriptionEvalExpectation; got: string | null }>;
  skillText: string;
}

export type DescriptionProposerFn = (input: ProposeDescriptionInput) => Promise<string>;

export function buildProposeDescriptionPrompt(input: ProposeDescriptionInput): string {
  return [
    "You are improving an agent skill's frontmatter description so a routing gate sends the right requests to it.",
    `Skill: ${input.skillName}`,
    "Current description:",
    `"""${input.currentDescription}"""`,
    "",
    "A routing gate evaluated realistic prompts against this description alongside competing skills. It misrouted these:",
    ...input.failures.map((failure) =>
      failure.expect === "trigger"
        ? `- SHOULD trigger, but the gate chose ${failure.got ?? "nothing parseable"}: "${failure.prompt}"`
        : `- should NOT trigger, but the gate chose ${input.skillName}: "${failure.prompt}"`,
    ),
    "",
    "Rewrite the description so the should-trigger prompts route to this skill and the near-miss prompts do not.",
    "Stay truthful to what the skill actually does (SKILL.md below). Include concrete trigger phrasings and, where useful, explicit do-not-trigger boundaries.",
    "Return ONLY the new description text — one paragraph, no quotes, no markdown fences, no commentary.",
    "",
    "=== SKILL.md ===",
    input.skillText,
    "=== END SKILL.md ===",
  ].join("\n");
}

/** Normalize a proposed description: strip fences/quotes, collapse whitespace. */
export function parseProposedDescription(raw: string): string {
  let text = raw.trim();
  const fenceMatch = text.match(/^```[a-z]*\s*([\s\S]*?)\s*```$/);
  if (fenceMatch) text = fenceMatch[1]!.trim();
  text = text.replace(/^description\s*:\s*/i, "");
  if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
    text = text.slice(1, -1);
  }
  return text.replace(/\s+/g, " ").trim();
}

export interface OptimizationIteration {
  iteration: number;
  description: string | null;   // null when the proposal was unusable
  proposalError?: string;
  train?: SplitScore;
  /** Present only when the candidate beat the baseline on train (held-out evaluation earned). */
  test?: SplitScore;
}

export interface OptimizeDescriptionRunReport {
  baseline: { description: string; train: SplitScore; test: SplitScore };
  iterations: OptimizationIteration[];
  /** Best candidate by held-out test accuracy, only when it beats the baseline. */
  winner: { iteration: number; description: string; train: SplitScore; test: SplitScore } | null;
}

function subsetEvalSet(evalSet: DescriptionEvalSet, split: DescriptionEvalSplit): DescriptionEvalSet {
  return { ...evalSet, prompts: evalSet.prompts.filter((p) => p.split === split) };
}

function trainFailures(evalSet: DescriptionEvalSet, verdicts: RoutingVerdict[]): ProposeDescriptionInput["failures"] {
  const byId = new Map(evalSet.prompts.map((p) => [p.id, p]));
  return verdicts
    .filter((v) => !v.correct)
    .map((v) => ({ prompt: byId.get(v.id)?.prompt ?? v.id, expect: v.expect, got: v.got }));
}

/**
 * Hill-climb the description: propose from the best-so-far candidate's
 * train failures, evaluate on train, and spend a held-out test evaluation
 * only on candidates that beat the baseline train accuracy.
 */
export async function optimizeDescription(options: {
  skillName: string;
  skillText: string;
  currentDescription: string;
  distractors: RoutingSkillOption[];
  evalSet: DescriptionEvalSet;
  maxIterations: number;
  prober: RoutingProberFn;
  proposer: DescriptionProposerFn;
}): Promise<OptimizeDescriptionRunReport> {
  const trainSet = subsetEvalSet(options.evalSet, "train");
  const testSet = subsetEvalSet(options.evalSet, "test");
  const scoreOn = async (description: string, set: DescriptionEvalSet) =>
    scoreDescription({ skillName: options.skillName, description, distractors: options.distractors, evalSet: set, prober: options.prober });

  const baselineTrain = await scoreOn(options.currentDescription, trainSet);
  const baselineTest = await scoreOn(options.currentDescription, testSet);
  const baseline = { description: options.currentDescription, train: baselineTrain.train, test: baselineTest.test };

  const iterations: OptimizationIteration[] = [];
  let best: { iteration: number; description: string; train: SplitScore; test: SplitScore } | null = null;
  // Propose from the strongest description seen so far (by train accuracy).
  let proposeFrom = { description: options.currentDescription, verdicts: baselineTrain.verdicts, trainAccuracy: baseline.train.accuracy };

  for (let iteration = 1; iteration <= options.maxIterations; iteration++) {
    if (proposeFrom.verdicts.every((v) => v.correct)) {
      if (best) break; // train saturated and held-out already improved — done
      // Overfit trap: perfect train, no held-out gain. Re-propose from the
      // baseline's failures for diversity instead of giving up — unless the
      // baseline itself has nothing left to learn from.
      if (baselineTrain.verdicts.every((v) => v.correct)) break;
      proposeFrom = { description: options.currentDescription, verdicts: baselineTrain.verdicts, trainAccuracy: baseline.train.accuracy };
    }

    let description: string;
    try {
      description = parseProposedDescription(await options.proposer({
        skillName: options.skillName,
        currentDescription: proposeFrom.description,
        failures: trainFailures(options.evalSet, proposeFrom.verdicts),
        skillText: options.skillText,
      }));
      if (description.length === 0) throw new CliCommandError("proposer returned an empty description");
    } catch (error) {
      iterations.push({ iteration, description: null, proposalError: error instanceof Error ? error.message : String(error) });
      continue;
    }

    const candidateTrain = await scoreOn(description, trainSet);
    const entry: OptimizationIteration = { iteration, description, train: candidateTrain.train };

    if (candidateTrain.train.accuracy > baseline.train.accuracy) {
      const candidateTest = await scoreOn(description, testSet);
      entry.test = candidateTest.test;
      if (candidateTest.test.accuracy > (best?.test.accuracy ?? baseline.test.accuracy)) {
        best = { iteration, description, train: candidateTrain.train, test: candidateTest.test };
      }
    }
    iterations.push(entry);

    if (candidateTrain.train.accuracy > proposeFrom.trainAccuracy) {
      proposeFrom = { description, verdicts: candidateTrain.verdicts, trainAccuracy: candidateTrain.train.accuracy };
    }
  }

  return { baseline, iterations, winner: best };
}

// ---------------------------------------------------------------- apply

function wrapWords(text: string, width: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if (current.length > 0 && current.length + 1 + word.length > width) {
      lines.push(current);
      current = word;
    } else {
      current = current.length > 0 ? `${current} ${word}` : word;
    }
  }
  if (current.length > 0) lines.push(current);
  return lines;
}

/**
 * Replace the frontmatter `description` in a SKILL.md, preserving every other
 * byte. Handles plain scalars, quoted scalars, and `description: >`/`|` block
 * scalars (the style bundled skills use). The new value is always written as
 * a block scalar so long descriptions stay readable. Returns null when the
 * document cannot be rewritten with confidence (no frontmatter, no
 * description key, or an empty replacement) — callers must refuse, not guess.
 */
export function replaceFrontmatterDescription(skillText: string, newDescription: string): string | null {
  const description = newDescription.replace(/\s+/g, " ").trim();
  if (description.length === 0) return null;

  const match = skillText.match(/^(---\r?\n)([\s\S]*?)(\r?\n---)/);
  if (!match) return null;
  const head = match[1]!;
  const body = match[2]!;
  const tail = skillText.slice(head.length + body.length); // starts with \n---

  const lines = body.split(/\r?\n/);
  let start = -1;
  let end = -1;
  for (let index = 0; index < lines.length; index++) {
    if (!/^description\s*:/.test(lines[index]!)) continue;
    start = index;
    end = index + 1;
    if (/^description\s*:\s*[>|][+-]?\s*$/.test(lines[index]!)) {
      while (end < lines.length && (lines[end]!.trim() === "" || /^\s+\S/.test(lines[end]!))) end++;
      while (end > start + 1 && lines[end - 1]!.trim() === "") end--; // keep trailing blanks out of the block
    }
    break;
  }
  if (start < 0) return null;

  const replacement = ["description: >", ...wrapWords(description, 96).map((line) => `  ${line}`)];
  const newBody = [...lines.slice(0, start), ...replacement, ...lines.slice(end)].join("\n");
  return head + newBody + tail;
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
  /** Write the optimization winner's description into SKILL.md (W-000038). */
  apply?: boolean;
  /** Injectable generator (tests); defaults to a single Pi completion. */
  generator?: TriggerSetGeneratorFn;
  /** Injectable routing prober (tests); defaults to a single Pi completion per prompt. */
  prober?: RoutingProberFn;
  /** Injectable description proposer (tests); defaults to a single Pi completion per iteration. */
  proposer?: DescriptionProposerFn;
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

export interface OptimizeDescriptionRunResult {
  mode: "optimize";
  skillDir: string;
  skillName: string;
  evalSetPath: string;
  report: OptimizeDescriptionRunReport;
  distractors: string[];
  probeCount: number;
  probeModel: string | null;
  totalTokens: number;
  totalCostUsd: number;
  /** True when --apply wrote the winner into SKILL.md. */
  applied: boolean;
  skillPath: string;
}

export type OptimizeDescriptionCommandResult = GenerateTriggerSetResult | ScoreDescriptionResult | OptimizeDescriptionRunResult;

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
    return runScoreMode(options, { skillDir, skillText, frontmatter });
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
  context: { skillDir: string; skillText: string; frontmatter: SkillFrontmatter },
): Promise<ScoreDescriptionResult | OptimizeDescriptionRunResult> {
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

  const meta = () => ({
    skillDir: context.skillDir,
    skillName: context.frontmatter.name,
    evalSetPath,
    distractors: distractors.map((d) => d.name),
    probeCount,
    probeModel,
    totalTokens,
    totalCostUsd,
  });

  if (options.maxIterations === undefined) {
    const score = await scoreDescription({
      skillName: context.frontmatter.name,
      description,
      distractors,
      evalSet,
      prober: countingProber,
    });
    return { mode: "score", score, ...meta() };
  }

  const proposer: DescriptionProposerFn = options.proposer ?? (async (input) =>
    invokePiCompletion({
      prompt: buildProposeDescriptionPrompt(input),
      purpose: "description proposal",
      model: options.model,
      agentDir: options.agentDir,
    }));

  const report = await optimizeDescription({
    skillName: context.frontmatter.name,
    skillText: context.skillText,
    currentDescription: description,
    distractors,
    evalSet,
    maxIterations: options.maxIterations,
    prober: countingProber,
    proposer,
  });

  const skillPath = path.join(context.skillDir, "SKILL.md");
  let applied = false;
  if (options.apply && report.winner) {
    await applyWinningDescription({
      skillPath,
      skillDir: context.skillDir,
      originalText: context.skillText,
      newDescription: report.winner.description,
    });
    applied = true;
  }
  return { mode: "optimize", report, applied, skillPath, ...meta() };
}

/** Write the winner into SKILL.md and verify it reads back; restore on failure. */
async function applyWinningDescription(options: {
  skillPath: string;
  skillDir: string;
  originalText: string;
  newDescription: string;
}): Promise<void> {
  const updated = replaceFrontmatterDescription(options.originalText, options.newDescription);
  if (updated === null) {
    throw new CliCommandError(
      `Could not safely rewrite the frontmatter description in ${options.skillPath} (missing frontmatter or description key). Nothing was written.`,
    );
  }
  await writeFile(options.skillPath, updated, "utf8");
  const collapse = (value: string | undefined): string => (value ?? "").replace(/\s+/g, " ").trim();
  const verified = parseSkillFrontmatter(await readFile(options.skillPath, "utf8"), options.skillDir);
  if (collapse(verified.description) !== collapse(options.newDescription)) {
    await writeFile(options.skillPath, options.originalText, "utf8");
    throw new CliCommandError(
      `Applied description did not read back cleanly from ${options.skillPath}; the original SKILL.md was restored.`,
    );
  }
}

async function fileExists(file: string): Promise<boolean> {
  try {
    return (await stat(file)).isFile();
  } catch {
    return false;
  }
}
