import { Array, Option, Schema } from 'effect';
import { defineTaggedUnion } from 'foldkit/schema';

import type { AppContext } from '@/app/context';
import { EnvName } from '@/app/domain';

import { ArtifactEntry } from './artifact';
import { Run, Tab, Variant, type Case } from './domain';

// MODEL

export const HostedRuns = defineTaggedUnion({
  Loading: {},
  Loaded: { runs: Schema.Array(Run) },
});
export type HostedRuns = typeof HostedRuns.Type;

export const RunsQuery = Schema.Struct({ root: Schema.String, maybeSkillId: Schema.Option(Schema.String) });
export type RunsQuery = typeof RunsQuery.Type;

export const LocalRuns = Schema.Struct({
  runs: Schema.Array(Run),
  skillIds: Schema.Array(Schema.String),
  maybeQuery: Schema.Option(RunsQuery),
});
export type LocalRuns = typeof LocalRuns.Type;

export const Scope = Schema.Struct({ env: EnvName, root: Schema.String });
export type Scope = typeof Scope.Type;

export const Model = Schema.Struct({
  scope: Scope,
  hostedRuns: HostedRuns,
  localRuns: LocalRuns,
  maybeSkillId: Schema.Option(Schema.String),
  maybeRunId: Schema.Option(Schema.String),
  maybeCaseId: Schema.Option(Schema.String),
  tab: Tab,
  variant: Variant,
  artifacts: Schema.Array(ArtifactEntry),
});
export type Model = typeof Model.Type;

export const isSameQuery = (left: RunsQuery, right: RunsQuery): boolean =>
  left.root === right.root && Option.getOrNull(left.maybeSkillId) === Option.getOrNull(right.maybeSkillId);

const hostedRunList = (model: Model): ReadonlyArray<Run> =>
  HostedRuns.match(model.hostedRuns, { Loading: () => [], Loaded: ({ runs }) => runs });

const sourceRuns = (model: Model, context: AppContext): ReadonlyArray<Run> =>
  context.env === 'localhost' ? model.localRuns.runs : hostedRunList(model);

export const skillIds = (model: Model, context: AppContext): ReadonlyArray<string> => {
  const available =
    context.env === 'localhost'
      ? model.localRuns.skillIds
      : Array.dedupe(Array.map(hostedRunList(model), (run) => run.skill));
  const ordered = Array.dedupe(
    Array.filter(
      Array.map(context.workspace.skills, (skill) => skill.id),
      (skillId) => Array.contains(available, skillId),
    ),
  );
  return [...ordered, ...Array.filter(available, (skillId) => !Array.contains(ordered, skillId))];
};

export const visibleRuns = (model: Model, context: AppContext): ReadonlyArray<Run> =>
  Option.match(model.maybeSkillId, {
    onNone: () => sourceRuns(model, context),
    onSome: (skillId) => Array.filter(sourceRuns(model, context), (run) => run.skill === skillId),
  });

export type Selection = Readonly<{ run: Run; testCase: Case }>;

export const activeSelection = (model: Model, context: AppContext): Option.Option<Selection> =>
  Option.flatMap(model.maybeRunId, (runId) =>
    Array.findFirst(visibleRuns(model, context), (run) => run.id === runId).pipe(
      Option.flatMap((run) =>
        Option.flatMap(model.maybeCaseId, (caseId) =>
          Array.findFirst(run.cases, (testCase) => testCase.id === caseId).pipe(
            Option.map((testCase) => ({ run, testCase })),
          ),
        ),
      ),
    ),
  );
