import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import { readEvalsJson } from "../evals/loader.js";
import type { EvalsJsonFile } from "../evals/types.js";
import { CliCommandError } from "./types.js";

export interface CreateCommandOptions {
  skillDir: string;
  force?: boolean;
  dryRun?: boolean;
}

export interface CreateCommandResult {
  skillDir: string;
  evalsJsonPath: string;
  dryRun: boolean;
  written: boolean;
  evals: EvalsJsonFile;
}

interface SkillFrontmatter {
  name: string;
  description?: string;
}

export async function createCommand(options: CreateCommandOptions): Promise<CreateCommandResult> {
  const skillDir = path.resolve(options.skillDir);
  const skillPath = path.join(skillDir, "SKILL.md");
  const evalsDir = path.join(skillDir, "evals");
  const evalsJsonPath = path.join(evalsDir, "evals.json");

  const skillText = await readSkillMd(skillPath);
  const frontmatter = parseSkillFrontmatter(skillText, skillDir);
  const evals = buildStarterEvals(frontmatter);

  if (options.dryRun) {
    return { skillDir, evalsJsonPath, dryRun: true, written: false, evals };
  }

  if (!options.force && await fileExists(evalsJsonPath)) {
    throw new CliCommandError(`Refusing to overwrite existing evals file: ${evalsJsonPath}. Re-run with --force to overwrite.`);
  }

  await mkdir(evalsDir, { recursive: true });
  await writeFile(evalsJsonPath, `${JSON.stringify(evals, null, 2)}\n`, "utf8");

  // Validate the written file through the same loader used by `run`.
  const validated = await readEvalsJson(evalsJsonPath);
  return { skillDir, evalsJsonPath, dryRun: false, written: true, evals: validated };
}

async function readSkillMd(skillPath: string): Promise<string> {
  try {
    return await readFile(skillPath, "utf8");
  } catch (error) {
    throw new CliCommandError(`Could not read SKILL.md at ${skillPath}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function parseSkillFrontmatter(skillText: string, skillDir: string): SkillFrontmatter {
  const frontmatterMatch = skillText.match(/^---\s*\n([\s\S]*?)\n---\s*\n?/);
  const frontmatter = frontmatterMatch?.[1] ?? "";
  const name = readYamlString(frontmatter, "name") ?? path.basename(skillDir);
  const description = readYamlString(frontmatter, "description");
  return { name, description };
}

function readYamlString(frontmatter: string, key: string): string | undefined {
  const pattern = new RegExp(`^${escapeRegExp(key)}\\s*:\\s*(.+?)\\s*$`, "m");
  const match = frontmatter.match(pattern);
  if (!match) return undefined;
  return unquoteYamlScalar(match[1]!.trim());
}

function unquoteYamlScalar(value: string): string {
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}

function buildStarterEvals(skill: SkillFrontmatter): EvalsJsonFile {
  const description = skill.description ?? `Use the ${skill.name} skill correctly.`;
  const shortDescription = description.endsWith(".") ? description.slice(0, -1) : description;

  return {
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
        prompt: `Complete a representative ${skill.name} task for this scenario: ${shortDescription}. Explain the result clearly and include any important next steps.`,
        expected_output: "The assistant should complete the representative task, not merely describe the skill.",
        setup: { kind: "empty" },
        assertions: [
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
        prompt: `I need help with a nearby but different task. Give general guidance about organizing my work, but do not assume I need the ${skill.name} workflow unless it clearly applies.`,
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
  };
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
