import type { WorkspaceSetup } from "../contracts/types.js";
import type { EvalAssertion, EvalCase, EvalsJsonFile } from "../evals/types.js";
import { CliCommandError } from "./types.js";

export interface GuidedEvalDesignerPromptInput {
  skillName: string;
  skillDescription?: string;
  skillMarkdown: string;
}

export interface GuidedEvalDesignerFixture {
  /** Path relative to the skill's evals/ directory, e.g. files/golden-path/requirements.md. */
  path: string;
  purpose?: string;
  contents?: string;
}

export interface GuidedEvalDesignerTriggerBehavior {
  should_trigger: string[];
  should_not_trigger: string[];
}

export interface GuidedEvalDesignerNormalizedProposal {
  evals: EvalsJsonFile;
  rationale: string;
  triggerBehavior: GuidedEvalDesignerTriggerBehavior;
  fixtures: GuidedEvalDesignerFixture[];
}

interface RawGuidedEvalDesignerResponse {
  rationale?: unknown;
  trigger_behavior?: unknown;
  fixtures?: unknown;
  evals?: unknown;
}

/**
 * Build the prompt contract for LLM-assisted eval design. This prompt asks the
 * model to design an eval suite, not to run or grade one.
 */
export function buildGuidedEvalDesignerPrompt(input: GuidedEvalDesignerPromptInput): string {
  const description = input.skillDescription?.trim() || "No description provided.";
  return [
    "You are an expert eval designer for agent skills.",
    "Your task is to propose a starter eval suite for the supplied SKILL.md.",
    "",
    "Design responsibilities:",
    "- Identify trigger behavior: when the skill should activate and when it should not.",
    "- Include positive cases: explicit trigger and representative execution/golden path.",
    "- Include adjacent negative cases that test over-triggering against nearby but different tasks.",
    "- Propose fixture files only when they make the eval more realistic.",
    "- Prefer deterministic assertions for concrete file/workspace outcomes.",
    "- Use judge assertions for conversational, qualitative, or rubric-style behavior.",
    "- Explain the rationale for each major design choice.",
    "",
    "Safety and path rules:",
    "- Fixture paths must be relative to evals/ and start with files/.",
    "- Workspace output paths must be relative paths inside the case workspace.",
    "- Never use absolute paths, .. traversal, home-directory paths, or hidden path segments.",
    "- Do not invent live external service credentials.",
    "",
    "Return only JSON with this exact top-level shape:",
    JSON.stringify({
      rationale: "Why these cases and assertions cover the skill.",
      trigger_behavior: {
        should_trigger: ["user intent that should activate the skill"],
        should_not_trigger: ["adjacent user intent that should not activate the skill"],
      },
      fixtures: [
        {
          path: "files/golden-path/input.md",
          purpose: "Why this fixture is needed",
          contents: "Fixture file contents to write if accepted",
        },
      ],
      evals: {
        version: "1",
        skill_name: input.skillName,
        evals: [
          {
            id: "trigger-explicit",
            description: "Explicit trigger case.",
            prompt: "User-facing prompt.",
            expected_output: "Human-readable success criteria.",
            setup: { kind: "empty" },
            assertions: [
              {
                id: "explicit-trigger-relevance",
                kind: "output",
                method: "judge",
                prompt: "Rubric for the judge.",
                mustPass: true,
              },
            ],
            metadata: { tags: ["trigger", "positive", "guided"], difficulty: "easy", intent: "explicit-trigger" },
          },
        ],
      },
    }, null, 2),
    "",
    `Skill name: ${input.skillName}`,
    `Skill description: ${description}`,
    "",
    "SKILL.md:",
    "```markdown",
    input.skillMarkdown,
    "```",
  ].join("\n");
}

/** Parse and normalize the guided designer's JSON response into evals.json. */
export function parseGuidedEvalDesignerResponse(raw: string, options: { skillName: string }): GuidedEvalDesignerNormalizedProposal {
  const parsed = parseJsonObject(raw);
  return normalizeGuidedEvalDesignerResponse(parsed, options);
}

export function normalizeGuidedEvalDesignerResponse(
  response: RawGuidedEvalDesignerResponse,
  options: { skillName: string },
): GuidedEvalDesignerNormalizedProposal {
  const issues: string[] = [];

  const rationale = typeof response.rationale === "string" && response.rationale.trim()
    ? response.rationale.trim()
    : addIssue(issues, "`rationale` must be a non-empty string");

  const triggerBehavior = normalizeTriggerBehavior(response.trigger_behavior, issues);
  const fixtures = normalizeFixtures(response.fixtures, issues);
  const fixturePaths = new Set(fixtures.map((fixture) => fixture.path));
  const evals = normalizeEvalsJson(response.evals, options.skillName, fixturePaths, issues);

  if (issues.length > 0 || !rationale || !triggerBehavior || !evals) {
    throw new CliCommandError(`Guided eval designer response failed validation:\n${issues.map((issue) => `- ${issue}`).join("\n")}`);
  }

  return { evals, rationale, triggerBehavior, fixtures };
}

