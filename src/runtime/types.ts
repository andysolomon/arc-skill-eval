// AgentRuntime — the seam between the eval pipeline (run-case, grading,
// artifacts) and whatever agent actually executes a case. Pi's SDK runner is
// the default implementation; the interface exists so alternative runtimes
// (deterministic replay, a future OpenAI-compatible custom agent) can run
// behind the exact same eval contract and artifact pipeline.
//
// The option/result shapes are aliases of the Pi runner's contract, not
// parallel copies: run-case consumes precisely this shape today, and aliasing
// keeps the two from drifting. If a future runtime cannot satisfy a field,
// that is the moment to introduce a runtime-neutral type — not before.

import type { PiSdkSessionFactory } from "../pi/sdk-runner.js";
import type { PiSdkCaseRunResult, RunPiSdkCaseOptions as PiRunCaseOptions } from "../pi/types.js";
import type { EvalTraceRuntime } from "../traces/types.js";

export type RuntimeCaseOptions = PiRunCaseOptions & {
  /** Test-injection hook honored by the Pi runtime; others may ignore it. */
  createSession?: PiSdkSessionFactory;
};

export type RuntimeCaseResult = PiSdkCaseRunResult;

export interface AgentRuntime {
  /** Recorded in trace identity (`trace.identity.runtime`). */
  id: EvalTraceRuntime;
  runCase(options: RuntimeCaseOptions): Promise<RuntimeCaseResult>;
}
