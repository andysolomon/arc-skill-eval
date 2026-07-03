import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { ModelSelection } from "../contracts/types.js";
import { readEvalsJson, validateEvalsJsonValue } from "../evals/loader.js";
import type { EvalAssertion, EvalsJsonFile } from "../evals/types.js";
import { reviewCreateProposalInteractively, type CreateInteractivePrompt } from "./create-interactive.js";
import { extractJsonObject, invokePiCompletion } from "./pi-completion.js";
import { CliCommandError } from "./types.js";

export interface LlmEvalDesignProposal {
  evals: EvalsJsonFile;
  fixtureInputs: string[];
  rationale: string[];
}

export interface LlmEvalDesignerInput {
  skillDir: string;
  skillPath: string;
  skillText: string;
  starterEvals: EvalsJsonFile;
}

export type LlmEvalDesignerFn = (input: LlmEvalDesignerInput) => Promise<LlmEvalDesignProposal>;

export interface CreateCommandOptions {
  skillDir: string;
  force?: boolean;
  dryRun?: boolean;
  guided?: boolean;
  interactive?: boolean;
  interactivePrompt?: CreateInteractivePrompt;
  model?: ModelSelection;
  agentDir?: string;
  designer?: LlmEvalDesignerFn;
  /** Optional override for the eval-authoring skill that guides --guided create. Defaults to bundled skills/arc-creating-evals. */
  authoringSkillPath?: string;
}

export interface CreateCommandResult {
  skillDir: string;
  evalsJsonPath: string;
  dryRun: boolean;
  written: boolean;
  evals: EvalsJsonFile;
  fixtureInputs: string[];
  adjacentNegativeAssumption: string;
  guided: boolean;
  interactive: boolean;
  rationale: string[];
}

export interface SkillFrontmatter {
  name: string;
  description?: string;
}

export async function createCommand(options: CreateCommandOptions): Promise<CreateCommandResult> {
  const skillDir = path.resolve(options.skillDir);
  const skillPath = path.join(skillDir, "SKILL.md");
  const evalsDir = path.join(skillDir, "evals");
  const evalsJsonPath = path.join(evalsDir, "evals.json");

  if (!options.dryRun && !options.force && await fileExists(evalsJsonPath)) {
    throw new CliCommandError(`Refusing to overwrite existing evals file: ${evalsJsonPath}. Re-run with --force to overwrite.`);
  }

  const skillText = await readSkillMd(skillPath);
  const frontmatter = parseSkillFrontmatter(skillText, skillDir);
  const starter = buildStarterEvals(frontmatter, skillText);
  const proposal = options.guided
    ? await (options.designer ?? createDefaultLlmEvalDesigner({ model: options.model, agentDir: options.agentDir, authoringSkillPath: options.authoringSkillPath }))({
        skillDir,
        skillPath,
        skillText,
        starterEvals: starter.evals,
      })
    : {
        evals: starter.evals,
        fixtureInputs: starter.fixtureInputs,
        rationale: ["Deterministic starter scaffold generated from SKILL.md heuristics."],
      };
  const proposalEvals = validateEvalsJsonValue(proposal.evals, options.guided ? "guided eval designer response" : evalsJsonPath);
  const fixtureInputs = sanitizeFixtureInputs(proposal.fixtureInputs);
  const rationale = proposal.rationale.length > 0 ? proposal.rationale : [options.guided ? "LLM-guided eval design proposal." : "Deterministic starter scaffold."];
  const evals = options.interactive
    ? await reviewCreateProposalInteractively(proposalEvals, {
        prompt: options.interactivePrompt,
        rationale: rationale.join("\n"),
        fixtureInputs,
      })
    : proposalEvals;

  if (options.dryRun) {
    return {
      skillDir,
      evalsJsonPath,
      dryRun: true,
      written: false,
      evals,
      fixtureInputs,
      adjacentNegativeAssumption: options.guided ? "LLM-guided adjacent negative proposal" : starter.adjacentNegativeAssumption,
      guided: Boolean(options.guided),
      interactive: Boolean(options.interactive),
      rationale,
    };
  }

  await mkdir(evalsDir, { recursive: true });
  await writeStarterFixtureInputs(evalsDir, fixtureInputs);
  await writeFile(evalsJsonPath, `${JSON.stringify(evals, null, 2)}\n`, "utf8");

  // Validate the written file through the same loader used by `run`.
  const validated = await readEvalsJson(evalsJsonPath);
  return {
    skillDir,
    evalsJsonPath,
    dryRun: false,
    written: true,
    evals: validated,
    fixtureInputs,
    adjacentNegativeAssumption: options.guided ? "LLM-guided adjacent negative proposal" : starter.adjacentNegativeAssumption,
    guided: Boolean(options.guided),
    interactive: Boolean(options.interactive),
    rationale,
  };
}

