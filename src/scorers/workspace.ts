import type { MaterializedFixtureDetails, WorkspaceSnapshot } from "../fixtures/types.js";
import { captureWorkspaceSnapshot } from "../fixtures/workspace-snapshot.js";
import type { PiSdkCaseRunResult } from "../pi/types.js";
import type { DeterministicWorkspaceContext } from "./types.js";

export async function captureCurrentWorkspaceSnapshot(workspaceDir: string): Promise<WorkspaceSnapshot> {
  return await captureWorkspaceSnapshot(workspaceDir);
}

export function createWorkspaceContext(options: {
  workspaceDir: string;
  fixture?: MaterializedFixtureDetails | null;
  initialSnapshot?: WorkspaceSnapshot | null;
}): DeterministicWorkspaceContext {
  return {
    workspaceDir: options.workspaceDir,
    fixture: options.fixture ?? null,
    initialSnapshot: options.initialSnapshot ?? options.fixture?.initialSnapshot ?? null,
  };
}

export function createWorkspaceContextFromPiSdkCaseResult(result: PiSdkCaseRunResult): DeterministicWorkspaceContext {
  return createWorkspaceContext({
    workspaceDir: result.workspaceDir,
    fixture: result.fixture,
    initialSnapshot: result.fixture?.initialSnapshot ?? null,
  });
}
