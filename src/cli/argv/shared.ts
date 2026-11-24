import { parseModelSelection } from "../../contracts/model-selection.js";
import { SANDBOX_MODE_VALUES, type ModelSelection, type SandboxMode } from "../../contracts/types.js";
import { CliUsageError } from "../types.js";

export function readFlagValue(arg: string, nextArg: string | undefined): { value: string; consumedNext: boolean } {
  const separatorIndex = arg.indexOf("=");

  if (separatorIndex >= 0) {
    return { value: arg.slice(separatorIndex + 1), consumedNext: false };
  }

  if (nextArg === undefined) {
    throw new CliUsageError(`Flag ${arg} requires a value.`);
  }

  return { value: nextArg, consumedNext: true };
}

export function parseModelSelectionFlag(flagName: string, rawValue: string): ModelSelection {
  const parsed = parseModelSelection(rawValue, flagName);
  if (!parsed.ok) throw new CliUsageError(parsed.message);
  return parsed.selection;
}

export function isSandboxMode(value: string): value is SandboxMode {
  return (SANDBOX_MODE_VALUES as readonly string[]).includes(value);
}
