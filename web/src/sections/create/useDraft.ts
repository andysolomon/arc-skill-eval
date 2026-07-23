import { useCallback, useEffect, useMemo, useState } from 'react';
import { openDatabase, requestToPromise, transactionDone } from '@/persistence/db';
import { putLearnProgress, type LearnProgressRecord } from '@/persistence/learnProgress';

export const CREATE_WIZARD_CHAPTER_ID = 'create-wizard';

export type CreateStepId = 'behaviors' | 'prompts' | 'assertions' | 'review';
export type BehaviorDimension = 'outcome' | 'process' | 'style' | 'efficiency';
export type PromptFlavor = 'explicit' | 'implicit' | 'contextual' | 'adjacent-negative';
export type AssertionKind = 'file-exists' | 'file-absent' | 'regex-match' | 'json-valid' | 'judge';

export type BehaviorAssertion = {
  kind: AssertionKind;
  val: string;
};

export type BehaviorRow = {
  id: string;
  text: string;
  dim: BehaviorDimension;
  prompt: string;
  flavor: PromptFlavor;
  asserts: BehaviorAssertion[];
};

export type CreateDraft = {
  skill: string;
  behaviors: BehaviorRow[];
};

export type EvalsJsonDraft = {
  skill_name: string;
  evals: Array<{
    id: string;
    prompt: string;
    assertions: Array<string | Record<string, string>>;
  }>;
};

export const dimensionColors: Record<BehaviorDimension, string> = {
  outcome: 'var(--tt-green)',
  process: 'var(--tt-blue)',
  style: 'var(--tt-magenta)',
  efficiency: 'var(--tt-yellow)',
};

export const dimensions = Object.keys(dimensionColors) as BehaviorDimension[];

export const flavorColors: Record<PromptFlavor, string> = {
  explicit: 'var(--tt-green)',
  implicit: 'var(--tt-blue)',
  contextual: 'var(--tt-cyan)',
  'adjacent-negative': 'var(--tt-orange)',
};

export const flavors = Object.keys(flavorColors) as PromptFlavor[];

export const assertionKinds: AssertionKind[] = [
  'file-exists',
  'file-absent',
  'regex-match',
  'json-valid',
  'judge',
];

export const assertionKindColor = (kind: AssertionKind) =>
  kind === 'judge' ? 'var(--tt-magenta)' : 'var(--tt-cyan)';

export const assertionField = (kind: AssertionKind) =>
  kind === 'regex-match' ? 'pattern' : 'path';

export const assertionPlaceholder = (kind: AssertionKind) =>
  kind === 'judge'
    ? 'one observable claim, graded true / false'
    : kind === 'regex-match'
      ? 'pattern e.g. conventionalcommits'
      : 'path e.g. .releaserc.json';

