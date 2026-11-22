import { Array, Option } from 'effect';
import { Update } from 'foldkit';
import { modifyFields } from 'foldkit/struct';

import { PageOutMessage, type AppContext } from '@/app/context';

import {
  CancelPlan,
  CommitPlan,
  CreateBehaviorId,
  DownloadEvalsJson,
  GenerateEvals,
  LoadCreateProgress,
  LoadSkillEvals,
  SaveCreateProgress,
  StagePlan,
  SuggestAssertion,
  SuggestBehavior,
  SuggestDimension,
  SuggestFlavor,
  SuggestPrompt,
} from './command';
import {
  assembleEvalsJson,
  makeBehaviorRow,
  serializeEvalsJson,
  stepAt,
  stepIndex,
  suggestPromptTemplate,
  type BehaviorAssertion,
  type BehaviorRow,
  type Draft,
  type Step,
} from './domain';
import { Message } from './message';
import {
  BannerActivity,
  DraftWrite,
  Hydration,
  Stage,
  Suggest,
  SuggestTarget,
  initialBanner,
  initialModel,
  isSuggestPending,
  isWriteInFlight,
  maybeStagedPlan,
  type Banner,
  type Model,
} from './model';

type UpdateReturn = Update.ReturnWithOutMessage<Model, Message, PageOutMessage>;

// INIT

export const init = (_context: AppContext): Update.Return<Model, Message> => ({
  model: initialModel,
  commands: [LoadCreateProgress()],
});

// CONTEXT

/** The draft banner only exists on localhost; leaving it resets it like an unmount did. */
export const contextChanged = (model: Model, context: AppContext): Update.Return<Model, Message> =>
  context.env === 'hosted' && model.banner !== initialBanner
    ? { model: modifyFields(model, { banner: () => initialBanner }) }
    : { model };

// DRAFT HELPERS

/** Every draft edit re-arms the write button. */
const mutateDraft = (model: Model, mutate: (draft: Draft) => Draft): Model =>
  modifyFields(model, { draft: mutate, write: () => DraftWrite.Unwritten() });

const mapRow = (model: Model, rowId: string, mutate: (row: BehaviorRow) => BehaviorRow): Model =>
  mutateDraft(model, (draft) =>
    modifyFields(draft, {
      behaviors: (rows) => Array.map(rows, (row) => (row.id === rowId ? mutate(row) : row)),
    }),
  );

const mapAssertions = (
  model: Model,
  rowId: string,
  mutate: (asserts: ReadonlyArray<BehaviorAssertion>) => ReadonlyArray<BehaviorAssertion>,
): Model => mapRow(model, rowId, (row) => modifyFields(row, { asserts: mutate }));

const appendRow = (model: Model, row: BehaviorRow): Model =>
  mutateDraft(model, (draft) => modifyFields(draft, { behaviors: (rows) => Array.append(rows, row) }));

const findRow = (model: Model, rowId: string): Option.Option<BehaviorRow> =>
  Array.findFirst(model.draft.behaviors, (row) => row.id === rowId);

/** Step panes own their suggest and staging state; leaving a step resets it. */
const goToStep = (model: Model, step: Step): Model =>
  step === model.step
    ? model
    : modifyFields(model, { step: () => step, suggest: () => Suggest.Idle(), stage: () => Stage.Idle() });

const seedDraft = (model: Model, skill: string, rows: ReadonlyArray<BehaviorRow>): Model =>
  goToStep(
    mutateDraft(model, () => ({ skill, behaviors: rows })),
    'behaviors',
  );

const modifyBanner = (model: Model, mutate: (banner: Banner) => Banner): Model =>
  modifyFields(model, { banner: mutate });

/** A suggestion result only touches the pane state if that pane still waits for it. */
const settleSuggest = (model: Model, target: SuggestTarget, next: Suggest): Model =>
  isSuggestPending(model.suggest, target) ? modifyFields(model, { suggest: () => next }) : model;

const startSuggest = (model: Model, target: SuggestTarget): Model =>
  modifyFields(model, { suggest: () => Suggest.Pending({ target }) });

const withRow = (
  model: Model,
  rowId: string,
  toReturn: (row: BehaviorRow) => UpdateReturn,
): UpdateReturn =>
  Option.match(findRow(model, rowId), {
    onNone: () => ({ model }),
    onSome: toReturn,
  });

// PERSISTENCE

/** Save the draft and step whenever either changed, once the saved copy has loaded. */
const persist = (before: Model, result: UpdateReturn): UpdateReturn => {
  const after = result.model;
  const changed = after.draft !== before.draft || after.step !== before.step;
  if (!changed || after.hydration._tag !== 'Loaded') {
    return result;
  }
  return Update.withOutMessage(
    {
      model: after,
      commands: [...(result.commands ?? []), SaveCreateProgress({ step: after.step, draft: after.draft })],
    },
    result.outMessage,
  );
};

