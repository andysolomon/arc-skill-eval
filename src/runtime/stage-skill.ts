import { existsSync } from "node:fs";
import { cp, mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

/**
 * Folders of a skill that the agent under test must not see: `evals/` holds
 * the suite that grades it, and `evals-runs/` holds earlier results.
 */
const HIDDEN_FROM_AGENT = new Set(["evals", "evals-runs"]);

/**
 * Copy a skill directory, or a directory of skills, without each skill's eval
 * suite and past runs. Only a folder that sits beside a SKILL.md is left out,
 * so a skill's own `references/evals/` is kept.
 */
export async function copySkillForAgent(skillDir: string, dest: string): Promise<void> {
  await cp(path.resolve(skillDir), dest, {
    recursive: true,
    force: true,
    filter: (source) =>
      !(HIDDEN_FROM_AGENT.has(path.basename(source)) && existsSync(path.join(path.dirname(source), "SKILL.md"))),
  });
}

/** Copies of the skills a case attaches, in a temp directory the agent can be pointed at. */
export interface StagedSkills {
  /** The target skill's copy. Its folder keeps the skill's name. */
  skillDir: string;
  /** One copy per `--extra-skill`, in the order given. */
  extraSkillPaths: string[];
  /** Map a path inside a copy back to the file it was copied from. Other paths come back unchanged. */
  toSourcePath: (stagedPath: string) => string;
  /** Idempotent. */
  cleanup: () => Promise<void>;
}

/**
 * Stage the target skill and any extra skills for one case. Every runtime is
 * pointed at these copies instead of the real directories, so the agent can
 * neither read the suite that grades it nor see a path that says it is under
 * test. The temp directory name is deliberately plain.
 */
export async function stageSkillsForAgent(options: {
  skillDir: string;
  extraSkillPaths: string[];
}): Promise<StagedSkills> {
  const root = await mkdtemp(path.join(tmpdir(), "skills-"));
  const pairs: Array<{ staged: string; source: string }> = [];
  let cleaned = false;
  const cleanup = async () => {
    if (cleaned) return;
    cleaned = true;
    await rm(root, { recursive: true, force: true });
  };

  // Each skill gets its own numbered parent, so two skills with the same
  // folder name cannot collide.
  const stage = async (sourceDir: string): Promise<string> => {
    const source = path.resolve(sourceDir);
    const staged = path.join(root, String(pairs.length + 1), path.basename(source));
    await mkdir(path.dirname(staged), { recursive: true });
    await copySkillForAgent(source, staged);
    pairs.push({ staged, source });
    return staged;
  };

  try {
    const skillDir = await stage(options.skillDir);
    const extraSkillPaths: string[] = [];
    for (const extraSkillPath of options.extraSkillPaths) {
      const resolved = path.resolve(extraSkillPath);
      // An extra skill may be given as its SKILL.md; stage the folder either way.
      extraSkillPaths.push(await stage(path.basename(resolved) === "SKILL.md" ? path.dirname(resolved) : resolved));
    }

    return {
      skillDir,
      extraSkillPaths,
      toSourcePath: (stagedPath) => {
        const pair = pairs.find(({ staged }) => stagedPath === staged || stagedPath.startsWith(`${staged}${path.sep}`));
        return pair ? `${pair.source}${stagedPath.slice(pair.staged.length)}` : stagedPath;
      },
      cleanup,
    };
  } catch (error) {
    await cleanup().catch(() => undefined);
    throw error;
  }
}
