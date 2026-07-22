import {
  createContext,
  useContext,
  useMemo,
  useReducer,
  type Dispatch,
  type PropsWithChildren,
} from 'react';

export type RunLifecycleStatus = 'idle' | 'running' | 'done';

export type ProgressRow = {
  id: string;
  caseId: string;
  assertionsPassed: number;
  assertionsFailed: number;
  totalAssertions: number;
  iteration?: number;
  message?: string;
  at?: string;
};

export type BenchmarkSummary = {
  passed: number;
  total: number;
  cost: number;
  delta?: number;
  exitCode: number;
  artifactPath: string;
  withSkill?: number;
  withoutSkill?: number;
};

export type RunLifecycleState = {
  status: RunLifecycleStatus;
  progressRows: ProgressRow[];
  elapsedSec: number;
  runId?: string;
  benchmark?: BenchmarkSummary;
  error?: string;
};

export type RunLifecycleAction =
  | { type: 'START'; runId?: string; at?: number; firstRow?: ProgressRow }
  | { type: 'PROGRESS'; row: ProgressRow; elapsedSec?: number }
  | { type: 'COMPLETE'; runId?: string; benchmark: BenchmarkSummary; elapsedSec?: number }
  | { type: 'CANCEL' }
  | { type: 'RESET' };

const initialState: RunLifecycleState = {
  status: 'idle',
  progressRows: [],
  elapsedSec: 0,
};

const mergeProgressRow = (rows: ProgressRow[], row: ProgressRow): ProgressRow[] => {
  const existingIndex = rows.findIndex((candidate) => candidate.caseId === row.caseId);

  if (existingIndex === -1) {
    return [...rows, row];
  }

  return rows.map((candidate, index) =>
    index === existingIndex ? { ...candidate, ...row } : candidate,
  );
};

export const runLifecycleReducer = (
  state: RunLifecycleState,
  action: RunLifecycleAction,
): RunLifecycleState => {
  if (action.type === 'START') {
    return {
      status: 'running',
      progressRows: action.firstRow ? [action.firstRow] : state.progressRows,
      elapsedSec: 0,
      runId: action.runId,
    };
  }

  if (action.type === 'PROGRESS') {
    return {
      ...state,
      status: state.status === 'idle' ? 'running' : state.status,
      elapsedSec: action.elapsedSec ?? state.elapsedSec,
      progressRows: mergeProgressRow(state.progressRows, action.row),
    };
  }

  if (action.type === 'COMPLETE') {
    return {
      ...state,
      status: 'done',
      runId: action.runId ?? state.runId,
      elapsedSec: action.elapsedSec ?? state.elapsedSec,
      benchmark: action.benchmark,
    };
  }

  if (action.type === 'CANCEL' || action.type === 'RESET') {
    return initialState;
  }

  return state;
};

type RunLifecycleContextValue = {
  state: RunLifecycleState;
  dispatch: Dispatch<RunLifecycleAction>;
};

const RunLifecycleContext = createContext<RunLifecycleContextValue | null>(null);

export const RunLifecycleProvider = ({ children }: PropsWithChildren) => {
  const [state, dispatch] = useReducer(runLifecycleReducer, initialState);
  const value = useMemo(() => ({ state, dispatch }), [state]);

  return <RunLifecycleContext.Provider value={value}>{children}</RunLifecycleContext.Provider>;
};

export const useRunLifecycle = () => {
  const value = useContext(RunLifecycleContext);

  if (!value) {
    throw new Error('useRunLifecycle must be used within RunLifecycleProvider');
  }

  return value;
};
