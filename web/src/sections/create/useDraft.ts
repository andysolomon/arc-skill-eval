import { useCallback, useEffect, useMemo, useState } from 'react';
import { openDatabase, requestToPromise, transactionDone } from '@/persistence/db';
import { putLearnProgress, type LearnProgressRecord } from '@/persistence/learnProgress';

export const CREATE_WIZARD_CHAPTER_ID = 'create-wizard';

export type CreateStepId = 'behaviors' | 'prompts' | 'assertions' | 'review';
export type AssertionKind = 'judge' | 'script' | 'diff';

export type PromptRow = {
  id: string;
  text: string;
};

export type AssertionRow = {
  id: string;
  kind: AssertionKind;
  body: string;
};

export type CreateDraft = {
  skillName: string;
  skillPath: string;
  behaviorBullets: string;
  prompts: PromptRow[];
  assertions: AssertionRow[];
};

export type EvalsJsonDraft = {
  skill_name: string;
  evals: Array<{
    id: string;
    description: string;
    prompt: string;
    expected_output: string;
    assertions: Array<string | Record<string, unknown>>;
  }>;
};

type PersistedCreateProgress = LearnProgressRecord & {
  activeStep?: CreateStepId;
  draft?: CreateDraft;
};

const stepOrder: CreateStepId[] = ['behaviors', 'prompts', 'assertions', 'review'];

const defaultDraft = (): CreateDraft => ({
  skillName: 'new-skill',
  skillPath: './skills/new-skill',
  behaviorBullets: '',
  prompts: [{ id: makeId('prompt'), text: '' }],
  assertions: [{ id: makeId('assertion'), kind: 'judge', body: '' }],
});

