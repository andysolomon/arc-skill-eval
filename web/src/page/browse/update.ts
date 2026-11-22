import { Array, Option } from 'effect';
import type { Update } from 'foldkit';
import { modifyFields } from 'foldkit/struct';

import { PageOutMessage, type AppContext } from '@/app/context';

import { ArtifactState, isSameRequest, requestsForTab, type ArtifactEntry, type ArtifactRequest } from './artifact';
import { FetchArtifact, FetchLocalRuns, LoadImportedRuns } from './command';
import { defaultCase } from './domain';
import { Message, type CaseStep } from './message';
import {
  HostedRuns,
  activeSelection,
  isSameQuery,
  skillIds,
  visibleRuns,
  type Model,
  type RunsQuery,
} from './model';

type UpdateReturn = Update.Return<Model, Message>;

// RECONCILE

/**
 * Bring every derived choice back in line after the data or a choice changed,
 * the way React's chain of effects did, but in one step: keep the selected
 * skill / run / case while they still exist (else pick the first skill, the
 * newest run, the first failing case), ask the daemon for the runs of the
 * selected skill, and fetch the artifacts the open tab reads.
 */
const reconcile = (model: Model, context: AppContext): UpdateReturn => {
  const availableSkillIds = skillIds(model, context);
  const maybeSkillId = Option.filter(model.maybeSkillId, (skillId) => Array.contains(availableSkillIds, skillId)).pipe(
    Option.orElse(() => Array.head(availableSkillIds)),
  );
  const withSkill = modifyFields(model, { maybeSkillId: () => maybeSkillId });

  const runs = visibleRuns(withSkill, context);
  const maybeRun = Option.orElse(
    Option.flatMap(withSkill.maybeRunId, (runId) => Array.findFirst(runs, (run) => run.id === runId)),
    () => Array.head(runs),
  );
  const maybeCase = Option.flatMap(maybeRun, (run) =>
    Option.orElse(
      Option.flatMap(withSkill.maybeCaseId, (caseId) => Array.findFirst(run.cases, (testCase) => testCase.id === caseId)),
      () => defaultCase(run),
    ),
  );
  const isDetailShown = Option.isSome(maybeRun) && Option.isSome(maybeCase);
  const withSelection = modifyFields(withSkill, {
    maybeRunId: () => Option.map(maybeRun, (run) => run.id),
    maybeCaseId: () => Option.map(maybeCase, (testCase) => testCase.id),
    tab: (tab) => (isDetailShown ? tab : 'overview'),
    variant: (variant) => (isDetailShown ? variant : 'with_skill'),
  });

  const maybeQuery: Option.Option<RunsQuery> =
    context.env === 'localhost' ? Option.some({ root: context.workspace.root, maybeSkillId }) : Option.none();
  const isNewQuery = Option.match(maybeQuery, {
    onNone: () => false,
    onSome: (query) =>
      Option.match(withSelection.localRuns.maybeQuery, {
        onNone: () => true,
        onSome: (current) => !isSameQuery(current, query),
      }),
  });
  const withQuery = modifyFields(withSelection, {
    localRuns: (localRuns) => modifyFields(localRuns, { maybeQuery: () => maybeQuery }),
  });

  const neededRequests: ReadonlyArray<ArtifactRequest> =
    context.env === 'localhost'
      ? Option.match(activeSelection(withQuery, context), {
          onNone: () => [],
          onSome: ({ run, testCase }) => requestsForTab(withQuery.tab, run, testCase, withQuery.variant),
        })
      : [];
  const isPending = (request: ArtifactRequest) =>
    !Array.some(withQuery.artifacts, (entry) => isSameRequest(entry.request, request));
  const newRequests = Array.filter(neededRequests, isPending);
  const artifacts: ReadonlyArray<ArtifactEntry> = Array.map(neededRequests, (request) =>
    Option.getOrElse(
      Array.findFirst(withQuery.artifacts, (entry) => isSameRequest(entry.request, request)),
      () => ({ request, state: ArtifactState.Loading() }),
    ),
  );

  return {
    model: modifyFields(withQuery, { artifacts: () => artifacts }),
    commands: [
      ...(isNewQuery ? Array.map(Option.toArray(maybeQuery), (query) => FetchLocalRuns({ query })) : []),
      ...Array.map(newRequests, (request) => FetchArtifact({ request })),
    ],
  };
};

