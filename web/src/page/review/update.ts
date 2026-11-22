import { Array, Option } from 'effect';
import type { Update } from 'foldkit';
import { modifyFields } from 'foldkit/struct';

import type { AppContext, PageOutMessage } from '@/app/context';

import { inspectArtifact } from './artifact';
import {
  AddFeedback,
  CancelPlan,
  CommitPlan,
  ConfirmRemoveFeedback,
  CreateSampleArtifact,
  DeleteFeedback,
  DerivePlan,
  DownloadPlan,
  FetchRuns,
  GetInspectionTime,
  LoadReviewData,
  ReadImportFile,
  SaveLastRunId,
  StagePlan,
  StoreImportedRuns,
} from './command';
import { Apply, PlanDownload, Proposal, isImproveInFlight, type Improve } from './domain';
import { Message } from './message';
import { initialImprove, type Model } from './model';
import { allRuns, runsForSkill, selectedRun, showsLocalHeader, skillIds } from './selectors';

type UpdateReturn = Update.ReturnWithOutMessage<Model, Message, PageOutMessage>;

// INIT

const fetchRunsFor = (context: AppContext, maybeSkillId: Option.Option<string>) =>
  context.env === 'localhost' ? [FetchRuns({ root: context.workspace.root, maybeSkillId })] : [];

export const init = (context: AppContext): Update.Return<Model, Message> => ({
  model: {
    env: context.env,
    workspaceRoot: context.workspace.root,
    importedRuns: [],
    localRuns: [],
    localSkillIds: [],
    feedback: [],
    improvePlans: [],
    maybeLastRunId: Option.none(),
    maybeNowMillis: Option.none(),
    maybeSelectedSkillId: Option.none(),
    maybeSelectedRunId: Option.none(),
    maybeSelectedCaseId: Option.none(),
    pasteText: '',
    maybeInspection: Option.none(),
    note: '',
    improve: initialImprove,
  },
  commands: [LoadReviewData(), ...fetchRunsFor(context, Option.none())],
});

// SELECTION

const sameOption = (left: Option.Option<string>, right: Option.Option<string>): boolean =>
  Option.match(left, { onNone: () => Option.isNone(right), onSome: (value) => Option.contains(right, value) });

/**
 * Bring the selection back in line after anything changed: a skill that
 * still has runs (else the first), a run of that skill (else the last
 * imported run, else the first), a case of that run (else the first failing
 * one, else the first). On localhost, a new skill (or `forceFetch`) re-asks
 * the daemon for that skill's runs.
 */
const reconcile = (
  model: Model,
  context: AppContext,
  config: Readonly<{ previousSkillId: Option.Option<string>; forceFetch: boolean }>,
): Update.Return<Model, Message> => {
  const offeredSkillIds = skillIds(model, context);
  const maybeSkillId = Option.orElse(
    Option.filter(model.maybeSelectedSkillId, (skillId) => Array.contains(offeredSkillIds, skillId)),
    () => Array.head(offeredSkillIds),
  );
  const runs = runsForSkill(allRuns(model, context), maybeSkillId);
  const hasRun = (runId: string) => Array.some(runs, (run) => run.id === runId);
  const maybeRunId = Option.orElse(Option.filter(model.maybeSelectedRunId, hasRun), () =>
    Option.orElse(Option.filter(model.maybeLastRunId, hasRun), () => Option.map(Array.head(runs), (run) => run.id)),
  );
  const maybeRun = Option.flatMap(maybeRunId, (runId) => Array.findFirst(runs, (run) => run.id === runId));
  const maybeCaseId = Option.flatMap(maybeRun, (run) => {
    const hasCase = (caseId: string) => Array.some(run.cases, (testCase) => testCase.id === caseId);
    return Option.orElse(Option.filter(model.maybeSelectedCaseId, hasCase), () =>
      Option.map(
        Option.orElse(
          Array.findFirst(run.cases, (testCase) => testCase.status === 'fail'),
          () => Array.head(run.cases),
        ),
        (testCase) => testCase.id,
      ),
    );
  });

  const selected = modifyFields(model, {
    maybeSelectedSkillId: () => maybeSkillId,
    maybeSelectedRunId: () => maybeRunId,
    maybeSelectedCaseId: () => maybeCaseId,
  });
  const withoutWorkspace = Option.isNone(maybeRun)
    ? modifyFields(selected, { note: () => '', improve: () => initialImprove })
    : selected;
  const nextModel = showsLocalHeader(withoutWorkspace, context)
    ? modifyFields(withoutWorkspace, { pasteText: () => '', maybeInspection: () => Option.none() })
    : withoutWorkspace;

  return {
    model: nextModel,
    commands:
      config.forceFetch || !sameOption(config.previousSkillId, maybeSkillId) ? fetchRunsFor(context, maybeSkillId) : [],
  };
};

