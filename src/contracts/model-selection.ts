import { THINKING_LEVEL_VALUES, type ModelSelection, type ThinkingLevel } from "./types.js";

export type ModelSelectionParse =
  | { readonly ok: true; readonly selection: ModelSelection }
  | { readonly ok: false; readonly message: string };

const isThinkingLevel = (value: string): value is ThinkingLevel =>
  (THINKING_LEVEL_VALUES as readonly string[]).includes(value);

/**
 * Parse `provider/model[:thinking]`. The provider ends at the first slash. A
 * trailing `:suffix` is a thinking level only when it names one, so colon tags
 * such as `ollama/glm-5.2:cloud` stay in the model id.
 */
export function parseModelSelection(raw: string, label = "model"): ModelSelectionParse {
  const value = raw.trim();
  const invalid: ModelSelectionParse = {
    ok: false,
    message: `Invalid ${label}: ${value || "(empty)"}. Expected provider/model or provider/model:thinking.`,
  };

  const slash = value.indexOf("/");
  if (slash <= 0 || slash === value.length - 1) return invalid;

  const provider = value.slice(0, slash);
  const rest = value.slice(slash + 1);
  const colon = rest.lastIndexOf(":");
  const suffix = rest.slice(colon + 1);
  if (colon < 0 || !isThinkingLevel(suffix)) return { ok: true, selection: { provider, id: rest } };

  const id = rest.slice(0, colon);
  if (!id) return invalid;
  return { ok: true, selection: { provider, id, thinking: suffix } };
}
