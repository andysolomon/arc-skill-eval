import { Match, Option } from 'effect';
import { Command, Update } from 'foldkit';
import { modifyFields } from 'foldkit/struct';

import { PageOutMessage, type AppContext } from '@/app/context';
import type { EnvName, SectionName, ThemeName } from '@/app/domain';
import {
  ApplyDocumentAttributes,
  ConfirmResetHostedData,
  CopyInstallCommand,
  ResetHostedDataAndReload,
  SaveShellPreferences,
  WaitBeforeResetInstallCopy,
} from '@/command';
import { Message } from '@/message';
import { InstallCopy, Page, toContext, type Model } from '@/model';
import * as Browse from '@/page/browse';
import * as Create from '@/page/create';
import * as Learn from '@/page/learn';
import * as Review from '@/page/review';
import * as Run from '@/page/run';
import * as Workspace from '@/shell/workspace';

type UpdateReturn = Update.Return<Model, Message>;

export const initPage = (section: SectionName, context: AppContext): Update.Return<Page, Message> => {
  const lift = <M, PM>(
    init: Update.Return<M, PM>,
    toPage: (model: M) => Page,
    toMessage: (message: PM) => Message,
  ): Update.Return<Page, Message> => ({
    model: toPage(init.model),
    commands: Command.mapMessages(init.commands, toMessage),
  });

  return Match.value(section).pipe(
    Match.withReturnType<Update.Return<Page, Message>>(),
    Match.when('run', () =>
      lift(Run.init(context), (model) => Page.Run({ model }), (message) => Message.GotRunMessage({ message })),
    ),
    Match.when('browse', () =>
      lift(Browse.init(context), (model) => Page.Browse({ model }), (message) => Message.GotBrowseMessage({ message })),
    ),
    Match.when('create', () =>
      lift(Create.init(context), (model) => Page.Create({ model }), (message) => Message.GotCreateMessage({ message })),
    ),
    Match.when('review', () =>
      lift(Review.init(context), (model) => Page.Review({ model }), (message) => Message.GotReviewMessage({ message })),
    ),
    Match.when('learn', () =>
      lift(Learn.init(context), (model) => Page.Learn({ model }), (message) => Message.GotLearnMessage({ message })),
    ),
    Match.exhaustive,
  );
};

const notifyPage = (model: Model): UpdateReturn => {
  const context = toContext(model);
  const withPage = (page: Page, commands: Update.Return<Page, Message>['commands']): UpdateReturn => ({
    model: modifyFields(model, { page: () => page }),
    commands,
  });

  return Page.match(model.page, {
    Run: ({ model: pageModel }) => {
      const changed = Run.contextChanged(pageModel, context);
      return withPage(Page.Run({ model: changed.model }), Command.mapMessages(changed.commands, (message) => Message.GotRunMessage({ message })));
    },
    Browse: ({ model: pageModel }) => {
      const changed = Browse.contextChanged(pageModel, context);
      return withPage(Page.Browse({ model: changed.model }), Command.mapMessages(changed.commands, (message) => Message.GotBrowseMessage({ message })));
    },
    Create: ({ model: pageModel }) => {
      const changed = Create.contextChanged(pageModel, context);
      return withPage(Page.Create({ model: changed.model }), Command.mapMessages(changed.commands, (message) => Message.GotCreateMessage({ message })));
    },
    Review: ({ model: pageModel }) => {
      const changed = Review.contextChanged(pageModel, context);
      return withPage(Page.Review({ model: changed.model }), Command.mapMessages(changed.commands, (message) => Message.GotReviewMessage({ message })));
    },
    Learn: ({ model: pageModel }) => {
      const changed = Learn.contextChanged(pageModel, context);
      return withPage(Page.Learn({ model: changed.model }), Command.mapMessages(changed.commands, (message) => Message.GotLearnMessage({ message })));
    },
  });
};

const foldPageOutMessage = PageOutMessage.match<Update.Step<Model, Message>>({
  RequestedSection:
    ({ section }) =>
    (model) =>
      switchSection(model, section),
});

const foldRun = (context: AppContext) =>
  Update.foldChild({
    update: (pageModel: Run.Model, message: Run.Message) => Run.update(pageModel, message, context),
    read: (model: Model) => (model.page._tag === 'Run' ? Option.some(model.page.model) : Option.none()),
    write: (model: Model, next: Run.Model): Model => modifyFields(model, { page: () => Page.Run({ model: next }) }),
    toParentMessage: (message: Run.Message) => Message.GotRunMessage({ message }),
    foldOutMessage: foldPageOutMessage,
  });

const foldBrowse = (context: AppContext) =>
  Update.foldChild({
    update: (pageModel: Browse.Model, message: Browse.Message) => Browse.update(pageModel, message, context),
    read: (model: Model) => (model.page._tag === 'Browse' ? Option.some(model.page.model) : Option.none()),
    write: (model: Model, next: Browse.Model): Model => modifyFields(model, { page: () => Page.Browse({ model: next }) }),
    toParentMessage: (message: Browse.Message) => Message.GotBrowseMessage({ message }),
    foldOutMessage: foldPageOutMessage,
  });

const foldCreate = (context: AppContext) =>
  Update.foldChild({
    update: (pageModel: Create.Model, message: Create.Message) => Create.update(pageModel, message, context),
    read: (model: Model) => (model.page._tag === 'Create' ? Option.some(model.page.model) : Option.none()),
    write: (model: Model, next: Create.Model): Model => modifyFields(model, { page: () => Page.Create({ model: next }) }),
    toParentMessage: (message: Create.Message) => Message.GotCreateMessage({ message }),
    foldOutMessage: foldPageOutMessage,
  });

