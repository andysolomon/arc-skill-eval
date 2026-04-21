import type { ModelSelection, SkillProfile, TargetTier } from "../contracts/types.js";
import type { RepoSourceDescriptor } from "../load/source-types.js";
import type {
  PiSdkCaseKind,
  PiSdkCaseLane,
  PiSessionTelemetryEntry,
  PiSessionTelemetryExternalCall,
  PiSessionTelemetryFileTouch,
  PiSessionTelemetrySkillRead,
  PiSessionTelemetryToolCall,
  PiSessionTelemetryToolResult,
} from "../pi/types.js";

export type EvalTraceRuntime = "pi-sdk";

export interface EvalTraceIdentity {
  runtime: EvalTraceRuntime;
  source: RepoSourceDescriptor;
  skill: {
    name: string;
    relativeSkillDir: string;
    profile: SkillProfile;
    targetTier: TargetTier;
  };
  case: {
    caseId: string;
    kind: PiSdkCaseKind;
    lane: PiSdkCaseLane;
    prompt: string;
  };
  model: ModelSelection | null;
}

export interface EvalTraceTiming {
  startedAt: string;
  finishedAt: string;
  durationMs: number;
}

export interface EvalTraceObservations {
  assistantText: string;
  toolCalls: PiSessionTelemetryToolCall[];
  toolResults: PiSessionTelemetryToolResult[];
  bashCommands: string[];
  touchedFiles: PiSessionTelemetryFileTouch[];
  writtenFiles: string[];
  editedFiles: string[];
  skillReads: PiSessionTelemetrySkillRead[];
  externalCalls: PiSessionTelemetryExternalCall[];
}

export interface EvalTraceRawArtifacts {
  sessionId: string;
  sessionFile: string | undefined;
  messages: unknown[];
  sdkEvents: unknown[];
  telemetryEntries: PiSessionTelemetryEntry[];
}

export interface EvalTrace {
  identity: EvalTraceIdentity;
  timing: EvalTraceTiming;
  observations: EvalTraceObservations;
  raw: EvalTraceRawArtifacts;
}