export const slugifyBehavior = (text: string, index: number) => {
  const slug = (text || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .split('-')
    .slice(0, 4)
    .join('-');

  return slug || `case-${index + 1}`;
};

export const suggestPromptTemplate = (skill: string, behavior: BehaviorRow) => {
  const text = (behavior.text || 'the target behavior').replace(/\.$/, '');
  const lower = text.charAt(0).toLowerCase() + text.slice(1);
  const templates: Record<PromptFlavor, string> = {
    explicit: `Use ${skill || 'the skill'} to ${lower}.`,
    implicit: `${text}.`,
    contextual: `We keep running into trouble here — ${lower}. Sort it out.`,
    'adjacent-negative': 'A nearby request the skill should stay out of.',
  };

  return templates[behavior.flavor] ?? `${text}.`;
};

type PersistedCreateProgress = LearnProgressRecord & {
  activeStep?: CreateStepId;
  draft?: CreateDraft;
};

const stepOrder: CreateStepId[] = ['behaviors', 'prompts', 'assertions', 'review'];

const defaultDraft = (): CreateDraft => ({
  skill: 'my-skill',
  behaviors: [],
});

const makeId = (prefix: string) =>
  `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export const makeBehaviorRow = (patch: Partial<Omit<BehaviorRow, 'id'>> = {}): BehaviorRow => ({
  id: makeId('behavior'),
  text: '',
  dim: 'outcome',
  prompt: '',
  flavor: 'explicit',
  asserts: [],
  ...patch,
});

const isStepId = (value: unknown): value is CreateStepId =>
  typeof value === 'string' && stepOrder.includes(value as CreateStepId);

const isAssertion = (value: unknown): value is BehaviorAssertion =>
  Boolean(
    value &&
      typeof value === 'object' &&
      assertionKinds.includes((value as BehaviorAssertion).kind) &&
      typeof (value as BehaviorAssertion).val === 'string',
  );

const isBehaviorRow = (value: unknown): value is BehaviorRow => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const row = value as BehaviorRow;

  return (
    typeof row.id === 'string' &&
    typeof row.text === 'string' &&
    dimensions.includes(row.dim) &&
    typeof row.prompt === 'string' &&
    flavors.includes(row.flavor) &&
    Array.isArray(row.asserts) &&
    row.asserts.every(isAssertion)
  );
};

const normalizeDraft = (value: unknown): CreateDraft => {
  const fallback = defaultDraft();

  if (!value || typeof value !== 'object') {
    return fallback;
  }

  const candidate = value as Partial<CreateDraft>;

  return {
    skill: typeof candidate.skill === 'string' ? candidate.skill : fallback.skill,
    behaviors:
      Array.isArray(candidate.behaviors) && candidate.behaviors.every(isBehaviorRow)
        ? candidate.behaviors
        : fallback.behaviors,
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

export const assembleEvalsJson = (draft: CreateDraft): EvalsJsonDraft => ({
  skill_name: draft.skill || 'my-skill',
  evals: draft.behaviors.map((behavior, index) => ({
    id: slugifyBehavior(behavior.text, index),
    prompt: behavior.prompt,
    assertions: behavior.asserts.map((assertion) =>
      assertion.kind === 'judge'
        ? assertion.val
        : { type: assertion.kind, [assertionField(assertion.kind)]: assertion.val },
    ),
  })),
});

export const behaviorsFromEvalsJson = (
  evals: unknown,
): { skill: string; rows: BehaviorRow[] } => {
  if (!evals || typeof evals !== 'object') {
    return { skill: '', rows: [] };
  }

  const candidate = evals as Record<string, unknown>;
  const skill =
    typeof candidate.skill_name === 'string' && candidate.skill_name.trim()
      ? candidate.skill_name
      : '';

  if (!Array.isArray(candidate.evals)) {
    return { skill: '', rows: [] };
  }

  const rows = candidate.evals.flatMap((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      return [];
    }

    const evalEntry = entry as Record<string, unknown>;
    const asserts = Array.isArray(evalEntry.assertions)
      ? evalEntry.assertions.flatMap((assertion): BehaviorAssertion[] => {
          if (typeof assertion === 'string') {
            return [{ kind: 'judge', val: assertion }];
          }

          if (!assertion || typeof assertion !== 'object' || Array.isArray(assertion)) {
            return [];
          }

          const assertionObject = assertion as Record<string, unknown>;
          const type = assertionObject.type;
          if (
            typeof type !== 'string' ||
            !assertionKinds.includes(type as AssertionKind)
          ) {
            return [];
          }

          const kind = type as AssertionKind;
          return [
            {
              kind,
              val: String(
                assertionObject[assertionField(kind)] ??
                  assertionObject.path ??
                  assertionObject.pattern ??
                  '',
              ),
            },
          ];
        })
      : [];

    return [
      makeBehaviorRow({
        text: typeof evalEntry.id === 'string' ? evalEntry.id.replace(/-/g, ' ') : '',
        prompt: typeof evalEntry.prompt === 'string' ? evalEntry.prompt : '',
        asserts,
      }),
    ];
  });

  return { skill, rows };
};

export const useDraft = () => {
  const [draft, setDraft] = useState<CreateDraft>(defaultDraft);
  const [activeStep, setActiveStep] = useState<CreateStepId>('behaviors');
  const [wrote, setWrote] = useState(false);
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
    const record: PersistedCreateProgress = {
      chapterId: CREATE_WIZARD_CHAPTER_ID,
      scrollPos: stepIndex,
      completedSteps: stepOrder.slice(0, stepIndex),
      lastVisited: activeStep,
      activeStep,
      draft,
    };

    void putLearnProgress(record);
  }, [activeStep, draft, hydrated]);

  const mutateDraft = useCallback((mutate: (current: CreateDraft) => CreateDraft) => {
    setWrote(false);
    setDraft(mutate);
  }, []);

  const setSkill = useCallback(
    (skill: string) => mutateDraft((current) => ({ ...current, skill })),
    [mutateDraft],
  );

  const addBehavior = useCallback(
    () =>
      mutateDraft((current) => ({
        ...current,
        behaviors: [...current.behaviors, makeBehaviorRow()],
      })),
    [mutateDraft],
  );

  const removeBehavior = useCallback(
    (id: string) =>
      mutateDraft((current) => ({
        ...current,
        behaviors: current.behaviors.filter((behavior) => behavior.id !== id),
      })),
    [mutateDraft],
  );

  const updateBehavior = useCallback(
    (id: string, patch: Partial<Omit<BehaviorRow, 'id'>>) =>
      mutateDraft((current) => ({
        ...current,
        behaviors: current.behaviors.map((behavior) =>
          behavior.id === id ? { ...behavior, ...patch } : behavior,
        ),
      })),
    [mutateDraft],
  );

  const addAssertion = useCallback(
    (behaviorId: string, kind: AssertionKind) =>
      mutateDraft((current) => ({
        ...current,
        behaviors: current.behaviors.map((behavior) =>
          behavior.id === behaviorId
            ? { ...behavior, asserts: [...behavior.asserts, { kind, val: '' }] }
            : behavior,
        ),
      })),
    [mutateDraft],
  );

  const removeAssertion = useCallback(
    (behaviorId: string, index: number) =>
      mutateDraft((current) => ({
        ...current,
        behaviors: current.behaviors.map((behavior) =>
          behavior.id === behaviorId
            ? { ...behavior, asserts: behavior.asserts.filter((_, i) => i !== index) }
            : behavior,
        ),
      })),
    [mutateDraft],
  );

  const setAssertionValue = useCallback(
    (behaviorId: string, index: number, val: string) =>
      mutateDraft((current) => ({
        ...current,
        behaviors: current.behaviors.map((behavior) =>
          behavior.id === behaviorId
            ? {
                ...behavior,
                asserts: behavior.asserts.map((assertion, i) =>
                  i === index ? { ...assertion, val } : assertion,
                ),
              }
            : behavior,
        ),
      })),
    [mutateDraft],
  );

  const seedBehaviors = useCallback(
    (skill: string, rows: BehaviorRow[]) => {
      mutateDraft(() => ({ skill, behaviors: rows }));
      setActiveStep('behaviors');
    },
    [mutateDraft],
  );

  const markWritten = useCallback(() => setWrote(true), []);

  const evalsJson = useMemo(() => assembleEvalsJson(draft), [draft]);
  const assertionCount = draft.behaviors.reduce((n, behavior) => n + behavior.asserts.length, 0);
  const deterministicCount = draft.behaviors.reduce(
    (n, behavior) => n + behavior.asserts.filter((assertion) => assertion.kind !== 'judge').length,
    0,
  );

  return {
    activeStep,
    activeStepIndex: stepOrder.indexOf(activeStep),
    addAssertion,
    addBehavior,
    assertionCount,
    behaviorCount: draft.behaviors.length,
    deterministicCount,
    draft,
    evalsJson,
    judgeCount: assertionCount - deterministicCount,
    markWritten,
    removeAssertion,
    removeBehavior,
    seedBehaviors,
    setActiveStep,
    setAssertionValue,
    setSkill,
    steps: stepOrder,
    updateBehavior,
    wrote,
  };
};