const foldReview = (context: AppContext) =>
  Update.foldChild({
    update: (pageModel: Review.Model, message: Review.Message) => Review.update(pageModel, message, context),
    read: (model: Model) => (model.page._tag === 'Review' ? Option.some(model.page.model) : Option.none()),
    write: (model: Model, next: Review.Model): Model => modifyFields(model, { page: () => Page.Review({ model: next }) }),
    toParentMessage: (message: Review.Message) => Message.GotReviewMessage({ message }),
    foldOutMessage: foldPageOutMessage,
  });

const foldLearn = (context: AppContext) =>
  Update.foldChild({
    update: (pageModel: Learn.Model, message: Learn.Message) => Learn.update(pageModel, message, context),
    read: (model: Model) => (model.page._tag === 'Learn' ? Option.some(model.page.model) : Option.none()),
    write: (model: Model, next: Learn.Model): Model => modifyFields(model, { page: () => Page.Learn({ model: next }) }),
    toParentMessage: (message: Learn.Message) => Message.GotLearnMessage({ message }),
    foldOutMessage: foldPageOutMessage,
  });

const switchSection = (model: Model, section: SectionName): UpdateReturn => {
  if (section === model.section) {
    return { model };
  }
  const withSection = modifyFields(model, { section: () => section });
  const pageInit = initPage(section, toContext(withSection));
  return {
    model: modifyFields(withSection, { page: () => pageInit.model }),
    commands: [...(pageInit.commands ?? []), SaveShellPreferences({ section })],
  };
};

const setTheme = (model: Model, theme: ThemeName): UpdateReturn => {
  const notified = notifyPage(modifyFields(model, { theme: () => theme }));
  return {
    model: notified.model,
    commands: [
      ...(notified.commands ?? []),
      ApplyDocumentAttributes({ theme, env: model.env }),
      SaveShellPreferences({ theme }),
    ],
  };
};

const setEnv = (model: Model, env: EnvName): UpdateReturn => {
  const notified = notifyPage(modifyFields(model, { env: () => env }));
  return {
    model: notified.model,
    commands: [
      ...(notified.commands ?? []),
      ApplyDocumentAttributes({ theme: model.theme, env }),
      SaveShellPreferences({ env }),
      ...(env === 'localhost'
        ? Command.mapMessages(Workspace.checkDaemon(model.workspace), (message) =>
            Message.GotWorkspaceMessage({ message }),
          )
        : []),
    ],
  };
};

const foldWorkspace = Update.foldChild({
  update: Workspace.update,
  read: (model: Model) => Option.some(model.workspace),
  write: (model: Model, next: Workspace.Model): Model => modifyFields(model, { workspace: () => next }),
  toParentMessage: (message: Workspace.Message) => Message.GotWorkspaceMessage({ message }),
});

const updateWorkspace = (model: Model, message: Workspace.Message): UpdateReturn => {
  const workspaceUpdate = foldWorkspace(model, message);
  const before = model.workspace;
  const after = workspaceUpdate.model.workspace;
  if (before.root === after.root && before.resolution === after.resolution) {
    return workspaceUpdate;
  }
  const notified = notifyPage(workspaceUpdate.model);
  return { model: notified.model, commands: [...(workspaceUpdate.commands ?? []), ...(notified.commands ?? [])] };
};

export const update = (model: Model, message: Message) =>
  Message.match<UpdateReturn>(message, {
    ClickedSection: ({ section }) => switchSection(model, section),
    PressedSectionKey: ({ section }) => switchSection(model, section),
    ClickedTheme: ({ theme }) => setTheme(model, theme),
    ClickedEnv: ({ env }) => setEnv(model, env),
    ClickedInstallCommand: () => ({ model, commands: [CopyInstallCommand()] }),
    CompletedCopyInstallCommand: () => ({
      model: modifyFields(model, { installCopy: () => InstallCopy.Copied() }),
      commands: [WaitBeforeResetInstallCopy()],
    }),
    CompletedWaitBeforeResetInstallCopy: () => ({
      model: modifyFields(model, { installCopy: () => InstallCopy.Idle() }),
    }),
    ClickedResetHostedData: () => ({ model, commands: [ConfirmResetHostedData()] }),
    CompletedConfirmResetHostedData: ({ confirmed }) =>
      confirmed ? { model, commands: [ResetHostedDataAndReload()] } : { model },
    CompletedResetHostedData: () => ({ model }),
    CompletedApplyDocumentAttributes: () => ({ model }),
    CompletedSavePreferences: () => ({ model }),
    GotWorkspaceMessage: ({ message: workspaceMessage }) => updateWorkspace(model, workspaceMessage),
    GotRunMessage: ({ message: pageMessage }) => foldRun(toContext(model))(model, pageMessage),
    GotBrowseMessage: ({ message: pageMessage }) => foldBrowse(toContext(model))(model, pageMessage),
    GotCreateMessage: ({ message: pageMessage }) => foldCreate(toContext(model))(model, pageMessage),
    GotReviewMessage: ({ message: pageMessage }) => foldReview(toContext(model))(model, pageMessage),
    GotLearnMessage: ({ message: pageMessage }) => foldLearn(toContext(model))(model, pageMessage),
  });
