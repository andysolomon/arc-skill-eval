import { Array, Option } from 'effect';
import type { Update } from 'foldkit';
import { modifyFields } from 'foldkit/struct';

import { PageOutMessage, type AppContext } from '@/app/context';

import { DeleteRun, LoadLastRunId, SaveLastRunId, ShowAlert, StartRun } from './command';
import { defaultComposer, findSelectedSkill, hasNoEvals, type Composer, type FieldName } from './composer';
import { RunState, accept, applyEvent, start } from './lifecycle';
import { Message } from './message';
import type { Model } from './model';

// INIT

export const init = (_context: AppContext): Update.Return<Model, Message> => ({
  model: {
    composer: defaultComposer,
    maybeOpenField: Option.some('skill'),
    extraSkillDraft: '',
    run: RunState.Idle(),
    runAttempt: 0,
    maybeLastRunId: Option.none(),
    spinnerFrame: 0,
  },
  commands: [LoadLastRunId()],
});

// UPDATE

type UpdateReturn = Update.ReturnWithOutMessage<Model, Message, PageOutMessage>;

const toggleField = (model: Model, field: FieldName): UpdateReturn => ({
  model: modifyFields(model, {
    maybeOpenField: (maybeOpenField) => (Option.contains(maybeOpenField, field) ? Option.none() : Option.some(field)),
  }),
});

/** Pick a flag value from its open row, which then closes. */
const selectFlag = (model: Model, patch: (composer: Composer) => Composer): UpdateReturn => ({
  model: modifyFields(model, { composer: patch, maybeOpenField: () => Option.none() }),
});

const addExtraSkill = (model: Model): UpdateReturn => {
  const extraSkill = model.extraSkillDraft.trim();
  if (extraSkill === '' || Array.contains(model.composer.extraSkill, extraSkill)) {
    return { model };
  }
  return {
    model: modifyFields(model, {
      composer: (composer) => modifyFields(composer, { extraSkill: (skills) => Array.append(skills, extraSkill) }),
      extraSkillDraft: () => '',
    }),
  };
};

/** Refuse to start: point the user at the skill row and tell them why. */
const refuseRun = (model: Model, text: string): UpdateReturn => ({
  model: modifyFields(model, { maybeOpenField: () => Option.some<FieldName>('skill') }),
  commands: [ShowAlert({ text })],
});

const startRun = (model: Model, context: AppContext): UpdateReturn => {
  const { composer } = model;
  const maybeSelectedSkill = findSelectedSkill(context.workspace.skills, composer);
  if (composer.workspaceRoot === '') {
    return refuseRun(model, 'Choose a skill before starting the run.');
  }
  if (hasNoEvals(maybeSelectedSkill)) {
    const skillName = Option.match(maybeSelectedSkill, { onNone: () => 'This skill', onSome: (skill) => skill.id });
    return refuseRun(model, `${skillName} has no evals/evals.json. Create an eval suite in the Create tab first.`);
  }
  const attempt = model.runAttempt + 1;
  return {
    model: modifyFields(model, { run: () => start(attempt, composer), runAttempt: () => attempt }),
    commands: [StartRun({ attempt, composer })],
  };
};

const clickRunButton = (model: Model, context: AppContext): UpdateReturn =>
  RunState.match(model.run, {
    Idle: () => startRun(model, context),
    Starting: () => ({ model: modifyFields(model, { run: () => RunState.Idle() }) }),
    Streaming: ({ runId }) => ({
      model: modifyFields(model, { run: () => RunState.Idle() }),
      commands: [DeleteRun({ runId })],
    }),
    Done: () => ({ model: modifyFields(model, { run: () => RunState.Idle() }) }),
  });

const acceptRun = (
  model: Model,
  accepted: Readonly<{ attempt: number; runId: string; socketUrl: string; startedAtMs: number }>,
): UpdateReturn => {
  const { run } = model;
  if (run._tag === 'Starting' && run.attempt === accepted.attempt) {
    return { model: modifyFields(model, { run: () => accept(run, accepted) }) };
  }
  return { model, commands: [DeleteRun({ runId: accepted.runId })] };
};

