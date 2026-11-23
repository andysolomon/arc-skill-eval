/**
 * Side effects of the Create wizard: draft persistence, the evals.json
 * download, and the localhost daemon calls (draft, suggest, load, stage,
 * apply, discard). Every Command turns its failures into a Message.
 */

import { Array, Clock, Effect, Option, Random, Schema } from 'effect';
import { Command } from 'foldkit';

import { readCreateProgress, writeCreateProgress, CREATE_WIZARD_CHAPTER_ID } from '@/persistence/createProgress';
import { DAEMON_URL } from '@/shell/daemon';

import {
  BehaviorRow,
  Dimension,
  Draft,
  Flavor,
  Step,
  assembleEvalsJson,
  behaviorsFromEvalsJson,
  defaultDraft,
  extractGeneratedBehaviors,
  isAssertionKind,
  isDimension,
  isFlavor,
  makeBehaviorRow,
  parseModel,
  stepIndex,
  steps,
  stripTrailingPeriod,
  type BehaviorAssertion,
  type BehaviorSeed,
} from './domain';
import { Message } from './message';
import { SuggestTarget, type StagedPlan } from './model';

// HELPERS

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !globalThis.Array.isArray(value);

const errorMessage = (cause: unknown, fallback: string): string =>
  cause instanceof Error && cause.message !== '' ? cause.message : fallback;

const daemonCall = <A>(run: () => Promise<A>, fallback: string): Effect.Effect<A, string> =>
  Effect.tryPromise({ try: run, catch: (cause) => errorMessage(cause, fallback) });

const readJson = async (response: Response): Promise<unknown> => {
  const text = await response.text();
  return text.trim() === '' ? {} : (JSON.parse(text) as unknown);
};

const readJsonError = async (response: Response): Promise<Option.Option<string>> => {
  try {
    const payload = (await response.json()) as unknown;
    return isRecord(payload) && typeof payload.error === 'string' && payload.error.trim() !== ''
      ? Option.some(payload.error.trim())
      : Option.none();
  } catch {
    return Option.none();
  }
};

