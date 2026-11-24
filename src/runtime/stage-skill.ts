import { existsSync } from "node:fs";
import { cp, mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

type GivesAwayTheEval = "eval" | "test" | "judge" | "bench" | "rubric" | "score" | "arc-skill";

export type BlindName<S extends string> = Lowercase<S> extends `${string}${GivesAwayTheEval}${string}` ? never : S;

const STAGED_SKILLS_PREFIX: BlindName<"skills-"> = "skills-";

const HIDDEN_FROM_AGENT = new Set(["evals", "evals-runs"]);

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
  skillDir: string;
  /** One copy per `--extra-skill`, in the order given. */
  extraSkillPaths: string[];
  toSourcePath: (stagedPath: string) => string;
  cleanup: () => Promise<void>;
}

export async function stageSkillsForAgent(options: {
  skillDir: string;
  extraSkillPaths: string[];
}): Promise<StagedSkills> {
  const root = await mkdtemp(path.join(tmpdir(), STAGED_SKILLS_PREFIX));
  const pairs: Array<{ staged: string; source: string }> = [];
  let cleaned = false;
  const cleanup = async () => {
    if (cleaned) return;
    cleaned = true;
    await rm(root, { recursive: true, force: true });
  };

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
