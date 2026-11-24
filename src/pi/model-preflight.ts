import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";

import { VERSION as BUNDLED_PI_SDK_VERSION } from "@earendil-works/pi-coding-agent";

import type { ModelSelection } from "../contracts/types.js";
import { createPiSessionBootstrap, describeUnresolvedModel } from "./session-adapter.js";

export interface PiModelPreflightOptions {
  agentDir?: string;
  model?: ModelSelection;
  judgeModel?: ModelSelection;
}

/**
 * This does not send a request, so a model the provider rejects at request
 * time (e.g. `model_not_found` for the account) still surfaces per case.
 */
export async function preflightPiModels(options: PiModelPreflightOptions): Promise<string[]> {
  const bootstrap = await createPiSessionBootstrap({
    runtimeDir: tmpdir(),
    credentialsAgentDir: options.agentDir,
  });
  const { modelRuntime, settingsManager } = bootstrap;

  const defaultProvider = settingsManager.getDefaultProvider();
  const defaultModel = settingsManager.getDefaultModel();
  const runner = options.model ?? (defaultProvider && defaultModel ? { provider: defaultProvider, id: defaultModel } : undefined);

  const checks: Array<{ role: "runner" | "judge"; selection: ModelSelection }> = [];
  if (runner) checks.push({ role: "runner", selection: runner });
  if (options.judgeModel && !sameModel(options.judgeModel, runner)) {
    checks.push({ role: "judge", selection: options.judgeModel });
  }

  const issues: string[] = [];
  for (const { role, selection } of checks) {
    const model = modelRuntime.getModel(selection.provider, selection.id);
    if (!model) {
      issues.push(`${capitalize(role)} model: ${describeUnresolvedModel(modelRuntime, selection)}`);
      continue;
    }
    const authProblem = await findAuthProblem(modelRuntime, model);
    if (authProblem !== null) {
      issues.push(
        `${capitalize(role)} model ${selection.provider}/${selection.id}: no credentials configured for provider ` +
          `"${selection.provider}" in ${bootstrap.credentialsAgentDir}${authProblem ? ` (${authProblem})` : ""}. ` +
          "Log in with `pi` (/login), or set the provider's API key environment variable.",
      );
    }
  }
  return issues;
}

/**
 * A warning when the `pi` CLI on PATH is a different major version than the
 * Pi SDK bundled with arc-skill-eval, or null when they match or no CLI is
 * found. Model catalogs, providers, and auth can differ across majors.
 */
export function detectPiCliVersionSkew(): string | null {
  const result = spawnSync("pi", ["--version"], {
    encoding: "utf8",
    timeout: 3_000,
    stdio: ["ignore", "pipe", "ignore"],
  });
  if (result.error || result.status !== 0) return null;
  const cliVersion = /\d+\.\d+\.\d+/u.exec(result.stdout)?.[0];
  if (!cliVersion || majorVersion(cliVersion) === majorVersion(BUNDLED_PI_SDK_VERSION)) return null;

  return `Warning: Pi CLI ${cliVersion} on PATH and the bundled Pi SDK ${BUNDLED_PI_SDK_VERSION} are different major versions. ` +
    "Their model catalogs and providers can differ, so a model that works in `pi` may not resolve here. " +
    "Update arc-skill-eval or your Pi CLI so the major versions match.";
}

async function findAuthProblem(
  modelRuntime: Awaited<ReturnType<typeof createPiSessionBootstrap>>["modelRuntime"],
  model: NonNullable<ReturnType<typeof modelRuntime.getModel>>,
): Promise<string | null> {
  try {
    return (await modelRuntime.getAuth(model)) ? null : "";
  } catch (error) {
    // e.g. models.json references an API-key environment variable that isn't set.
    return error instanceof Error ? error.message : String(error);
  }
}

function majorVersion(version: string): string {
  return version.split(".")[0] ?? version;
}

function sameModel(a: ModelSelection, b: ModelSelection | undefined): boolean {
  return b !== undefined && a.provider === b.provider && a.id === b.id;
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
