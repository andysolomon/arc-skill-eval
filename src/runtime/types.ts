// AgentRuntime — the protocol-neutral seam between eval orchestration
// (run-case, grading, artifacts) and whatever agent executes a case.
//
// Invariants:
// - Standard eval input carries real identity/prompt/skill/files plus
//   execution options only — no NormalizedSkillEvalContract, Pi kind/lane,
//   profile, targetTier, or routing placeholders.
// - Pi-specific compatibility metadata is synthesized exclusively in
//   src/pi/sdk-eval-case.ts before calling runPiSdkCase.
// - RuntimeCaseResult remains the Pi result shape so trace/replay/artifact
//   consumers stay compatible without a persisted-schema migration.
// - createSession is a focused Pi test-injection hook; non-Pi runtimes may
//   ignore it.

import type {
  ModelSelection,
  SandboxCommandMock,
  SandboxMode,
} from "../contracts/types.js";
import type { RepoSourceDescriptor } from "../load/source-types.js";
import type { EvalContextMode } from "../observability/types.js";
import type { PiSdkSessionFactory } from "../pi/sdk-runner.js";
import type { PiSdkCaseRunResult } from "../pi/types.js";
import type { EvalTraceRuntime } from "../traces/types.js";

/** Discovered skill identity needed to execute a standard eval case. */
export interface RuntimeSkillIdentity {
  name: string;
  skillDir: string;
  relativeSkillDir: string;
  skillDefinitionPath: string;
  /** Path to evals.json (or legacy eval definition) for logging / fixtures. */
  evalDefinitionPath: string;
}

/**
 * Eval-native execution case: real case id + prompt + skill name.
 * No Pi lane/kind and no normalized-contract fields.
 */
export interface RuntimeExecutionCase {
  caseId: string;
  prompt: string;
  skillName: string;
}

/**
 * Protocol-neutral options for {@link AgentRuntime.runCase}.
 * Pi translation happens only inside the Pi SDK adapter.
 */
export interface RuntimeCaseOptions {
  source: RepoSourceDescriptor;
  skill: RuntimeSkillIdentity;
  case: RuntimeExecutionCase;
  workspaceDir: string;
  agentDir?: string;
  model?: ModelSelection;
  /** Attach the target skill to the session. Defaults to true for Pi. */
  attachSkill?: boolean;
  /** Additional explicit skill paths to load as conflict/distractor context. */
  extraSkillPaths?: string[];
  /** Context isolation mode. Defaults to isolated for Pi. */
  contextMode?: EvalContextMode;
  /** Execution isolation mode. Defaults to "none". */
  sandbox?: SandboxMode;
  /** Deterministic external-command mocks for the just-bash sandbox. */
  sandboxMocks?: SandboxCommandMock[];
  /** Test-injection hook honored by the Pi runtime; others may ignore it. */
  createSession?: PiSdkSessionFactory;
}

/** Compatible with existing timing/trace/manifest/tool-summary assembly. */
export type RuntimeCaseResult = PiSdkCaseRunResult;

export interface AgentRuntime {
  /** Recorded in trace identity (`trace.identity.runtime`). */
  id: EvalTraceRuntime;
  runCase(options: RuntimeCaseOptions): Promise<RuntimeCaseResult>;
}
