/**
 * The Create wizard's domain: steps, behavior rows, assertion kinds, and the
 * pure translations between a draft and evals.json.
 */

import { Array, Option, Schema } from 'effect';

// STEP

export const steps = ['behaviors', 'prompts', 'assertions', 'review'] as const;
export const Step = Schema.Literals(steps);
export type Step = typeof Step.Type;

export const railSteps: ReadonlyArray<Readonly<{ id: Step; num: string; label: string }>> = [
  { id: 'behaviors', num: '01', label: 'List behaviors' },
  { id: 'prompts', num: '02', label: 'Write prompts' },
  { id: 'assertions', num: '03', label: 'Attach assertions' },
  { id: 'review', num: '04', label: 'Review & run' },
];

export const stepIndex = (step: Step): number => steps.indexOf(step);

export const stepAt = (index: number): Option.Option<Step> => Array.get(steps, index);

// BEHAVIOR

export const dimensions = ['outcome', 'process', 'style', 'efficiency'] as const;
export const Dimension = Schema.Literals(dimensions);
export type Dimension = typeof Dimension.Type;

export const flavors = ['explicit', 'implicit', 'contextual', 'adjacent-negative'] as const;
export const Flavor = Schema.Literals(flavors);
export type Flavor = typeof Flavor.Type;

export const behaviorAssertionKinds = ['tool-call-required', 'tool-call-forbidden', 'skill-read-required'] as const;
export type BehaviorAssertionKind = (typeof behaviorAssertionKinds)[number];

export const assertionKinds = [
  'file-exists',
  'file-absent',
  'regex-match',
  'json-valid',
  ...behaviorAssertionKinds,
  'judge',
] as const;
export const AssertionKind = Schema.Literals(assertionKinds);
export type AssertionKind = typeof AssertionKind.Type;

export const BehaviorAssertion = Schema.Struct({ kind: AssertionKind, val: Schema.String });
export type BehaviorAssertion = typeof BehaviorAssertion.Type;

export const BehaviorRow = Schema.Struct({
  id: Schema.String,
  text: Schema.String,
  dim: Dimension,
  prompt: Schema.String,
  flavor: Flavor,
  asserts: Schema.Array(BehaviorAssertion),
});
export type BehaviorRow = typeof BehaviorRow.Type;

export const Draft = Schema.Struct({ skill: Schema.String, behaviors: Schema.Array(BehaviorRow) });
export type Draft = typeof Draft.Type;

export const defaultDraft: Draft = { skill: 'my-skill', behaviors: [] };

export type BehaviorSeed = Partial<Omit<BehaviorRow, 'id'>>;

export const makeBehaviorRow = (id: string, seed: BehaviorSeed = {}): BehaviorRow => ({
  id,
  text: seed.text ?? '',
  dim: seed.dim ?? 'outcome',
  prompt: seed.prompt ?? '',
  flavor: seed.flavor ?? 'explicit',
  asserts: seed.asserts ?? [],
});

export const isBehaviorKind = (kind: string): kind is BehaviorAssertionKind =>
  Array.contains(behaviorAssertionKinds as ReadonlyArray<string>, kind);

export const isAssertionKind = (kind: string): kind is AssertionKind =>
  Array.contains(assertionKinds as ReadonlyArray<string>, kind);

export const isDimension = (value: unknown): value is Dimension =>
  typeof value === 'string' && Array.contains(dimensions as ReadonlyArray<string>, value);

export const isFlavor = (value: unknown): value is Flavor =>
  typeof value === 'string' && Array.contains(flavors as ReadonlyArray<string>, value);

// COLORS AND COPY

export const dimensionColors: Record<Dimension, string> = {
  outcome: 'var(--tt-green)',
  process: 'var(--tt-blue)',
  style: 'var(--tt-magenta)',
  efficiency: 'var(--tt-yellow)',
};

export const flavorColors: Record<Flavor, string> = {
  explicit: 'var(--tt-green)',
  implicit: 'var(--tt-blue)',
  contextual: 'var(--tt-cyan)',
  'adjacent-negative': 'var(--tt-orange)',
};

