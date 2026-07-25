import { useCallback, useState } from 'react';
import { assertionKinds } from './useDraft';
import type {
  AssertionKind,
  BehaviorDimension,
  PromptFlavor,
} from './useDraft';

type SuggestBehaviorInput = {
  existing: string[];
  skill: string;
};

type SuggestPromptInput = {
  behavior: string;
  dim: BehaviorDimension;
  flavor: PromptFlavor;
  rowId: string;
  skill: string;
};

type SuggestAssertionInput = {
  behavior: string;
  prompt: string;
  rowId: string;
  skill: string;
};

type SuggestDimensionInput = {
  behavior: string;
  rowId: string;
  skill: string;
};

type SuggestFlavorInput = {
  behavior: string;
  prompt: string;
  rowId: string;
  skill: string;
};

type BehaviorSuggestion = {
  text: string;
  dim: BehaviorDimension;
};

type AssertionSuggestion = {
  kind: AssertionKind;
  val: string;
};

type SuggestState = {
  error: string | null;
  pendingKey: string | null;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));

export const parseModel = (spec: string): { provider: string; id: string } | undefined => {
  const slash = spec.indexOf('/');
  if (slash <= 0 || slash >= spec.length - 1) {
    return undefined;
  }
  return { provider: spec.slice(0, slash), id: spec.slice(slash + 1) };
};

const readError = async (response: Response) => {
  try {
    const payload = (await response.json()) as unknown;
    if (isRecord(payload) && typeof payload.error === 'string' && payload.error.trim()) {
      return payload.error.trim();
    }
  } catch {
    // The daemon may be offline or return a non-JSON proxy response.
  }

  return `suggest failed with ${response.status}`;
};

const postSuggestion = async (
  kind: 'behavior' | 'prompt' | 'assertion' | 'dimension' | 'flavor',
  skill: string,
  context: Record<string, unknown>,
  model?: { provider: string; id: string },
) => {
  const response = await fetch('http://localhost:7357/suggest', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      kind,
      skill,
      context,
      ...(model ? { model } : {}),
    }),
  });

  if (!response.ok) {
    throw new Error(await readError(response));
  }

  const payload = (await response.json()) as unknown;
  if (!isRecord(payload) || payload.ok !== true) {
    throw new Error('suggest returned an invalid response');
  }

  return payload;
};

export const useSuggest = (enabled: boolean, modelSpec?: string) => {
  const parsedModel = modelSpec ? parseModel(modelSpec) : undefined;
  const [state, setState] = useState<SuggestState>({ error: null, pendingKey: null });

  const run = useCallback(
    async <T,>(pendingKey: string, request: () => Promise<T>): Promise<T> => {
      if (!enabled) {
        throw new Error('LLM assist is only available on localhost.');
      }

      setState({ error: null, pendingKey });

      try {
        const result = await request();
        setState({ error: null, pendingKey: null });
        return result;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'suggest failed';
        setState({ error: message, pendingKey: null });
        throw error;
      }
    },
    [enabled],
  );

  const suggestBehavior = useCallback(
    ({ existing, skill }: SuggestBehaviorInput) =>
      run<BehaviorSuggestion>('behavior', async () => {
        const payload = await postSuggestion('behavior', skill, { existing }, parsedModel);
        const behavior = payload.behavior;
        if (
          !isRecord(behavior)
          || typeof behavior.text !== 'string'
          || !['outcome', 'process', 'style', 'efficiency'].includes(String(behavior.dim))
        ) {
          throw new Error('suggest returned an invalid behavior');
        }

        return {
          text: behavior.text,
          dim: behavior.dim as BehaviorDimension,
        };
      }),
    [parsedModel, run],
  );

  const suggestPrompt = useCallback(
    ({ behavior, dim, flavor, rowId, skill }: SuggestPromptInput) =>
      run<string>(`prompt:${rowId}`, async () => {
        const payload = await postSuggestion('prompt', skill, { behavior, dim, flavor }, parsedModel);
        if (typeof payload.prompt !== 'string' || !payload.prompt.trim()) {
          throw new Error('suggest returned an invalid prompt');
        }
        return payload.prompt.trim();
      }),
    [parsedModel, run],
  );

  const suggestAssertion = useCallback(
    ({ behavior, prompt, rowId, skill }: SuggestAssertionInput) =>
      run<AssertionSuggestion>(`assertion:${rowId}`, async () => {
        const payload = await postSuggestion('assertion', skill, { behavior, prompt }, parsedModel);
        const assertion = payload.assertion;
        if (
          !isRecord(assertion)
          || typeof assertion.val !== 'string'
          || !(assertionKinds as string[]).includes(String(assertion.kind))
        ) {
          throw new Error('suggest returned an invalid assertion');
        }

        return {
          kind: assertion.kind as AssertionKind,
          val: assertion.val,
        };
      }),
    [parsedModel, run],
  );

  const suggestDimension = useCallback(
    ({ behavior, rowId, skill }: SuggestDimensionInput) =>
      run<BehaviorDimension>(`dimension:${rowId}`, async () => {
        const payload = await postSuggestion('dimension', skill, { behavior }, parsedModel);
        if (
          typeof payload.dim !== 'string'
          || !['outcome', 'process', 'style', 'efficiency'].includes(payload.dim)
        ) {
          throw new Error('suggest returned an invalid dimension');
        }
        return payload.dim as BehaviorDimension;
      }),
    [parsedModel, run],
  );

  const suggestFlavor = useCallback(
    ({ behavior, prompt, rowId, skill }: SuggestFlavorInput) =>
      run<PromptFlavor>(`flavor:${rowId}`, async () => {
        const payload = await postSuggestion('flavor', skill, { behavior, prompt }, parsedModel);
        if (
          typeof payload.flavor !== 'string'
          || !['explicit', 'implicit', 'contextual', 'adjacent-negative'].includes(payload.flavor)
        ) {
          throw new Error('suggest returned an invalid flavor');
        }
        return payload.flavor as PromptFlavor;
      }),
    [parsedModel, run],
  );

  return {
    ...state,
    suggestAssertion,
    suggestBehavior,
    suggestDimension,
    suggestFlavor,
    suggestPrompt,
  };
};
