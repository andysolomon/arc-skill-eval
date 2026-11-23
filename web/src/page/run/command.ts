/**
 * Run section Commands: the daemon's `/runs` endpoints, the selected skill's
 * case ids, the remembered last run id, and the browser alert for refusals.
 */

import { Clock, Effect, Option, Schema } from 'effect';
import { Command } from 'foldkit';

import { loadPreferences, savePreferences } from '@/persistence/effect';
import { DAEMON_URL } from '@/shell/daemon';

import { Composer } from './composer';
import { Message } from './message';

const DAEMON_RUNS_URL = `${DAEMON_URL}/runs`;

// START

const RunStartResponse = Schema.Struct({
  runId: Schema.optional(Schema.Unknown),
  id: Schema.optional(Schema.Unknown),
  wsUrl: Schema.optional(Schema.Unknown),
  websocketUrl: Schema.optional(Schema.Unknown),
});

const RunRejection = Schema.Struct({ error: Schema.optional(Schema.Unknown) });

const nonEmptyString = (value: unknown): Option.Option<string> =>
  typeof value === 'string' && value !== '' ? Option.some(value) : Option.none();

/** The daemon may answer with an http(s) or relative socket URL; normalise it to ws(s). */
const toSocketUrl = (wsUrl: string): string => {
  const parsed = new URL(wsUrl, DAEMON_RUNS_URL);
  if (parsed.protocol === 'http:') {
    parsed.protocol = 'ws:';
  }
  if (parsed.protocol === 'https:') {
    parsed.protocol = 'wss:';
  }
  return parsed.toString();
};

const rejectionMessage = async (response: Response): Promise<string> => {
  const fallback = `Daemon rejected run with ${response.status}`;
  try {
    const body = Schema.decodeUnknownOption(RunRejection)(await response.json());
    return Option.getOrElse(
      Option.flatMap(body, ({ error }) => nonEmptyString(error)),
      () => fallback,
    );
  } catch {
    return fallback;
  }
};

const postRun = async (composer: Composer): Promise<Readonly<{ runId: string; socketUrl: string }>> => {
  const response = await fetch(DAEMON_RUNS_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      workspaceRoot: composer.workspaceRoot,
      case: composer.case,
      model: composer.model,
      judgeModel: composer.judgeModel,
      compare: composer.compare,
      extraSkill: composer.extraSkill,
      iteration: composer.iteration,
      contextMode: composer.contextMode,
      sandbox: composer.sandbox,
    }),
  });

  if (!response.ok) {
    throw new Error(await rejectionMessage(response));
  }

  const result = Schema.decodeUnknownOption(RunStartResponse)(await response.json());
  const maybeRunId = Option.flatMap(result, ({ runId, id }) => Option.orElse(nonEmptyString(runId), () => nonEmptyString(id)));
  const maybeWsUrl = Option.flatMap(result, ({ wsUrl, websocketUrl }) =>
    Option.orElse(nonEmptyString(wsUrl), () => nonEmptyString(websocketUrl)),
  );

  if (Option.isNone(maybeRunId) || Option.isNone(maybeWsUrl)) {
    throw new Error('Daemon response did not include runId and wsUrl');
  }

  return { runId: maybeRunId.value, socketUrl: toSocketUrl(maybeWsUrl.value) };
};

const errorMessage = (error: unknown): string => (error instanceof Error ? error.message : 'Run failed.');

export const StartRun = Command.define('StartRun', {
  args: { attempt: Schema.Number, composer: Composer },
  messages: [Message.SucceededStartRun, Message.FailedStartRun],
  execute: ({ attempt, composer }) =>
    Clock.currentTimeMillis.pipe(
      Effect.flatMap((startedAtMs) =>
        Effect.tryPromise({ try: () => postRun(composer), catch: errorMessage }).pipe(
          Effect.map(({ runId, socketUrl }) => Message.SucceededStartRun({ attempt, runId, socketUrl, startedAtMs })),
        ),
      ),
      Effect.catch((error) => Effect.succeed(Message.FailedStartRun({ attempt, error }))),
    ),
});

// CANCEL

/** Ask the daemon to abort the run; it stops the in-flight case and ends the run with run.cancelled. */
export const DeleteRun = Command.define('DeleteRun', {
  args: { runId: Schema.String },
  messages: [Message.CompletedDeleteRun],
  execute: ({ runId }) =>
    Effect.tryPromise(() => fetch(`${DAEMON_RUNS_URL}/${encodeURIComponent(runId)}`, { method: 'DELETE' })).pipe(
      Effect.ignore,
      Effect.as(Message.CompletedDeleteRun()),
    ),
});

// SUITE CASES

const SkillEvalsResponse = Schema.Struct({
  ok: Schema.optional(Schema.Unknown),
  error: Schema.optional(Schema.Unknown),
  evals: Schema.optional(Schema.Struct({ evals: Schema.optional(Schema.Array(Schema.Unknown)) })),
});

const caseIdOf = (entry: unknown): Option.Option<string> => {
  if (typeof entry !== 'object' || entry === null || !('id' in entry)) {
    return Option.none();
  }
  const { id } = entry;
  return typeof id === 'string' || typeof id === 'number' ? Option.some(String(id)) : Option.none();
};

export const LoadSuiteCases = Command.define('LoadSuiteCases', {
  args: { workspaceRoot: Schema.String },
  messages: [Message.SucceededLoadSuiteCases, Message.FailedLoadSuiteCases],
  interrupt: true,
  execute: ({ workspaceRoot }) =>
    Effect.tryPromise({
      try: async (signal) => {
        const response = await fetch(`${DAEMON_URL}/skill-evals?root=${encodeURIComponent(workspaceRoot)}`, { signal });
        return (await response.json()) as unknown;
      },
      catch: errorMessage,
    }).pipe(
      Effect.flatMap((payload) =>
        Schema.decodeUnknownEffect(SkillEvalsResponse)(payload).pipe(Effect.mapError(() => 'invalid evals response')),
      ),
      Effect.flatMap((payload) =>
        payload.ok === true
          ? Effect.succeed(
              Message.SucceededLoadSuiteCases({
                workspaceRoot,
                caseIds: (payload.evals?.evals ?? []).flatMap((entry) => Option.toArray(caseIdOf(entry))),
              }),
            )
          : Effect.fail(typeof payload.error === 'string' ? payload.error : 'could not read evals.json'),
      ),
      Effect.catch((error) => Effect.succeed(Message.FailedLoadSuiteCases({ workspaceRoot, error }))),
    ),
});

// LAST RUN

export const LoadLastRunId = Command.define('LoadLastRunId', {
  messages: [Message.CompletedLoadLastRunId],
  execute: loadPreferences.pipe(
    Effect.map((prefs) => Message.CompletedLoadLastRunId({ maybeLastRunId: Option.fromNullishOr(prefs.lastRunId) })),
    Effect.catch(() => Effect.succeed(Message.CompletedLoadLastRunId({ maybeLastRunId: Option.none() }))),
  ),
});

export const SaveLastRunId = Command.define('SaveLastRunId', {
  args: { runId: Schema.String },
  messages: [Message.CompletedSaveLastRunId],
  execute: ({ runId }) => savePreferences({ lastRunId: runId }).pipe(Effect.as(Message.CompletedSaveLastRunId({ runId }))),
});

// ALERT

export const ShowAlert = Command.define('ShowAlert', {
  args: { text: Schema.String },
  messages: [Message.CompletedShowAlert],
  execute: ({ text }) =>
    Effect.sync(() => {
      window.alert(text);
      return Message.CompletedShowAlert();
    }),
});
