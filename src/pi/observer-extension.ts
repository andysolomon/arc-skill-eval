import type { ExtensionAPI, ExtensionFactory } from "@mariozechner/pi-coding-agent";
import { isToolCallEventType } from "@mariozechner/pi-coding-agent";

import type { ValidatedSkillDiscovery } from "../load/source-types.js";
import type {
  PiSessionTelemetryEntry,
  PiSessionTelemetryToolCall,
  PiSessionTelemetryToolResult,
  PiSdkRunnableCase,
} from "./types.js";
import { PI_SESSION_TELEMETRY_CUSTOM_TYPE } from "./types.js";
import {
  summarizeExternalCalls,
  summarizeToolInput,
  toFileTouchTelemetry,
  toSkillReadTelemetry,
} from "./telemetry-helpers.js";

export interface CreatePiSessionTelemetryObserverOptions {
  skill: ValidatedSkillDiscovery;
  caseDefinition: PiSdkRunnableCase;
}

export function createPiSessionTelemetryObserverExtension(
  options: CreatePiSessionTelemetryObserverOptions,
): ExtensionFactory {
  return function piSessionTelemetryObserver(pi: ExtensionAPI): void {
    let sequence = 0;

    pi.on("session_start", async (_event, ctx) => {
      appendTelemetry(pi, {
        sequence: ++sequence,
        timestamp: new Date().toISOString(),
        kind: "run-start",
        skillName: options.skill.contract.skill,
        caseId: options.caseDefinition.caseId,
        lane: options.caseDefinition.lane,
        sessionId: ctx.sessionManager.getSessionId(),
        data: {
          kind: options.caseDefinition.kind,
          relativeSkillDir: options.skill.files.relativeSkillDir,
        },
      });
    });

    pi.on("tool_call", async (event, ctx) => {
      const toolCall: PiSessionTelemetryToolCall = {
        toolCallId: event.toolCallId,
        toolName: event.toolName,
        inputSummary: summarizeToolInput(event.toolName, event.input),
      };

      appendTelemetry(pi, {
        sequence: ++sequence,
        timestamp: new Date().toISOString(),
        kind: "tool-call",
        skillName: options.skill.contract.skill,
        caseId: options.caseDefinition.caseId,
        lane: options.caseDefinition.lane,
        sessionId: ctx.sessionManager.getSessionId(),
        data: toolCall,
      });

      if (isToolCallEventType("read", event)) {
        const skillRead = toSkillReadTelemetry(ctx.cwd, event.toolCallId, event.input.path);

        if (skillRead !== null) {
          appendTelemetry(pi, {
            sequence: ++sequence,
            timestamp: new Date().toISOString(),
            kind: "skill-read",
            skillName: options.skill.contract.skill,
            caseId: options.caseDefinition.caseId,
            lane: options.caseDefinition.lane,
            sessionId: ctx.sessionManager.getSessionId(),
            data: skillRead,
          });
        }
      }

      if (isToolCallEventType("bash", event)) {
        appendTelemetry(pi, {
          sequence: ++sequence,
          timestamp: new Date().toISOString(),
          kind: "bash-command",
          skillName: options.skill.contract.skill,
          caseId: options.caseDefinition.caseId,
          lane: options.caseDefinition.lane,
          sessionId: ctx.sessionManager.getSessionId(),
          data: {
            toolCallId: event.toolCallId,
            command: event.input.command,
            timeout: event.input.timeout,
          },
        });

        for (const externalCall of summarizeExternalCalls(event.toolCallId, event.input.command)) {
          appendTelemetry(pi, {
            sequence: ++sequence,
            timestamp: new Date().toISOString(),
            kind: "external-call",
            skillName: options.skill.contract.skill,
            caseId: options.caseDefinition.caseId,
            lane: options.caseDefinition.lane,
            sessionId: ctx.sessionManager.getSessionId(),
            data: externalCall,
          });
        }
      }
    });

    pi.on("tool_result", async (event, ctx) => {
      const toolResult: PiSessionTelemetryToolResult = {
        toolCallId: event.toolCallId,
        toolName: event.toolName,
        isError: event.isError,
      };

      appendTelemetry(pi, {
        sequence: ++sequence,
        timestamp: new Date().toISOString(),
        kind: "tool-result",
        skillName: options.skill.contract.skill,
        caseId: options.caseDefinition.caseId,
        lane: options.caseDefinition.lane,
        sessionId: ctx.sessionManager.getSessionId(),
        data: toolResult,
      });

      if (event.isError) {
        return;
      }

      const fileTouch = toFileTouchTelemetry(ctx.cwd, event.toolCallId, event.toolName, event.input);

      if (fileTouch !== null) {
        appendTelemetry(pi, {
          sequence: ++sequence,
          timestamp: new Date().toISOString(),
          kind: "file-touch",
          skillName: options.skill.contract.skill,
          caseId: options.caseDefinition.caseId,
          lane: options.caseDefinition.lane,
          sessionId: ctx.sessionManager.getSessionId(),
          data: fileTouch,
        });
      }
    });
  };
}

function appendTelemetry(pi: ExtensionAPI, entry: PiSessionTelemetryEntry): void {
  pi.appendEntry(PI_SESSION_TELEMETRY_CUSTOM_TYPE, entry);
}

