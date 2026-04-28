export const SKILL_CATEGORY_VALUES = [
  "planning",
  "repo-mutation",
  "external-api",
  "orchestration",
] as const;

/** @deprecated Use `SKILL_CATEGORY_VALUES` / `SkillCategory`. */
export const PROFILE_VALUES = SKILL_CATEGORY_VALUES;

export const TARGET_TIER_VALUES = [0, 1, 2, 3] as const;

export const CLASSIFICATION_CONFIDENCE_VALUES = [
  "unknown",
  "low",
  "medium",
  "high",
] as const;

export const INFERENCE_SOURCE_VALUES = [
  "author",
  "loader",
  "runtime",
  "default",
] as const;

export const WORKSPACE_KIND_VALUES = ["empty", "seeded", "fixture"] as const;

export const WORKSPACE_MOUNT_MODE_VALUES = [
  "preserve-path",
  "flatten-contents",
] as const;

export const NETWORK_MODE_VALUES = ["none", "mocked", "live"] as const;

export const TOOL_REQUIREMENT_MODE_VALUES = ["real", "shim", "mock"] as const;

export const ENFORCEMENT_VALUES = ["warn", "required"] as const;

export const THINKING_LEVEL_VALUES = [
  "off",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
] as const;

export const FIXTURE_KIND_VALUES = ["repo", "docs", "api"] as const;

export const EXECUTION_LANE_VALUES = ["deterministic"] as const;

export const MUST_PASS_ASSERTION_TYPES = [
  "no-forbidden-files-touched",
  "skill-read-required",
  "no-live-external-calls",
  "no-forbidden-commands",
  "custom",
] as const;

export type SkillCategory = (typeof SKILL_CATEGORY_VALUES)[number];
/** @deprecated Use `SkillCategory`. */
export type SkillProfile = SkillCategory;
export type TargetTier = (typeof TARGET_TIER_VALUES)[number];
export type EnforcementMode = (typeof ENFORCEMENT_VALUES)[number];
export type ThinkingLevel = (typeof THINKING_LEVEL_VALUES)[number];
export type FixtureKind = (typeof FIXTURE_KIND_VALUES)[number];
export type ExecutionLane = (typeof EXECUTION_LANE_VALUES)[number];
export type MustPassAssertionType = (typeof MUST_PASS_ASSERTION_TYPES)[number];
export type ClassificationConfidence = (typeof CLASSIFICATION_CONFIDENCE_VALUES)[number];
export type InferenceSource = (typeof INFERENCE_SOURCE_VALUES)[number];
export type WorkspaceKind = (typeof WORKSPACE_KIND_VALUES)[number];
export type WorkspaceMountMode = (typeof WORKSPACE_MOUNT_MODE_VALUES)[number];
export type NetworkMode = (typeof NETWORK_MODE_VALUES)[number];
export type ToolRequirementMode = (typeof TOOL_REQUIREMENT_MODE_VALUES)[number];

export interface SkillEvalContract {
  skill: string;
  /** @deprecated Use `classification.primary` on `SkillDefinition` for new domain objects. */
  profile: SkillProfile;
  targetTier: TargetTier;
  enforcement?: EnforcementConfig;
  thresholds?: ThresholdConfig;
  model?: ModelSelection;
  overrides?: OverridesConfig;
  routing: RoutingSection;
  execution?: ExecutionCase[];
  cliParity?: ParityCase[];
  liveSmoke?: LiveSmokeCase[];
  rubric?: RubricConfig;
}

export interface NormalizedSkillEvalContract {
  skill: string;
  profile: SkillProfile;
  targetTier: TargetTier;
  enforcement: NormalizedEnforcementConfig;
  thresholds?: ThresholdConfig;
  model?: ModelSelection;
  overrides: NormalizedOverridesConfig;
  routing: NormalizedRoutingSection;
  execution: ExecutionCase[];
  cliParity: ParityCase[];
  liveSmoke: LiveSmokeCase[];
  rubric: NormalizedRubricConfig;
}

