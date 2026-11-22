import { Effect, Option } from 'effect';
import { Command } from 'foldkit';

import { loadImportedRuns } from '@/persistence/importedRuns';
import { DAEMON_URL } from '@/shell/daemon';

import { ArtifactRequest, artifactUrl } from './artifact';
import { decodeRuns, decodeRunsPayload } from './domain';
import { Message } from './message';
import { RunsQuery } from './model';

// COMMAND

export const LoadImportedRuns = Command.define('LoadImportedRuns', {
  messages: [Message.CompletedLoadImportedRuns],
  execute: loadImportedRuns.pipe(
    Effect.map((records) => Message.CompletedLoadImportedRuns({ runs: decodeRuns(records) })),
    Effect.catch(() => Effect.succeed(Message.CompletedLoadImportedRuns({ runs: [] }))),
  ),
});

const runsUrl = (query: RunsQuery): string => {
  const search = new URLSearchParams([
    ['root', query.root],
    ...Option.match(query.maybeSkillId, {
      onNone: () => [],
      onSome: (skillId): ReadonlyArray<[string, string]> => [['skill', skillId]],
    }),
  ]);
  return `${DAEMON_URL}/runs?${search.toString()}`;
};

export const FetchLocalRuns = Command.define('FetchLocalRuns', {
  args: { query: RunsQuery },
  messages: [Message.SucceededFetchLocalRuns, Message.FailedFetchLocalRuns],
  execute: ({ query }) =>
    Effect.tryPromise(async (signal) => {
      const response = await fetch(runsUrl(query), { signal });
      if (!response.ok) {
        throw new Error(`runs lookup failed with ${response.status}`);
      }
      return (await response.json()) as unknown;
    }).pipe(
      Effect.map((payload) => Message.SucceededFetchLocalRuns({ query, runs: decodeRunsPayload(payload) })),
      Effect.catch(() => Effect.succeed(Message.FailedFetchLocalRuns({ query }))),
    ),
});

/** A daemon error answer carries its reason as the body text, which the tabs show as is. */
export const FetchArtifact = Command.define('FetchArtifact', {
  args: { request: ArtifactRequest },
  messages: [Message.SucceededFetchArtifact, Message.FailedFetchArtifact],
  execute: ({ request }) =>
    Effect.tryPromise({
      try: async (signal) => {
        const response = await fetch(artifactUrl(request), { signal });
        const text = await response.text();
        return { isOk: response.ok, status: response.status, text };
      },
      catch: (error) => (error instanceof Error ? error.message : 'Artifact request failed.'),
    }).pipe(
      Effect.map(({ isOk, status, text }) =>
        isOk
          ? Message.SucceededFetchArtifact({ request, text })
          : Message.FailedFetchArtifact({ request, error: text === '' ? `Artifact request failed with ${status}.` : text }),
      ),
      Effect.catch((error) =>
        Effect.succeed(Message.FailedFetchArtifact({ request, error: typeof error === 'string' ? error : 'Artifact request failed.' })),
      ),
    ),
});
