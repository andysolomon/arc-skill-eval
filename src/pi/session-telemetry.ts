import { SessionManager } from "@mariozechner/pi-coding-agent";

import type {
  PiSessionTelemetryEntry,
  PiSessionTelemetryExternalCall,
  PiSessionTelemetryFileTouch,
  PiSessionTelemetrySkillRead,
  PiSessionTelemetrySnapshot,
  PiSessionTelemetryToolCall,
  PiSessionTelemetryToolResult,
} from "./types.js";
import { PI_SESSION_TELEMETRY_CUSTOM_TYPE } from "./types.js";

export async function loadPiSessionTelemetry(sessionFile: string): Promise<PiSessionTelemetrySnapshot> {
  const sessionManager = SessionManager.open(sessionFile);
  const entries = extractPiSessionTelemetryEntries(sessionManager.getEntries());

  return summarizePiSessionTelemetry(entries);
}

export function extractPiSessionTelemetryEntries(entries: unknown[]): PiSessionTelemetryEntry[] {
  return entries
    .flatMap((entry) => {
      if (!isCustomTelemetryEntry(entry)) {
        return [];
      }

      return isPiSessionTelemetryEntry(entry.data) ? [entry.data] : [];
    })
    .sort((left, right) => left.sequence - right.sequence);
}

export function summarizePiSessionTelemetry(entries: PiSessionTelemetryEntry[]): PiSessionTelemetrySnapshot {
  const toolCalls: PiSessionTelemetryToolCall[] = [];
  const toolResults: PiSessionTelemetryToolResult[] = [];
  const skillReads: PiSessionTelemetrySkillRead[] = [];
  const bashCommands: string[] = [];
  const touchedFiles: PiSessionTelemetryFileTouch[] = [];
  const externalCalls: PiSessionTelemetryExternalCall[] = [];

  for (const entry of entries) {
    switch (entry.kind) {
      case "tool-call":
        toolCalls.push(entry.data);
        break;
      case "tool-result":
        toolResults.push(entry.data);
        break;
      case "skill-read":
        skillReads.push(entry.data);
        break;
      case "bash-command":
        bashCommands.push(entry.data.command);
        break;
      case "file-touch":
        touchedFiles.push(entry.data);
        break;
      case "external-call":
        externalCalls.push(entry.data);
        break;
      default:
        break;
    }
  }

  return {
    entries,
    toolCalls,
    toolResults,
    skillReads,
    bashCommands,
    touchedFiles,
    externalCalls,
  };
}

function isCustomTelemetryEntry(
  value: unknown,
): value is { type: "custom"; customType: string; data?: unknown } {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    value.type === "custom" &&
    "customType" in value &&
    value.customType === PI_SESSION_TELEMETRY_CUSTOM_TYPE
  );
}

function isPiSessionTelemetryEntry(value: unknown): value is PiSessionTelemetryEntry {
  return (
    typeof value === "object" &&
    value !== null &&
    "sequence" in value &&
    typeof value.sequence === "number" &&
    "timestamp" in value &&
    typeof value.timestamp === "string" &&
    "kind" in value &&
    typeof value.kind === "string" &&
    "skillName" in value &&
    typeof value.skillName === "string" &&
    "caseId" in value &&
    typeof value.caseId === "string" &&
    "lane" in value &&
    typeof value.lane === "string" &&
    "data" in value
  );
}
