import { cp, rm, stat } from "node:fs/promises";
import path from "node:path";

import { resolveBundledSkillPath } from "./package-root.js";
import { CliCommandError } from "./types.js";

/**
 * Project-relative folders each harness discovers skills from.
 *
 * `.agents/skills` is the shared Agent Skills location read by Pi, Codex,
 * Cursor Agent and Copilot; Claude Code reads `.claude/skills`. Cursor also
 * gets `.cursor/skills` because its CLI docs still point there.
 */
export const INSTALL_HARNESS_DIRS = {
  "claude-code": [".claude/skills"],
  codex: [".agents/skills"],
  "cursor-agent": [".agents/skills", ".cursor/skills"],
  copilot: [".agents/skills"],
  pi: [".agents/skills"],
} as const satisfies Record<string, readonly string[]>;

export type InstallHarnessId = keyof typeof INSTALL_HARNESS_DIRS;

export const INSTALL_HARNESS_IDS = Object.keys(INSTALL_HARNESS_DIRS) as InstallHarnessId[];

/** Bundled skills meant for an agent to use. `hello-world` is a test fixture, not one of them. */
export const DEFAULT_INSTALL_SKILLS = ["arc-creating-evals", "arc-running-evals"] as const;

/**
 * Top-level skill folders that are never installed. `evals/` holds fixture
 * SKILL.md files that a recursively scanning harness would register as real
 * skills; the others are run output and dependencies.
 */
const EXCLUDED_TOP_LEVEL = new Set(["evals", "evals-runs", "node_modules"]);

export function isInstallHarnessId(value: string): value is InstallHarnessId {
  return Object.hasOwn(INSTALL_HARNESS_DIRS, value);
}

export interface InstallSkillsCommandOptions {
  /** Project root to install into. Must already exist. Defaults to the cwd. */
  target?: string;
  /** Harnesses to install for. Defaults to every harness except cursor's extra folder. */
  harnesses?: InstallHarnessId[];
  /** Bundled skill names. Defaults to {@link DEFAULT_INSTALL_SKILLS}. */
  skills?: string[];
  /** Replace an existing install (removing stale files) instead of skipping it. */
  force?: boolean;
}

export interface InstallSkillsCommandResult {
  target: string;
  installed: Array<{ skill: string; path: string }>;
  skipped: Array<{ skill: string; path: string; reason: string }>;
}

export async function installSkillsCommand(options: InstallSkillsCommandOptions = {}): Promise<InstallSkillsCommandResult> {
  const target = path.resolve(options.target ?? process.cwd());
  const harnesses = options.harnesses && options.harnesses.length > 0
    ? options.harnesses
    : (["claude-code", "codex", "copilot", "pi"] as InstallHarnessId[]);
  const skillNames = options.skills && options.skills.length > 0 ? options.skills : [...DEFAULT_INSTALL_SKILLS];

  const targetStat = await stat(target).catch(() => undefined);
  if (!targetStat?.isDirectory()) {
    throw new CliCommandError(`Install target is not an existing directory: ${target}. Pass --target <project-root>.`);
  }
  const sources = skillNames.map((skill) => ({ skill, sourceDir: resolveBundledSkillPath(skill) }));
  const skillRoots = [...new Set(harnesses.flatMap((harness) => INSTALL_HARNESS_DIRS[harness]))];

  const result: InstallSkillsCommandResult = { target, installed: [], skipped: [] };

  for (const root of skillRoots) {
    for (const { skill, sourceDir } of sources) {
      const dest = path.join(target, root, skill);
      const existing = await stat(dest).catch(() => undefined);
      if (existing && !options.force) {
        result.skipped.push({ skill, path: dest, reason: "already exists; re-run with --force to replace it" });
        continue;
      }
      if (existing) {
        await rm(dest, { recursive: true, force: true });
      }
      await cp(sourceDir, dest, {
        recursive: true,
        filter: (source) => {
          const rel = path.relative(sourceDir, source);
          return rel === "" || !EXCLUDED_TOP_LEVEL.has(rel.split(path.sep)[0]!);
        },
      });
      result.installed.push({ skill, path: dest });
    }
  }

  return result;
}
