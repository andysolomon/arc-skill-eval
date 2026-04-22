import type { ValidateCommandOptions, ValidateCommandResult } from "./types.js";
import { ensureNonEmptySelection, loadRepoForValidation, selectValidatedSkills } from "./shared.js";

export async function runValidateCommand(options: ValidateCommandOptions): Promise<ValidateCommandResult> {
  const loaded = await loadRepoForValidation(options.input);

  try {
    const selected = selectValidatedSkills(loaded.result, options.skillNames);
    ensureNonEmptySelection(
      selected.skills,
      `No participating skills found in ${loaded.result.source.displayName}.`,
    );

    return {
      source: loaded.result.source,
      skills: selected.skills,
      validSkills: selected.validSkills,
      invalidSkills: selected.invalidSkills,
    };
  } finally {
    await loaded.cleanup();
  }
}