function normalizeTriggerBehavior(value: unknown, issues: string[]): GuidedEvalDesignerTriggerBehavior | undefined {
  if (!isRecord(value)) {
    issues.push("`trigger_behavior` must be an object");
    return undefined;
  }
  return {
    should_trigger: normalizeStringArray(value.should_trigger, "trigger_behavior.should_trigger", issues),
    should_not_trigger: normalizeStringArray(value.should_not_trigger, "trigger_behavior.should_not_trigger", issues),
  };
}

function normalizeFixtures(value: unknown, issues: string[]): GuidedEvalDesignerFixture[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    issues.push("`fixtures` must be an array when present");
    return [];
  }

  const seen = new Set<string>();
  const fixtures: GuidedEvalDesignerFixture[] = [];
  for (let i = 0; i < value.length; i++) {
    const item = value[i];
    if (!isRecord(item)) {
      issues.push(`fixtures[${i}] must be an object`);
      continue;
    }
    if (typeof item.path !== "string" || !item.path.trim()) {
      issues.push(`fixtures[${i}].path must be a non-empty string`);
      continue;
    }
    const fixturePath = item.path.trim();
    validateSafeRelativePath(fixturePath, `fixtures[${i}].path`, issues, { mustStartWith: "files/" });
    if (seen.has(fixturePath)) issues.push(`fixtures[${i}].path duplicates ${fixturePath}`);
    seen.add(fixturePath);
    fixtures.push({
      path: fixturePath,
      purpose: typeof item.purpose === "string" ? item.purpose : undefined,
      contents: typeof item.contents === "string" ? item.contents : undefined,
    });
  }
  return fixtures;
}

function normalizeEvalsJson(value: unknown, skillName: string, fixturePaths: Set<string>, issues: string[]): EvalsJsonFile | undefined {
  if (!isRecord(value)) {
    issues.push("`evals` must be an object containing evals.json content");
    return undefined;
  }
  if (value.version !== undefined && typeof value.version !== "string") {
    issues.push("evals.version must be a string when present");
  }
  if (typeof value.skill_name !== "string" || value.skill_name !== skillName) {
    issues.push(`evals.skill_name must exactly match ${JSON.stringify(skillName)}`);
  }
  if (!Array.isArray(value.evals)) {
    issues.push("evals.evals must be an array");
    return undefined;
  }

  const seen = new Set<string>();
  const cases: EvalCase[] = [];
  for (let i = 0; i < value.evals.length; i++) {
    const normalized = normalizeEvalCase(value.evals[i], i, fixturePaths, issues);
    if (!normalized) continue;
    const id = String(normalized.id);
    if (seen.has(id)) {
      issues.push(`evals.evals[${i}].id duplicates ${id}`);
      continue;
    }
    seen.add(id);
    cases.push(normalized);
  }

  if (cases.length === 0) issues.push("evals.evals must include at least one case");
  return { version: typeof value.version === "string" ? value.version : "1", skill_name: skillName, evals: cases };
}

function normalizeEvalCase(value: unknown, index: number, fixturePaths: Set<string>, issues: string[]): EvalCase | undefined {
  const prefix = `evals.evals[${index}]`;
  if (!isRecord(value)) {
    issues.push(`${prefix} must be an object`);
    return undefined;
  }
  if (typeof value.id !== "string" && typeof value.id !== "number") issues.push(`${prefix}.id must be a string or number`);
  if (typeof value.prompt !== "string" || !value.prompt.trim()) issues.push(`${prefix}.prompt must be a non-empty string`);
  if (value.description !== undefined && typeof value.description !== "string") issues.push(`${prefix}.description must be a string when present`);
  if (value.expected_output !== undefined && typeof value.expected_output !== "string") issues.push(`${prefix}.expected_output must be a string when present`);

  if (Array.isArray(value.expected_artifacts)) {
    for (let i = 0; i < value.expected_artifacts.length; i++) {
      if (typeof value.expected_artifacts[i] === "string") validateSafeRelativePath(value.expected_artifacts[i], `${prefix}.expected_artifacts[${i}]`, issues);
      else issues.push(`${prefix}.expected_artifacts[${i}] must be a string`);
    }
  }

  const setup = value.setup === undefined ? undefined : normalizeWorkspaceSetup(value.setup, `${prefix}.setup`, fixturePaths, issues);
  const assertions = value.assertions === undefined ? undefined : normalizeAssertions(value.assertions, `${prefix}.assertions`, issues);
  const metadata = isRecord(value.metadata) ? value.metadata as EvalCase["metadata"] : undefined;

  if ((typeof value.id !== "string" && typeof value.id !== "number") || typeof value.prompt !== "string" || !value.prompt.trim()) return undefined;
  return {
    id: value.id,
    description: typeof value.description === "string" ? value.description : undefined,
    prompt: value.prompt,
    expected_output: typeof value.expected_output === "string" ? value.expected_output : undefined,
    setup,
    assertions,
    metadata,
  };
}

