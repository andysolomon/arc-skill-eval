import {
  SANDBOX_MODE_VALUES,
  THINKING_LEVEL_VALUES,
  type ModelSelection,
  type SandboxMode,
  type ThinkingLevel,
} from "../../contracts/types.js";
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
  const slashIndex = rawValue.indexOf("/");
  if (slashIndex <= 0 || slashIndex === rawValue.length - 1) {
    throw new CliUsageError(`Invalid ${flagName}: ${rawValue}. Expected provider/model or provider/model:thinking.`);
  }

  const provider = rawValue.slice(0, slashIndex);
  const modelAndMaybeThinking = rawValue.slice(slashIndex + 1);
  const lastColonIndex = modelAndMaybeThinking.lastIndexOf(":");

  if (lastColonIndex < 0) return { provider, id: modelAndMaybeThinking };

  const suffix = modelAndMaybeThinking.slice(lastColonIndex + 1);
  if (!isThinkingLevel(suffix)) {
    return { provider, id: modelAndMaybeThinking };
  }

  const id = modelAndMaybeThinking.slice(0, lastColonIndex);
  if (!id) {
    throw new CliUsageError(`Invalid ${flagName}: ${rawValue}. Expected provider/model or provider/model:thinking.`);
  }

  return { provider, id, thinking: suffix };
}

export function isThinkingLevel(value: string): value is ThinkingLevel {
  return (THINKING_LEVEL_VALUES as readonly string[]).includes(value);
}

export function isSandboxMode(value: string): value is SandboxMode {
  return (SANDBOX_MODE_VALUES as readonly string[]).includes(value);
}
