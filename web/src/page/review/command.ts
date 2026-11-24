import { BrowserCrypto } from '@effect/platform-browser';
import { Array, Clock, Effect, Option, Schema } from 'effect';
import { SecureRandom } from 'effect/crypto';
import { Command, File } from 'foldkit';

import { addFeedback, type FeedbackRecord } from '@/persistence/feedback';
import type { ImprovePlanRecord } from '@/persistence/improvePlans';
import { loadPreferences, savePreferences } from '@/persistence/effect';
import { deleteFeedback, listFeedback, listImprovePlans } from '@/persistence/review';
import { DAEMON_URL } from '@/shell/daemon';

import { fromDaemonRuns, sampleRunJson } from './artifact';
import { ProposedPlan, ReviewRun, type FeedbackNote, type ImprovePlanSummary } from './domain';
import { readImportedRuns, writeImportedRuns } from './importedRuns';
import { Message } from './message';
import { derivePlan, planFileName, planToJson, runNotesOldestFirst } from './plan';

const errorMessage =
  (fallback: string) =>
  (error: unknown): string =>
    error instanceof Error ? error.message : fallback;

const attempt = <A>(run: (signal: AbortSignal) => Promise<A>, fallback: string): Effect.Effect<A, string> =>
  Effect.tryPromise({ try: run, catch: errorMessage(fallback) });

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  Boolean(value && typeof value === 'object' && !globalThis.Array.isArray(value));

const readJson = async (response: Response): Promise<unknown> => {
  const text = await response.text();
  return text.trim() ? (JSON.parse(text) as unknown) : {};
};

const toFeedbackNote = (record: FeedbackRecord): FeedbackNote => ({
  noteId: record.noteId,
  runId: record.runId,
  maybeCaseId: Option.fromNullishOr(record.caseId),
  note: record.note,
  createdAt: record.createdAt,
});

const toImprovePlanSummary = (record: ImprovePlanRecord): ImprovePlanSummary => ({
  planId: record.planId,
  runId: record.runId,
  status: record.status,
  createdAt: record.createdAt,
});

const readFeedbackNotes: Effect.Effect<ReadonlyArray<FeedbackNote>, string> = attempt(
  () => listFeedback(),
  'reading feedback failed',
).pipe(Effect.map(Array.map(toFeedbackNote)));

const nowIso = Clock.currentTimeMillis.pipe(Effect.map((millis) => new Date(millis).toISOString()));

export const LoadReviewData = Command.define('LoadReviewData', {
  messages: [Message.CompletedLoadReviewData],
  execute: Effect.all({
    importedRuns: readImportedRuns,
    feedback: readFeedbackNotes.pipe(Effect.catch(() => Effect.succeed([]))),
    improvePlans: attempt(() => listImprovePlans(), 'reading change plans failed').pipe(
      Effect.map(Array.map(toImprovePlanSummary)),
      Effect.catch(() => Effect.succeed([])),
    ),
    maybeLastRunId: loadPreferences.pipe(
      Effect.map((prefs) => Option.fromNullishOr(prefs.lastRunId)),
      Effect.catch(() => Effect.succeed(Option.none<string>())),
    ),
    nowMillis: Clock.currentTimeMillis,
  }).pipe(Effect.map((data) => Message.CompletedLoadReviewData(data))),
});

export const FetchRuns = Command.define('FetchRuns', {
  args: { root: Schema.String, maybeSkillId: Schema.Option(Schema.String) },
  messages: [Message.SucceededFetchRuns, Message.FailedFetchRuns],
  interrupt: true,
  execute: ({ root, maybeSkillId }) =>
    attempt(async (signal) => {
      const query = new URLSearchParams({ root });
      if (Option.isSome(maybeSkillId)) {
        query.set('skill', maybeSkillId.value);
      }
      const response = await fetch(`${DAEMON_URL}/runs?${query.toString()}`, { signal });
      if (!response.ok) {
        throw new Error(`runs lookup failed with ${response.status}`);
      }
      return (await response.json()) as unknown;
    }, 'runs lookup failed').pipe(
      Effect.flatMap((payload) =>
        Clock.currentTimeMillis.pipe(
          Effect.map((nowMillis) =>
            Message.SucceededFetchRuns({ runs: fromDaemonRuns(payload), maybeSkillId, nowMillis }),
          ),
        ),
      ),
      Effect.catch(() => Effect.succeed(Message.FailedFetchRuns())),
    ),
});

