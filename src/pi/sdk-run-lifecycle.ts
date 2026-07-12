import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { materializeFixture, type MaterializedFixture } from "../fixtures/index.js";
import type { ValidatedSkillDiscovery } from "../load/source-types.js";
import type {
  CreatePiSdkRunEnvironmentOptions,
  PiSdkCaseCleanupResult,
  PiSdkCaseRunResult,
  PiSdkRunEnvironment,
  PiSdkSkillCleanupResult,
  PiSdkRunnableCase,
} from "./types.js";
import { snapshotValue } from "./sdk-run-observation.js";

/** Internal owner for Pi run environment, fixture, and idempotent cleanup lifecycle. */
export async function createPiSdkRunEnvironment(
  options: CreatePiSdkRunEnvironmentOptions,
): Promise<PiSdkRunEnvironment> {
  const workspaceDir = path.resolve(options.workspaceDir);
  const agentDir = options.agentDir ? path.resolve(options.agentDir) : await mkdtemp(path.join(tmpdir(), "arc-skill-eval-pi-"));
  const sessionDir = options.sessionDir ? path.resolve(options.sessionDir) : path.join(agentDir, "sessions");
  const ownsAgentDir = options.agentDir === undefined;
  let cleaned = false;

  await mkdir(agentDir, { recursive: true });
  await mkdir(sessionDir, { recursive: true });

  return {
    workspaceDir,
    agentDir,
    sessionDir,
    cleanup: async () => {
      if (!ownsAgentDir || cleaned) {
        return { agentDirRemoved: false };
      }

      await rm(agentDir, { recursive: true, force: true });
      cleaned = true;

      return { agentDirRemoved: true };
    },
  };
}

export async function maybeMaterializeCaseFixture(
  skill: ValidatedSkillDiscovery,
  caseDefinition: PiSdkRunnableCase,
): Promise<MaterializedFixture | null> {
  if (caseDefinition.kind === "routing") {
    return null;
  }

  const fixture = caseDefinition.definition.fixture;

  if (!fixture) {
    return null;
  }

  return await materializeFixture({
    skillFiles: skill.files,
    fixture,
  });
}

export function createCaseCleanup(
  environment: PiSdkRunEnvironment,
  materializedFixture: MaterializedFixture | null,
): () => Promise<PiSdkCaseCleanupResult> {
  let cleanupPromise: Promise<PiSdkCaseCleanupResult> | undefined;

  return async () => {
    cleanupPromise ??= (async () => {
      const fixture = materializedFixture ? await materializedFixture.cleanup() : null;
      const environmentResult = await environment.cleanup();
      return {
        fixture,
        environment: environmentResult,
      };
    })();

    return await cleanupPromise;
  };
}

export function createSkillCleanup(
  results: PiSdkCaseRunResult[],
  environment: PiSdkRunEnvironment,
): () => Promise<PiSdkSkillCleanupResult> {
  let cleanupPromise: Promise<PiSdkSkillCleanupResult> | undefined;

  return async () => {
    cleanupPromise ??= (async () => {
      const cases: PiSdkSkillCleanupResult["cases"] = [];
      let agentDirRemoved = false;

      for (const result of results) {
        const caseCleanup = await result.cleanup();
        cases.push({
          caseId: result.caseDefinition.caseId,
          fixture: caseCleanup.fixture,
        });
        agentDirRemoved ||= caseCleanup.environment.agentDirRemoved;
      }

      if (!agentDirRemoved) {
        agentDirRemoved = (await environment.cleanup()).agentDirRemoved;
      }

      return {
        cases,
        environment: { agentDirRemoved },
      };
    })();

    return await cleanupPromise;
  };
}

export function snapshotFixture(materializedFixture: MaterializedFixture | null): PiSdkCaseRunResult["fixture"] {
  if (!materializedFixture) {
    return null;
  }

  return {
    kind: materializedFixture.kind,
    sourcePath: materializedFixture.sourcePath,
    workspaceDir: materializedFixture.workspaceDir,
    env: snapshotValue(materializedFixture.env),
    setup: snapshotValue(materializedFixture.setup),
    git: snapshotValue(materializedFixture.git),
    external: snapshotValue(materializedFixture.external),
    initialSnapshot: snapshotValue(materializedFixture.initialSnapshot),
  };
}
