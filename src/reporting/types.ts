import type { TargetTier } from "../contracts/types.js";
import type { ValidationIssue } from "../contracts/types.js";
import type { RepoSourceDescriptor, DiscoveredSkillFiles } from "../load/source-types.js";
import type {
  DeterministicSkillScoreResult,
  DeterministicCaseScoreResult,
  ThresholdStatus,
} from "../scorers/types.js";
import type {
  EvalTrace,
  EvalTraceIdentity,
  EvalTraceObservations,
  EvalTraceTiming,
} from "../traces/types.js";

export const ARC_SKILL_EVAL_REPORT_VERSION = "1";

export type ArcSkillEvalReportStatus = "passed" | "warn" | "failed" | "partial";
export type ReportIssueSeverity = "info" | "warn" | "error";

export interface ReportFrameworkInfo {
  name: "arc-skill-eval";
  version: string | null;
}

export interface ReportRunIssue {
  code: string;
  message: string;
  severity: ReportIssueSeverity;
  details?: Record<string, unknown>;
}

export interface ReportTraceRawSummary {
  sessionId: string;
  sessionFile: string | undefined;
  messageCount: number;
  sdkEventCount: number;
  telemetryEntryCount: number;
  hasMessages: boolean;
  hasSdkEvents: boolean;
  hasTelemetryEntries: boolean;
}

export interface ReportTraceEntry {
  traceId: string;
  skill: string;
  caseId: string;
  kind: EvalTraceIdentity["case"]["kind"];
  lane: EvalTraceIdentity["case"]["lane"];
  identity: EvalTraceIdentity;
  timing: EvalTraceTiming;
  observations: EvalTraceObservations;
  raw: ReportTraceRawSummary;
}

export interface ReportTrialStats {
  trialCount: 1;
  completedTrialCount: 0 | 1;
  failedTrialCount: 0 | 1;
  aggregated: false;
  aggregationMethod: null;
}

export interface ReportTierSummary {
  targetTier: TargetTier;
  achievedTier: TargetTier | null;
  status: "not_computed";
}

export interface ReportBaselineSummary {
  status: "not_configured";
}

export interface ReportCaseEntry extends DeterministicCaseScoreResult {
  status: "passed" | "failed";
  traceRef: string;
  trialStats: ReportTrialStats;
  model: EvalTraceIdentity["model"];
}

export interface ReportSkillEntry {
  skill: string;
  relativeSkillDir: string;
  profile: DeterministicSkillScoreResult["skill"]["profile"];
  targetTier: TargetTier;
  status: ArcSkillEvalReportStatus;
  weights: DeterministicSkillScoreResult["weights"];
  thresholds: DeterministicSkillScoreResult["thresholds"] | null;
  tier: ReportTierSummary;
  baseline: ReportBaselineSummary;
  models: Array<EvalTraceIdentity["model"]>;
  lanes: DeterministicSkillScoreResult["lanes"];
  cases: ReportCaseEntry[];
}

export interface ReportInvalidSkillEntry {
  skill: string;
  relativeSkillDir: string;
  skillDefinitionPath: string;
  evalDefinitionPath: string;
  issues: ValidationIssue[];
}

export interface ReportSummary {
  discoveredSkillCount: number;
  validSkillCount: number;
  invalidSkillCount: number;
  scoredSkillCount: number;
  caseCount: number;
  passedCaseCount: number;
  failedCaseCount: number;
  skillStatusCounts: Record<ArcSkillEvalReportStatus, number>;
  caseStatusCounts: {
    passed: number;
    failed: number;
  };
  laneStatusCounts: Record<ThresholdStatus, number>;
}

export interface ArcSkillEvalJsonReport {
  reportVersion: typeof ARC_SKILL_EVAL_REPORT_VERSION;
  generatedAt: string;
  runId: string;
  framework: ReportFrameworkInfo;
  source: RepoSourceDescriptor;
  status: ArcSkillEvalReportStatus;
  summary: ReportSummary;
  runIssues: ReportRunIssue[];
  invalidSkills: ReportInvalidSkillEntry[];
  skills: ReportSkillEntry[];
  traces: ReportTraceEntry[];
}

export interface BuildReportSkillInput {
  files: DiscoveredSkillFiles;
  score: DeterministicSkillScoreResult;
  traces: EvalTrace[];
}

export interface BuildInvalidSkillInput {
  files: DiscoveredSkillFiles;
  issues: ValidationIssue[];
}

export interface BuildJsonReportInput {
  source: RepoSourceDescriptor;
  skills: BuildReportSkillInput[];
  invalidSkills?: BuildInvalidSkillInput[];
  runIssues?: ReportRunIssue[];
  generatedAt?: string;
  runId?: string;
  frameworkVersion?: string | null;
  partial?: boolean;
  status?: ArcSkillEvalReportStatus;
}
