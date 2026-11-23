/**
 * Runs the daemon started, kept in memory, and the frames it streams over
 * `ws://…/runs/<runId>`:
 *
 * - `run.snapshot`  { run: { runId, status, progress: [row] }, ...summary }
 *                   sent first on every connection; carries the summary
 *                   fields of `run.completed` once the run has completed.
 * - `case.progress` { caseId, phase, assertionsPassed, assertionsFailed,
 *                   totalAssertions, error? } one per case state change.
 * - `run.completed` { passed, total, cost, exitCode, artifactPath,
 *                   withSkill?, withoutSkill?, delta? }
 * - `run.cancelled` { message }
 * - `run.failed`    { message }
 */

import { randomUUID } from "node:crypto";

const runs = new Map();
const listeners = new Map();

function emit(runId, frame) {
  for (const listener of listeners.get(runId) ?? []) {
    listener(frame);
  }
}

function publicRun(run) {
  return {
    runId: run.runId,
    startedAt: run.startedAt,
    status: run.status,
    workspaceRoot: run.workspaceRoot,
    options: run.options,
    progress: [...run.rows.values()],
    ...(run.summary ? { summary: run.summary } : {}),
    ...(run.error ? { error: run.error } : {}),
  };
}

export function createRun({ workspaceRoot, options }) {
  const run = {
    runId: randomUUID(),
    startedAt: new Date().toISOString(),
    status: "running",
    workspaceRoot,
    options,
    rows: new Map(),
    summary: null,
    error: null,
    terminalFrame: null,
  };
  runs.set(run.runId, run);
  return run.runId;
}

export function getRun(runId) {
  const run = runs.get(runId);
  return run ? { ...publicRun(run), terminalFrame: run.terminalFrame } : null;
}

export function snapshotFrame(run) {
  return {
    type: "run.snapshot",
    run: {
      runId: run.runId,
      status: run.status,
      startedAt: run.startedAt,
      progress: run.progress,
    },
    ...(run.summary ?? {}),
  };
}

export function updateCase(runId, row) {
  const run = runs.get(runId);
  if (!run || run.status !== "running") {
    return;
  }

  const frame = { type: "case.progress", runId, at: new Date().toISOString(), ...row };
  run.rows.set(row.caseId, frame);
  emit(runId, frame);
}

function finish(runId, status, frame, fields = {}) {
  const run = runs.get(runId);
  if (!run || run.status !== "running") {
    return;
  }

  run.status = status;
  run.finishedAt = new Date().toISOString();
  Object.assign(run, fields);
  run.terminalFrame = { runId, at: run.finishedAt, ...frame };
  emit(runId, run.terminalFrame);
}

export function completeRun(runId, summary) {
  finish(runId, "completed", { type: "run.completed", ...summary }, { summary });
}

export function cancelRun(runId, message = "Run cancelled. The in-flight case was stopped.") {
  finish(runId, "cancelled", { type: "run.cancelled", message });
}

export function failRun(runId, message) {
  finish(runId, "failed", { type: "run.failed", message }, { error: message });
}

export function subscribeToRun(runId, listener) {
  if (!listeners.has(runId)) {
    listeners.set(runId, new Set());
  }

  const runListeners = listeners.get(runId);
  runListeners.add(listener);

  return () => {
    runListeners.delete(listener);
    if (runListeners.size === 0) {
      listeners.delete(runId);
    }
  };
}
