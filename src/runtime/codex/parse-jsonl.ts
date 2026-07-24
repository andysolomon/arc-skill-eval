import type { PiSessionTelemetryToolCall } from "../../pi/types.js";

export interface ParsedCodexJsonl {
  assistantText: string;
  messages: unknown[];
  events: unknown[];
  toolCalls: PiSessionTelemetryToolCall[];
  inputTokens: number;
  outputTokens: number;
  parseErrors: string[];
  sessionId: string;
}

export function parseCodexJsonl(stdout: string, fallbackSessionId: string): ParsedCodexJsonl {
  const lines = stdout
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const parseErrors: string[] = [];
  const events: unknown[] = [];
  const messages: unknown[] = [];
  const toolCalls: PiSessionTelemetryToolCall[] = [];
  let assistantText = "";
  let sessionId = fallbackSessionId;
  let inputTokens = 0;
  let outputTokens = 0;
  let toolCallCounter = 0;

  for (const line of lines) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      parseErrors.push(line);
      continue;
    }

    events.push(parsed);
    const record = asRecord(parsed);
    if (!record) {
      continue;
    }

    if (typeof record.thread_id === "string") {
      sessionId = record.thread_id;
    }
    if (typeof record.session_id === "string") {
      sessionId = record.session_id;
    }

    absorbUsage(record, (input, output) => {
      inputTokens = Math.max(inputTokens, input);
      outputTokens = Math.max(outputTokens, output);
    });

    const type = typeof record.type === "string" ? record.type : undefined;
    const payload = asRecord(record.payload);

    // Persisted Codex session rollouts: { type: "session_meta", payload: { id } }
    if (type === "session_meta" && payload && typeof payload.id === "string") {
      sessionId = payload.id;
    }

    // Exec JSONL: item.completed
    if (type === "item.completed") {
      const item = asRecord(record.item);
      if (item) {
        absorbItemMessage(item, messages, (text) => {
          assistantText = text;
        });
        absorbItemToolCall(item, toolCalls, () => {
          toolCallCounter += 1;
          return `codex-tool-${toolCallCounter}`;
        });
      }
    }

    // Session / event_msg stream: nested payload.message
    if (type === "event_msg" && payload) {
      const payloadType = typeof payload.type === "string" ? payload.type : "";
      if (payloadType === "agent_message" || payloadType === "message") {
        const text =
          extractText(payload) ?? (typeof payload.message === "string" ? payload.message : undefined);
        if (text) {
          assistantText = text;
          messages.push({ role: "assistant", content: text });
        }
      }
      if (payloadType === "task_complete" && typeof payload.last_agent_message === "string") {
        assistantText = payload.last_agent_message;
        messages.push({ role: "assistant", content: payload.last_agent_message });
      }
      absorbUsage(payload, (input, output) => {
        inputTokens = Math.max(inputTokens, input);
        outputTokens = Math.max(outputTokens, output);
      });
    }

    if (type === "response_item" && payload) {
      const payloadType = typeof payload.type === "string" ? payload.type : "";
      if (payloadType === "message" && payload.role === "assistant") {
        const text = extractText(payload);
        if (text) {
          assistantText = text;
          messages.push({ role: "assistant", content: text });
        }
      }
      if (payloadType === "function_call" || payloadType === "custom_tool_call") {
        absorbItemToolCall(payload, toolCalls, () => {
          toolCallCounter += 1;
          return `codex-tool-${toolCallCounter}`;
        });
      }
    }

    if (type === "token_count" && payload) {
      absorbUsage(payload, (input, output) => {
        inputTokens = Math.max(inputTokens, input);
        outputTokens = Math.max(outputTokens, output);
      });
    }

    if (type === "agent_message" || type === "message") {
      const text = extractText(record) ?? extractText(asRecord(record.message));
      if (text) {
        assistantText = text;
        messages.push({ role: "assistant", content: text });
      }
    }

    if (record.role === "assistant") {
      const text = extractText(record);
      if (text) {
        assistantText = text;
        messages.push({ role: "assistant", content: text });
      }
    }

    if (type === "turn.completed" || type === "response.completed" || type === "task_complete") {
      const text =
        extractText(record) ??
        extractText(asRecord(record.response)) ??
        (typeof record.last_agent_message === "string" ? record.last_agent_message : undefined);
      if (text) {
        assistantText = text;
      }
    }
  }

  if (messages.length === 0 && assistantText) {
    messages.push({ role: "assistant", content: assistantText });
  }

  return {
    assistantText,
    messages,
    events,
    toolCalls,
    inputTokens,
    outputTokens,
    parseErrors,
    sessionId,
  };
}

function absorbItemMessage(
  item: Record<string, unknown>,
  messages: unknown[],
  onText: (text: string) => void,
): void {
  const itemType = typeof item.type === "string" ? item.type : "";
  if (itemType !== "agent_message" && itemType !== "message" && itemType !== "assistant_message") {
    const nestedText = extractText(item);
    if (nestedText && (itemType.includes("message") || itemType.includes("agent"))) {
      onText(nestedText);
      messages.push({ role: "assistant", content: nestedText });
    }
    return;
  }

  const text = extractText(item);
  if (text) {
    onText(text);
    messages.push({ role: "assistant", content: text });
  }
}

function absorbItemToolCall(
  item: Record<string, unknown>,
  toolCalls: PiSessionTelemetryToolCall[],
  nextId: () => string,
): void {
  const itemType = typeof item.type === "string" ? item.type : "";
  if (!itemType.includes("tool") && !itemType.includes("function")) {
    return;
  }

  const toolCallId = typeof item.id === "string" ? item.id : nextId();
  const toolName =
    (typeof item.name === "string" && item.name) ||
    (typeof item.tool_name === "string" && item.tool_name) ||
    itemType;
  const inputSummary = summarizeToolInput(item.arguments ?? item.input ?? item.params);

  const call: PiSessionTelemetryToolCall = { toolCallId, toolName, inputSummary };
  toolCalls.push(call);
}

function absorbUsage(
  record: Record<string, unknown>,
  apply: (input: number, output: number) => void,
): void {
  const usage = asRecord(record.usage) ?? asRecord(record.token_usage);
  if (!usage) {
    return;
  }
  const input = numberField(usage, ["input_tokens", "prompt_tokens", "inputTokens"]);
  const output = numberField(usage, ["output_tokens", "completion_tokens", "outputTokens"]);
  if (input !== null || output !== null) {
    apply(input ?? 0, output ?? 0);
  }
}

function extractText(record: Record<string, unknown> | undefined): string | undefined {
  if (!record) {
    return undefined;
  }
  if (typeof record.text === "string" && record.text.length > 0) {
    return record.text;
  }
  if (typeof record.content === "string" && record.content.length > 0) {
    return record.content;
  }
  if (Array.isArray(record.content)) {
    const parts = record.content
      .map((part) => {
        const piece = asRecord(part);
        if (!piece) {
          return typeof part === "string" ? part : "";
        }
        return typeof piece.text === "string" ? piece.text : typeof piece.content === "string" ? piece.content : "";
      })
      .filter((part) => part.length > 0);
    if (parts.length > 0) {
      return parts.join("\n");
    }
  }
  if (typeof record.message === "string") {
    return record.message;
  }
  return undefined;
}

function summarizeToolInput(value: unknown): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  try {
    const serialized = typeof value === "string" ? value : JSON.stringify(value);
    return serialized.length > 240 ? `${serialized.slice(0, 237)}...` : serialized;
  } catch {
    return undefined;
  }
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
}

function numberField(record: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }
  return null;
}
