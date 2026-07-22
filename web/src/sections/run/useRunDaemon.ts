import { useCallback, useEffect, useRef } from 'react';
import {
  useRunLifecycle,
  type BenchmarkSummary,
  type ProgressRow,
} from '@/state/runLifecycle';
import { writeLastRunIdPreference } from './WorkspacePicker';

export type CompareMode = 'off' | 'with' | 'on';
export type ContextMode = 'isolated' | 'ambient';
export type SandboxMode = 'none' | 'just-bash';

export type RunComposerState = {
  workspaceRoot: string;
  case: string;
  model: string;
  judgeModel: string;
  compare: CompareMode;
  extraSkill: string[];
  iteration: number;
  contextMode: ContextMode;
  sandbox: SandboxMode;
};

type RunStartResponse = {
  runId?: string;
  id?: string;
  wsUrl?: string;
  websocketUrl?: string;
};

type RunEvent = {
  type?: string;
  runId?: string;
  message?: string;
  at?: string;
  caseId?: string;
  case?: string;
  id?: string;
  iteration?: number;
  assertionsPassed?: number;
  passed?: number;
  assertionsFailed?: number;
  failed?: number;
  totalAssertions?: number;
  assertionsTotal?: number;
  total?: number;
  cost?: number;
  costUsd?: number;
  delta?: number;
  exitCode?: number;
  artifactPath?: string;
  withSkill?: number;
  withoutSkill?: number;
  run?: {
    runId?: string;
    status?: string;
    progress?: RunEvent[];
  };
};

const DAEMON_RUNS_URL = 'http://localhost:7357/runs';

const toNumber = (value: unknown, fallback = 0): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

const parseMessage = (data: string): RunEvent | null => {
  try {
    const parsed = JSON.parse(data) as unknown;
    return typeof parsed === 'object' && parsed !== null ? (parsed as RunEvent) : null;
  } catch {
    return null;
  }
};

const parseWebSocketUrl = (wsUrl: string): string => {
  const parsed = new URL(wsUrl, DAEMON_RUNS_URL);

  if (parsed.protocol === 'http:') {
    parsed.protocol = 'ws:';
  }

  if (parsed.protocol === 'https:') {
    parsed.protocol = 'wss:';
  }

  return parsed.toString();
};

const toProgressRow = (event: RunEvent, fallbackCaseId: string): ProgressRow => {
  const caseId = event.caseId ?? event.case ?? event.id ?? fallbackCaseId;
  const assertionsPassed = toNumber(event.assertionsPassed ?? event.passed);
  const assertionsFailed = toNumber(event.assertionsFailed ?? event.failed);
  const totalAssertions = toNumber(
    event.totalAssertions ?? event.assertionsTotal ?? event.total,
    assertionsPassed + assertionsFailed,
  );

  return {
    id: `${caseId}-${event.iteration ?? event.at ?? event.type ?? 'progress'}`,
    caseId,
    assertionsPassed,
    assertionsFailed,
    totalAssertions,
    iteration: event.iteration,
    message: event.message ?? event.type,
    at: event.at,
  };
};

const toBenchmark = (
  event: RunEvent,
  runId: string,
  currentRows: ProgressRow[],
): BenchmarkSummary => {
  const total = toNumber(event.total, currentRows.length);
  const passed = toNumber(
    event.passed,
    currentRows.filter((row) => row.assertionsFailed === 0).length,
  );

  return {
    passed,
    total,
    cost: toNumber(event.cost ?? event.costUsd),
    delta: typeof event.delta === 'number' ? event.delta : undefined,
    exitCode: toNumber(event.exitCode),
    artifactPath: event.artifactPath ?? `evals-runs/${runId}`,
    withSkill: typeof event.withSkill === 'number' ? event.withSkill : undefined,
    withoutSkill: typeof event.withoutSkill === 'number' ? event.withoutSkill : undefined,
  };
};

