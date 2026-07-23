import { useCallback, useState } from 'react';

type SuggestPromptInput = {
  behavior: string;
  currentPrompt: string;
  rowId: string;
  workspaceRoot: string;
};

type SuggestState = {
  error: string | null;
  pendingKey: string | null;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));

const toText = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value.trim() : null;

const firstCase = (payload: unknown): Record<string, unknown> | null => {
  if (!isRecord(payload)) {
    return null;
  }

  const evals = payload.evals;
  if (Array.isArray(evals)) {
    for (const item of evals) {
      if (isRecord(item)) {
        return item;
      }
    }
  }

  if (isRecord(evals) && Array.isArray(evals.evals)) {
    for (const group of evals.evals) {
      if (isRecord(group) && Array.isArray(group.cases)) {
        for (const item of group.cases) {
          if (isRecord(item)) {
            return item;
          }
        }
      }
    }
  }

  return null;
};

const postSuggestion = async (payload: Record<string, unknown>) => {
  const response = await fetch('/generate-evals', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`suggest failed with ${response.status}`);
  }

  return (await response.json()) as unknown;
};

const fallbackPrompt = (behavior: string, currentPrompt: string) =>
  currentPrompt.trim() ||
  `Ask the agent to complete a task that demonstrates this behavior: ${behavior || 'the selected behavior'}.`;

export const useSuggest = () => {
  const [state, setState] = useState<SuggestState>({ error: null, pendingKey: null });

  const suggestPrompt = useCallback(
    async ({ behavior, currentPrompt, rowId, workspaceRoot }: SuggestPromptInput) => {
      const pendingKey = `prompt:${rowId}`;
      setState({ error: null, pendingKey });

      try {
        const payload = await postSuggestion({
          workspaceRoot,
          behaviors: [behavior].filter(Boolean),
          target: 'prompt',
          currentPrompt,
        });
        const suggested =
          toText(isRecord(payload) ? payload.prompt ?? payload.suggestion ?? payload.text : null) ??
          toText(firstCase(payload)?.prompt) ??
          fallbackPrompt(behavior, currentPrompt);

        setState({ error: null, pendingKey: null });
        return suggested;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'suggest failed';
        setState({ error: message, pendingKey: null });
        throw error;
      }
    },
    [],
  );

  return {
    ...state,
    suggestPrompt,
  };
};
