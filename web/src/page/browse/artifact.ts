/**
 * Per-case run artifacts the daemon serves in localhost mode
 * (`GET /runs/:runId/artifacts/:caseId/:kind`), and the readers that turn
 * their text into what the detail tabs show. Hosted mode never fetches
 * artifacts: its tabs read the imported case directly, as React did.
 */

import { Array, Option, Order, Schema } from 'effect';
import { defineTaggedUnion } from 'foldkit/schema';

import { DAEMON_URL } from '@/shell/daemon';

import { deltaTag, type Case, type DeltaTag, type Metrics, type Run, type Tab, type Variant } from './domain';
import { field, finiteNumber, jsonRecord, unknownList } from './json';

// MODEL

export type ArtifactFilename =
  | 'assistant.md'
  | 'grading.json'
  | 'timing.json'
  | 'trace.json'
  | 'tool-summary.json'
  | 'context-manifest.json';

export const ArtifactRequest = Schema.Struct({
  root: Schema.String,
  runId: Schema.String,
  caseId: Schema.String,
  kind: Schema.String,
});
export type ArtifactRequest = typeof ArtifactRequest.Type;

export const ArtifactState = defineTaggedUnion({
  Loading: {},
  Loaded: { text: Schema.String },
  Failed: { error: Schema.String },
});
export type ArtifactState = typeof ArtifactState.Type;

export const ArtifactEntry = Schema.Struct({ request: ArtifactRequest, state: ArtifactState });
export type ArtifactEntry = typeof ArtifactEntry.Type;

export const isSameRequest = (left: ArtifactRequest, right: ArtifactRequest): boolean =>
  left.root === right.root && left.runId === right.runId && left.caseId === right.caseId && left.kind === right.kind;

/** Compare runs keep one artifact folder per variant; plain runs keep one. */
export const artifactKind = (compare: boolean, variant: Variant, filename: ArtifactFilename): string =>
  compare ? `${variant}/${filename}` : filename;

export const artifactRequest = (run: Run, testCase: Case, variant: Variant, filename: ArtifactFilename): ArtifactRequest => ({
  root: run.workspaceRoot,
  runId: run.id,
  caseId: testCase.id,
  kind: artifactKind(run.compare, variant, filename),
});

/** The artifacts the open tab reads, in the order React's tab components asked for them. */
export const requestsForTab = (tab: Tab, run: Run, testCase: Case, variant: Variant): ReadonlyArray<ArtifactRequest> => {
  const request = (forVariant: Variant, filename: ArtifactFilename) => artifactRequest(run, testCase, forVariant, filename);
  const byTab: Record<Tab, () => ReadonlyArray<ArtifactRequest>> = {
    overview: () => [request(variant, 'grading.json'), request(variant, 'timing.json')],
    response: () => [request(variant, 'assistant.md')],
    diff: () => (run.compare ? [request('with_skill', 'assistant.md'), request('without_skill', 'assistant.md')] : []),
    trace: () => [request(variant, 'tool-summary.json'), request(variant, 'context-manifest.json')],
    raw: () => [request(variant, 'grading.json')],
  };
  return byTab[tab]();
};

export const artifactUrl = (request: ArtifactRequest): string => {
  const rootQuery = request.root === '' ? '' : `?root=${encodeURIComponent(request.root)}`;
  return `${DAEMON_URL}/runs/${encodeURIComponent(request.runId)}/artifacts/${encodeURIComponent(
    request.caseId,
  )}/${encodeURIComponent(request.kind)}${rootQuery}`;
};

// READ

/** What a tab sees of one artifact, mirroring React's `ArtifactSourceState`. */
export type ArtifactView = Readonly<{ text: string; maybeJson: Option.Option<unknown>; maybeError: Option.Option<string> }>;

const parseJson = (text: string): Option.Option<unknown> => {
  try {
    return Option.some(JSON.parse(text) as unknown);
  } catch {
    return Option.none();
  }
};

