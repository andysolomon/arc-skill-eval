import { randomUUID } from "node:crypto";

const runs = new Map();
const listeners = new Map();

function cloneRun(run) {
  return {
    ...run,
    cases: [...run.cases],
    progress: [...run.progress],
  };
}

function emit(runId, event) {
  const runListeners = listeners.get(runId);
  if (!runListeners) {
    return;
  }

  for (const listener of runListeners) {
    listener(event);
  }
}

export function createRun(input = {}) {
  const runId = randomUUID();
  const startedAt = new Date().toISOString();
  const run = {
    runId,
    startedAt,
    status: "running",
    cases: input.case ? [input.case] : [],
    workspaceRoot: input.workspaceRoot,
    options: {
      case: input.case ?? null,
      model: input.model ?? null,
      judgeModel: input.judgeModel ?? null,
      compare: Boolean(input.compare),
      extraSkill: input.extraSkill ?? null,
      iteration: input.iteration ?? null,
      contextMode: input.contextMode ?? null,
      sandbox: input.sandbox ?? null,
    },
    progress: [],
  };

  runs.set(runId, run);
  appendProgress(runId, {
    type: "run.started",
    message: "Run accepted by daemon",
    at: startedAt,
  });

  return cloneRun(run);
}

export function getRun(runId) {
  const run = runs.get(runId);
  return run ? cloneRun(run) : null;
}

export function appendProgress(runId, progress) {
  const run = runs.get(runId);
  if (!run) {
    return null;
  }

  const event = {
    runId,
    at: new Date().toISOString(),
    ...progress,
  };

  run.progress.push(event);
  emit(runId, event);
  return event;
}

export function completeRun(runId, progress = {}) {
  const run = runs.get(runId);
  if (!run) {
    return null;
  }

  run.status = "completed";
  run.completedAt = new Date().toISOString();
  appendProgress(runId, {
    type: "run.completed",
    message: "Run completed",
    ...progress,
  });

  return cloneRun(run);
}

export function cancelRun(runId, progress = {}) {
  const run = runs.get(runId);
  if (!run) {
    return null;
  }

  run.status = "cancelled";
  run.cancelledAt = new Date().toISOString();
  appendProgress(runId, {
    type: "run.cancelled",
    message: "Run cancelled",
    ...progress,
  });

  return cloneRun(run);
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
