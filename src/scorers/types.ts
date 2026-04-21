import type {
  EnforcementMode,
  NormalizedSkillEvalContract,
  ThresholdConfig,
} from "../contracts/types.js";
import type { MaterializedFixtureDetails, WorkspaceSnapshot } from "../fixtures/types.js";
import type { DiscoveredSkillFiles } from "../load/source-types.js";
import type { PiSdkRunnableCase } from "../pi/types.js";
import type { EvalTrace } from "../traces/types.js";

export const SCORE_DIMENSIONS = ["trigger", "process", "outcome", "style"] as const;
export const DETERMINISTIC_LANE_FAMILIES = ["routing", "execution"] as const;

export type ScoreDimension = (typeof SCORE_DIMENSIONS)[number];
export type DeterministicLaneFamily = (typeof DETERMINISTIC_LANE_FAMILIES)[number];
export type ExecutionStatus = "completed" | "failed";
export type ThresholdStatus = "passed" | "warn" | "failed" | "not_applicable";

export type ScoreWeights = Record<ScoreDimension, number>;

export interface CanonicalSignalsSnapshot {
  values: string[];
  matched: Record<string, true>;
}

export interface DeterministicWorkspaceContext {
  workspaceDir: string;
  fixture: MaterializedFixtureDetails | null;
  initialSnapshot: WorkspaceSnapshot | null;
}

export interface DeterministicCaseScoreInput {
  contract: NormalizedSkillEvalContract;
  caseDefinition: PiSdkRunnableCase;
  trace: EvalTrace;
  workspace?: DeterministicWorkspaceContext;
  skillFiles?: DiscoveredSkillFiles;
  executionStatus?: ExecutionStatus;
}

export interface DeterministicSkillScoreCaseInput {
  caseDefinition: PiSdkRunnableCase;
  trace: EvalTrace;
  workspace?: DeterministicWorkspaceContext;
  executionStatus?: ExecutionStatus;
}

export interface DeterministicSkillScoreInput {
  contract: NormalizedSkillEvalContract;
  cases: DeterministicSkillScoreCaseInput[];
  skillFiles?: DiscoveredSkillFiles;
}

export interface ScoreCheckResult {
  code: string;
  label: string;
  passed: boolean;
  score: number;
  message: string;
  expected?: unknown;
  actual?: unknown;
  details?: Record<string, unknown>;
}

export interface HardAssertionResult {
  type: string;
  passed: boolean;
  message: string;
  details?: Record<string, unknown>;
}

export interface ScoreDimensionResult {
  dimension: ScoreDimension;
  applicable: boolean;
  weight: number;
  checkCount: number;
  score: number | null;
  scorePercent: number | null;
  checks: ScoreCheckResult[];
}

export interface DeterministicCaseScoreResult {
  caseId: string;
  lane: PiSdkRunnableCase["lane"];
  kind: PiSdkRunnableCase["kind"];
  executionStatus: ExecutionStatus;
  hardPassed: boolean;
  passed: boolean;
  score: number | null;
  scorePercent: number | null;
  dimensions: Record<ScoreDimension, ScoreDimensionResult>;
  hardAssertions: HardAssertionResult[];
  signals: CanonicalSignalsSnapshot;
  deferredExpectations: string[];
}

export interface AggregateScoreSummary {
  lane: DeterministicLaneFamily | "overall";
  caseCount: number;
  scoredCaseCount: number;
  passedCaseCount: number;
  failedCaseCount: number;
  score: number | null;
  scorePercent: number | null;
  threshold: number | null;
  thresholdPercent: number | null;
  thresholdPassed: boolean | null;
  enforcement: EnforcementMode;
  status: ThresholdStatus;
}

export interface DeterministicSkillScoreResult {
  skill: Pick<NormalizedSkillEvalContract, "skill" | "profile" | "targetTier">;
  weights: ScoreWeights;
  thresholds: ThresholdConfig | undefined;
  cases: DeterministicCaseScoreResult[];
  lanes: {
    routing: AggregateScoreSummary;
    execution: AggregateScoreSummary;
    overall: AggregateScoreSummary;
  };
}

export interface CustomAssertionContext {
  trace: EvalTrace;
  workspaceDir: string;
  fixture: MaterializedFixtureDetails | null;
}

export interface CustomAssertionOutcome {
  pass: boolean;
  score?: number;
  message: string;
  details?: Record<string, unknown>;
}

export type CustomAssertion = (ctx: CustomAssertionContext) => Promise<CustomAssertionOutcome>;