// UPDATE

const skillPathFor = (context: AppContext, skillId: string): Option.Option<string> =>
  Array.findFirst(context.workspace.skills, (skill) => skill.id === skillId).pipe(
    Option.flatMap((skill) => skill.path),
  );

const transition = (model: Model, message: Message, context: AppContext): UpdateReturn =>
  Message.match<UpdateReturn>(message, {
    CompletedLoadCreateProgress: ({ maybeDraft, maybeStep }) => ({
      model: modifyFields(model, {
        hydration: () => Hydration.Loaded(),
        draft: (draft) => Option.getOrElse(maybeDraft, () => draft),
        step: (current) => Option.getOrElse(maybeStep, () => current),
      }),
    }),
    CompletedSaveCreateProgress: () => ({ model }),

    ClickedStep: ({ step: target }) => ({ model: goToStep(model, target) }),
    ClickedBack: () => ({
      model: Option.match(stepAt(stepIndex(model.step) - 1), {
        onNone: () => model,
        onSome: (target) => goToStep(model, target),
      }),
    }),
    ClickedNext: () => ({
      model: Option.match(stepAt(stepIndex(model.step) + 1), {
        onNone: () => model,
        onSome: (target) => goToStep(model, target),
      }),
    }),

    UpdatedSkill: ({ value }) => ({
      model: modifyFields(
        mutateDraft(model, (draft) => modifyFields(draft, { skill: () => value })),
        { maybeEditTargetPath: () => Option.none() },
      ),
    }),
    ClickedAddBehavior: () => ({ model, commands: [CreateBehaviorId()] }),
    CompletedCreateBehaviorId: ({ id }) => ({ model: appendRow(model, makeBehaviorRow(id)) }),
    ClickedRemoveBehavior: ({ rowId }) => ({
      model: mutateDraft(model, (draft) =>
        modifyFields(draft, { behaviors: (rows) => Array.filter(rows, (row) => row.id !== rowId) }),
      ),
    }),
    UpdatedBehaviorText: ({ rowId, value }) => ({
      model: mapRow(model, rowId, (row) => modifyFields(row, { text: () => value })),
    }),
    ClickedDimension: ({ rowId, dim }) => ({
      model: mapRow(model, rowId, (row) => modifyFields(row, { dim: () => dim })),
    }),
    UpdatedPrompt: ({ rowId, value }) => ({
      model: mapRow(model, rowId, (row) => modifyFields(row, { prompt: () => value })),
    }),
    ClickedFlavor: ({ rowId, flavor }) => ({
      model: mapRow(model, rowId, (row) => modifyFields(row, { flavor: () => flavor })),
    }),
    ClickedAddAssertion: ({ rowId, kind }) => ({
      model: mapAssertions(model, rowId, (asserts) => Array.append(asserts, { kind, val: '' })),
    }),
    ClickedRemoveAssertion: ({ rowId, index }) => ({
      model: mapAssertions(model, rowId, (asserts) => Array.remove(asserts, index)),
    }),
    UpdatedAssertionValue: ({ rowId, index, value }) => ({
      model: mapAssertions(model, rowId, (asserts) =>
        Array.map(asserts, (assertion, assertionIndex) =>
          assertionIndex === index ? modifyFields(assertion, { val: () => value }) : assertion,
        ),
      ),
    }),

    ClickedSuggestBehavior: () => ({
      model: startSuggest(model, SuggestTarget.Behavior()),
      commands: [
        SuggestBehavior({
          skill: model.draft.skill,
          existing: Array.filter(
            Array.map(model.draft.behaviors, (row) => row.text),
            (text) => text !== '',
          ),
          assistModel: model.assistModel,
        }),
      ],
    }),
    ClickedSuggestDimension: ({ rowId }) =>
      withRow(model, rowId, (row) => ({
        model: startSuggest(model, SuggestTarget.Dimension({ rowId })),
        commands: [
          SuggestDimension({ rowId, skill: model.draft.skill, behavior: row.text, assistModel: model.assistModel }),
        ],
      })),
    ClickedSuggestPrompt: ({ rowId }) =>
      withRow(model, rowId, (row) => {
        const fallback = suggestPromptTemplate(model.draft.skill, row);
        return context.env === 'localhost'
          ? {
              model: startSuggest(model, SuggestTarget.Prompt({ rowId })),
              commands: [
                SuggestPrompt({
                  rowId,
                  skill: model.draft.skill,
                  behavior: row.text,
                  dim: row.dim,
                  flavor: row.flavor,
                  fallback,
                  assistModel: model.assistModel,
                }),
              ],
            }
          : { model: mapRow(model, rowId, (current) => modifyFields(current, { prompt: () => fallback })) };
      }),
    ClickedSuggestFlavor: ({ rowId }) =>
      withRow(model, rowId, (row) =>
        context.env !== 'localhost' || row.prompt.trim() === ''
          ? { model }
          : {
              model: startSuggest(model, SuggestTarget.Flavor({ rowId })),
              commands: [
                SuggestFlavor({
                  rowId,
                  skill: model.draft.skill,
                  behavior: row.text,
                  prompt: row.prompt,
                  assistModel: model.assistModel,
                }),
              ],
            },
      ),
    ClickedSuggestAssertion: ({ rowId }) =>
      withRow(model, rowId, (row) => ({
        model: startSuggest(model, SuggestTarget.Assertion({ rowId })),
        commands: [
          SuggestAssertion({
            rowId,
            skill: model.draft.skill,
            behavior: row.text,
            prompt: row.prompt,
            assistModel: model.assistModel,
          }),
        ],
      })),

    SucceededSuggestBehavior: ({ row }) => ({
      model: appendRow(settleSuggest(model, SuggestTarget.Behavior(), Suggest.Idle()), row),
    }),
    SucceededSuggestDimension: ({ rowId, dim }) => ({
      model: mapRow(settleSuggest(model, SuggestTarget.Dimension({ rowId }), Suggest.Idle()), rowId, (row) =>
        modifyFields(row, { dim: () => dim }),
      ),
    }),
    SucceededSuggestPrompt: ({ rowId, prompt }) => ({
      model: mapRow(settleSuggest(model, SuggestTarget.Prompt({ rowId }), Suggest.Idle()), rowId, (row) =>
        modifyFields(row, { prompt: () => prompt }),
      ),
    }),
    FailedSuggestPrompt: ({ rowId, error, fallback }) => ({
      model: mapRow(settleSuggest(model, SuggestTarget.Prompt({ rowId }), Suggest.Failed({ error })), rowId, (row) =>
        modifyFields(row, { prompt: () => fallback }),
      ),
    }),
    SucceededSuggestFlavor: ({ rowId, flavor }) => ({
      model: mapRow(settleSuggest(model, SuggestTarget.Flavor({ rowId }), Suggest.Idle()), rowId, (row) =>
        modifyFields(row, { flavor: () => flavor }),
      ),
    }),
    SucceededSuggestAssertion: ({ rowId, assertion }) => ({
      model: mapAssertions(settleSuggest(model, SuggestTarget.Assertion({ rowId }), Suggest.Idle()), rowId, (asserts) =>
        Array.append(asserts, assertion),
      ),
    }),
    FailedSuggest: ({ target, error }) => ({ model: settleSuggest(model, target, Suggest.Failed({ error })) }),

    SelectedAssistModel: ({ value }) => ({ model: modifyFields(model, { assistModel: () => value }) }),
    ClickedSkillChip: ({ skillId }) => ({
      model: modifyBanner(model, (banner) =>
        modifyFields(banner, {
          maybeSelectedSkillId: (maybeSelected) =>
            Option.contains(maybeSelected, skillId) ? Option.none() : Option.some(skillId),
        }),
      ),
    }),
    ClickedDraftEvals: () =>
      Option.match(model.banner.maybeSelectedSkillId, {
        onNone: () => ({ model }),
        onSome: (skillId) => ({
          model: modifyBanner(model, (banner) =>
            modifyFields(banner, {
              activity: () => BannerActivity.Generating(),
              maybeLoaded: () => Option.none(),
              maybeLoadError: () => Option.none(),
              maybeDraftError: () => Option.none(),
            }),
          ),
          commands: [
            GenerateEvals({
              skillId,
              skillPath: Option.getOrElse(skillPathFor(context, skillId), () => `${context.workspace.root}/${skillId}`),
              assistModel: model.assistModel,
            }),
          ],
        }),
      }),
    ClickedEditExistingEvals: () =>
      Option.match(Option.flatMap(model.banner.maybeSelectedSkillId, (skillId) => skillPathFor(context, skillId)), {
        onNone: () => ({
          model: modifyBanner(model, (banner) =>
            modifyFields(banner, { maybeLoadError: () => Option.some('could not resolve the selected skill path') }),
          ),
        }),
        onSome: (skillPath) => ({
          model: modifyBanner(model, (banner) =>
            modifyFields(banner, {
              activity: () => BannerActivity.LoadingEvals(),
              maybeDrafted: () => Option.none(),
              maybeLoadError: () => Option.none(),
            }),
          ),
          commands: [
            LoadSkillEvals({
              skillId: Option.getOrElse(model.banner.maybeSelectedSkillId, () => ''),
              skillPath,
            }),
          ],
        }),
      }),
    SucceededGenerateEvals: ({ skill, rows }) => ({
      model: modifyFields(
        seedDraft(
          modifyBanner(model, (banner) =>
            banner.activity._tag === 'Generating'
              ? modifyFields(banner, {
                  activity: () => BannerActivity.Idle(),
                  maybeDrafted: () => Option.some({ skill, count: rows.length }),
                })
              : banner,
          ),
          skill,
          rows,
        ),
        { maybeEditTargetPath: () => Option.none() },
      ),
    }),
    FailedGenerateEvals: ({ error }) => ({
      model: modifyBanner(model, (banner) =>
        banner.activity._tag === 'Generating'
          ? modifyFields(banner, { activity: () => BannerActivity.Idle(), maybeDraftError: () => Option.some(error) })
          : banner,
      ),
    }),
    SucceededLoadSkillEvals: ({ skill, rows, skillPath }) => ({
      model: modifyFields(
        seedDraft(
          modifyBanner(model, (banner) =>
            banner.activity._tag === 'LoadingEvals'
              ? modifyFields(banner, {
                  activity: () => BannerActivity.Idle(),
                  maybeLoaded: () => Option.some({ skill, count: rows.length }),
                })
              : banner,
          ),
          skill,
          rows,
        ),
        { maybeEditTargetPath: () => Option.some(skillPath) },
      ),
    }),
    FailedLoadSkillEvals: ({ error }) => ({
      model: modifyBanner(model, (banner) =>
        banner.activity._tag === 'LoadingEvals'
          ? modifyFields(banner, {
              activity: () => BannerActivity.Idle(),
              maybeLoaded: () => Option.none(),
              maybeLoadError: () => Option.some(error),
            })
          : banner,
      ),
    }),

    ClickedWriteEvalsJson: () => {
      if (model.write._tag === 'Written' || isWriteInFlight(model.stage)) {
        return { model };
      }
      if (context.env !== 'localhost') {
        return {
          model: modifyFields(model, { write: () => DraftWrite.Written() }),
          commands: [DownloadEvalsJson({ contents: serializeEvalsJson(assembleEvalsJson(model.draft)) })],
        };
      }
      return {
        model: modifyFields(model, { stage: () => Stage.Staging() }),
        commands: [
          StagePlan({
            workspaceRoot: Option.getOrElse(model.maybeEditTargetPath, () => context.workspace.root),
            draft: model.draft,
          }),
        ],
      };
    },
    CompletedDownloadEvalsJson: () => ({ model }),
    SucceededStagePlan: ({ plan }) =>
      model.stage._tag === 'Staging' ? { model: modifyFields(model, { stage: () => Stage.Staged({ plan }) }) } : { model },
    FailedStagePlan: ({ error }) =>
      model.stage._tag === 'Staging'
        ? { model: modifyFields(model, { stage: () => Stage.Failed({ error, maybePlan: Option.none() }) }) }
        : { model },
    ClickedApplyChanges: () =>
      Option.match(maybeStagedPlan(model.stage), {
        onNone: () => ({ model }),
        onSome: (plan) => ({
          model: modifyFields(model, { stage: () => Stage.Committing({ plan }) }),
          commands: [CommitPlan({ planId: plan.planId })],
        }),
      }),
    SucceededCommitPlan: ({ maybePath }) => ({
      model: modifyFields(model, {
        write: () => DraftWrite.Written(),
        stage: (stage) => (stage._tag === 'Committing' ? Stage.Committed({ maybePath }) : stage),
      }),
    }),
    FailedCommitPlan: ({ error }) => ({
      model: modifyFields(model, {
        stage: (stage) =>
          stage._tag === 'Committing' ? Stage.Failed({ error, maybePlan: Option.some(stage.plan) }) : stage,
      }),
    }),
    ClickedDiscardChanges: () =>
      Option.match(maybeStagedPlan(model.stage), {
        onNone: () => ({ model: modifyFields(model, { stage: () => Stage.Idle() }) }),
        onSome: (plan) => ({
          model: modifyFields(model, { stage: () => Stage.Cancelling({ plan }) }),
          commands: [CancelPlan({ planId: plan.planId })],
        }),
      }),
    SucceededCancelPlan: () => ({
      model: modifyFields(model, {
        stage: (stage) => (stage._tag === 'Cancelling' ? Stage.Cancelled() : stage),
      }),
    }),
    FailedCancelPlan: ({ error }) => ({
      model: modifyFields(model, {
        stage: (stage) =>
          stage._tag === 'Cancelling' ? Stage.Failed({ error, maybePlan: Option.some(stage.plan) }) : stage,
      }),
    }),
    ClickedOpenRunConsole: () => ({ model, outMessage: PageOutMessage.RequestedSection({ section: 'run' }) }),
  });

export const update = (model: Model, message: Message, context: AppContext): UpdateReturn =>
  persist(model, transition(model, message, context));