function normalizeWorkspaceSetup(value: unknown, pathPrefix: string, fixturePaths: Set<string>, issues: string[]): WorkspaceSetup | undefined {
  if (!isRecord(value)) {
    issues.push(`${pathPrefix} must be an object`);
    return undefined;
  }
  if (value.kind === "empty") return { kind: "empty" };
  if (value.kind === "seeded") {
    if (!Array.isArray(value.sources)) {
      issues.push(`${pathPrefix}.sources must be an array`);
      return undefined;
    }
    return {
      kind: "seeded",
      sources: value.sources.map((source, index) => {
        if (!isRecord(source)) {
          issues.push(`${pathPrefix}.sources[${index}] must be an object`);
          return { from: "" };
        }
        if (typeof source.from !== "string" || !source.from.trim()) {
          issues.push(`${pathPrefix}.sources[${index}].from must be a non-empty string`);
          return { from: "" };
        }
        const from = source.from.trim();
        validateSafeRelativePath(from, `${pathPrefix}.sources[${index}].from`, issues, { mustStartWith: "files/" });
        if (!fixturePaths.has(from)) issues.push(`${pathPrefix}.sources[${index}].from references unknown fixture ${from}`);
        const to = typeof source.to === "string" && source.to.trim() ? source.to.trim() : undefined;
        if (to) validateSafeRelativePath(to, `${pathPrefix}.sources[${index}].to`, issues);
        return { from, to };
      }).filter((source) => source.from),
    };
  }
  issues.push(`${pathPrefix}.kind must be "empty" or "seeded" for guided proposals`);
  return undefined;
}

function normalizeAssertions(value: unknown, pathPrefix: string, issues: string[]): EvalAssertion[] | undefined {
  if (!Array.isArray(value)) {
    issues.push(`${pathPrefix} must be an array`);
    return undefined;
  }
  return value.map((assertion, index) => normalizeAssertion(assertion, `${pathPrefix}[${index}]`, issues)).filter((assertion): assertion is EvalAssertion => assertion !== undefined);
}

function normalizeAssertion(value: unknown, pathPrefix: string, issues: string[]): EvalAssertion | undefined {
  if (typeof value === "string") {
    if (!value.trim()) issues.push(`${pathPrefix} string assertion must be non-empty`);
    return value;
  }
  if (!isRecord(value)) {
    issues.push(`${pathPrefix} must be a string or assertion object`);
    return undefined;
  }

  if (value.type === "file-exists" || value.type === "json-valid") {
    if (typeof value.path === "string") validateSafeRelativePath(value.path, `${pathPrefix}.path`, issues);
    return value as unknown as EvalAssertion;
  }
  if (value.type === "regex-match") {
    if (isRecord(value.target) && typeof value.target.file === "string") validateSafeRelativePath(value.target.file, `${pathPrefix}.target.file`, issues);
    return value as unknown as EvalAssertion;
  }
  if (value.kind === "workspace") {
    if (typeof value.path === "string") validateSafeRelativePath(value.path, `${pathPrefix}.path`, issues);
    return value as unknown as EvalAssertion;
  }
  if (value.kind === "output" || value.kind === "behavior" || value.kind === "safety") return value as unknown as EvalAssertion;

  issues.push(`${pathPrefix} has unsupported assertion shape`);
  return undefined;
}

function parseJsonObject(raw: string): RawGuidedEvalDesignerResponse {
  const trimmed = raw.trim();
  const withoutFence = trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  try {
    const parsed = JSON.parse(withoutFence);
    if (!isRecord(parsed)) throw new Error("top-level JSON value must be an object");
    return parsed;
  } catch (error) {
    throw new CliCommandError(`Guided eval designer returned invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function normalizeStringArray(value: unknown, pathPrefix: string, issues: string[]): string[] {
  if (!Array.isArray(value)) {
    issues.push(`${pathPrefix} must be an array of strings`);
    return [];
  }
  return value.filter((item, index) => {
    if (typeof item !== "string" || !item.trim()) {
      issues.push(`${pathPrefix}[${index}] must be a non-empty string`);
      return false;
    }
    return true;
  }).map((item) => item.trim());
}

function validateSafeRelativePath(value: string, label: string, issues: string[], options: { mustStartWith?: string } = {}): void {
  if (pathIsUnsafe(value)) issues.push(`${label} must be a safe relative path inside the eval workspace`);
  if (options.mustStartWith && !value.startsWith(options.mustStartWith)) issues.push(`${label} must start with ${options.mustStartWith}`);
}

function pathIsUnsafe(value: string): boolean {
  if (!value || value.includes("\0") || value.includes("\\")) return true;
  if (value.startsWith("/") || value.startsWith("~")) return true;
  const parts = value.split("/");
  return parts.some((part) => part === "" || part === "." || part === ".." || part.startsWith("."));
}

function addIssue(issues: string[], issue: string): undefined {
  issues.push(issue);
  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
