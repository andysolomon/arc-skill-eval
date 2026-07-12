import type { ModelSelection } from "../contracts/types.js";
import type { PiSdkUsageMetrics } from "./types.js";
import { loadPiSessionTelemetry } from "./session-telemetry.js";
import type { PiSdkSessionLike } from "./sdk-runner.js";

/** Internal owner for Pi event capture, usage normalization, telemetry, and terminal errors. */
export function observePiSdkSession(session: PiSdkSessionLike): {
  events: unknown[];
  getAssistantText: () => string;
  unsubscribe: () => void;
} {
  const events: unknown[] = [];
  let assistantText = "";
  const unsubscribe = session.subscribe((event) => {
    events.push(snapshotValue(event));

    if (isTextDeltaEvent(event)) {
      assistantText += event.assistantMessageEvent.delta;
    }
  });

  return { events, getAssistantText: () => assistantText, unsubscribe };
}

export function collectPiSdkUsageMetrics(
  session: PiSdkSessionLike,
  selectedModel: ModelSelection | null,
): PiSdkUsageMetrics {
  const tokenUsage = collectAssistantTokenUsage(session.messages);
  const contextUsage = normalizeContextUsage(session.getContextUsage?.());
  const sessionModel = normalizeSessionModel(session.model, session.thinkingLevel);
  const messageModel = inferModelFromMessages(session.messages);
  const model = sessionModel ?? selectedModel ?? messageModel;
  const thinkingLevel = normalizeThinkingLevel(session.thinkingLevel) ?? model?.thinking ?? null;
  const contextWindowTokens = contextUsage?.contextWindowTokens ?? numericValue(session.model?.contextWindow) ?? null;
  const contextWindowUsedPercent = contextUsage
    ? contextUsage.contextWindowUsedPercent
    : contextWindowTokens && contextWindowTokens > 0
      ? (tokenUsage.totalTokens / contextWindowTokens) * 100
      : null;

  return {
    model,
    thinkingLevel,
    inputTokens: tokenUsage.inputTokens,
    outputTokens: tokenUsage.outputTokens,
    cacheReadTokens: tokenUsage.cacheReadTokens,
    cacheWriteTokens: tokenUsage.cacheWriteTokens,
    totalTokens: tokenUsage.totalTokens,
    estimatedCostUsd: tokenUsage.estimatedCostUsd,
    contextWindowTokens,
    contextWindowUsedPercent,
  };
}

/** The terminal provider error, excluding errors the agent recovered from. */
export function findTerminalProviderError(messages: Iterable<unknown>): string | null {
  let last: { stopReason?: unknown; errorMessage?: unknown } | null = null;
  for (const message of messages) {
    const candidate = message as { role?: unknown; stopReason?: unknown; errorMessage?: unknown };
    if (candidate !== null && typeof candidate === "object" && candidate.role === "assistant") last = candidate;
  }
  if (!last || last.stopReason !== "error") return null;
  return typeof last.errorMessage === "string" && last.errorMessage.length > 0
    ? last.errorMessage
    : "provider reported an error with no message";
}

export async function loadTelemetryIfAvailable(sessionFile: string | undefined) {
  if (!sessionFile) {
    return null;
  }

  try {
    return await loadPiSessionTelemetry(sessionFile);
  } catch {
    return null;
  }
}

export function buildPromptFailureMessage(caseId: string, error: unknown): string {
  if (error instanceof Error && error.message.length > 0) {
    return `Pi SDK run failed for case ${caseId}: ${error.message}`;
  }

  return `Pi SDK run failed for case ${caseId}.`;
}

export function normalizeSessionModel(
  model: PiSdkSessionLike["model"],
  thinkingLevel: unknown,
): ModelSelection | null {
  if (typeof model !== "object" || model === null) return null;
  const provider = typeof model.provider === "string" ? model.provider : undefined;
  const id = typeof model.id === "string" ? model.id : undefined;
  if (!provider || !id) return null;
  const normalizedThinkingLevel = normalizeThinkingLevel(thinkingLevel);
  return { provider, id, ...(normalizedThinkingLevel ? { thinking: normalizedThinkingLevel } : {}) };
}

export function snapshotValue<T>(value: T): T {
  try {
    return structuredClone(value);
  } catch {
    return value;
  }
}

function collectAssistantTokenUsage(messages: unknown[]) {
  let inputTokens = 0;
  let outputTokens = 0;
  let cacheReadTokens = 0;
  let cacheWriteTokens = 0;
  let estimatedCostUsd = 0;

  for (const message of messages) {
    if (!isAssistantMessageWithUsage(message)) continue;
    const usage = message.usage;
    inputTokens += numericField(usage, "input");
    outputTokens += numericField(usage, "output");
    cacheReadTokens += numericField(usage, "cacheRead");
    cacheWriteTokens += numericField(usage, "cacheWrite");
    estimatedCostUsd += numericField(asRecord(usage.cost), "total");
  }

  return {
    inputTokens,
    outputTokens,
    cacheReadTokens,
    cacheWriteTokens,
    totalTokens: inputTokens + outputTokens + cacheReadTokens + cacheWriteTokens,
    estimatedCostUsd,
  };
}

function inferModelFromMessages(messages: unknown[]): ModelSelection | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (typeof message !== "object" || message === null) continue;
    const record = message as Record<string, unknown>;
    if (record.role !== "assistant") continue;
    const provider = typeof record.provider === "string" ? record.provider : undefined;
    const id = typeof record.model === "string" ? record.model : undefined;
    if (provider && id) return { provider, id };
  }
  return null;
}

function normalizeContextUsage(value: unknown): {
  contextWindowTokens: number | null;
  contextWindowUsedPercent: number | null;
} | null {
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  return {
    contextWindowTokens: numericValue(record.contextWindow),
    contextWindowUsedPercent: numericValue(record.percent),
  };
}

function normalizeThinkingLevel(value: unknown): PiSdkUsageMetrics["thinkingLevel"] {
  if (typeof value !== "string") return null;
  return ["off", "minimal", "low", "medium", "high", "xhigh"].includes(value)
    ? value as PiSdkUsageMetrics["thinkingLevel"]
    : null;
}

function isTextDeltaEvent(
  event: unknown,
): event is { type: "message_update"; assistantMessageEvent: { type: "text_delta"; delta: string } } {
  return (
    typeof event === "object" &&
    event !== null &&
    "type" in event &&
    event.type === "message_update" &&
    "assistantMessageEvent" in event &&
    typeof event.assistantMessageEvent === "object" &&
    event.assistantMessageEvent !== null &&
    "type" in event.assistantMessageEvent &&
    event.assistantMessageEvent.type === "text_delta" &&
    "delta" in event.assistantMessageEvent &&
    typeof event.assistantMessageEvent.delta === "string"
  );
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? value as Record<string, unknown> : {};
}

function isAssistantMessageWithUsage(
  value: unknown,
): value is { role: "assistant"; usage: Record<string, unknown> } {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  if (record.role !== "assistant") return false;
  return typeof record.usage === "object" && record.usage !== null;
}

function numericField(source: Record<string, unknown>, key: string): number {
  return numericValue(source[key]) ?? 0;
}

function numericValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
