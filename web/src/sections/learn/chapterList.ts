export type LearnChapterId =
  | 'overview'
  | 'skill'
  | 'create'
  | 'assert'
  | 'signal'
  | 'run'
  | 'pi';

export type LearnChapter = {
  id: LearnChapterId;
  label: string;
  desc?: string;
};

export const learnChapters: readonly LearnChapter[] = [
  { id: 'overview', label: 'Overview' },
  {
    id: 'skill',
    label: 'Anatomy of a skill',
    desc: 'SKILL.md, progressive disclosure, and why name + description do the triggering.',
  },
  {
    id: 'create',
    label: 'Creating an eval',
    desc: 'From behaviors to a runnable case — a worked example, step by step.',
  },
  {
    id: 'assert',
    label: 'Writing assertions',
    desc: 'Deterministic checks vs the llm-judge, and how to choose between them.',
  },
  {
    id: 'signal',
    label: 'The with / without signal',
    desc: 'How the with_skill / without_skill delta is computed and read.',
  },
  {
    id: 'run',
    label: 'Anatomy of a run',
    desc: 'The artifact files every run writes, and how to read them.',
  },
  {
    id: 'pi',
    label: 'The Pi runtime',
    desc: 'Why the runner is Pi — an llm, a loop, and enough tokens — and how to pin it down.',
  },
];

export const chapterNumber = (id: LearnChapterId): string =>
  String(learnChapters.findIndex((chapter) => chapter.id === id) + 1).padStart(2, '0');