export const viewArtifact = (entries: ReadonlyArray<ArtifactEntry>, request: ArtifactRequest): ArtifactView => {
  const maybeState = Array.findFirst(entries, (entry) => isSameRequest(entry.request, request)).pipe(
    Option.map((entry) => entry.state),
  );
  const empty: ArtifactView = { text: '', maybeJson: Option.none(), maybeError: Option.none() };
  return Option.match(maybeState, {
    onNone: () => empty,
    onSome: ArtifactState.match({
      Loading: () => empty,
      Loaded: ({ text }) => ({
        text,
        maybeJson: request.kind.endsWith('.json') ? parseJson(text) : Option.none(),
        maybeError: Option.none(),
      }),
      Failed: ({ error }) => ({ text: '', maybeJson: Option.none(), maybeError: Option.some(error) }),
    }),
  });
};

export const readTimingMetrics = (maybeJson: Option.Option<unknown>, fallback: Metrics): Metrics => {
  const timing = Option.flatMap(maybeJson, jsonRecord);
  const tokenUsage = jsonRecord(field(timing, 'token_usage'));
  return {
    costUsd: Option.getOrElse(finiteNumber(field(timing, 'estimated_cost_usd')), () => fallback.costUsd),
    latencyMs: Option.getOrElse(finiteNumber(field(timing, 'duration_ms')), () => fallback.latencyMs),
    msPerCase: fallback.msPerCase,
    tokens: finiteNumber(field(timing, 'total_tokens')).pipe(
      Option.orElse(() => finiteNumber(field(tokenUsage, 'total_tokens'))),
      Option.getOrElse(() => fallback.tokens),
    ),
  };
};

export const readGradingSummary = (maybeJson: Option.Option<unknown>, testCase: Case): DeltaTag => {
  const summary = jsonRecord(field(Option.flatMap(maybeJson, jsonRecord), 'summary'));
  return Option.match(finiteNumber(field(summary, 'failed')), {
    onNone: () => deltaTag(testCase.status),
    onSome: (failed) => (failed > 0 ? 'FAIL' : 'PASS'),
  });
};

export const readGradingEvidence = (maybeJson: Option.Option<unknown>, fallback: string): string => {
  const results = unknownList(field(Option.flatMap(maybeJson, jsonRecord), 'assertion_results'));
  const maybeFailed = Array.findFirst(Array.getSomes(Array.map(results, jsonRecord)), (result) => result.passed === false);
  const evidence = Option.match(maybeFailed, {
    onNone: () => field(Option.flatMap(Array.head(results), jsonRecord), 'evidence'),
    onSome: (failed) => failed.evidence ?? field(Option.flatMap(Array.head(results), jsonRecord), 'evidence'),
  });
  return typeof evidence === 'string' && evidence.length > 0 ? evidence : fallback;
};

/** `{ name: count }` entries with finite counts, most frequent first. */
export const countEntries = (value: unknown): ReadonlyArray<readonly [string, number]> =>
  Option.match(jsonRecord(value), {
    onNone: () => [],
    onSome: (record) =>
      Array.sort(
        Array.getSomes(
          Array.map(Object.entries(record), ([name, count]) =>
            Option.map(finiteNumber(count), (finite) => [name, finite] as const),
          ),
        ),
        Order.mapInput(Order.flip(Order.Number), ([, count]: readonly [string, number]) => count),
      ),
  });

export const stringList = (value: unknown): ReadonlyArray<string> =>
  Array.filter(unknownList(value), (item): item is string => typeof item === 'string');

export const externalCallLabels = (value: unknown): ReadonlyArray<string> =>
  Array.getSomes(
    Array.map(unknownList(value), (item) => {
      const record = jsonRecord(item);
      const system = field(record, 'system');
      const operation = field(record, 'operation');
      const target = field(record, 'target');
      return typeof system === 'string' && system !== '' && typeof operation === 'string' && operation !== ''
        ? Option.some(`${system}:${operation}${typeof target === 'string' && target !== '' ? ` ${target}` : ''}`)
        : Option.none();
    }),
  );

export const attachedSkillNames = (value: unknown): ReadonlyArray<string> =>
  Array.getSomes(
    Array.map(unknownList(value), (item) => {
      const name = field(jsonRecord(item), 'name');
      return typeof name === 'string' ? Option.some(name) : Option.none();
    }),
  );
