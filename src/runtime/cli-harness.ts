import type { ModelSelection, SandboxMode } from "../contracts/types.js";

import { buildRedactedStderrPreview } from "./cli-redact.js";

export function assertCliHarnessSandboxSupported(runtimeId: string, sandbox?: SandboxMode): void {
  if (sandbox === undefined || sandbox === "none") {
    return;
  }
  throw new Error(
    `Runtime "${runtimeId}" does not support --sandbox ${sandbox}; omit --sandbox or use --runtime pi-sdk.`,
  );
}

export function buildCliHarnessFailureMessage(
  harnessLabel: string,
  caseId: string,
  exitCode: number,
  stderr: string,
): string {
  const preview = buildRedactedStderrPreview(stderr);
  const base = `${harnessLabel} run failed for case ${caseId} (exit ${exitCode}).`;
  return preview.length > 0 ? `${base} stderr: ${preview}` : base;
}

export function harnessUsageModel(model?: ModelSelection | null): ModelSelection | null {
  return model ?? null;
}