export const assertionKindColor = (kind: AssertionKind): string =>
  kind === 'judge' ? 'var(--tt-magenta)' : isBehaviorKind(kind) ? 'var(--tt-blue)' : 'var(--tt-cyan)';

/** JSON field the wizard's single `val` maps to for a given kind. */
export const assertionField = (kind: AssertionKind): string =>
  kind === 'regex-match' ? 'pattern' : isBehaviorKind(kind) ? 'value' : 'path';

export const assertionPlaceholder = (kind: AssertionKind): string => {
  if (kind === 'judge') {
    return 'one observable claim, graded true / false';
  }
  if (kind === 'regex-match') {
    return 'pattern e.g. conventionalcommits';
  }
  if (kind === 'skill-read-required') {
    return 'skill name e.g. arc-conventional-commits';
  }
  if (kind === 'tool-call-required' || kind === 'tool-call-forbidden') {
    return 'tool name e.g. Write';
  }
  return 'path e.g. .releaserc.json';
};

export const ASSIST_MODEL_OPTIONS = [
  'minimax/MiniMax-M3',
  'minimax/MiniMax-M2.7',
  'anthropic/claude-sonnet-4',
  'openai/gpt-5-mini',
  'moonshot/kimi-k2-0905-preview',
] as const;

export const DEFAULT_ASSIST_MODEL = 'minimax/MiniMax-M3';

// MODEL SPEC

export type ModelRef = Readonly<{ provider: string; id: string }>;

export const parseModel = (spec: string): Option.Option<ModelRef> => {
  const slash = spec.indexOf('/');
  return slash <= 0 || slash >= spec.length - 1
    ? Option.none()
    : Option.some({ provider: spec.slice(0, slash), id: spec.slice(slash + 1) });
};

// PROMPTS

export const stripTrailingPeriod = (text: string): string => text.replace(/\.$/, '');

export const suggestPromptTemplate = (skill: string, behavior: BehaviorRow): string => {
  const text = stripTrailingPeriod(behavior.text || 'the target behavior');
  const lower = text.charAt(0).toLowerCase() + text.slice(1);
  const templates: Record<Flavor, string> = {
    explicit: `Use ${skill || 'the skill'} to ${lower}.`,
    implicit: `${text}.`,
    contextual: `We keep running into trouble here: ${lower}. Sort it out.`,
    'adjacent-negative': 'A nearby request the skill should stay out of.',
  };
  return templates[behavior.flavor];
};

// EVALS.JSON

export type EvalsAssertion = string | Readonly<Record<string, string>>;

export type EvalsCase = Readonly<{ id: string; prompt: string; assertions: ReadonlyArray<EvalsAssertion> }>;

export type EvalsJson = Readonly<{ version: string; skill_name: string; evals: ReadonlyArray<EvalsCase> }>;

export const slugifyBehavior = (text: string, index: number): string => {
  const slug = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .split('-')
    .slice(0, 4)
    .join('-');
  return slug || `case-${index + 1}`;
};

const toEvalsAssertion = (slug: string, assertion: BehaviorAssertion, index: number): EvalsAssertion => {
  if (assertion.kind === 'judge') {
    return assertion.val;
  }
  if (isBehaviorKind(assertion.kind)) {
    return {
      id: `${slug}-${assertion.kind}-${index + 1}`,
      kind: 'behavior',
      method: assertion.kind,
      value: assertion.val,
    };
  }
  return { type: assertion.kind, [assertionField(assertion.kind)]: assertion.val };
};

export const assembleEvalsJson = (draft: Draft): EvalsJson => ({
  version: '1',
  skill_name: draft.skill || 'my-skill',
  evals: Array.map(draft.behaviors, (behavior, index) => {
    const slug = slugifyBehavior(behavior.text, index);
    return {
      id: slug,
      prompt: behavior.prompt,
      assertions: Array.map(behavior.asserts, (assertion, assertionIndex) =>
        toEvalsAssertion(slug, assertion, assertionIndex),
      ),
    };
  }),
});

export const serializeEvalsJson = (evalsJson: EvalsJson): string => `${JSON.stringify(evalsJson, null, 2)}\n`;

export type DraftCounts = Readonly<{ cases: number; assertions: number; deterministic: number; judge: number }>;

