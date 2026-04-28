import type {
  ExecutionCase,
  LiveSmokeCase,
  ModelSelection,
  NormalizedSkillEvalContract,
  ThinkingLevel,
  ParityCase,
  RoutingCase,
} from "../contracts/types.js";
import type { MaterializedFixtureDetails, FixtureCleanupResult } from "../fixtures/types.js";
import type { RepoSourceDescriptor, ValidatedSkillDiscovery } from "../load/source-types.js";

export type PiSdkCaseKind = "routing" | "execution" | "cli-parity" | "live-smoke";

export type PiSdkCaseLane =
  | "routing-explicit"
  | "routing-implicit-positive"
  | "routing-adjacent-negative"
  | "routing-hard-negative"
  | "execution-deterministic"
  | "cli-parity"
  | "live-smoke";

interface PiSdkCaseBase<TCase> {
  kind: PiSdkCaseKind;
  lane: PiSdkCaseLane;
  caseId: string;
  prompt: string;
  skillName: string;
  contractModel?: ModelSelection;
  definition: TCase;
}

export interface PiSdkRoutingCase extends PiSdkCaseBase<RoutingCase> {
  kind: "routing";
  lane:
    | "routing-explicit"
    | "routing-implicit-positive"
    | "routing-adjacent-negative"
    | "routing-hard-negative";
}

export interface PiSdkExecutionCase extends PiSdkCaseBase<ExecutionCase> {
  kind: "execution";
  lane: "execution-deterministic";
}

export interface PiSdkParityCase extends PiSdkCaseBase<ParityCase> {
  kind: "cli-parity";
  lane: "cli-parity";
}

export interface PiSdkLiveSmokeCase extends PiSdkCaseBase<LiveSmokeCase> {
  kind: "live-smoke";
  lane: "live-smoke";
}

export type PiSdkRunnableCase = PiSdkRoutingCase | PiSdkExecutionCase | PiSdkParityCase | PiSdkLiveSmokeCase;

export interface CreatePiSdkRunEnvironmentOptions {
  workspaceDir: string;
  agentDir?: string;
  sessionDir?: string;
}

export interface PiSdkRunEnvironmentCleanupResult {
  agentDirRemoved: boolean;
}

export interface PiSdkRunEnvironment {
  workspaceDir: string;
  agentDir: string;
  sessionDir: string;
  cleanup: () => Promise<PiSdkRunEnvironmentCleanupResult>;
}

export interface RunPiSdkCaseOptions {
  source: RepoSourceDescriptor;
  skill: ValidatedSkillDiscovery;
  caseDefinition: PiSdkRunnableCase;
  environment?: PiSdkRunEnvironment;
  workspaceDir?: string;
  agentDir?: string;
  sessionDir?: string;
  model?: ModelSelection;
  appendSystemPrompt?: string[];
  /** Attach the target skill to the Pi session. Defaults to true. */
  attachSkill?: boolean;
}

export interface RunValidatedSkillViaPiSdkOptions {
  source: RepoSourceDescriptor;
  skill: ValidatedSkillDiscovery;
  selectedCaseIds?: string[];
  environment?: PiSdkRunEnvironment;
  workspaceDir?: string;
  agentDir?: string;
  sessionDir?: string;
  model?: ModelSelection;
  appendSystemPrompt?: string[];
  /** Attach the target skill to the Pi session. Defaults to true. */
  attachSkill?: boolean;
}

export const PI_SESSION_TELEMETRY_CUSTOM_TYPE = "arc-skill-eval.telemetry";

export type PiSessionTelemetryKind =
  | "run-start"
  | "tool-call"
  | "tool-result"
  | "skill-read"
  | "bash-command"
  | "file-touch"
  | "external-call";

export interface PiSessionTelemetryToolCall {
  toolCallId: string;
  toolName: string;
  inputSummary?: string;
}

export interface PiSessionTelemetryToolResult {
  toolCallId: string;
  toolName: string;
  isError: boolean;
}

export interface PiSessionTelemetrySkillRead {
  toolCallId: string;
  path: string;
  absolutePath: string;
  skillName: string;
}

export interface PiSessionTelemetryBashCommand {
  toolCallId: string;
  command: string;
  timeout?: number;
}

export interface PiSessionTelemetryFileTouch {
  toolCallId: string;
  toolName: "edit" | "write";
  path: string;
  absolutePath: string;
}

export interface PiSessionExternalCallSummary {
  toolCallId: string;
  system: string;
  operation: string;
  target?: string;
}

export type PiSessionTelemetryExternalCall = PiSessionExternalCallSummary;

export interface PiSessionTelemetryToolInfo {
  name: string;
  source?: string;
  sourcePath?: string;
  sourceScope?: string;
  sourceOrigin?: string;
}

export interface PiSessionTelemetryRunStart {
  kind: PiSdkRunnableCase["kind"];
  relativeSkillDir: string;
  activeTools?: string[];
  allTools?: PiSessionTelemetryToolInfo[];
}

