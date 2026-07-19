// Default AgentRuntime: translates protocol-neutral eval input into the
// eval-native Pi runner, then forwards to runPiSdkEvalCase.

import { runPiSdkEvalCase } from "../pi/sdk-runner.js";
import { toPiSdkEvalCaseOptions } from "../pi/sdk-eval-case.js";

import type { AgentRuntime } from "./types.js";

export const piSdkRuntime: AgentRuntime = {
  id: "pi-sdk",
  runCase: (options) => runPiSdkEvalCase(toPiSdkEvalCaseOptions(options)),
};

export { toPiSdkEvalCaseOptions } from "../pi/sdk-eval-case.js";