export interface EnforcementConfig {
  tier?: EnforcementMode;
  score?: EnforcementMode;
}

export interface NormalizedEnforcementConfig {
  tier: EnforcementMode;
  score: EnforcementMode;
}

export interface ThresholdConfig {
  overall?: number;
  routing?: number;
  execution?: number;
  cliParity?: number;
  liveSmoke?: number;
}

export interface ModelSelection {
  provider: string;
  id: string;
  thinking?: ThinkingLevel;
}

/** Pure routing/reporting label for what a skill is primarily for. */
export interface SkillClassification {
  primary: SkillCategory;
  secondary?: SkillCategory[];
  confidence?: ClassificationConfidence;
  inferred?: boolean;
}

/** Declarative capabilities: what a skill is allowed or expected to do. */
export interface SkillCapabilities {
  readsRepo?: boolean;
  writesRepo?: boolean;
  usesGit?: boolean;
  callsExternalApis?: boolean;
  orchestratesTools?: boolean;
  producesPlan?: boolean;
  validatesOutputs?: boolean;
}

/** Runtime/evaluation policy, separated from classification and capabilities. */
export interface SkillPolicy {
  thinking: ThinkingLevel;
  enforcement: EnforcementMode;
  targetTier: TargetTier;
}

/** Metadata for values inferred by loaders/runtimes instead of declared by authors. */
export interface InferenceMetadata {
  inferred: boolean;
  source: InferenceSource;
  confidence: ClassificationConfidence;
  rationale?: string;
}

/** Environment shape required to run or evaluate a skill. */
export interface EnvironmentRequirements {
  workspace: WorkspaceRequirement;
  git?: GitRequirement;
  network?: NetworkRequirement;
  tools?: ToolRequirement[];
  envVars?: EnvVarRequirement[];
}

export interface WorkspaceRequirement {
  kind: WorkspaceKind;
  writable: boolean;
}

export interface GitRequirement {
  required: boolean;
  needsHistory?: boolean;
  needsBranches?: boolean;
  needsDirtyState?: boolean;
  needsStagedState?: boolean;
  needsTags?: boolean;
}

export interface NetworkRequirement {
  mode: NetworkMode;
  allowedHosts?: string[];
}

export interface ToolRequirement {
  name: string;
  required: boolean;
  mode?: ToolRequirementMode;
}

export interface EnvVarRequirement {
  name: string;
  required: boolean;
  secret?: boolean;
}

/** One composable model for all ways an eval case prepares its workspace. */
export type WorkspaceSetup =
  | EmptyWorkspaceSetup
  | SeededWorkspaceSetup
  | FixtureWorkspaceSetup;

export interface EmptyWorkspaceSetup {
  kind: "empty";
}

export interface SeededWorkspaceSetup {
  kind: "seeded";
  sources: WorkspaceSource[];
  mountMode?: WorkspaceMountMode;
}

export interface FixtureWorkspaceSetup {
  kind: "fixture";
  fixture: FixtureRef;
}

export interface WorkspaceSource {
  from: string;
  to?: string;
}

export interface SkillSource {
  skillMdPath: string;
  skillDir: string;
}

export interface SkillDescriptor {
  id: string;
  name: string;
  description?: string;
  classification: SkillClassification;
  capabilities: SkillCapabilities;
  policy: SkillPolicy;
  environment: EnvironmentRequirements;
  inference?: InferenceMetadata;
}

export interface SkillDefinition<EvalSuiteT = unknown> extends SkillDescriptor {
  source: SkillSource;
  evalSuite?: EvalSuiteT;
}

export interface OverridesConfig {
  weights?: Partial<Record<"trigger" | "process" | "outcome" | "style", number>>;
  expectedSignals?: string[];
  forbiddenSignals?: string[];
}