export const countDraft = (draft: Draft): DraftCounts => {
  const allAssertions = Array.flatMap(draft.behaviors, (behavior) => behavior.asserts);
  const deterministic = Array.filter(allAssertions, (assertion) => assertion.kind !== 'judge').length;
  return {
    cases: draft.behaviors.length,
    assertions: allAssertions.length,
    deterministic,
    judge: allAssertions.length - deterministic,
  };
};

// IMPORT

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !globalThis.Array.isArray(value);

const toBehaviorAssertion = (assertion: unknown): Option.Option<BehaviorAssertion> => {
  if (typeof assertion === 'string') {
    return Option.some({ kind: 'judge', val: assertion });
  }
  if (!isRecord(assertion)) {
    return Option.none();
  }
  if (assertion.kind === 'behavior') {
    const method = assertion.method;
    return typeof method === 'string' && isBehaviorKind(method)
      ? Option.some({ kind: method, val: String(assertion.value ?? '') })
      : Option.none();
  }
  const type = assertion.type;
  if (typeof type !== 'string' || !isAssertionKind(type)) {
    return Option.none();
  }
  return Option.some({
    kind: type,
    val: String(assertion[assertionField(type)] ?? assertion.path ?? assertion.pattern ?? ''),
  });
};

/** Rows (without ids) for an evals.json loaded from disk. */
export const behaviorsFromEvalsJson = (evals: unknown): Readonly<{ skill: string; seeds: ReadonlyArray<BehaviorSeed> }> => {
  if (!isRecord(evals) || !globalThis.Array.isArray(evals.evals)) {
    return { skill: '', seeds: [] };
  }
  const skill = typeof evals.skill_name === 'string' && evals.skill_name.trim() !== '' ? evals.skill_name : '';
  const seeds = Array.getSomes(
    Array.map(evals.evals as ReadonlyArray<unknown>, (entry): Option.Option<BehaviorSeed> => {
      if (!isRecord(entry)) {
        return Option.none();
      }
      return Option.some({
        text: typeof entry.id === 'string' ? entry.id.replace(/-/g, ' ') : '',
        prompt: typeof entry.prompt === 'string' ? entry.prompt : '',
        asserts: globalThis.Array.isArray(entry.assertions)
          ? Array.getSomes(Array.map(entry.assertions as ReadonlyArray<unknown>, toBehaviorAssertion))
          : [],
      });
    }),
  );
  return { skill, seeds };
};

const pushText = (values: ReadonlyArray<string>, value: unknown): ReadonlyArray<string> =>
  typeof value === 'string' && value.trim() !== '' && !Array.contains(values, value.trim())
    ? Array.append(values, value.trim())
    : values;

const collectCaseText = (values: ReadonlyArray<string>, value: unknown): ReadonlyArray<string> => {
  if (!isRecord(value)) {
    return values;
  }
  const named = pushText(pushText(values, value.description), value.behavior);
  return named.length === values.length ? pushText(named, value.prompt) : named;
};

const collectBehaviors = (values: ReadonlyArray<string>, value: unknown): ReadonlyArray<string> => {
  if (globalThis.Array.isArray(value)) {
    return Array.reduce(value as ReadonlyArray<unknown>, values, (collected, item) =>
      typeof item === 'string' ? pushText(collected, item) : collectCaseText(collected, item),
    );
  }
  if (!isRecord(value)) {
    return values;
  }
  const fromLists = collectBehaviors(collectBehaviors(values, value.behaviors), value.cases);
  return globalThis.Array.isArray(value.evals)
    ? Array.reduce(value.evals as ReadonlyArray<unknown>, fromLists, (collected, item) => {
        const withCase = collectCaseText(collected, item);
        return isRecord(item) ? collectBehaviors(withCase, item.cases) : withCase;
      })
    : fromLists;
};

/** Behavior descriptions in a `/generate-evals` payload, de-duplicated in order. */
export const extractGeneratedBehaviors = (payload: unknown): ReadonlyArray<string> =>
  isRecord(payload) ? collectBehaviors(collectBehaviors([], payload.behaviors), payload.evals) : [];