const stepCase = (model: Model, context: AppContext, step: CaseStep): Model =>
  Option.match(activeSelection(model, context), {
    onNone: () => model,
    onSome: ({ run, testCase }) => {
      const cases = run.cases;
      return Option.match(
        Array.findFirstIndex(cases, (candidate) => candidate.id === testCase.id),
        {
          onNone: () => model,
          onSome: (index) => {
            const nextIndex = step === 'next' ? Math.min(cases.length - 1, index + 1) : Math.max(0, index - 1);
            return modifyFields(model, {
              maybeCaseId: () => Option.map(Array.get(cases, nextIndex), (next) => next.id),
            });
          },
        },
      );
    },
  });

const setArtifactState = (model: Model, request: ArtifactRequest, state: ArtifactState): Model =>
  modifyFields(model, {
    artifacts: (artifacts) =>
      Array.map(artifacts, (entry) =>
        isSameRequest(entry.request, request) ? modifyFields(entry, { state: () => state }) : entry,
      ),
  });

const isCurrentQuery = (model: Model, query: RunsQuery): boolean =>
  Option.exists(model.localRuns.maybeQuery, (current) => isSameQuery(current, query));

// INIT

export const init = (context: AppContext): UpdateReturn => {
  const reconciled = reconcile(
    {
      scope: { env: context.env, root: context.workspace.root },
      hostedRuns: HostedRuns.Loading(),
      localRuns: { runs: [], skillIds: [], maybeQuery: Option.none() },
      maybeSkillId: Option.none(),
      maybeRunId: Option.none(),
      maybeCaseId: Option.none(),
      tab: 'overview',
      variant: 'with_skill',
      artifacts: [],
    },
    context,
  );
  return { model: reconciled.model, commands: [LoadImportedRuns(), ...(reconciled.commands ?? [])] };
};

// CONTEXT

/** A new env or workspace root starts the local runs over, as React's `useLocalhostRuns` did. */
export const contextChanged = (model: Model, context: AppContext): UpdateReturn => {
  const isNewScope = model.scope.env !== context.env || model.scope.root !== context.workspace.root;
  const scoped = isNewScope
    ? modifyFields(model, {
        scope: () => ({ env: context.env, root: context.workspace.root }),
        localRuns: (localRuns) =>
          modifyFields(localRuns, {
            skillIds: () => [],
            runs: (runs) => (context.env === 'localhost' ? runs : []),
          }),
      })
    : model;
  return reconcile(scoped, context);
};

// UPDATE

export const update = (model: Model, message: Message, context: AppContext) =>
  Message.match<Update.ReturnWithOutMessage<Model, Message, PageOutMessage>>(message, {
    SelectedSkill: ({ skillId }) =>
      reconcile(modifyFields(model, { maybeSkillId: () => Option.some(skillId) }), context),
    SelectedRun: ({ runId }) => reconcile(modifyFields(model, { maybeRunId: () => Option.some(runId) }), context),
    SelectedCase: ({ caseId }) => reconcile(modifyFields(model, { maybeCaseId: () => Option.some(caseId) }), context),
    PressedCaseStepKey: ({ step }) => reconcile(stepCase(model, context, step), context),
    SelectedTab: ({ tab }) => reconcile(modifyFields(model, { tab: () => tab }), context),
    SelectedVariant: ({ variant }) => reconcile(modifyFields(model, { variant: () => variant }), context),
    ClickedImportInReview: () => ({ model, outMessage: PageOutMessage.RequestedSection({ section: 'review' }) }),
    CompletedLoadImportedRuns: ({ runs }) =>
      reconcile(modifyFields(model, { hostedRuns: () => HostedRuns.Loaded({ runs }) }), context),
    SucceededFetchLocalRuns: ({ query, runs }) => {
      if (!isCurrentQuery(model, query)) {
        return { model };
      }
      const discovered = Array.dedupe(Array.map(runs, (run) => run.skill));
      return reconcile(
        modifyFields(model, {
          localRuns: (localRuns) =>
            modifyFields(localRuns, {
              runs: () => runs,
              skillIds: (current) =>
                Option.isSome(query.maybeSkillId) ? Array.dedupe([...current, ...discovered]) : discovered,
            }),
        }),
        context,
      );
    },
    FailedFetchLocalRuns: ({ query }) =>
      isCurrentQuery(model, query)
        ? reconcile(
            modifyFields(model, {
              localRuns: (localRuns) => modifyFields(localRuns, { runs: () => [], skillIds: () => [] }),
            }),
            context,
          )
        : { model },
    SucceededFetchArtifact: ({ request, text }) => ({
      model: setArtifactState(model, request, ArtifactState.Loaded({ text })),
    }),
    FailedFetchArtifact: ({ request, error }) => ({
      model: setArtifactState(model, request, ArtifactState.Failed({ error })),
    }),
  });