export const GetInspectionTime = Command.define('GetInspectionTime', {
  messages: [Message.CompletedGetInspectionTime],
  execute: Clock.currentTimeMillis.pipe(Effect.map((nowMillis) => Message.CompletedGetInspectionTime({ nowMillis }))),
});

export const CreateSampleArtifact = Command.define('CreateSampleArtifact', {
  messages: [Message.CompletedCreateSampleArtifact],
  execute: Clock.currentTimeMillis.pipe(
    Effect.map((nowMillis) =>
      Message.CompletedCreateSampleArtifact({ text: sampleRunJson(new Date(nowMillis).toISOString()), nowMillis }),
    ),
  ),
});

export const ReadImportFile = Command.define('ReadImportFile', {
  args: { file: File.File },
  messages: [Message.SucceededReadImportFile, Message.FailedReadImportFile],
  execute: ({ file }) =>
    Effect.all({ text: File.readAsText(file), nowMillis: Clock.currentTimeMillis }).pipe(
      Effect.map(({ text, nowMillis }) => Message.SucceededReadImportFile({ text, nowMillis })),
      Effect.catch(() => Effect.succeed(Message.FailedReadImportFile())),
    ),
});

export const StoreImportedRuns = Command.define('StoreImportedRuns', {
  args: { runs: Schema.Array(ReviewRun) },
  messages: [Message.CompletedStoreImportedRuns],
  execute: ({ runs }) => writeImportedRuns(runs).pipe(Effect.as(Message.CompletedStoreImportedRuns())),
});

export const SaveLastRunId = Command.define('SaveLastRunId', {
  args: { runId: Schema.String },
  messages: [Message.CompletedSaveLastRunId],
  execute: ({ runId }) => savePreferences({ lastRunId: runId }).pipe(Effect.as(Message.CompletedSaveLastRunId())),
});

export const AddFeedback = Command.define('AddFeedback', {
  args: { runId: Schema.String, maybeCaseId: Schema.Option(Schema.String), note: Schema.String },
  messages: [Message.SucceededAddFeedback, Message.FailedAddFeedback],
  execute: ({ runId, maybeCaseId, note }) =>
    attempt(() => addFeedback({ runId, caseId: Option.getOrUndefined(maybeCaseId), note }), 'recording feedback failed').pipe(
      Effect.andThen(readFeedbackNotes),
      Effect.map((feedback) => Message.SucceededAddFeedback({ feedback })),
      Effect.catch(() => Effect.succeed(Message.FailedAddFeedback())),
    ),
});

export const ConfirmRemoveFeedback = Command.define('ConfirmRemoveFeedback', {
  args: { noteId: Schema.String },
  messages: [Message.CompletedConfirmRemoveFeedback],
  execute: ({ noteId }) =>
    Effect.sync(() => window.confirm('Remove this feedback note?')).pipe(
      Effect.catch(() => Effect.succeed(false)),
      Effect.map((confirmed) => Message.CompletedConfirmRemoveFeedback({ noteId, confirmed })),
    ),
});

export const DeleteFeedback = Command.define('DeleteFeedback', {
  args: { noteId: Schema.String },
  messages: [Message.SucceededDeleteFeedback, Message.FailedDeleteFeedback],
  execute: ({ noteId }) =>
    attempt(() => deleteFeedback(noteId), 'removing feedback failed').pipe(
      Effect.andThen(readFeedbackNotes),
      Effect.map((feedback) => Message.SucceededDeleteFeedback({ feedback })),
      Effect.catch(() => Effect.succeed(Message.FailedDeleteFeedback())),
    ),
});

const newPlanId = Effect.gen(function* () {
  const random = yield* SecureRandom.SecureRandom;
  return yield* random.uuidV4();
}).pipe(Effect.provide(BrowserCrypto.layerSecureRandom));

export const DerivePlan = Command.define('DerivePlan', {
  args: { runId: Schema.String, workspaceRoot: Schema.String, maybeEvalsJson: Schema.Option(Schema.Unknown) },
  messages: [Message.SucceededDerivePlan, Message.FailedDerivePlan],
  execute: ({ runId, workspaceRoot, maybeEvalsJson }) =>
    readFeedbackNotes.pipe(
      Effect.map((notes) => runNotesOldestFirst(notes, runId)),
      Effect.flatMap((notes) =>
        Array.isReadonlyArrayEmpty(notes)
          ? Effect.fail('at least one feedback note is required')
          : Effect.all({ planId: newPlanId, nowIso }).pipe(
              Effect.map(({ planId, nowIso: now }) =>
                derivePlan({ planId, nowIso: now, runId, workspaceRoot, maybeEvalsJson, notes }),
              ),
            ),
      ),
      Effect.map((plan) => Message.SucceededDerivePlan({ plan })),
      Effect.catch((error) => Effect.succeed(Message.FailedDerivePlan({ error }))),
    ),
});

