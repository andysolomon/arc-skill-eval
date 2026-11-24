import { Option } from 'effect';
import type { Update } from 'foldkit';
import { modifyFields } from 'foldkit/struct';

import type { AppContext, PageOutMessage } from '@/app/context';

import { advanceCreateCommand, advanceCreateScaffold, advancePi } from './animation';
import type { ChapterId } from './chapterList';
import { LoadReaderProgress, SaveReaderProgress, ScrollReaderToTop } from './command';
import { Message, type SavedProgress } from './message';
import { initialCreateDemo, initialPiDemo, maybeOpenChapterId, Playback, Reader, type Model } from './model';

type UpdateReturn = Update.ReturnWithOutMessage<Model, Message, PageOutMessage>;

// INIT

export const init = (_context: AppContext): Update.Return<Model, Message> => ({
  model: {
    reader: Reader.Restoring(),
    scrollPos: 0,
    completedSteps: [],
    createDemo: initialCreateDemo,
    piDemo: initialPiDemo,
  },
  commands: [LoadReaderProgress()],
});

// UPDATE

const togglePlayback = (playback: Playback): Playback =>
  Playback.match(playback, {
    Playing: () => Playback.Paused(),
    Paused: () => Playback.Playing(),
  });

const openChapter = (model: Model, chapterId: ChapterId): UpdateReturn => {
  const isSameChapter = Option.contains(maybeOpenChapterId(model), chapterId);
  const scrollPos = isSameChapter ? model.scrollPos : 0;
  const progress: SavedProgress = { chapterId, scrollPos, completedSteps: model.completedSteps };
  return {
    model: modifyFields(model, {
      reader: () => Reader.Reading({ chapterId }),
      scrollPos: () => scrollPos,
      createDemo: (createDemo) => (isSameChapter ? createDemo : initialCreateDemo),
      piDemo: (piDemo) => (isSameChapter ? piDemo : initialPiDemo),
    }),
    commands: [SaveReaderProgress({ progress }), ScrollReaderToTop()],
  };
};

const restoreProgress = (model: Model, maybeProgress: Option.Option<SavedProgress>): UpdateReturn =>
  Reader.match(model.reader, {
    Reading: () => ({ model }),
    Restoring: () =>
      Option.match(maybeProgress, {
        onNone: () => ({ model: modifyFields(model, { reader: () => Reader.Reading({ chapterId: 'overview' }) }) }),
        onSome: (progress) => ({
          model: modifyFields(model, {
            reader: () => Reader.Reading({ chapterId: progress.chapterId }),
            scrollPos: () => progress.scrollPos,
            completedSteps: () => progress.completedSteps,
          }),
        }),
      }),
  });

export const update = (model: Model, message: Message, _context: AppContext) =>
  Message.match<UpdateReturn>(message, {
    ClickedChapter: ({ chapterId }) => openChapter(model, chapterId),
    ClickedDeepDive: ({ chapterId }) => openChapter(model, chapterId),
    PressedDeepDiveActivationKey: ({ chapterId }) => openChapter(model, chapterId),
    ClickedCreateDemoPlayback: () => ({
      model: modifyFields(model, {
        createDemo: (createDemo) => modifyFields(createDemo, { playback: togglePlayback }),
      }),
    }),
    ClickedCreateDemoReplay: () => ({ model: modifyFields(model, { createDemo: () => initialCreateDemo }) }),
    ClickedPiDemoPlayback: () => ({
      model: modifyFields(model, {
        piDemo: (piDemo) => modifyFields(piDemo, { playback: togglePlayback }),
      }),
    }),
    ClickedPiDemoReplay: () => ({ model: modifyFields(model, { piDemo: () => initialPiDemo }) }),
    TickedCreateCommandDemo: () => ({
      model: modifyFields(model, {
        createDemo: (createDemo) => modifyFields(createDemo, { commandTick: advanceCreateCommand }),
      }),
    }),
    TickedCreateScaffoldDemo: () => ({
      model: modifyFields(model, {
        createDemo: (createDemo) => modifyFields(createDemo, { scaffoldTick: advanceCreateScaffold }),
      }),
    }),
    TickedPiDemo: () => ({
      model: modifyFields(model, {
        piDemo: (piDemo) => modifyFields(piDemo, { tick: advancePi }),
      }),
    }),
    SucceededLoadReaderProgress: ({ maybeProgress }) => restoreProgress(model, maybeProgress),
    FailedLoadReaderProgress: () => restoreProgress(model, Option.none()),
    CompletedSaveReaderProgress: () => ({ model }),
    CompletedScrollReaderToTop: () => ({ model }),
  });

export const contextChanged = (model: Model, _context: AppContext): Update.Return<Model, Message> => ({ model });
