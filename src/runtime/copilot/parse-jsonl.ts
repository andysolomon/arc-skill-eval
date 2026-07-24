import type { PiSessionTelemetryToolCall } from "../../pi/types.js";

export interface ParsedCopilotJsonl {
  assistantText: string;
  messages: unknown[];
  events: unknown[];
  toolCalls: PiSessionTelemetryToolCall[];
  inputTokens: number;
  outputTokens: number;
  parseErrors: string[];
  sessionId: string;
}

/** Parse Copilot CLI `--output-format=json` JSONL stdout. */
export function parseCopilotJsonl(stdout: string, fallbackSessionId: string): ParsedCopilotJsonl {
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

    if (typeof record.session_id === "string") {
      sessionId = record.session_id;
    }

    absorbUsage(record, (input, output) => {
      inputTokens = Math.max(inputTokens, input);
      outputTokens = Math.max(outputTokens, output);
    });

    const type = typeof record.type === "string" ? record.type : undefined;
    if (type === "assistant" || type === "message" || type === "result" || record.role === "assistant") {
      const text = extractText(record);
      if (text) {
        assistantText = text;
        messages.push({ role: "assistant", content: text });
      }
    }

    if (type === "tool_call" || type === "tool_use") {
      toolCalls.push({
        toolCallId: (typeof record.id === "string" && record.id) || `copilot-tool-${(toolCallCounter += 1)}`,
        toolName:
          (typeof record.name === "string" && record.name) ||
          (typeof record.toolName === "string" && record.toolName) ||
          "tool",
        inputSummary: summarizeToolInput(record.arguments ?? record.input ?? record.params),
      });
    }

    if (!type && typeof record.result === "string") {
      assistantText = record.result;
      messages.push({ role: "assistant", content: record.result });
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

function extractText(record: Record<string, unknown>): string | undefined {
  if (typeof record.text === "string" && record.text) {
    return record.text;
  }
  if (typeof record.content === "string" && record.content) {
    return record.content;
  }
  if (typeof record.result === "string" && record.result) {
    return record.result;
  }
  if (typeof record.message === "string" && record.message) {
    return record.message;
  }
  const message = asRecord(record.message);
  if (message) {
    return extractText(message);
  }
  if (Array.isArray(record.content)) {
    const parts = record.content
      .map((part) => {
        if (typeof part === "string") {
          return part;
        }
        const piece = asRecord(part);
        return piece && typeof piece.text === "string" ? piece.text : "";
      })
      .filter((part) => part.length > 0);
    if (parts.length > 0) {
      return parts.join("\n");
    }
  }
  return undefined;
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