const settle = (model: Model, context: AppContext, previousSkillId: Option.Option<string>) =>
  reconcile(model, context, { previousSkillId, forceFetch: false });

// IMPORT

const inspectAndImport = (model: Model, context: AppContext, text: string, nowMillis: number): UpdateReturn => {
  const outcome = inspectArtifact(text, new Date(nowMillis).toISOString());
  const inspected = modifyFields(model, {
    pasteText: () => text,
    maybeInspection: () => Option.some(outcome.inspection),
    maybeNowMillis: () => Option.some(nowMillis),
  });

  return Option.match(outcome.maybeRuns, {
    onNone: () => ({ model: inspected }),
    onSome: (runs) => {
      const maybeImportedRunId = Option.map(Array.head(runs), (run) => run.id);
      const imported = modifyFields(inspected, {
        importedRuns: () => runs,
        maybeLastRunId: (maybeLastRunId) => Option.orElse(maybeImportedRunId, () => maybeLastRunId),
      });
      const importSettle = settle(imported, context, model.maybeSelectedSkillId);
      return {
        model: importSettle.model,
        commands: [
          StoreImportedRuns({ runs }),
          ...Option.match(maybeImportedRunId, { onNone: () => [], onSome: (runId) => [SaveLastRunId({ runId })] }),
          ...(importSettle.commands ?? []),
        ],
      };
    },
  });
};

// IMPROVE

const withImprove = (model: Model, changes: Partial<{ [K in keyof Improve]: (value: Improve[K]) => Improve[K] }>) =>
  modifyFields(model, { improve: (improve) => modifyFields(improve, changes) });

const proposePlan = (model: Model, context: AppContext): UpdateReturn => {
  const hasFeedback = (runId: string) => Array.some(model.feedback, (note) => note.runId === runId);
  return Option.match(
    Option.filter(selectedRun(model, context), (run) => hasFeedback(run.id) && !isImproveInFlight(model.improve)),
    {
      onNone: () => ({ model }),
      onSome: (run) => ({
        model: withImprove(model, { proposal: () => Proposal.Deriving() }),
        commands: [DerivePlan({ runId: run.id, workspaceRoot: run.workspaceRoot, maybeEvalsJson: run.maybeEvalsJson })],
      }),
    },
  );
};

// UPDATE

