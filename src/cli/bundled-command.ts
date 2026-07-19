import { listBundledSkillEntries, resolveBundledSkillPath } from "./package-root.js";

export interface BundledCommandOptions {
  skillName?: string;
  json?: boolean;
}

export interface BundledCommandResult {
  entries: Array<{ name: string; path: string }>;
}

export async function bundledCommand(options: BundledCommandOptions): Promise<BundledCommandResult> {
  if (options.skillName) {
    const skillDir = resolveBundledSkillPath(options.skillName);
    return { entries: [{ name: options.skillName, path: skillDir }] };
  }

  const allEntries = await listBundledSkillEntries();
  return { entries: allEntries };
}
