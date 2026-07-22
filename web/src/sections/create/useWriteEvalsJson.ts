import { useCallback, useState } from 'react';
import type { EvalsJsonDraft } from './useDraft';

type ApplyPlanInput = {
  plan: EvalsJsonDraft;
  workspaceRoot: string;
};

type ApplyPlanResult = {
  diff: unknown;
  planId: string;
  stagingPath: string;
};

type WriteState =
  | { status: 'idle'; error: null; plan: null; wrotePath: null }
  | { status: 'staging'; error: null; plan: null; wrotePath: null }
  | { status: 'staged'; error: null; plan: ApplyPlanResult; wrotePath: null }
  | { status: 'committing'; error: null; plan: ApplyPlanResult; wrotePath: null }
  | { status: 'committed'; error: null; plan: null; wrotePath: string | null }
  | { status: 'cancelling'; error: null; plan: ApplyPlanResult; wrotePath: null }
  | { status: 'cancelled'; error: null; plan: null; wrotePath: null }
  | { status: 'error'; error: string; plan: ApplyPlanResult | null; wrotePath: null };

const idleState: WriteState = {
  error: null,
  plan: null,
  status: 'idle',
  wrotePath: null,
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));

const readJson = async (response: Response): Promise<unknown> => {
  const text = await response.text();
  if (!text.trim()) {
    return {};
  }

  return JSON.parse(text) as unknown;
};

const requirePlanResult = (payload: unknown): ApplyPlanResult => {
  if (
    !isRecord(payload) ||
    typeof payload.planId !== 'string' ||
    typeof payload.stagingPath !== 'string'
  ) {
    throw new Error('apply plan returned an invalid response');
  }

  return {
    diff: payload.diff ?? null,
    planId: payload.planId,
    stagingPath: payload.stagingPath,
  };
};

export const useWriteEvalsJson = () => {
  const [state, setState] = useState<WriteState>(idleState);

  const stagePlan = useCallback(async ({ workspaceRoot, plan }: ApplyPlanInput) => {
    setState({ error: null, plan: null, status: 'staging', wrotePath: null });

    try {
      const response = await fetch('http://localhost:7357/apply-plan', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ workspaceRoot, plan }),
      });

      if (!response.ok) {
        throw new Error(`apply plan failed with ${response.status}`);
      }

      const stagedPlan = requirePlanResult(await readJson(response));
      setState({ error: null, plan: stagedPlan, status: 'staged', wrotePath: null });
      return stagedPlan;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'apply plan failed';
      setState({ error: message, plan: null, status: 'error', wrotePath: null });
      throw error;
    }
  }, []);

  const commitPlan = useCallback(async () => {
    if (!state.plan) {
      return;
    }

    const stagedPlan = state.plan;
    setState({ error: null, plan: stagedPlan, status: 'committing', wrotePath: null });

    try {
      const response = await fetch(
        `http://localhost:7357/apply-plan/${encodeURIComponent(stagedPlan.planId)}/commit`,
        { method: 'POST' },
      );

      if (!response.ok) {
        throw new Error(`commit failed with ${response.status}`);
      }

      const result = await readJson(response);
      const wrotePath = isRecord(result) && typeof result.path === 'string' ? result.path : null;
      setState({ error: null, plan: null, status: 'committed', wrotePath });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'commit failed';
      setState({ error: message, plan: stagedPlan, status: 'error', wrotePath: null });
      throw error;
    }
  }, [state.plan]);

  const cancelPlan = useCallback(async () => {
    if (!state.plan) {
      setState(idleState);
      return;
    }

    const stagedPlan = state.plan;
    setState({ error: null, plan: stagedPlan, status: 'cancelling', wrotePath: null });

    try {
      const response = await fetch(
        `http://localhost:7357/apply-plan/${encodeURIComponent(stagedPlan.planId)}/cancel`,
        { method: 'POST' },
      );

      if (!response.ok) {
        throw new Error(`cancel failed with ${response.status}`);
      }

      setState({ error: null, plan: null, status: 'cancelled', wrotePath: null });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'cancel failed';
      setState({ error: message, plan: stagedPlan, status: 'error', wrotePath: null });
      throw error;
    }
  }, [state.plan]);

  const reset = useCallback(() => setState(idleState), []);

  return {
    ...state,
    cancelPlan,
    commitPlan,
    reset,
    stagePlan,
  };
};