interface PiSessionTelemetryEntryBase<TKind extends PiSessionTelemetryKind, TData> {
  sequence: number;
  timestamp: string;
  kind: TKind;
  skillName: string;
  caseId: string;
  lane: PiSdkCaseLane;
  sessionId: string;
  data: TData;
}

export type PiSessionTelemetryEntry =
  | PiSessionTelemetryEntryBase<"run-start", PiSessionTelemetryRunStart>
  | PiSessionTelemetryEntryBase<"tool-call", PiSessionTelemetryToolCall>
  | PiSessionTelemetryEntryBase<"tool-result", PiSessionTelemetryToolResult>
  | PiSessionTelemetryEntryBase<"skill-read", PiSessionTelemetrySkillRead>
  | PiSessionTelemetryEntryBase<"bash-command", PiSessionTelemetryBashCommand>
  | PiSessionTelemetryEntryBase<"file-touch", PiSessionTelemetryFileTouch>
  | PiSessionTelemetryEntryBase<"external-call", PiSessionExternalCallSummary>;

export interface PiSessionTelemetrySnapshot {
  entries: PiSessionTelemetryEntry[];
  toolCalls: PiSessionTelemetryToolCall[];
  toolResults: PiSessionTelemetryToolResult[];
  skillReads: PiSessionTelemetrySkillRead[];
  bashCommands: string[];
  touchedFiles: PiSessionTelemetryFileTouch[];
  externalCalls: PiSessionTelemetryExternalCall[];
}

export interface PiSdkUsageMetrics {
  model: ModelSelection | null;
  thinkingLevel: ThinkingLevel | null;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
  contextWindowTokens: number | null;
  contextWindowUsedPercent: number | null;
}

export interface PiSdkSessionArtifact {
  sessionId: string;
  sessionFile: string | undefined;
  assistantText: string;
  messages: unknown[];
  events: unknown[];
}

export interface PiSdkCaseCleanupResult {
  fixture: FixtureCleanupResult | null;
  environment: PiSdkRunEnvironmentCleanupResult;
}

export interface PiSdkSkillCleanupResult {
  cases: Array<{
    caseId: string;
    fixture: FixtureCleanupResult | null;
  }>;
  environment: PiSdkRunEnvironmentCleanupResult;
}

export interface PiSdkCaseRunResult {
  source: RepoSourceDescriptor;
  skill: {
    name: string;
    relativeSkillDir: string;
    profile: NormalizedSkillEvalContract["profile"];
    targetTier: NormalizedSkillEvalContract["targetTier"];
  };
  caseDefinition: PiSdkRunnableCase;
  workspaceDir: string;
  agentDir: string;
  sessionDir: string;
  fixture: MaterializedFixtureDetails | null;
  model: ModelSelection | null;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  session: PiSdkSessionArtifact;
  usage: PiSdkUsageMetrics;
  telemetry: PiSessionTelemetrySnapshot | null;
  cleanup: () => Promise<PiSdkCaseCleanupResult>;
}

export interface PiSdkSkillRunResult {
  source: RepoSourceDescriptor;
  skill: ValidatedSkillDiscovery;
  workspaceDir: string;
  agentDir: string;
  sessionDir: string;
  results: PiSdkCaseRunResult[];
  cleanup: () => Promise<PiSdkSkillCleanupResult>;
}

export interface PiCliJsonInvocationOptions {
  cwd: string;
  argv: string[];
  env: NodeJS.ProcessEnv;
}

export interface PiCliJsonInvocationResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
}

export type PiCliJsonInvoker = (
  options: PiCliJsonInvocationOptions,
) => Promise<PiCliJsonInvocationResult>;

export interface RunPiCliJsonCaseOptions {
  source: RepoSourceDescriptor;
  skill: ValidatedSkillDiscovery;
  caseDefinition: PiSdkParityCase;
  workspaceDir?: string;
  model?: ModelSelection;
  appendSystemPrompt?: string[];
  invokeCli?: PiCliJsonInvoker;
}

export interface PiCliJsonCaseCleanupResult {
  fixture: FixtureCleanupResult | null;
}

export interface PiCliJsonCaseRunResult {
  source: RepoSourceDescriptor;
  skill: {
    name: string;
    relativeSkillDir: string;
    profile: NormalizedSkillEvalContract["profile"];
    targetTier: NormalizedSkillEvalContract["targetTier"];
  };
  caseDefinition: PiSdkParityCase;
  workspaceDir: string;
  fixture: MaterializedFixtureDetails | null;
  model: ModelSelection | null;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  session: {
    sessionId: string;
    sessionFile: string | undefined;
    assistantText: string;
    messages: unknown[];
    events: unknown[];
    stderr: string;
    exitCode: number | null;
  };
  cleanup: () => Promise<PiCliJsonCaseCleanupResult>;
}
