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

/**
 * One assertion as the wizard edits it: a kind and a single value. An
 * assertion loaded from an existing evals.json keeps its original JSON in
 * `source`, so fields the wizard does not edit (flags, target, id,
 * mustPass, severity, ...) are written back unchanged.
 */
export const BehaviorAssertion = Schema.Struct({
  kind: AssertionKind,
  val: Schema.String,
  source: Schema.optional(Schema.Unknown),
});
export type BehaviorAssertion = typeof BehaviorAssertion.Type;

/** An assertion the wizard cannot edit, kept as loaded at its original position. */
export const KeptAssertion = Schema.Struct({ index: Schema.Number, value: Schema.Unknown });
export type KeptAssertion = typeof KeptAssertion.Type;

/**
 * One eval case. A case loaded from an existing evals.json keeps its
 * original JSON in `source` (id, expected_output, files, metadata, ...) and
 * the assertions the wizard cannot edit in `kept`, so writing the suite back
 * loses nothing.
 */
export const BehaviorRow = Schema.Struct({
  id: Schema.String,
  text: Schema.String,
  dim: Dimension,
  prompt: Schema.String,
  flavor: Flavor,
  asserts: Schema.Array(BehaviorAssertion),
  source: Schema.optional(Schema.Unknown),
  kept: Schema.optional(Schema.Array(KeptAssertion)),
});
export type BehaviorRow = typeof BehaviorRow.Type;

/** `source` holds the top-level fields of a loaded evals.json (version and any others). */
export const Draft = Schema.Struct({
  skill: Schema.String,
  behaviors: Schema.Array(BehaviorRow),
  source: Schema.optional(Schema.Unknown),
});
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
  ...(seed.source === undefined ? {} : { source: seed.source }),
  ...(seed.kept === undefined ? {} : { kept: seed.kept }),
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

type JsonRecord = Readonly<Record<string, unknown>>;

export type EvalsAssertion = string | JsonRecord;

export type EvalsCase = Readonly<{
  id: string | number;
  prompt: string;
  assertions?: ReadonlyArray<unknown>;
  [field: string]: unknown;
}>;

export type EvalsJson = Readonly<{
  version?: unknown;
  skill_name: string;
  evals: ReadonlyArray<EvalsCase>;
  [field: string]: unknown;
}>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !globalThis.Array.isArray(value);

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

/** The kind and value the wizard shows for an evals.json assertion, if it can edit it. */
const toEditable = (assertion: unknown): Option.Option<Readonly<{ kind: AssertionKind; val: string }>> => {
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
  if (typeof type !== 'string' || !isAssertionKind(type) || type === 'judge' || isBehaviorKind(type)) {
    return Option.none();
  }
  const value = assertion[assertionField(type)];
  return typeof value === 'string' ? Option.some({ kind: type, val: value }) : Option.none();
};

const freshAssertion = (slug: string, assertion: BehaviorAssertion, index: number): EvalsAssertion => {
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

/**
 * A loaded assertion is written back as loaded when its kind and value are
 * unchanged, and with only its value replaced when the kind is unchanged.
 */
const toEvalsAssertion = (slug: string, assertion: BehaviorAssertion, index: number): EvalsAssertion => {
  const { source } = assertion;
  const maybeOriginal = toEditable(source);
  if (Option.isNone(maybeOriginal) || maybeOriginal.value.kind !== assertion.kind) {
    return freshAssertion(slug, assertion, index);
  }
  if (maybeOriginal.value.val === assertion.val) {
    return source as EvalsAssertion;
  }
  if (assertion.kind === 'judge' || !isRecord(source)) {
    return assertion.val;
  }
  return { ...source, [isBehaviorKind(assertion.kind) ? 'value' : assertionField(assertion.kind)]: assertion.val };
};

/** Edited assertions, with the ones the wizard cannot edit put back at their original positions. */
const caseAssertions = (slug: string, behavior: BehaviorRow): ReadonlyArray<unknown> => {
  const edited: Array<unknown> = Array.map(behavior.asserts, (assertion, index) =>
    toEvalsAssertion(slug, assertion, index),
  );
  for (const kept of behavior.kept ?? []) {
    edited.splice(Math.min(kept.index, edited.length), 0, kept.value);
  }
  return edited;
};

const toEvalsCase = (behavior: BehaviorRow, index: number): EvalsCase => {
  const slug = slugifyBehavior(behavior.text, index);
  const assertions = caseAssertions(slug, behavior);
  const { source } = behavior;
  if (!isRecord(source)) {
    return { id: slug, prompt: behavior.prompt, assertions };
  }
  // Spreading the loaded case keeps its fields and their order.
  const id = typeof source.id === 'string' || typeof source.id === 'number' ? source.id : slug;
  return {
    ...source,
    id,
    prompt: behavior.prompt,
    ...(assertions.length > 0 || 'assertions' in source ? { assertions } : {}),
  };
};

export const assembleEvalsJson = (draft: Draft): EvalsJson => {
  const evals = Array.map(draft.behaviors, toEvalsCase);
  const skillName = draft.skill || 'my-skill';
  return isRecord(draft.source)
    ? { ...draft.source, skill_name: skillName, evals }
    : { version: '1', skill_name: skillName, evals };
};

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

const toCaseSeed = (entry: Record<string, unknown>): BehaviorSeed => {
  const rawAssertions: ReadonlyArray<unknown> = globalThis.Array.isArray(entry.assertions) ? entry.assertions : [];
  const asserts: Array<BehaviorAssertion> = [];
  const kept: Array<KeptAssertion> = [];
  rawAssertions.forEach((assertion, index) => {
    Option.match(toEditable(assertion), {
      onNone: () => {
        kept.push({ index, value: assertion });
      },
      onSome: (editable) => {
        asserts.push({ ...editable, source: assertion });
      },
    });
  });
  const id = entry.id;
  return {
    text: typeof id === 'string' ? id.replace(/-/g, ' ') : typeof id === 'number' ? String(id) : '',
    prompt: typeof entry.prompt === 'string' ? entry.prompt : '',
    asserts,
    source: entry,
    ...(kept.length > 0 ? { kept } : {}),
  };
};

/** Rows (without ids) for an evals.json loaded from disk, and its top-level fields. */
export const behaviorsFromEvalsJson = (
  evals: unknown,
): Readonly<{ skill: string; seeds: ReadonlyArray<BehaviorSeed>; source: unknown }> => {
  if (!isRecord(evals) || !globalThis.Array.isArray(evals.evals)) {
    return { skill: '', seeds: [], source: undefined };
  }
  const skill = typeof evals.skill_name === 'string' && evals.skill_name.trim() !== '' ? evals.skill_name : '';
  const seeds = Array.getSomes(
    Array.map(evals.evals as ReadonlyArray<unknown>, (entry): Option.Option<BehaviorSeed> =>
      isRecord(entry) ? Option.some(toCaseSeed(entry)) : Option.none(),
    ),
  );
  const { evals: _cases, ...topLevel } = evals;
  return { skill, seeds, source: { ...topLevel, evals: [] } };
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
