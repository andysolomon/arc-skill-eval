import { Array, Match, Option } from 'effect';
import { Submodel } from 'foldkit';
import type { Html, HtmlBuilder } from 'foldkit/html';

import type { AppContext } from '@/app/context';
import { sx } from '@/ui/sx';

import * as AssertChapter from './chapter/assert';
import * as CreateChapter from './chapter/create';
import * as OverviewChapter from './chapter/overview';
import * as PiChapter from './chapter/pi';
import * as RunChapter from './chapter/run';
import * as SignalChapter from './chapter/signal';
import * as SkillChapter from './chapter/skill';
import { chapterNumber, learnChapters, type Chapter, type ChapterId } from './chapterList';
import { READER_SCROLL_ID } from './command';
import { Message } from './message';
import { maybeOpenChapterId, Reader, type Model } from './model';

// VIEW

const chromeStyles = `
.learn-chapter-row:not([aria-current]):hover { background: var(--tt-bg-hi); }
.learn-deep-dive:hover { border-color: var(--tt-border-active) !important; }
`;

const chapterRow = (chapter: Chapter, isSelected: boolean, h: HtmlBuilder<Message>): Html =>
  h.keyed('button')(
    chapter.id,
    [
      ...(isSelected ? [h.AriaCurrent('page')] : []),
      h.Class('learn-chapter-row'),
      h.DataAttribute('chapter-id', chapter.id),
      h.OnClick(Message.ClickedChapter({ chapterId: chapter.id })),
      h.Style(
        sx({
          alignItems: 'center',
          background: isSelected ? 'var(--tt-selection)' : 'transparent',
          border: 'none',
          borderLeft: `2px solid ${isSelected ? 'var(--tt-blue)' : 'transparent'}`,
          borderRadius: 6,
          cursor: 'pointer',
          display: 'flex',
          gap: 10,
          margin: '1px 0',
          padding: '8px 9px',
          textAlign: 'left',
          width: '100%',
        }),
      ),
      h.Type('button'),
    ],
    [
      h.span(
        [
          h.Style(
            sx({
              color: isSelected ? 'var(--tt-blue)' : 'var(--tt-dim)',
              flex: 'none',
              fontSize: 11,
              fontWeight: 700,
              width: 16,
            }),
          ),
        ],
        [chapterNumber(chapter.id)],
      ),
      h.span(
        [h.Style(sx({ color: isSelected ? 'var(--tt-fg)' : 'var(--tt-fg-dark)', fontSize: 12.5, minWidth: 0 }))],
        [chapter.label],
      ),
    ],
  );

const chapterRail = (maybeActiveId: Option.Option<ChapterId>, h: HtmlBuilder<Message>): Html =>
  h.aside(
    [
      h.AriaLabel('Learn chapters'),
      h.Style(
        sx({
          background: 'var(--tt-bg-dark)',
          borderRight: '1px solid var(--tt-border)',
          display: 'flex',
          flexDirection: 'column',
          flex: 'none',
          minHeight: 0,
          width: 238,
        }),
      ),
    ],
    [
      h.div(
        [
          h.Style(
            sx({
              color: 'var(--tt-comment)',
              fontSize: 11,
              letterSpacing: '0.08em',
              padding: '13px 16px 7px',
              textTransform: 'uppercase',
            }),
          ),
        ],
        ['chapters'],
      ),
      h.nav(
        [h.Style(sx({ flex: 1, minHeight: 0, overflow: 'auto', padding: '0 8px 8px' }))],
        Array.map(learnChapters, (chapter) => chapterRow(chapter, Option.contains(maybeActiveId, chapter.id), h)),
      ),
      h.div(
        [
          h.Style(
            sx({
              borderTop: '1px solid var(--tt-border)',
              color: 'var(--tt-comment)',
              fontSize: 11,
              lineHeight: 1.9,
              padding: '12px 16px',
            }),
          ),
        ],
        [
          'format · Anthropic evals.json',
          h.br([]),
          'method · OpenAI eval-skills',
          h.br([]),
          'runtime · ',
          h.span([h.Style(sx({ color: 'var(--tt-teal)' }))], ['Pi']),
        ],
      ),
    ],
  );

const chapterView = (model: Model, chapterId: ChapterId, h: HtmlBuilder<Message>): Html =>
  Match.value(chapterId).pipe(
    Match.withReturnType<Html>(),
    Match.when('overview', () => OverviewChapter.view(h)),
    Match.when('skill', () => SkillChapter.view(h)),
    Match.when('create', () => CreateChapter.view(model.createDemo, h)),
    Match.when('assert', () => AssertChapter.view(h)),
    Match.when('signal', () => SignalChapter.view(h)),
    Match.when('run', () => RunChapter.view(h)),
    Match.when('pi', () => PiChapter.view(model.piDemo, h)),
    Match.exhaustive,
  );

const readerContent = (model: Model, h: HtmlBuilder<Message>): ReadonlyArray<Html> =>
  Reader.match(model.reader, {
    Restoring: () => [],
    Reading: ({ chapterId }) => [chapterView(model, chapterId, h)],
  });

export const view = Submodel.defineView<Model, Message, AppContext>((model, context, h) =>
  h.main(
    [
      h.Class('app-main'),
      h.DataAttribute('screen-label', `learn (${context.env})`),
      h.DataAttribute('testid', 'learn-app'),
      h.Style(sx({ display: 'flex', minHeight: 0, minWidth: 0, overflow: 'hidden', padding: 0 })),
    ],
    [
      h.style([], [chromeStyles]),
      chapterRail(maybeOpenChapterId(model), h),
      h.div(
        [h.Id(READER_SCROLL_ID), h.Style(sx({ flex: 1, minHeight: 0, minWidth: 0, overflow: 'auto' }))],
        readerContent(model, h),
      ),
    ],
  ),
);