function sanitizeFixtureInputs(paths: string[]): string[] {
  const sanitized: string[] = [];
  for (const item of paths) {
    const normalized = normalizePathCandidate(item);
    if (normalized && isSafeRelativeDataPath(normalized) && !sanitized.includes(normalized)) sanitized.push(normalized);
  }
  return sanitized.slice(0, 10);
}

function createDefaultLlmEvalDesigner(options: { model?: ModelSelection; agentDir?: string; authoringSkillPath?: string }): LlmEvalDesignerFn {
  return async (input) => {
    const authoringSkill = await readEvalAuthoringSkill(options.authoringSkillPath);
    const prompt = buildGuidedCreatePrompt(input, { authoringSkill });
    const rawResponse = await invokePiCompletion({ prompt, purpose: "guided create", model: options.model, agentDir: options.agentDir });
    return parseGuidedCreateResponse(rawResponse);
  };
}

export interface GuidedCreatePromptOptions {
  authoringSkill?: EvalAuthoringSkillReference;
}

export interface EvalAuthoringSkillReference {
  path: string;
  markdown: string;
}

export function buildGuidedCreatePrompt(input: LlmEvalDesignerInput, options: GuidedCreatePromptOptions = {}): string {
  const authoringSkill = options.authoringSkill;
  return [
    "You are running arc-skill-eval create --guided.",
    authoringSkill
      ? "Follow the arc-creating-evals skill below as the authoritative eval-authoring procedure."
      : "You are an expert eval designer for Anthropic-style agent skills.",
    "Design a starter eval suite for the target SKILL.md below. Do not use tools or create files; respond only with the JSON proposal.",
    "Adapt any interactive phase gates in arc-creating-evals for this non-interactive CLI call: infer reasonable success criteria from the skill text, and record assumptions in rationale.",
    "Prefer specific, representative cases over generic heuristics. Include routing, execution, adjacent-negative, and safety/behavior coverage where useful.",
    "Use deterministic assertions when files or exact output can be checked; use judge assertions only for semantic behavior.",
    "Allowed assertion shapes are strict:",
    "- File exists: { \"type\": \"file-exists\", \"path\": \"relative/path.txt\" }",
    "- Regex against a file: { \"type\": \"regex-match\", \"pattern\": \"...\", \"target\": { \"file\": \"relative/path.txt\" } }",
    "- Regex against assistant text: { \"type\": \"regex-match\", \"pattern\": \"...\", \"target\": \"assistant-text\" }",
    "- Valid JSON file: { \"type\": \"json-valid\", \"path\": \"relative/path.json\" }",
    "- Semantic judge: { \"id\": \"stable-id\", \"kind\": \"output\", \"method\": \"judge\", \"prompt\": \"...\" }",
    "Never use { \"type\": \"regex\" }, { \"kind\": \"workspace\", \"method\": \"regex-match\" }, or any assertion shape not listed above.",
    "If a case needs seeded files, list fixture input paths and reference them under setup.sources from evals/files/.",
    "Return ONLY JSON with this shape:",
    JSON.stringify({
      rationale: ["why these cases were chosen"],
      fixtureInputs: ["files/example.md"],
      evalsJson: input.starterEvals,
    }, null, 2),
    "The evalsJson value must be a valid evals/evals.json object for arc-skill-eval.",
    "Do not include markdown fences or prose outside the JSON object.",
    "",
    ...(authoringSkill
      ? [
          `=== arc-creating-evals skill (${authoringSkill.path}) ===`,
          authoringSkill.markdown,
          "=== END arc-creating-evals skill ===",
          "",
        ]
      : []),
    "=== TARGET SKILL.md ===",
    input.skillText,
    "=== END TARGET SKILL.md ===",
  ].join("\n");
}

