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

export interface RuntimeSkillIdentity {
  name: string;
  skillDir: string;
  relativeSkillDir: string;
  skillDefinitionPath: string;
  evalDefinitionPath: string;
}

export interface RuntimeExecutionCase {
  caseId: string;
  prompt: string;
  skillName: string;
}

export interface RuntimeCaseOptions {
  source: RepoSourceDescriptor;
  skill: RuntimeSkillIdentity;
  case: RuntimeExecutionCase;
  workspaceDir: string;
  workspaceEnv?: Record<string, string>;
  agentDir?: string;
  model?: ModelSelection;
  /** Attach the target skill to the session. Defaults to true for Pi. */
  attachSkill?: boolean;
  extraSkillPaths?: string[];
  /** Context isolation mode. Defaults to isolated for Pi. */
  contextMode?: EvalContextMode;
  /** Execution isolation mode. Defaults to "none". */
  sandbox?: SandboxMode;
  sandboxMocks?: SandboxCommandMock[];
  createSession?: PiSdkSessionFactory;
  /**
   * Aborted when the case times out or the run is cancelled. Runtimes stop
   * their agent (kill the CLI child / abort the Pi session) and release any
   * resources acquired so far.
   */
  signal?: AbortSignal;
}

export type RuntimeCaseResult = PiSdkCaseRunResult;

export interface AgentRuntime {
  /** Recorded in trace identity (`trace.identity.runtime`). */
  id: EvalTraceRuntime;
  runCase(options: RuntimeCaseOptions): Promise<RuntimeCaseResult>;
}
