import { useCallback, useState } from 'react';
import type { StagedImprovePlan } from './useProposePlan';

export type ApplyPlanResult = {
  backupPath?: string;
  cancelled?: boolean;
  committed?: boolean;
  path?: string;
  planId: string;
};

type ApplyPlanState =
  | { status: 'idle'; error: null; result: null }
  | { status: 'committing'; error: null; result: null }
  | { status: 'committed'; error: null; result: ApplyPlanResult }
  | { status: 'cancelling'; error: null; result: null }
  | { status: 'cancelled'; error: null; result: ApplyPlanResult }
  | { status: 'error'; error: string; result: null };

const idleState: ApplyPlanState = {
  error: null,
  result: null,
  status: 'idle',
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));

const readJson = async (response: Response): Promise<unknown> => {
  const text = await response.text();
  return text.trim() ? (JSON.parse(text) as unknown) : {};
};

const requireApplyResult = (payload: unknown, planId: string): ApplyPlanResult => {
  if (!isRecord(payload)) {
    throw new Error('apply action returned an invalid response');
  }

  return {
    backupPath: typeof payload.backupPath === 'string' ? payload.backupPath : undefined,
    cancelled: payload.cancelled === true,
    committed: payload.committed === true,
    path: typeof payload.path === 'string' ? payload.path : undefined,
    planId: typeof payload.planId === 'string' ? payload.planId : planId,
  };
};

const postApplyAction = async (
  stagedPlan: StagedImprovePlan,
  action: 'cancel' | 'commit',
): Promise<ApplyPlanResult> => {
  const response = await fetch(
    `http://localhost:7357/apply-plan/${encodeURIComponent(stagedPlan.planId)}/${action}`,
    { method: 'POST' },
  );

  if (!response.ok) {
    throw new Error(`${action} failed with ${response.status}`);
  }

  return requireApplyResult(await readJson(response), stagedPlan.planId);
};

export const useApplyPlan = () => {
  const [state, setState] = useState<ApplyPlanState>(idleState);

  const commitPlan = useCallback(async (stagedPlan: StagedImprovePlan) => {
    setState({ error: null, result: null, status: 'committing' });

    try {
      const result = await postApplyAction(stagedPlan, 'commit');
      setState({ error: null, result, status: 'committed' });
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'commit failed';
      setState({ error: message, result: null, status: 'error' });
      throw error;
    }
  }, []);

  const cancelPlan = useCallback(async (stagedPlan: StagedImprovePlan) => {
    setState({ error: null, result: null, status: 'cancelling' });

    try {
      const result = await postApplyAction(stagedPlan, 'cancel');
      setState({ error: null, result, status: 'cancelled' });
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'cancel failed';
      setState({ error: message, result: null, status: 'error' });
      throw error;
    }
  }, []);

  const reset = useCallback(() => setState(idleState), []);

  return {
    ...state,
    cancelPlan,
    commitPlan,
    reset,
  };
};