export const useRunDaemon = () => {
  const { state, dispatch } = useRunLifecycle();
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | undefined>();
  const shouldReconnectRef = useRef(false);
  const wsUrlRef = useRef<string | undefined>();
  const startedAtRef = useRef<number>(0);
  const runIdRef = useRef<string | undefined>();
  const rowsRef = useRef<ProgressRow[]>([]);

  useEffect(() => {
    rowsRef.current = state.progressRows;
  }, [state.progressRows]);

  useEffect(
    () => () => {
      shouldReconnectRef.current = false;
      window.clearTimeout(reconnectTimerRef.current);
      socketRef.current?.close();
    },
    [],
  );

  const elapsedSec = useCallback(() => {
    if (!startedAtRef.current) {
      return 0;
    }

    return Math.max(0, Math.round((Date.now() - startedAtRef.current) / 1000));
  }, []);

  const handleEvent = useCallback(
    (event: RunEvent) => {
      if (event.type === 'run.snapshot') {
        const snapshotRunId = event.run?.runId;
        if (snapshotRunId) {
          runIdRef.current = snapshotRunId;
        }

        for (const progressEvent of event.run?.progress ?? []) {
          dispatch({
            type: 'PROGRESS',
            row: toProgressRow(progressEvent, 'run'),
            elapsedSec: elapsedSec(),
          });
        }

        if (event.run?.status === 'completed' && snapshotRunId) {
          const benchmark = toBenchmark(event, snapshotRunId, rowsRef.current);
          dispatch({ type: 'COMPLETE', runId: snapshotRunId, benchmark, elapsedSec: elapsedSec() });
          void writeLastRunIdPreference(snapshotRunId);
        }

        return;
      }

      if (event.type === 'run.completed') {
        const runId = event.runId ?? runIdRef.current ?? 'run';
        const benchmark = toBenchmark(event, runId, rowsRef.current);
        shouldReconnectRef.current = false;
        dispatch({ type: 'COMPLETE', runId, benchmark, elapsedSec: elapsedSec() });
        void writeLastRunIdPreference(runId);
        return;
      }

      if (event.type === 'run.cancelled') {
        shouldReconnectRef.current = false;
        dispatch({ type: 'CANCEL' });
        return;
      }

      dispatch({
        type: 'PROGRESS',
        row: toProgressRow(event, event.caseId ?? event.case ?? 'run'),
        elapsedSec: elapsedSec(),
      });
    },
    [dispatch, elapsedSec],
  );

  const connectWebSocket = useCallback(
    (wsUrl: string) => {
      shouldReconnectRef.current = true;
      wsUrlRef.current = wsUrl;
      socketRef.current?.close();

      const socket = new WebSocket(wsUrl);
      socketRef.current = socket;

      socket.addEventListener('message', (message) => {
        if (typeof message.data !== 'string') {
          return;
        }

        const event = parseMessage(message.data);
        if (event) {
          handleEvent(event);
        }
      });

      socket.addEventListener('close', () => {
        if (!shouldReconnectRef.current || !wsUrlRef.current) {
          return;
        }

        reconnectTimerRef.current = window.setTimeout(() => {
          if (wsUrlRef.current) {
            connectWebSocket(wsUrlRef.current);
          }
        }, 1000);
      });
    },
    [handleEvent],
  );

  const startRun = useCallback(
    async (composerState: RunComposerState) => {
      startedAtRef.current = Date.now();
      rowsRef.current = [];
      dispatch({
        type: 'START',
        firstRow: {
          id: 'accepted',
          caseId: composerState.case === '*' ? 'all cases' : composerState.case,
          assertionsPassed: 0,
          assertionsFailed: 0,
          totalAssertions: 0,
          message: 'posting to daemon',
          at: new Date().toISOString(),
        },
      });

      const response = await fetch(DAEMON_RUNS_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          workspaceRoot: composerState.workspaceRoot,
          case: composerState.case,
          model: composerState.model,
          judgeModel: composerState.judgeModel,
          compare: composerState.compare,
          extraSkill: composerState.extraSkill,
          iteration: composerState.iteration,
          contextMode: composerState.contextMode,
          sandbox: composerState.sandbox,
        }),
      });

      if (!response.ok) {
        dispatch({ type: 'CANCEL' });
        throw new Error(`Daemon rejected run with ${response.status}`);
      }

      const result = (await response.json()) as RunStartResponse;
      const runId = result.runId ?? result.id;
      const wsUrl = result.wsUrl ?? result.websocketUrl;

      if (!runId || !wsUrl) {
        dispatch({ type: 'CANCEL' });
        throw new Error('Daemon response did not include runId and wsUrl');
      }

      runIdRef.current = runId;
      dispatch({ type: 'START', runId });
      connectWebSocket(parseWebSocketUrl(wsUrl));
    },
    [connectWebSocket, dispatch],
  );

  const cancelRun = useCallback(async () => {
    shouldReconnectRef.current = false;
    socketRef.current?.close();

    if (runIdRef.current) {
      await fetch(`${DAEMON_RUNS_URL}/${encodeURIComponent(runIdRef.current)}`, { method: 'DELETE' });
    }

    dispatch({ type: 'CANCEL' });
  }, [dispatch]);

  return {
    startRun,
    cancelRun,
    resetRun: () => dispatch({ type: 'RESET' }),
  };
};
