import { CliUsageError } from "./types.js";

export interface LaminarConfig {
  apiKey: string;
  baseUrl?: string;
  projectName?: string;
}

export function resolveLaminarConfig(opts: {
  enabled: boolean | undefined;
  env: NodeJS.ProcessEnv;
}): LaminarConfig | undefined {
  if (!opts.enabled) return undefined;

  const apiKey = opts.env.LMNR_PROJECT_API_KEY;
  if (!apiKey) {
    throw new CliUsageError(
      "--laminar requires the LMNR_PROJECT_API_KEY environment variable to be set.",
    );
  }

  return {
    apiKey,
    baseUrl: opts.env.LMNR_BASE_URL || undefined,
    projectName: opts.env.LMNR_PROJECT_NAME || undefined,
  };
}
