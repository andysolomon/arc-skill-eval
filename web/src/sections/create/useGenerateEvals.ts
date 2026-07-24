import { useCallback, useState } from 'react';
import { parseModel } from './useSuggest';

type GenerateEvalsInput = {
  workspaceRoot: string;
  behaviors: string[];
  model?: string;
};

type GenerateEvalsResult = {
  behaviors: string[];
  partial: unknown;
};

type GenerateEvalsState = {
  error: string | null;
  isGenerating: boolean;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));

const toText = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value.trim() : null;

const pushText = (values: string[], value: unknown) => {
  const text = toText(value);
  if (text && !values.includes(text)) {
    values.push(text);
  }
};

const collectCaseText = (value: unknown, values: string[]) => {
  if (!isRecord(value)) {
    return;
  }

  const initialLength = values.length;
  pushText(values, value.description);
  pushText(values, value.behavior);

  if (values.length === initialLength) {
    pushText(values, value.prompt);
  }
};

const collectBehaviors = (value: unknown, values: string[]) => {
  if (Array.isArray(value)) {
    value.forEach((item) => {
      if (typeof item === 'string') {
        pushText(values, item);
        return;
      }

      collectCaseText(item, values);
    });
    return;
  }

  if (!isRecord(value)) {
    return;
  }

  collectBehaviors(value.behaviors, values);
  collectBehaviors(value.cases, values);

  if (Array.isArray(value.evals)) {
    value.evals.forEach((item) => {
      collectCaseText(item, values);
      if (isRecord(item)) {
        collectBehaviors(item.cases, values);
      }
    });
  }
};

const extractGeneratedBehaviors = (payload: unknown): string[] => {
  const values: string[] = [];

  if (isRecord(payload)) {
    collectBehaviors(payload.behaviors, values);
    collectBehaviors(payload.evals, values);
  }

  return values;
};

export const useGenerateEvals = () => {
  const [state, setState] = useState<GenerateEvalsState>({
    error: null,
    isGenerating: false,
  });

  const generateEvals = useCallback(
    async ({ workspaceRoot, behaviors, model }: GenerateEvalsInput): Promise<GenerateEvalsResult> => {
      setState({ error: null, isGenerating: true });

      const parsedModel = model ? parseModel(model) : undefined;

      try {
        const response = await fetch('http://localhost:7357/generate-evals', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            workspaceRoot,
            behaviors,
            ...(parsedModel ? { model: parsedModel } : {}),
          }),
        });

        if (!response.ok) {
          let message = `generate evals failed with ${response.status}`;
          try {
            const failure = (await response.json()) as unknown;
            if (
              isRecord(failure) &&
              typeof failure.error === 'string' &&
              failure.error.trim()
            ) {
              message = failure.error.trim();
            }
          } catch {
            // Keep the status-based fallback for non-JSON daemon/proxy responses.
          }
          throw new Error(message);
        }

        const partial = (await response.json()) as unknown;
        if (!isRecord(partial)) {
          throw new Error('generate evals returned an invalid response');
        }

        const generatedBehaviors = extractGeneratedBehaviors(partial);
        setState({ error: null, isGenerating: false });

        return {
          behaviors: generatedBehaviors,
          partial,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'generate evals failed';
        setState({ error: message, isGenerating: false });
        throw error;
      }
    },
    [],
  );

  return {
    ...state,
    generateEvals,
  };
};