export const update = (model: Model, message: Message, context: AppContext) =>
  Message.match<UpdateReturn>(message, {
    CompletedLoadReviewData: ({ importedRuns, feedback, improvePlans, maybeLastRunId, nowMillis }) =>
      settle(
        modifyFields(model, {
          importedRuns: () => importedRuns,
          feedback: () => feedback,
          improvePlans: () => improvePlans,
          maybeLastRunId: () => maybeLastRunId,
          maybeNowMillis: () => Option.some(nowMillis),
        }),
        context,
        model.maybeSelectedSkillId,
      ),
    SucceededFetchRuns: ({ runs, maybeSkillId, nowMillis }) => {
      if (context.env !== 'localhost') {
        return { model };
      }
      const discovered = Array.dedupe(Array.map(runs, (run) => run.skill));
      return settle(
        modifyFields(model, {
          localRuns: () => runs,
          localSkillIds: (current) =>
            Option.isSome(maybeSkillId) ? Array.dedupe([...current, ...discovered]) : discovered,
          maybeNowMillis: () => Option.some(nowMillis),
        }),
        context,
        model.maybeSelectedSkillId,
      );
    },
    FailedFetchRuns: () =>
      settle(
        modifyFields(model, { localRuns: () => [], localSkillIds: () => [] }),
        context,
        model.maybeSelectedSkillId,
      ),
    SelectedSkill: ({ skillId }) =>
      settle(
        modifyFields(model, { maybeSelectedSkillId: () => Option.some(skillId) }),
        context,
        model.maybeSelectedSkillId,
      ),
    SelectedRun: ({ runId }) =>
      settle(modifyFields(model, { maybeSelectedRunId: () => Option.some(runId) }), context, model.maybeSelectedSkillId),
    SelectedCase: ({ caseId }) => ({ model: modifyFields(model, { maybeSelectedCaseId: () => Option.some(caseId) }) }),

    UpdatedPasteText: ({ value }) => ({ model: modifyFields(model, { pasteText: () => value }) }),
    ClickedInspectJson: () => ({ model, commands: [GetInspectionTime()] }),
    CompletedGetInspectionTime: ({ nowMillis }) => inspectAndImport(model, context, model.pasteText, nowMillis),
    ClickedLoadSample: () => ({ model, commands: [CreateSampleArtifact()] }),
    CompletedCreateSampleArtifact: ({ text, nowMillis }) => inspectAndImport(model, context, text, nowMillis),
    SelectedImportFiles: ({ files }) =>
      Option.match(Array.head(files), {
        onNone: () => ({ model }),
        onSome: (file) => ({ model, commands: [ReadImportFile({ file })] }),
      }),
    DroppedImportFiles: ({ files }) =>
      Option.match(Array.head(files), {
        onNone: () => ({ model }),
        onSome: (file) => ({ model, commands: [ReadImportFile({ file })] }),
      }),
    SucceededReadImportFile: ({ text, nowMillis }) => inspectAndImport(model, context, text, nowMillis),
    FailedReadImportFile: () => ({ model }),
    CompletedStoreImportedRuns: () => ({ model }),
    CompletedSaveLastRunId: () => ({ model }),

    UpdatedNote: ({ value }) => ({ model: modifyFields(model, { note: () => value }) }),
    ClickedRecordFeedback: () => {
      const note = model.note.trim();
      return Option.match(
        Option.filter(selectedRun(model, context), () => note !== ''),
        {
          onNone: () => ({ model }),
          onSome: (run) => ({
            model,
            commands: [AddFeedback({ runId: run.id, maybeCaseId: model.maybeSelectedCaseId, note })],
          }),
        },
      );
    },
    SucceededAddFeedback: ({ feedback }) => ({
      model: modifyFields(model, { feedback: () => feedback, note: () => '' }),
    }),
    FailedAddFeedback: () => ({ model }),
    ClickedRemoveFeedback: ({ noteId }) => ({ model, commands: [ConfirmRemoveFeedback({ noteId })] }),
    CompletedConfirmRemoveFeedback: ({ noteId, confirmed }) =>
      confirmed ? { model, commands: [DeleteFeedback({ noteId })] } : { model },
    SucceededDeleteFeedback: ({ feedback }) => ({ model: modifyFields(model, { feedback: () => feedback }) }),
    FailedDeleteFeedback: () => ({ model }),

    ClickedProposePlan: () => proposePlan(model, context),
    SucceededDerivePlan: ({ plan }) => {
      if (context.env === 'localhost') {
        return {
          model: withImprove(model, { proposal: () => Proposal.Staging({ plan }) }),
          commands: [StagePlan({ plan, runId: plan.runId, workspaceRoot: plan.workspaceRoot })],
        };
      }
      const skill = Option.match(
        Array.findFirst(allRuns(model, context), (run) => run.id === plan.runId),
        { onNone: () => '', onSome: (run) => run.skill },
      );
      return {
        model: withImprove(model, { proposal: () => Proposal.Derived({ plan }) }),
        commands: [DownloadPlan({ plan, skill })],
      };
    },
    FailedDerivePlan: ({ error }) => ({ model: withImprove(model, { proposal: () => Proposal.Failed({ error }) }) }),
    SucceededDownloadPlan: () => ({ model: withImprove(model, { download: () => PlanDownload.Started() }) }),
    FailedDownloadPlan: () => ({ model }),
    SucceededStagePlan: ({ staged }) => ({
      model: withImprove(model, {
        proposal: (proposal) =>
          Proposal.match(proposal, {
            Staging: ({ plan }) => Proposal.Staged({ plan }),
            Idle: () => proposal,
            Deriving: () => proposal,
            Derived: () => proposal,
            Staged: () => proposal,
            Failed: () => proposal,
          }),
        maybeStagedPlan: () => Option.some(staged),
        apply: () => Apply.Idle(),
      }),
    }),
    FailedStagePlan: ({ error }) => ({ model: withImprove(model, { proposal: () => Proposal.Failed({ error }) }) }),

    ClickedApplyChanges: () =>
      Option.match(
        Option.filter(model.improve.maybeStagedPlan, () => !isImproveInFlight(model.improve)),
        {
          onNone: () => ({ model }),
          onSome: ({ planId }) => ({
            model: withImprove(model, { apply: () => Apply.Committing() }),
            commands: [CommitPlan({ planId })],
          }),
        },
      ),
    SucceededCommitPlan: ({ result }) => ({
      model: withImprove(model, { apply: () => Apply.Committed({ result }), maybeStagedPlan: () => Option.none() }),
    }),
    FailedCommitPlan: ({ error }) => ({ model: withImprove(model, { apply: () => Apply.Failed({ error }) }) }),
    ClickedDiscardPlan: () =>
      Option.match(
        Option.filter(model.improve.maybeStagedPlan, () => !isImproveInFlight(model.improve)),
        {
          onNone: () => ({ model }),
          onSome: ({ planId }) => ({
            model: withImprove(model, { apply: () => Apply.Cancelling() }),
            commands: [CancelPlan({ planId })],
          }),
        },
      ),
    SucceededCancelPlan: ({ result }) => ({
      model: withImprove(model, {
        apply: () => Apply.Cancelled({ result }),
        maybeStagedPlan: () => Option.none(),
        proposal: () => Proposal.Idle(),
      }),
    }),
    FailedCancelPlan: ({ error }) => ({ model: withImprove(model, { apply: () => Apply.Failed({ error }) }) }),
  });

// CONTEXT

/** Env or workspace changed: the daemon's runs belong to the old one, so drop them and ask again. */
export const contextChanged = (model: Model, context: AppContext): Update.Return<Model, Message> => {
  const isEnvChanged = context.env !== model.env;
  const isRootChanged = context.workspace.root !== model.workspaceRoot;
  if (!isEnvChanged && !isRootChanged) {
    return settle(model, context, model.maybeSelectedSkillId);
  }
  return reconcile(
    modifyFields(model, {
      env: () => context.env,
      workspaceRoot: () => context.workspace.root,
      localSkillIds: () => [],
      localRuns: (localRuns) => (context.env === 'localhost' ? localRuns : []),
      improve: (improve) => (isEnvChanged ? initialImprove : improve),
    }),
    context,
    { previousSkillId: model.maybeSelectedSkillId, forceFetch: context.env === 'localhost' },
  );
};