export const DownloadPlan = Command.define('DownloadPlan', {
  args: { plan: ProposedPlan, skill: Schema.String },
  messages: [Message.SucceededDownloadPlan, Message.FailedDownloadPlan],
  execute: ({ plan, skill }) =>
    nowIso.pipe(
      Effect.flatMap((now) =>
        Effect.try(() => {
          const blob = new Blob([`${JSON.stringify(planToJson(plan), null, 2)}\n`], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const anchor = document.createElement('a');
          anchor.href = url;
          anchor.download = planFileName(plan, skill, now);
          document.body.append(anchor);
          anchor.click();
          anchor.remove();
          URL.revokeObjectURL(url);
        }),
      ),
      Effect.as(Message.SucceededDownloadPlan()),
      Effect.catch(() => Effect.succeed(Message.FailedDownloadPlan())),
    ),
});

const daemonError = (payload: unknown, fallback: string): string =>
  isRecord(payload) && typeof payload.error === 'string' && payload.error !== '' ? payload.error : fallback;

export const StagePlan = Command.define('StagePlan', {
  args: { plan: ProposedPlan, runId: Schema.String, workspaceRoot: Schema.String },
  messages: [Message.SucceededStagePlan, Message.FailedStagePlan],
  execute: ({ plan, runId, workspaceRoot }) =>
    readFeedbackNotes.pipe(
      Effect.map((notes) =>
        Array.filter(notes, (note) => Array.contains(plan.sourceNoteIds, note.noteId)).map((note) => ({
          caseId: Option.getOrNull(note.maybeCaseId),
          note: note.note,
        })),
      ),
      Effect.flatMap((notes) =>
        attempt(async () => {
          const response = await fetch(`${DAEMON_URL}/apply-plan`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ kind: 'improve', skillDir: workspaceRoot, runId, notes }),
          });
          const payload = await readJson(response);
          if (!response.ok) {
            throw new Error(daemonError(payload, `apply plan failed with ${response.status}`));
          }
          if (!isRecord(payload) || typeof payload.planId !== 'string' || typeof payload.stagingPath !== 'string') {
            throw new Error('apply plan returned an invalid response');
          }
          return { planId: payload.planId, stagingPath: payload.stagingPath, diff: payload.diff ?? null };
        }, 'propose plan failed'),
      ),
    ).pipe(
      Effect.map((staged) => Message.SucceededStagePlan({ staged })),
      Effect.catch((error) => Effect.succeed(Message.FailedStagePlan({ error }))),
    ),
});

const postApplyAction = (planId: string, action: 'cancel' | 'commit') =>
  attempt(async () => {
    const response = await fetch(`${DAEMON_URL}/apply-plan/${encodeURIComponent(planId)}/${action}`, {
      method: 'POST',
    });
    const payload = await readJson(response);
    if (!response.ok) {
      throw new Error(daemonError(payload, `${action} failed with ${response.status}`));
    }
    if (!isRecord(payload)) {
      throw new Error('apply action returned an invalid response');
    }
    return {
      planId: typeof payload.planId === 'string' ? payload.planId : planId,
      maybePath: typeof payload.path === 'string' ? Option.some(payload.path) : Option.none(),
    };
  }, `${action} failed`);

export const CommitPlan = Command.define('CommitPlan', {
  args: { planId: Schema.String },
  messages: [Message.SucceededCommitPlan, Message.FailedCommitPlan],
  execute: ({ planId }) =>
    postApplyAction(planId, 'commit').pipe(
      Effect.map((result) => Message.SucceededCommitPlan({ result })),
      Effect.catch((error) => Effect.succeed(Message.FailedCommitPlan({ error }))),
    ),
});

export const CancelPlan = Command.define('CancelPlan', {
  args: { planId: Schema.String },
  messages: [Message.SucceededCancelPlan, Message.FailedCancelPlan],
  execute: ({ planId }) =>
    postApplyAction(planId, 'cancel').pipe(
      Effect.map((result) => Message.SucceededCancelPlan({ result })),
      Effect.catch((error) => Effect.succeed(Message.FailedCancelPlan({ error }))),
    ),
});
