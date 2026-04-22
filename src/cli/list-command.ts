import type { ListCommandOptions, ListCommandResult } from "./types.js";
import { loadRepoForList, selectDiscoveredSkills } from "./shared.js";

export async function runListCommand(options: ListCommandOptions): Promise<ListCommandResult> {
  const loaded = await loadRepoForList(options.input);

  try {
    return {
      source: loaded.result.source,
      skills: selectDiscoveredSkills(loaded.result.skills, options.skillNames),
    };
  } finally {
    await loaded.cleanup();
  }
}