const postJson = (path: string, body: unknown): Promise<Response> =>
  fetch(`${DAEMON_URL}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

const withModel = (assistModel: string): Record<string, unknown> =>
  Option.match(parseModel(assistModel), {
    onNone: () => ({}),
    onSome: (model) => ({ model }),
  });

const createRowId: Effect.Effect<string> = Effect.gen(function* () {
  const millis = yield* Clock.currentTimeMillis;
  const random = yield* Random.next;
  return `behavior-${millis.toString(36)}-${random.toString(36).slice(2, 8)}`;
});

const toRows = (seeds: ReadonlyArray<BehaviorSeed>): Effect.Effect<ReadonlyArray<BehaviorRow>> =>
  Effect.forEach(seeds, (seed) => Effect.map(createRowId, (id) => makeBehaviorRow(id, seed)));

// PERSISTENCE

const normalizeDraft = (value: unknown): Draft => {
  if (!isRecord(value)) {
    return defaultDraft;
  }
  return {
    skill: typeof value.skill === 'string' ? value.skill : defaultDraft.skill,
    behaviors: Option.getOrElse(
      Schema.decodeUnknownOption(Schema.Array(BehaviorRow))(value.behaviors),
      () => defaultDraft.behaviors,
    ),
    ...(isRecord(value.source) ? { source: value.source } : {}),
  };
};

const toLoadedProgress = (record: unknown): ReturnType<typeof Message.CompletedLoadCreateProgress> => {
  if (!isRecord(record)) {
    return Message.CompletedLoadCreateProgress({ maybeDraft: Option.none(), maybeStep: Option.none() });
  }
  return Message.CompletedLoadCreateProgress({
    maybeDraft: record.draft ? Option.some(normalizeDraft(record.draft)) : Option.none(),
    maybeStep: Schema.decodeUnknownOption(Step)(record.activeStep ?? record.lastVisited),
  });
};

export const LoadCreateProgress = Command.define('LoadCreateProgress', {
  messages: [Message.CompletedLoadCreateProgress],
  execute: Effect.tryPromise(() => readCreateProgress()).pipe(
    Effect.map(toLoadedProgress),
    Effect.catch(() =>
      Effect.succeed(Message.CompletedLoadCreateProgress({ maybeDraft: Option.none(), maybeStep: Option.none() })),
    ),
  ),
});

export const SaveCreateProgress = Command.define('SaveCreateProgress', {
  args: { step: Step, draft: Draft },
  messages: [Message.CompletedSaveCreateProgress],
  execute: ({ step, draft }) =>
    Effect.tryPromise(() =>
      writeCreateProgress({
        chapterId: CREATE_WIZARD_CHAPTER_ID,
        scrollPos: stepIndex(step),
        completedSteps: steps.slice(0, stepIndex(step)),
        lastVisited: step,
        activeStep: step,
        draft,
      }),
    ).pipe(Effect.ignore, Effect.as(Message.CompletedSaveCreateProgress())),
});

// ROWS

export const CreateBehaviorId = Command.define('CreateBehaviorId', {
  messages: [Message.CompletedCreateBehaviorId],
  execute: Effect.map(createRowId, (id) => Message.CompletedCreateBehaviorId({ id })),
});

// DOWNLOAD

export const DownloadEvalsJson = Command.define('DownloadEvalsJson', {
  args: { contents: Schema.String },
  messages: [Message.CompletedDownloadEvalsJson],
  execute: ({ contents }) =>
    Effect.try(() => {
      const blob = new Blob([contents], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'evals.json';
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    }).pipe(
      Effect.ignore,
      Effect.as(Message.CompletedDownloadEvalsJson()),
    ),
});

// SUGGEST

type SuggestKind = 'behavior' | 'prompt' | 'assertion' | 'dimension' | 'flavor';

const postSuggestion = async (
  kind: SuggestKind,
  skill: string,
  context: Record<string, unknown>,
  assistModel: string,
): Promise<Record<string, unknown>> => {
  const response = await postJson('/suggest', { kind, skill, context, ...withModel(assistModel) });
  if (!response.ok) {
    const maybeError = await readJsonError(response);
    throw new Error(Option.getOrElse(maybeError, () => `suggest failed with ${response.status}`));
  }
  const payload = (await response.json()) as unknown;
  if (!isRecord(payload) || payload.ok !== true) {
    throw new Error('suggest returned an invalid response');
  }
  return payload;
};

const suggest = <A>(run: () => Promise<A>): Effect.Effect<A, string> => daemonCall(run, 'suggest failed');

const failedSuggest = (target: SuggestTarget) => (error: string) =>
  Effect.succeed(Message.FailedSuggest({ target, error }));

export const SuggestBehavior = Command.define('SuggestBehavior', {
  args: { skill: Schema.String, existing: Schema.Array(Schema.String), assistModel: Schema.String },
  messages: [Message.SucceededSuggestBehavior, Message.FailedSuggest],
  execute: ({ skill, existing, assistModel }) =>
    suggest(async () => {
      const payload = await postSuggestion('behavior', skill, { existing }, assistModel);
      const behavior = payload.behavior;
      if (!isRecord(behavior) || typeof behavior.text !== 'string' || !isDimension(behavior.dim)) {
        throw new Error('suggest returned an invalid behavior');
      }
      return { text: behavior.text, dim: behavior.dim };
    }).pipe(
      Effect.flatMap((seed) => Effect.map(createRowId, (id) => makeBehaviorRow(id, seed))),
      Effect.map((row) => Message.SucceededSuggestBehavior({ row })),
      Effect.catch(failedSuggest(SuggestTarget.Behavior())),
    ),
});

export const SuggestDimension = Command.define('SuggestDimension', {
  args: { rowId: Schema.String, skill: Schema.String, behavior: Schema.String, assistModel: Schema.String },
  messages: [Message.SucceededSuggestDimension, Message.FailedSuggest],
  execute: ({ rowId, skill, behavior, assistModel }) =>
    suggest(async (): Promise<Dimension> => {
      const payload = await postSuggestion('dimension', skill, { behavior }, assistModel);
      if (!isDimension(payload.dim)) {
        throw new Error('suggest returned an invalid dimension');
      }
      return payload.dim;
    }).pipe(
      Effect.map((dim) => Message.SucceededSuggestDimension({ rowId, dim })),
      Effect.catch(failedSuggest(SuggestTarget.Dimension({ rowId }))),
    ),
});

export const SuggestPrompt = Command.define('SuggestPrompt', {
  args: {
    rowId: Schema.String,
    skill: Schema.String,
    behavior: Schema.String,
    dim: Dimension,
    flavor: Flavor,
    fallback: Schema.String,
    assistModel: Schema.String,
  },
  messages: [Message.SucceededSuggestPrompt, Message.FailedSuggestPrompt],
  execute: ({ rowId, skill, behavior, dim, flavor, fallback, assistModel }) =>
    suggest(async () => {
      const payload = await postSuggestion('prompt', skill, { behavior, dim, flavor }, assistModel);
      if (typeof payload.prompt !== 'string' || payload.prompt.trim() === '') {
        throw new Error('suggest returned an invalid prompt');
      }
      return payload.prompt.trim();
    }).pipe(
      Effect.map((prompt) => Message.SucceededSuggestPrompt({ rowId, prompt })),
      Effect.catch((error) => Effect.succeed(Message.FailedSuggestPrompt({ rowId, error, fallback }))),
    ),
});

export const SuggestFlavor = Command.define('SuggestFlavor', {
  args: { rowId: Schema.String, skill: Schema.String, behavior: Schema.String, prompt: Schema.String, assistModel: Schema.String },
  messages: [Message.SucceededSuggestFlavor, Message.FailedSuggest],
  execute: ({ rowId, skill, behavior, prompt, assistModel }) =>
    suggest(async (): Promise<Flavor> => {
      const payload = await postSuggestion('flavor', skill, { behavior, prompt }, assistModel);
      if (!isFlavor(payload.flavor)) {
        throw new Error('suggest returned an invalid flavor');
      }
      return payload.flavor;
    }).pipe(
      Effect.map((flavor) => Message.SucceededSuggestFlavor({ rowId, flavor })),
      Effect.catch(failedSuggest(SuggestTarget.Flavor({ rowId }))),
    ),
});

export const SuggestAssertion = Command.define('SuggestAssertion', {
  args: { rowId: Schema.String, skill: Schema.String, behavior: Schema.String, prompt: Schema.String, assistModel: Schema.String },
  messages: [Message.SucceededSuggestAssertion, Message.FailedSuggest],
  execute: ({ rowId, skill, behavior, prompt, assistModel }) =>
    suggest(async (): Promise<BehaviorAssertion> => {
      const payload = await postSuggestion('assertion', skill, { behavior, prompt }, assistModel);
      const assertion = payload.assertion;
      const kind = isRecord(assertion) ? String(assertion.kind) : '';
      if (!isRecord(assertion) || typeof assertion.val !== 'string' || !isAssertionKind(kind)) {
        throw new Error('suggest returned an invalid assertion');
      }
      return { kind, val: assertion.val };
    }).pipe(
      Effect.map((assertion) => Message.SucceededSuggestAssertion({ rowId, assertion })),
      Effect.catch(failedSuggest(SuggestTarget.Assertion({ rowId }))),
    ),
});

// DRAFT AND LOAD

export const GenerateEvals = Command.define('GenerateEvals', {
  args: { skillId: Schema.String, skillPath: Schema.String, assistModel: Schema.String },
  messages: [Message.SucceededGenerateEvals, Message.FailedGenerateEvals],
  execute: ({ skillId, skillPath, assistModel }) =>
    daemonCall(async () => {
      const response = await postJson('/generate-evals', {
        workspaceRoot: skillPath,
        behaviors: [],
        ...withModel(assistModel),
      });
      if (!response.ok) {
        const maybeError = await readJsonError(response);
        throw new Error(Option.getOrElse(maybeError, () => `generate evals failed with ${response.status}`));
      }
      const partial = (await response.json()) as unknown;
      if (!isRecord(partial)) {
        throw new Error('generate evals returned an invalid response');
      }
      return extractGeneratedBehaviors(partial);
    }, 'generate evals failed').pipe(
      Effect.flatMap((behaviors) =>
        toRows(Array.map(behaviors, (text) => ({ text: stripTrailingPeriod(text), flavor: 'implicit' as const }))),
      ),
      Effect.map((rows) => Message.SucceededGenerateEvals({ skill: skillId, rows })),
      Effect.catch((error) => Effect.succeed(Message.FailedGenerateEvals({ error }))),
    ),
});

export const LoadSkillEvals = Command.define('LoadSkillEvals', {
  args: { skillId: Schema.String, skillPath: Schema.String },
  messages: [Message.SucceededLoadSkillEvals, Message.FailedLoadSkillEvals],
  execute: ({ skillId, skillPath }) =>
    daemonCall(async () => {
      const response = await fetch(`${DAEMON_URL}/skill-evals?root=${encodeURIComponent(skillPath)}`);
      const data = (await response.json()) as unknown;
      if (!isRecord(data) || !data.ok) {
        const error = isRecord(data) && typeof data.error === 'string' ? data.error : '';
        throw new Error(error || 'could not load evals.json');
      }
      return behaviorsFromEvalsJson(data.evals);
    }, 'could not load evals.json').pipe(
      Effect.flatMap(({ skill, seeds, source }) =>
        Effect.map(toRows(seeds), (rows) =>
          Message.SucceededLoadSkillEvals({ skill: skill || skillId, rows, skillPath, source }),
        ),
      ),
      Effect.catch((error) => Effect.succeed(Message.FailedLoadSkillEvals({ error }))),
    ),
});

// STAGE, APPLY, DISCARD

const toStagedPlan = (payload: unknown): StagedPlan => {
  if (!isRecord(payload) || typeof payload.planId !== 'string' || typeof payload.stagingPath !== 'string') {
    throw new Error('apply plan returned an invalid response');
  }
  return {
    planId: payload.planId,
    stagingPath: payload.stagingPath,
    diffText: JSON.stringify(payload.diff ?? null, null, 2),
  };
};

/** Stage the suite for <skillDir>/evals/evals.json; the daemon validates it and answers with a diff. */
export const StagePlan = Command.define('StagePlan', {
  args: { skillDir: Schema.String, draft: Draft },
  messages: [Message.SucceededStagePlan, Message.FailedStagePlan],
  execute: ({ skillDir, draft }) =>
    daemonCall(async () => {
      const response = await postJson('/apply-plan', { kind: 'evals', skillDir, evals: assembleEvalsJson(draft) });
      if (!response.ok) {
        const maybeError = await readJsonError(response);
        throw new Error(Option.getOrElse(maybeError, () => `apply plan failed with ${response.status}`));
      }
      return toStagedPlan(await readJson(response));
    }, 'apply plan failed').pipe(
      Effect.map((plan) => Message.SucceededStagePlan({ plan })),
      Effect.catch((error) => Effect.succeed(Message.FailedStagePlan({ error }))),
    ),
});

const planUrl = (planId: string, action: 'commit' | 'cancel'): string =>
  `${DAEMON_URL}/apply-plan/${encodeURIComponent(planId)}/${action}`;

export const CommitPlan = Command.define('CommitPlan', {
  args: { planId: Schema.String },
  messages: [Message.SucceededCommitPlan, Message.FailedCommitPlan],
  execute: ({ planId }) =>
    daemonCall(async () => {
      const response = await fetch(planUrl(planId, 'commit'), { method: 'POST' });
      if (!response.ok) {
        const maybeError = await readJsonError(response);
        throw new Error(Option.getOrElse(maybeError, () => `commit failed with ${response.status}`));
      }
      const result = await readJson(response);
      return isRecord(result) && typeof result.path === 'string' ? Option.some(result.path) : Option.none<string>();
    }, 'commit failed').pipe(
      Effect.map((maybePath) => Message.SucceededCommitPlan({ maybePath })),
      Effect.catch((error) => Effect.succeed(Message.FailedCommitPlan({ error }))),
    ),
});

export const CancelPlan = Command.define('CancelPlan', {
  args: { planId: Schema.String },
  messages: [Message.SucceededCancelPlan, Message.FailedCancelPlan],
  execute: ({ planId }) =>
    daemonCall(async () => {
      const response = await fetch(planUrl(planId, 'cancel'), { method: 'POST' });
      if (!response.ok) {
        throw new Error(`cancel failed with ${response.status}`);
      }
    }, 'cancel failed').pipe(
      Effect.as(Message.SucceededCancelPlan()),
      Effect.catch((error) => Effect.succeed(Message.FailedCancelPlan({ error }))),
    ),
});
