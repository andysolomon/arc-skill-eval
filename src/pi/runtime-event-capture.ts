/**
 * Pi sends every `message_update` with the whole partial assistant message
 * so far (`message` and `assistantMessageEvent.partial`). Cloning those on
 * every delta stores the streamed output once per delta, which grows
 * quadratically and can OOM a long tool call. The recorder keeps only what
 * each update adds (its type, content index, delta, and the finished block
 * on `*_end` events). The complete message is still captured once, by
 * `message_end` and by the session's message list.
 */

export const DEFAULT_MAX_RUNTIME_EVENT_BYTES = 32 * 1024 * 1024;

export const MAX_RUNTIME_EVENT_BYTES_ENV = "ARC_SKILL_EVAL_MAX_RUNTIME_EVENT_BYTES";

const ASSISTANT_EVENT_FIELDS = ["contentIndex", "delta", "content", "toolCall", "reason"] as const;

const UNMEASURABLE_EVENT_BYTES = 1024;

export interface RuntimeEventRecorder {
  readonly events: unknown[];
  readonly truncated: boolean;
  record: (event: unknown) => void;
}

export function createRuntimeEventRecorder(options: { maxBytes?: number } = {}): RuntimeEventRecorder {
  const maxBytes = options.maxBytes ?? resolveMaxRuntimeEventBytes();
  const events: unknown[] = [];
  let bytes = 2;
  let truncated = false;

  return {
    events,
    get truncated() {
      return truncated;
    },
    record(event) {
      if (truncated) return;
      const captured = captureRuntimeEvent(event);
      const size = measureJson(captured) + (events.length > 0 ? 1 : 0);
      if (bytes + size > maxBytes) {
        truncated = true;
        return;
      }
      bytes += size;
      events.push(captured);
    },
  };
}

export function captureRuntimeEvent(event: unknown): unknown {
  return isMessageUpdateEvent(event) ? compactMessageUpdate(event) : cloneValue(event);
}

function compactMessageUpdate(event: MessageUpdateEvent): Record<string, unknown> {
  const { message: _message, assistantMessageEvent, ...rest } = event;
  const compact: Record<string, unknown> = { type: assistantMessageEvent.type };
  for (const field of ASSISTANT_EVENT_FIELDS) {
    if (field in assistantMessageEvent) compact[field] = cloneValue(assistantMessageEvent[field]);
  }
  // `error` events carry the final message; keep only the reason text.
  const errorMessage = asRecord(assistantMessageEvent.error).errorMessage;
  if (typeof errorMessage === "string") compact.errorMessage = errorMessage;

  return { ...cloneValue(rest), assistantMessageEvent: compact };
}

function resolveMaxRuntimeEventBytes(): number {
  const raw = process.env[MAX_RUNTIME_EVENT_BYTES_ENV];
  if (raw === undefined || raw.trim() === "") return DEFAULT_MAX_RUNTIME_EVENT_BYTES;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_MAX_RUNTIME_EVENT_BYTES;
}

function measureJson(value: unknown): number {
  try {
    return JSON.stringify(value)?.length ?? 0;
  } catch {
    return UNMEASURABLE_EVENT_BYTES;
  }
}

function cloneValue<T>(value: T): T {
  try {
    return structuredClone(value);
  } catch {
    return value;
  }
}

interface MessageUpdateEvent extends Record<string, unknown> {
  type: "message_update";
  assistantMessageEvent: Record<string, unknown> & { type: unknown };
}

function isMessageUpdateEvent(event: unknown): event is MessageUpdateEvent {
  if (typeof event !== "object" || event === null) return false;
  const record = event as Record<string, unknown>;
  return (
    record.type === "message_update" &&
    typeof record.assistantMessageEvent === "object" &&
    record.assistantMessageEvent !== null
  );
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? value as Record<string, unknown> : {};
}
