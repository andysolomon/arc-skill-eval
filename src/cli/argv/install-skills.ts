import { INSTALL_HARNESS_IDS, isInstallHarnessId, type InstallHarnessId } from "../install-skills-command.js";
import { CliUsageError } from "../types.js";
import { readFlagValue } from "./shared.js";

export function parseInstallSkillsCommandArgs(args: string[]) {
  let target: string | undefined;
  const harnesses: InstallHarnessId[] = [];
  const skills: string[] = [];
  let force = false;
  let json = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]!;

    if (arg === "--json") {
      json = true;
      continue;
    }

    if (arg === "--force") {
      force = true;
      continue;
    }

    if (arg === "--target" || arg.startsWith("--target=")) {
      const parsed = readFlagValue(arg, args[index + 1]);
      target = parsed.value;
      index += parsed.consumedNext ? 1 : 0;
      continue;
    }

    if (arg === "--harness" || arg.startsWith("--harness=")) {
      const parsed = readFlagValue(arg, args[index + 1]);
      if (!isInstallHarnessId(parsed.value)) {
        throw new CliUsageError(`Unknown --harness: ${parsed.value}. Expected one of: ${INSTALL_HARNESS_IDS.join(", ")}.`);
      }
      if (!harnesses.includes(parsed.value)) harnesses.push(parsed.value);
      index += parsed.consumedNext ? 1 : 0;
      continue;
    }

    if (arg === "--skill" || arg.startsWith("--skill=")) {
      const parsed = readFlagValue(arg, args[index + 1]);
      if (!skills.includes(parsed.value)) skills.push(parsed.value);
      index += parsed.consumedNext ? 1 : 0;
      continue;
    }

    if (arg.startsWith("-")) {
      throw new CliUsageError(`Unknown flag: ${arg}.`);
    }

    throw new CliUsageError("install-skills takes no positional arguments; use --target <project-root>.");
  }

  return {
    ...(target !== undefined ? { target } : {}),
    harnesses,
    skills,
    force,
    json,
  };
}
