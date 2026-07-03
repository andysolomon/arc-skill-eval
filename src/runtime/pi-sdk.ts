// Default AgentRuntime: Pi's SDK runner, unchanged. The implementation stays
// in src/pi/sdk-runner.ts — this adapter only gives it the runtime identity
// the eval pipeline records in trace identity.

import { runPiSdkCase } from "../pi/sdk-runner.js";
import type { AgentRuntime } from "./types.js";

export const piSdkRuntime: AgentRuntime = {
  id: "pi-sdk",
  runCase: (options) => runPiSdkCase(options),
};
