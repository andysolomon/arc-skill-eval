/**
 * Change plans derived from feedback notes. Pure: the caller supplies the
 * plan id and timestamp.
 */

import { Array, Option, Order, pipe } from 'effect';

import type { FeedbackNote, ProposedPlan } from './domain';

type JsonRecord = Readonly<Record<string, unknown>>;

const isRecord = (value: unknown): value is JsonRecord =>
  Boolean(value && typeof value === 'object' && !globalThis.Array.isArray(value));

const stringifySnippet = (value: unknown): string => {
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (!value) {
    return '';
  }
  return JSON.stringify(value, null, 2);
};

const readEvalCases = (evalsJson: unknown): ReadonlyArray<JsonRecord> => {
  if (!isRecord(evalsJson)) {
    return [];
  }
  const rawCases = globalThis.Array.isArray(evalsJson.evals)
    ? evalsJson.evals
    : globalThis.Array.isArray(evalsJson.cases)
      ? evalsJson.cases
      : [];
  return Array.filter(rawCases as ReadonlyArray<unknown>, isRecord);
};

const readCaseId = (testCase: JsonRecord): Option.Option<string> => {
  const id = testCase.id ?? testCase.caseId ?? testCase.name;
  return typeof id === 'string' && id.trim() ? Option.some(id) : Option.none();
};

const summarizeCase = (maybeEvalsJson: Option.Option<unknown>, maybeCaseId: Option.Option<string>): string =>
  Option.match(maybeCaseId, {
    onNone: () => 'Run-level feedback.',
    onSome: (caseId) => {
      const evalCases = Option.match(maybeEvalsJson, { onNone: () => [], onSome: readEvalCases });
      // Runs on disk name each case folder eval-<case id>.
      const ids = [caseId, caseId.replace(/^eval-/, '')];
      return Option.match(
        Array.findFirst(evalCases, (testCase) =>
          Option.match(readCaseId(testCase), { onNone: () => false, onSome: (id) => ids.includes(id) }),
        ),
        {
          onNone: () => `No eval case with id ${caseId} was found.`,
          onSome: (matchedCase) => {
            const prompt = stringifySnippet(matchedCase.prompt ?? matchedCase.input ?? matchedCase.messages);
            return prompt ? `${caseId}: ${prompt}` : stringifySnippet(matchedCase);
          },
        },
      );
    },
  });

const byCreatedAt = Order.mapInput(Order.String, (note: FeedbackNote) => note.createdAt);

/** A run's notes, oldest first (the order plan items are listed in). */
export const runNotesOldestFirst = (
  notes: ReadonlyArray<FeedbackNote>,
  runId: string,
): ReadonlyArray<FeedbackNote> =>
  pipe(
    notes,
    Array.filter((note) => note.runId === runId),
    Array.sort(byCreatedAt),
  );

/** A run's notes, newest first (the order the feedback panel lists them in). */
export const runNotesNewestFirst = (
  notes: ReadonlyArray<FeedbackNote>,
  runId: string,
): ReadonlyArray<FeedbackNote> =>
  pipe(
    notes,
    Array.filter((note) => note.runId === runId),
    Array.sort(Order.flip(byCreatedAt)),
  );

export const derivePlan = (
  config: Readonly<{
    planId: string;
    nowIso: string;
    runId: string;
    workspaceRoot: string;
    maybeEvalsJson: Option.Option<unknown>;
    notes: ReadonlyArray<FeedbackNote>;
  }>,
): ProposedPlan => ({
  planId: config.planId,
  runId: config.runId,
  workspaceRoot: config.workspaceRoot,
  maybeEvalsJson: config.maybeEvalsJson,
  sourceNoteIds: Array.map(config.notes, (note) => note.noteId),
  items: Array.map(config.notes, (note) => ({
    path: 'evals/evals.json',
    before: summarizeCase(config.maybeEvalsJson, note.maybeCaseId),
    after: note.note,
    rationale: `Feedback Note ${note.noteId} for ${Option.getOrElse(note.maybeCaseId, () => 'run')}`,
  })),
  createdAt: config.nowIso,
  updatedAt: config.nowIso,
});

/** The plan as the daemon and the downloaded file see it (same keys as the React app). */
export const planToJson = (plan: ProposedPlan): JsonRecord => ({
  planId: plan.planId,
  runId: plan.runId,
  workspaceRoot: plan.workspaceRoot,
  evalsJson: Option.getOrUndefined(plan.maybeEvalsJson),
  sourceNoteIds: plan.sourceNoteIds,
  items: plan.items,
  createdAt: plan.createdAt,
  updatedAt: plan.updatedAt,
});

const safeFilePart = (value: string): string =>
  value
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'review';

export const planFileName = (plan: ProposedPlan, skill: string, nowIso: string): string =>
  `improve-plan-${safeFilePart(skill)}-${safeFilePart(plan.runId)}-${nowIso.replace(/[:.]/g, '-')}.json`;