const makeId = (prefix: string) =>
  `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const isStepId = (value: unknown): value is CreateStepId =>
  typeof value === 'string' && stepOrder.includes(value as CreateStepId);

const isPromptRow = (value: unknown): value is PromptRow =>
  Boolean(
    value &&
      typeof value === 'object' &&
      typeof (value as PromptRow).id === 'string' &&
      typeof (value as PromptRow).text === 'string',
  );

const isAssertionKind = (value: unknown): value is AssertionKind =>
  value === 'judge' || value === 'script' || value === 'diff';

const isAssertionRow = (value: unknown): value is AssertionRow =>
  Boolean(
    value &&
      typeof value === 'object' &&
      typeof (value as AssertionRow).id === 'string' &&
      isAssertionKind((value as AssertionRow).kind) &&
      typeof (value as AssertionRow).body === 'string',
  );

const normalizeDraft = (value: unknown): CreateDraft => {
  const fallback = defaultDraft();

  if (!value || typeof value !== 'object') {
    return fallback;
  }

  const candidate = value as Partial<CreateDraft>;
  const prompts = Array.isArray(candidate.prompts) && candidate.prompts.every(isPromptRow)
    ? candidate.prompts
    : fallback.prompts;
  const assertions =
    Array.isArray(candidate.assertions) && candidate.assertions.every(isAssertionRow)
      ? candidate.assertions
      : fallback.assertions;

  return {
    skillName: typeof candidate.skillName === 'string' ? candidate.skillName : fallback.skillName,
    skillPath: typeof candidate.skillPath === 'string' ? candidate.skillPath : fallback.skillPath,
    behaviorBullets:
      typeof candidate.behaviorBullets === 'string'
        ? candidate.behaviorBullets
        : fallback.behaviorBullets,
    prompts: prompts.length > 0 ? prompts : fallback.prompts,
    assertions: assertions.length > 0 ? assertions : fallback.assertions,
  };
};

const readCreateProgress = async (): Promise<PersistedCreateProgress | undefined> => {
  const db = await openDatabase();
  const tx = db.transaction('learnProgress', 'readonly');
  const done = transactionDone(tx);
  const record = await requestToPromise<PersistedCreateProgress | undefined>(
    tx.objectStore('learnProgress').get(CREATE_WIZARD_CHAPTER_ID),
  );
  await done;
  db.close();

  return record;
};

const parseBehaviorBullets = (value: string): string[] =>
  value
    .split(/\r?\n/)
    .map((line) => line.replace(/^[-*]\s*/, '').trim())
    .filter(Boolean);

const slugify = (value: string, fallback: string) => {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);

  return slug || fallback;
};

const toEvalAssertion = (assertion: AssertionRow, index: number): string | Record<string, unknown> => {
  const body = assertion.body.trim();

  if (assertion.kind === 'judge') {
    return body || 'TODO: judge the intended behavior from the run transcript.';
  }

  if (assertion.kind === 'diff') {
    return {
      id: `diff-${index + 1}`,
      kind: 'workspace',
      method: 'snapshot-diff',
      path: body || 'TODO/path-to-compare',
    };
  }

  if (body.startsWith('{')) {
    try {
      const parsed = JSON.parse(body);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // Fall through to a regex assertion so the preview remains valid JSON.
    }
  }

  return {
    type: 'file-exists',
    path: body || 'TODO/path-the-skill-should-create',
  };
};

export const assembleEvalsJson = (draft: CreateDraft): EvalsJsonDraft => {
  const behaviors = parseBehaviorBullets(draft.behaviorBullets);
  const filledPrompts = draft.prompts.map((prompt) => prompt.text.trim()).filter(Boolean);
  const caseCount = Math.max(behaviors.length, filledPrompts.length);
  const assertions = draft.assertions
    .filter((assertion) => assertion.body.trim())
    .map(toEvalAssertion);

  return {
    skill_name: slugify(draft.skillName, 'new-skill'),
    evals: Array.from({ length: caseCount }, (_, index) => {
      const behavior = behaviors[index] ?? behaviors[0] ?? `case ${index + 1}`;
      const prompt = filledPrompts[index] ?? `TODO: prompt that exercises ${behavior}`;
      const id = slugify(behavior, `case-${index + 1}`);

      return {
        id,
        description: behavior,
        prompt,
        expected_output: `The assistant satisfies this behavior: ${behavior}`,
        assertions,
      };
    }),
  };
};

export const useDraft = () => {
  const [draft, setDraft] = useState<CreateDraft>(defaultDraft);
  const [activeStep, setActiveStep] = useState<CreateStepId>('behaviors');
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void readCreateProgress()
      .then((record) => {
        if (cancelled) {
          return;
        }

        if (record?.draft) {
          setDraft(normalizeDraft(record.draft));
        }

        const nextStep = record?.activeStep ?? record?.lastVisited;
        if (isStepId(nextStep)) {
          setActiveStep(nextStep);
        }
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) {
          setHydrated(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!hydrated) {
      return;
    }

    const stepIndex = stepOrder.indexOf(activeStep);
    const completedSteps = stepOrder.slice(0, stepIndex);
    const record: PersistedCreateProgress = {
      chapterId: CREATE_WIZARD_CHAPTER_ID,
      scrollPos: stepIndex,
      completedSteps,
      lastVisited: activeStep,
      activeStep,
      draft,
    };

    void putLearnProgress(record);
  }, [activeStep, draft, hydrated]);

  const updateDraft = useCallback((patch: Partial<CreateDraft>) => {
    setDraft((current) => ({ ...current, ...patch }));
  }, []);

  const addPrompt = useCallback(() => {
    setDraft((current) => ({
      ...current,
      prompts: [...current.prompts, { id: makeId('prompt'), text: '' }],
    }));
  }, []);

  const updatePrompt = useCallback((id: string, text: string) => {
    setDraft((current) => ({
      ...current,
      prompts: current.prompts.map((prompt) => (prompt.id === id ? { ...prompt, text } : prompt)),
    }));
  }, []);

  const removePrompt = useCallback((id: string) => {
    setDraft((current) => ({
      ...current,
      prompts:
        current.prompts.length === 1
          ? [{ ...current.prompts[0], text: '' }]
          : current.prompts.filter((prompt) => prompt.id !== id),
    }));
  }, []);

  const addAssertion = useCallback(() => {
    setDraft((current) => ({
      ...current,
      assertions: [...current.assertions, { id: makeId('assertion'), kind: 'judge', body: '' }],
    }));
  }, []);

  const updateAssertion = useCallback((id: string, patch: Partial<Omit<AssertionRow, 'id'>>) => {
    setDraft((current) => ({
      ...current,
      assertions: current.assertions.map((assertion) =>
        assertion.id === id ? { ...assertion, ...patch } : assertion,
      ),
    }));
  }, []);

  const removeAssertion = useCallback((id: string) => {
    setDraft((current) => ({
      ...current,
      assertions:
        current.assertions.length === 1
          ? [{ ...current.assertions[0], body: '' }]
          : current.assertions.filter((assertion) => assertion.id !== id),
    }));
  }, []);

  const evalsJson = useMemo(() => assembleEvalsJson(draft), [draft]);
  const activeStepIndex = stepOrder.indexOf(activeStep);

  return {
    activeStep,
    activeStepIndex,
    addAssertion,
    addPrompt,
    assertionCount: draft.assertions.filter((assertion) => assertion.body.trim()).length,
    behaviorCount: parseBehaviorBullets(draft.behaviorBullets).length,
    draft,
    evalsJson,
    promptCount: draft.prompts.filter((prompt) => prompt.text.trim()).length,
    removeAssertion,
    removePrompt,
    setActiveStep,
    steps: stepOrder,
    updateAssertion,
    updateDraft,
    updatePrompt,
  };
};