function parseGuidedCreateResponse(rawResponse: string): LlmEvalDesignProposal {
  const jsonBlob = extractJsonObject(rawResponse);
  if (!jsonBlob) {
    throw new CliCommandError("Guided eval designer returned no JSON object.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonBlob);
  } catch (error) {
    throw new CliCommandError(`Guided eval designer returned invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (!isRecord(parsed)) {
    throw new CliCommandError("Guided eval designer response must be a JSON object.");
  }

  const evalsCandidate = isRecord(parsed.evalsJson)
    ? parsed.evalsJson
    : isRecord(parsed.evals_json)
      ? parsed.evals_json
      : isRecord(parsed.evals) && "skill_name" in parsed.evals
        ? parsed.evals
        : "skill_name" in parsed
          ? parsed
          : null;

  if (!evalsCandidate) {
    throw new CliCommandError("Guided eval designer response must include an `evalsJson` object.");
  }

  try {
    return {
      evals: validateEvalsJsonValue(evalsCandidate, "guided eval designer response"),
      fixtureInputs: readStringArrayField(parsed, "fixtureInputs") ?? readStringArrayField(parsed, "fixtures") ?? [],
      rationale: readStringArrayField(parsed, "rationale") ?? (typeof parsed.rationale === "string" ? [parsed.rationale] : []),
    };
  } catch (error) {
    if (error instanceof Error && "issues" in error && Array.isArray((error as { issues?: unknown }).issues)) {
      throw new CliCommandError(`Guided eval designer returned invalid evals.json:\n- ${(error as { issues: string[] }).issues.join("\n- ")}`);
    }
    throw error;
  }
}

function readStringArrayField(value: Record<string, unknown>, field: string): string[] | undefined {
  const raw = value[field];
  if (!Array.isArray(raw)) return undefined;
  return raw.filter((item): item is string => typeof item === "string" && item.length > 0);
}

async function readEvalAuthoringSkill(authoringSkillPath?: string): Promise<EvalAuthoringSkillReference> {
  const resolvedPath = path.resolve(authoringSkillPath ?? bundledArcCreatingEvalsSkillPath());
  try {
    return { path: resolvedPath, markdown: await readFile(resolvedPath, "utf8") };
  } catch (error) {
    throw new CliCommandError(`Unable to read eval-authoring skill at ${resolvedPath}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function bundledArcCreatingEvalsSkillPath(): string {
  const thisFile = fileURLToPath(import.meta.url);
  return path.resolve(path.dirname(thisFile), "..", "..", "skills", "arc-creating-evals", "SKILL.md");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function readSkillMd(skillPath: string): Promise<string> {
  try {
    return await readFile(skillPath, "utf8");
  } catch (error) {
    throw new CliCommandError(`Could not read SKILL.md at ${skillPath}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export function parseSkillFrontmatter(skillText: string, skillDir: string): SkillFrontmatter {
  const frontmatterMatch = skillText.match(/^---\s*\n([\s\S]*?)\n---\s*\n?/);
  const frontmatter = frontmatterMatch?.[1] ?? "";
  const name = readYamlString(frontmatter, "name") ?? path.basename(skillDir);
  const description = readYamlString(frontmatter, "description");
  return { name, description };
}

function readYamlString(frontmatter: string, key: string): string | undefined {
  const blockValue = readYamlBlockScalar(frontmatter, key);
  if (blockValue !== undefined) return blockValue;

  const pattern = new RegExp(`^${escapeRegExp(key)}\\s*:\\s*(.+?)\\s*$`, "m");
  const match = frontmatter.match(pattern);
  if (!match) return undefined;
  return unquoteYamlScalar(match[1]!.trim());
}

function readYamlBlockScalar(frontmatter: string, key: string): string | undefined {
  const lines = frontmatter.split(/\r?\n/);
  const startIndex = lines.findIndex((line) => new RegExp(`^${escapeRegExp(key)}\\s*:\\s*[>|]\\s*$`).test(line));
  if (startIndex === -1) return undefined;

  const blockLines: string[] = [];
  for (const line of lines.slice(startIndex + 1)) {
    if (/^\S[^:]*:\s*/.test(line)) break;
    if (line.trim() === "") {
      blockLines.push("");
      continue;
    }
    if (!/^\s+/.test(line)) break;
    blockLines.push(line.replace(/^\s{2}/, ""));
  }

  const value = blockLines.join("\n").trim();
  return value ? value.replace(/\n+/g, " ") : undefined;
}

function unquoteYamlScalar(value: string): string {
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}

function buildStarterEvals(skill: SkillFrontmatter, skillText: string): { evals: EvalsJsonFile; fixtureInputs: string[]; adjacentNegativeAssumption: string } {
  const description = skill.description ?? `Use the ${skill.name} skill correctly.`;
  const shortDescription = description.endsWith(".") ? description.slice(0, -1) : description;
  const deterministicSignals = inferDeterministicAssertions(skillText);
  const fixtureInputs = inferFixtureInputPaths(skillText, deterministicSignals.paths);
  const expectedArtifactsText = deterministicSignals.paths.length > 0
    ? ` Produce the expected artifact(s): ${deterministicSignals.paths.map((item) => `\`${item}\``).join(", ")}.`
    : "";
  const fixtureInputsText = fixtureInputs.length > 0
    ? ` Use the seeded input fixture(s): ${fixtureInputs.map((item) => `\`${item}\``).join(", ")}.`
    : "";
  const adjacentNegative = inferAdjacentNegativeCase(skill, skillText);

  return {
    fixtureInputs,
    adjacentNegativeAssumption: adjacentNegative.assumption,
    evals: {
      version: "1",
      skill_name: skill.name,
      evals: [
      {
        id: "trigger-explicit",
        description: "Explicit trigger case: the user directly asks for this skill's help.",
        prompt: `Use the ${skill.name} skill to help with this task: ${shortDescription}.`,
        expected_output: "The assistant should recognize the requested skill domain and provide a useful, task-specific response.",
        assertions: [
          {
            id: "explicit-trigger-relevance",
            kind: "output",
            method: "judge",
            prompt: `The response should be directly relevant to the ${skill.name} skill and the requested task.`,
            mustPass: true,
          },
        ],
        metadata: {
          tags: ["trigger", "positive", "starter"],
          difficulty: "easy",
          intent: "explicit-trigger",
        },
      },
      {
        id: "execution-golden-path",
        description: "Golden-path execution case for a representative skill task.",
        prompt: `Complete a representative ${skill.name} task for this scenario: ${shortDescription}.${fixtureInputsText}${expectedArtifactsText} Explain the result clearly and include any important next steps.`,
        expected_output: deterministicSignals.paths.length > 0
          ? `The assistant should complete the representative task and create the expected artifact(s): ${deterministicSignals.paths.join(", ")}.`
          : "The assistant should complete the representative task, not merely describe the skill.",
        setup: fixtureInputs.length > 0
          ? {
              kind: "seeded",
              sources: fixtureInputs.map((inputPath) => ({
                from: `files/starter-inputs/${inputPath}`,
                to: inputPath,
              })),
            }
          : { kind: "empty" },
        assertions: [
          ...deterministicSignals.assertions,
          {
            id: "golden-path-completion",
            kind: "output",
            method: "judge",
            prompt: "The response should complete the user's requested task with concrete, useful output rather than only giving generic advice.",
            mustPass: true,
          },
          {
            id: "no-clarifying-only-response",
            kind: "output",
            method: "judge",
            prompt: "The response should not consist only of clarifying questions; it should make reasonable progress on the task.",
          },
        ],
        metadata: {
          tags: ["execution", "golden-path", "starter"],
          difficulty: "medium",
          intent: "representative-execution",
        },
      },
      {
        id: "adjacent-negative",
        description: "Adjacent negative case: nearby request that should not over-trigger the skill.",
        prompt: adjacentNegative.prompt,
        expected_output: "The assistant should answer the adjacent request without forcing the target skill into an unrelated task.",
        assertions: [
          {
            id: "negative-avoids-overtrigger",
            kind: "output",
            method: "judge",
            prompt: `The response should avoid claiming that the ${skill.name} skill is required when the user's request is only adjacent to the skill's domain.`,
            mustPass: true,
          },
        ],
        metadata: {
          tags: ["routing", "negative", "starter"],
          difficulty: "easy",
          intent: "adjacent-negative",
        },
      },
      ],
    },
  };
}

interface AdjacentNegativeCase {
  assumption: string;
  prompt: string;
}

function inferAdjacentNegativeCase(skill: SkillFrontmatter, skillText: string): AdjacentNegativeCase {
  const haystack = `${skill.name}\n${skill.description ?? ""}\n${stripFencedCodeBlocks(skillText)}`.toLowerCase();
  const generic = {
    assumption: "generic adjacent work request",
    prompt: `I need help with a nearby but different task. Give general guidance about organizing my work, but do not assume I need the ${skill.name} workflow unless it clearly applies.`,
  };

  const domains: Array<{ keywords: RegExp[]; assumption: string; prompt: string }> = [
    {
      keywords: [/\bevals?\b/, /\bevaluation\b/, /\btest cases?\b/, /\bskill eval/],
      assumption: "unit-test or QA request adjacent to eval-authoring",
      prompt: `I need help improving the unit tests for a regular application module. Suggest useful test cases and edge cases, but do not create the ${skill.name} eval suite unless skill-eval authoring is explicitly needed.`,
    },
    {
      keywords: [/\bplanning\b/, /\bplan\b/, /\broadmap\b/, /\bmilestone\b/],
      assumption: "meeting-note organization request adjacent to planning",
      prompt: `I have rough meeting notes and want a concise summary with action items. Help organize the notes, but do not turn this into the full ${skill.name} workflow unless a formal implementation plan is requested.`,
    },
    {
      keywords: [/\brelease\b/, /\bpublish\b/, /\bchangelog\b/, /\bversion\b/, /\bsemver\b/],
      assumption: "SemVer explanation request adjacent to release automation",
      prompt: `Explain how SemVer works for a teammate and give examples of patch, minor, and major changes. Do not run or recommend the ${skill.name} release workflow unless publishing or version bumping is explicitly requested.`,
    },
    {
      keywords: [/\bdocs?\b/, /\bdocumentation\b/, /\breadme\b/, /\bguide\b/],
      assumption: "code-review request adjacent to documentation writing",
      prompt: `Review this API design at a high level and point out maintainability risks. Mention where documentation might help, but do not start the ${skill.name} documentation workflow unless writing docs is the user's primary goal.`,
    },
    {
      keywords: [/\bauth\b/, /\bauthentication\b/, /\blogin\b/, /\bwebhook\b/, /\bclerk\b/],
      assumption: "security concept question adjacent to auth implementation",
      prompt: `Explain the difference between authentication and authorization for a product discussion. Keep it conceptual and do not assume the ${skill.name} implementation workflow is needed unless the user asks to build or configure auth.`,
    },
  ];

  for (const domain of domains) {
    if (domain.keywords.some((keyword) => keyword.test(haystack))) {
      return { assumption: domain.assumption, prompt: domain.prompt };
    }
  }

  return generic;
}

function inferDeterministicAssertions(skillText: string): { paths: string[]; assertions: EvalAssertion[] } {
  const paths = inferOutputPaths(skillText);
  const assertions: EvalAssertion[] = [];

  for (const filePath of paths) {
    assertions.push({ type: "file-exists", path: filePath });
    if (/\.json$/i.test(filePath)) {
      assertions.push({ type: "json-valid", path: filePath });
    }
  }

  return { paths, assertions };
}

function inferFixtureInputPaths(skillText: string, outputPaths: string[]): string[] {
  const outputPathSet = new Set(outputPaths);
  const candidates = new Set<string>();
  const searchableText = stripAdvisorySections(stripFencedCodeBlocks(skillText));
  const codeSpanPattern = /`([^`]+)`/g;
  let match: RegExpExecArray | null;

  while ((match = codeSpanPattern.exec(searchableText)) !== null) {
    for (const candidate of extractPathCandidates(match[1]!)) {
      if (isLikelyInputPath(candidate) && !outputPathSet.has(candidate)) candidates.add(candidate);
    }
  }

  const quotedPathPattern = /["']([^"'\n]+\.(?:md|markdown|txt|json|ya?ml|csv|tsv))["']/gi;
  while ((match = quotedPathPattern.exec(searchableText)) !== null) {
    const normalized = normalizePathCandidate(match[1]!);
    if (normalized && isLikelyInputPath(normalized) && !outputPathSet.has(normalized)) candidates.add(normalized);
  }

  return removeDuplicateBasenamePaths(Array.from(candidates)).slice(0, 3);
}

function inferOutputPaths(skillText: string): string[] {
  const candidates = new Set<string>();
  const searchableText = stripAdvisorySections(stripFencedCodeBlocks(skillText));
  const codeSpanPattern = /`([^`]+)`/g;
  let match: RegExpExecArray | null;

  while ((match = codeSpanPattern.exec(searchableText)) !== null) {
    for (const candidate of extractPathCandidates(match[1]!)) {
      if (isLikelyOutputPath(candidate)) candidates.add(candidate);
    }
  }

  const quotedPathPattern = /["']([^"'\n]+\.(?:md|markdown|txt|json|ya?ml|csv|tsv|html|xml))["']/gi;
  while ((match = quotedPathPattern.exec(searchableText)) !== null) {
    const normalized = normalizePathCandidate(match[1]!);
    if (normalized && isLikelyOutputPath(normalized)) candidates.add(normalized);
  }

  return removeDuplicateBasenamePaths(Array.from(candidates)).slice(0, 5);
}

function stripFencedCodeBlocks(value: string): string {
  return value.replace(/````?[\s\S]*?````?/g, "");
}

function stripAdvisorySections(value: string): string {
  return value.split(/^##\s+(?:Quality rules|Examples?|Anti-patterns?)\b/im)[0] ?? value;
}

function removeDuplicateBasenamePaths(paths: string[]): string[] {
  return paths.filter((candidate) => {
    if (candidate.includes("/")) return true;
    return !paths.some((other) => other !== candidate && other.endsWith(`/${candidate}`));
  });
}

function extractPathCandidates(value: string): string[] {
  return value
    .split(/[\s,]+/)
    .map((item) => normalizePathCandidate(item))
    .filter((item): item is string => item !== null);
}

function normalizePathCandidate(value: string): string | null {
  const trimmed = value.trim().replace(/[).,;:]+$/g, "").replace(/^\.\//, "");
  if (!trimmed) return null;
  if (trimmed.includes("://")) return null;
  if (path.isAbsolute(trimmed)) return null;
  if (trimmed.split(/[\\/]/).includes("..")) return null;
  return trimmed;
}

function isLikelyInputPath(value: string): boolean {
  if (!isSafeRelativeDataPath(value)) return false;
  const lowerValue = value.toLowerCase();
  const basename = path.basename(lowerValue);
  if (/^(input|requirements?|prd|issue|task|brief|notes?)\.(?:md|markdown|txt|json|ya?ml)$/i.test(basename)) return true;
  if (/^(notes|inputs?|requirements?|fixtures?)\//i.test(lowerValue)) return true;
  return false;
}

function isLikelyOutputPath(value: string): boolean {
  if (!isSafeRelativeDataPath(value)) return false;
  if (isLikelyInputPath(value)) return false;
  return true;
}

function isSafeRelativeDataPath(value: string): boolean {
  if (!/^[A-Za-z0-9._/-]+$/.test(value)) return false;
  if (!/\.(?:md|markdown|txt|json|ya?ml|csv|tsv|html|xml)$/i.test(value)) return false;
  const basename = path.basename(value).toLowerCase();
  if (basename === "skill.md" || basename === "readme.md") return false;
  if (value.startsWith("docs/") || value.startsWith("node_modules/")) return false;
  return true;
}

async function writeStarterFixtureInputs(evalsDir: string, fixtureInputs: string[]): Promise<void> {
  for (const inputPath of fixtureInputs) {
    const fixturePath = path.join(evalsDir, "files", "starter-inputs", inputPath);
    await mkdir(path.dirname(fixturePath), { recursive: true });
    await writeFile(fixturePath, buildFixtureInputPlaceholder(inputPath), "utf8");
  }
}

function buildFixtureInputPlaceholder(inputPath: string): string {
  if (/\.json$/i.test(inputPath)) {
    return `${JSON.stringify({ todo: `Replace with realistic input for ${inputPath}.` }, null, 2)}\n`;
  }

  if (/\.ya?ml$/i.test(inputPath)) {
    return `# TODO: replace with realistic input for ${inputPath}\n`;
  }

  return `# TODO\n\nReplace this starter fixture with realistic input for ${inputPath}.\n`;
}

async function fileExists(file: string): Promise<boolean> {
  try {
    const fileStat = await stat(file);
    return fileStat.isFile();
  } catch (error) {
    if (isMissingFileError(error)) return false;
    throw error;
  }
}

function isMissingFileError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