const failRun = (model: Model, attempt: number, error: string): UpdateReturn => {
  const { run } = model;
  if (run._tag === 'Starting' && run.attempt === attempt) {
    return { model: modifyFields(model, { run: () => RunState.Idle() }), commands: [ShowAlert({ text: error })] };
  }
  return { model };
};

const receiveRunEvent = (model: Model, message: typeof Message.ReceivedRunEvent.Type): UpdateReturn => {
  const { run } = model;
  if (run._tag !== 'Streaming') {
    return { model };
  }
  const outcome = applyEvent(run, message.event, message.receivedAtMs);
  const nextModel = modifyFields(model, { run: () => outcome.run });
  return Option.match(outcome.maybeFinishedRunId, {
    onNone: () => ({ model: nextModel }),
    onSome: (runId) => ({ model: nextModel, commands: [SaveLastRunId({ runId })] }),
  });
};

export const update = (model: Model, message: Message, context: AppContext) =>
  Message.match<UpdateReturn>(message, {
    ClickedReviewLink: () => ({ model, outMessage: PageOutMessage.RequestedSection({ section: 'review' }) }),
    ClickedLearnLink: () => ({ model, outMessage: PageOutMessage.RequestedSection({ section: 'learn' }) }),
    ClickedInspectInBrowse: () => ({ model, outMessage: PageOutMessage.RequestedSection({ section: 'browse' }) }),
    ClickedFlagRow: ({ field }) => toggleField(model, field),
    SelectedSkill: ({ workspaceRoot }) =>
      selectFlag(model, (composer) => modifyFields(composer, { workspaceRoot: () => workspaceRoot })),
    SelectedCase: ({ value }) => selectFlag(model, (composer) => modifyFields(composer, { case: () => value })),
    SelectedModel: ({ value }) => selectFlag(model, (composer) => modifyFields(composer, { model: () => value })),
    SelectedJudgeModel: ({ value }) =>
      selectFlag(model, (composer) => modifyFields(composer, { judgeModel: () => value })),
    SelectedCompare: ({ value }) => selectFlag(model, (composer) => modifyFields(composer, { compare: () => value })),
    SelectedIteration: ({ value }) =>
      selectFlag(model, (composer) => modifyFields(composer, { iteration: () => value })),
    SelectedContextMode: ({ value }) =>
      selectFlag(model, (composer) => modifyFields(composer, { contextMode: () => value })),
    SelectedSandbox: ({ value }) => selectFlag(model, (composer) => modifyFields(composer, { sandbox: () => value })),
    UpdatedExtraSkillDraft: ({ value }) => ({ model: modifyFields(model, { extraSkillDraft: () => value }) }),
    PressedExtraSkillEnter: () => addExtraSkill(model),
    ClickedAddExtraSkill: () => addExtraSkill(model),
    ClickedRemoveExtraSkill: ({ extraSkill }) => ({
      model: modifyFields(model, {
        composer: (composer) =>
          modifyFields(composer, {
            extraSkill: (skills) => Array.filter(skills, (candidate) => candidate !== extraSkill),
          }),
      }),
    }),
    ClickedRunButton: () => clickRunButton(model, context),
    TickedSpinner: () => ({ model: modifyFields(model, { spinnerFrame: (frame) => frame + 1 }) }),
    SucceededStartRun: (accepted) => acceptRun(model, accepted),
    FailedStartRun: ({ attempt, error }) => failRun(model, attempt, error),
    ReceivedRunEvent: (received) => receiveRunEvent(model, received),
    CompletedDeleteRun: () => ({ model }),
    CompletedLoadLastRunId: ({ maybeLastRunId }) => ({
      model: modifyFields(model, { maybeLastRunId: () => maybeLastRunId }),
    }),
    CompletedSaveLastRunId: ({ runId }) => ({ model: modifyFields(model, { maybeLastRunId: () => Option.some(runId) }) }),
    CompletedShowAlert: () => ({ model }),
  });

// CONTEXT

/**
 * The composer is only on screen in localhost mode. Leaving it resets its
 * open row and draft, as the React composer did by unmounting; the run itself
 * keeps going.
 */
export const contextChanged = (model: Model, context: AppContext): Update.Return<Model, Message> =>
  context.env === 'hosted'
    ? {
        model: modifyFields(model, {
          maybeOpenField: () => Option.some<FieldName>('skill'),
          extraSkillDraft: () => '',
        }),
      }
    : { model };
