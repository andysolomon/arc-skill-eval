import { Array, Option, Schema } from 'effect';

export const chapterIds = ['overview', 'skill', 'create', 'assert', 'signal', 'run', 'pi'] as const;
export const ChapterId = Schema.Literals(chapterIds);
export type ChapterId = typeof ChapterId.Type;

export type Chapter = Readonly<{ id: ChapterId; label: string; maybeDesc: Option.Option<string> }>;

export const learnChapters: ReadonlyArray<Chapter> = [
  { id: 'overview', label: 'Overview', maybeDesc: Option.none() },
  {
    id: 'skill',
    label: 'Anatomy of a skill',
    maybeDesc: Option.some('SKILL.md, progressive disclosure, and why name + description do the triggering.'),
  },
  {
    id: 'create',
    label: 'Creating an eval',
    maybeDesc: Option.some('Create runnable cases from required behaviors.'),
  },
  {
    id: 'assert',
    label: 'Writing assertions',
    maybeDesc: Option.some('Deterministic checks vs the llm-judge, and how to choose between them.'),
  },
  {
    id: 'signal',
    label: 'The with / without signal',
    maybeDesc: Option.some('How the with_skill / without_skill delta is computed and read.'),
  },
  {
    id: 'run',
    label: 'Anatomy of a run',
    maybeDesc: Option.some('The artifact files every run writes, and how to read them.'),
  },
  {
    id: 'pi',
    label: 'The Pi runtime',
    maybeDesc: Option.some('How Pi runs cases and how to pin models for repeatable results.'),
  },
];

export const chapterNumber = (id: ChapterId): string =>
  String(
    Option.getOrElse(
      Array.findFirstIndex(learnChapters, (chapter) => chapter.id === id),
      () => -1,
    ) + 1,
  ).padStart(2, '0');

export const decodeChapterId = Schema.decodeUnknownOption(ChapterId);
