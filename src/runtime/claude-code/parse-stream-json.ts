import type { PiSessionTelemetryToolCall } from "../../pi/types.js";

export interface ParsedClaudeStreamJson {
  assistantText: string;
  messages: unknown[];
  events: unknown[];
  toolCalls: PiSessionTelemetryToolCall[];
  inputTokens: number;
  outputTokens: number;
  parseErrors: string[];
  sessionId: string;
}

/**
 * Parse Claude Code `--output-format stream-json` (or single-line `json`) stdout.
 * Handles common shapes: `assistant` / `result` / `content_block_*` / tool_use.
 */
export function parseClaudeStreamJson(stdout: string, fallbackSessionId: string): ParsedClaudeStreamJson {
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
  const textChunks: string[] = [];

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

    if (typeof record.session_id === "string") {
      sessionId = record.session_id;
    }
    if (typeof record.sessionId === "string") {
      sessionId = record.sessionId;
    }

    absorbUsage(record, (input, output) => {
      inputTokens = Math.max(inputTokens, input);
      outputTokens = Math.max(outputTokens, output);
    });

    const type = typeof record.type === "string" ? record.type : undefined;

    if (type === "assistant" || type === "message" || record.role === "assistant") {
      const text = extractAssistantText(record);
      if (text) {
        assistantText = text;
        messages.push({ role: "assistant", content: text });
      }
      absorbToolUses(record, toolCalls, () => {
        toolCallCounter += 1;
        return `claude-tool-${toolCallCounter}`;
      });
    }

    if (type === "content_block_delta") {
      const delta = asRecord(record.delta);
      if (delta && typeof delta.text === "string") {
        textChunks.push(delta.text);
      }
    }

    if (type === "content_block_stop" && textChunks.length > 0) {
      const joined = textChunks.splice(0, textChunks.length).join("");
      if (joined) {
        assistantText = joined;
        messages.push({ role: "assistant", content: joined });
      }
    }

    if (type === "result") {
      const text =
        (typeof record.result === "string" && record.result) ||
        extractAssistantText(record) ||
        (typeof record.content === "string" ? record.content : undefined);
      if (text) {
        assistantText = text;
        messages.push({ role: "assistant", content: text });
      }
      absorbUsage(record, (input, output) => {
        inputTokens = Math.max(inputTokens, input);
        outputTokens = Math.max(outputTokens, output);
      });
    }

    if (type === "tool_use" || type === "tool_call") {
      pushToolCall(record, toolCalls, () => {
        toolCallCounter += 1;
        return `claude-tool-${toolCallCounter}`;
      });
    }
  }

  if (textChunks.length > 0 && !assistantText) {
    assistantText = textChunks.join("");
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

function extractAssistantText(record: Record<string, unknown>): string | undefined {
  if (typeof record.text === "string" && record.text.length > 0) {
    return record.text;
  }
  if (typeof record.message === "string" && record.message.length > 0) {
    return record.message;
  }
  const message = asRecord(record.message);
  if (message) {
    const nested = extractContentText(message);
    if (nested) {
      return nested;
    }
  }
  return extractContentText(record);
}

function extractContentText(record: Record<string, unknown>): string | undefined {
  if (typeof record.content === "string" && record.content.length > 0) {
    return record.content;
  }
  if (!Array.isArray(record.content)) {
    return undefined;
  }
  const parts = record.content
    .map((part) => {
      if (typeof part === "string") {
        return part;
      }
      const piece = asRecord(part);
      if (!piece) {
        return "";
      }
      if (piece.type === "text" && typeof piece.text === "string") {
        return piece.text;
      }
      return typeof piece.text === "string" ? piece.text : "";
    })
    .filter((part) => part.length > 0);
  return parts.length > 0 ? parts.join("\n") : undefined;
}

function absorbToolUses(
  record: Record<string, unknown>,
  toolCalls: PiSessionTelemetryToolCall[],
  nextId: () => string,
): void {
  const blocks = Array.isArray(record.content) ? record.content : [];
  for (const part of blocks) {
    const block = asRecord(part);
    if (!block) {
      continue;
    }
    const blockType = typeof block.type === "string" ? block.type : "";
    if (blockType === "tool_use" || blockType === "tool_call") {
      pushToolCall(block, toolCalls, nextId);
    }
  }
}

function pushToolCall(
  source: Record<string, unknown>,
  toolCalls: PiSessionTelemetryToolCall[],
  nextId: () => string,
): void {
  const toolCallId =
    (typeof source.id === "string" && source.id) ||
    (typeof source.tool_use_id === "string" && source.tool_use_id) ||
    nextId();
  const toolName =
    (typeof source.name === "string" && source.name) ||
    (typeof source.tool_name === "string" && source.tool_name) ||
    "tool";
  const inputSummary = summarizeToolInput(source.input ?? source.arguments ?? source.params);
  toolCalls.push({ toolCallId, toolName, inputSummary });
}

function absorbUsage(
  record: Record<string, unknown>,
  apply: (input: number, output: number) => void,
): void {
  const usage =
    asRecord(record.usage) ??
    asRecord(record.token_usage) ??
    asRecord(asRecord(record.message)?.usage);
  if (!usage) {
    return;
  }
  const input = numberField(usage, ["input_tokens", "prompt_tokens", "inputTokens"]);
  const output = numberField(usage, ["output_tokens", "completion_tokens", "outputTokens"]);
  if (input !== null || output !== null) {
    apply(input ?? 0, output ?? 0);
  }
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