export interface NormalizedOverridesConfig {
  weights: Partial<Record<"trigger" | "process" | "outcome" | "style", number>>;
  expectedSignals: string[];
  forbiddenSignals: string[];
}

export interface RoutingSection {
  explicit: RoutingCase[];
  implicitPositive: RoutingCase[];
  adjacentNegative: RoutingCase[];
  hardNegative?: RoutingCase[];
}

export interface NormalizedRoutingSection {
  explicit: RoutingCase[];
  implicitPositive: RoutingCase[];
  adjacentNegative: RoutingCase[];
  hardNegative: RoutingCase[];
}

export interface BaseCase {
  id: string;
  prompt: string;
  trialCount?: number;
  expected?: CaseExpected;
  mustPass?: MustPassAssertion[];
  notes?: string;
}

export interface RoutingCase extends BaseCase {}

export interface ExecutionCase extends BaseCase {
  lane?: ExecutionLane;
  fixture?: FixtureRef;
  model?: ModelSelection;
  customAssertions?: CustomAssertionRef[];
}

export interface ParityCase extends BaseCase {
  fixture?: FixtureRef;
}

export interface LiveSmokeCase extends BaseCase {
  fixture?: FixtureRef;
  envRequired: string[];
}

export interface CaseExpected {
  signals?: IncludeExclude;
  tools?: IncludeExclude;
  commands?: IncludeExclude;
  files?: FileExpectations;
  text?: IncludeExclude;
  artifacts?: string[];
}

export interface IncludeExclude {
  include?: string[];
  exclude?: string[];
}

export interface FileExpectations extends IncludeExclude {
  created?: string[];
  edited?: string[];
}

export type MustPassAssertion =
  | NoForbiddenFilesTouchedAssertion
  | SkillReadRequiredAssertion
  | NoLiveExternalCallsAssertion
  | NoForbiddenCommandsAssertion
  | CustomMustPassAssertion;

export interface NoForbiddenFilesTouchedAssertion {
  type: "no-forbidden-files-touched";
  paths: string[];
}

export interface SkillReadRequiredAssertion {
  type: "skill-read-required";
  skill: string;
}

export interface NoLiveExternalCallsAssertion {
  type: "no-live-external-calls";
}

export interface NoForbiddenCommandsAssertion {
  type: "no-forbidden-commands";
  commands: string[];
}

export interface CustomMustPassAssertion {
  type: "custom";
  ref: string;
}

export interface CustomAssertionRef {
  ref: string;
}

export interface FixtureRef {
  kind: FixtureKind;
  source: string;
  initGit?: boolean;
  setup?: string;
  teardown?: string;
  git?: GitFixtureSpec;
  external?: ExternalFixtureSpec;
  env?: Record<string, string>;
}

export interface GitFixtureSpec {
  enabled: boolean;
  defaultBranch?: string;
  currentBranch?: string;
  commits?: GitFixtureCommit[];
  dirtyFiles?: Record<string, string>;
  stagedFiles?: string[];
  remotes?: GitFixtureRemote[];
}

export interface GitFixtureCommit {
  message: string;
  files: Record<string, string>;
  tags?: string[];
}

export interface GitFixtureRemote {
  name: string;
  url: string;
}

export interface ExternalFixtureSpec {
  mockServers?: MockServerFixture[];
  cliShims?: CliShimFixture[];
}

export interface MockServerFixture {
  id: string;
  routesSource: string;
  env?: Record<string, string>;
}

export interface CliShimFixture {
  command: string;
  script: string;
}

export interface RubricConfig {
  enabled: boolean;
  prompts?: string[];
}

export interface NormalizedRubricConfig {
  enabled: boolean;
  prompts: string[];
}

export interface ValidationIssue {
  path: string;
  code: string;
  message: string;
}

export type ValidationResult<T> =
  | { ok: true; value: T; issues: [] }
  | { ok: false; issues: ValidationIssue[] };
