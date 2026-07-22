import { useEffect, useMemo, useRef } from 'react';
import type { ComponentType } from 'react';
import { Column, Kicker } from '@/components/primitives';
import { useEnv } from '@/state/env';
import StartHere from '../../../../docs/web-app/learn/00-start-here.mdx';
import WhatIs from '../../../../docs/web-app/learn/01-what-is.mdx';
import ProgressiveDisclosure from '../../../../docs/web-app/learn/02-progressive-disclosure.mdx';
import AuthoringGoodEvalSuites from '../../../../docs/web-app/learn/03-authoring-good-eval-suites.mdx';
import RunningAndIterating from '../../../../docs/web-app/learn/04-running-and-iterating.mdx';
import CostOfTheWin from '../../../../docs/web-app/learn/05-cost-of-the-win.mdx';
import AdvancedTraceAndJudges from '../../../../docs/web-app/learn/06-advanced-trace-and-judges.mdx';
import { LearnMDXProvider } from './MDXProvider';
import { useLearnProgress } from './useLearnProgress';

type Chapter = {
  id: string;
  order: number;
  title: string;
  description: string;
  Content: ComponentType;
};

const chapters: readonly Chapter[] = [
  {
    id: '00-start-here',
    order: 0,
    title: 'Start here',
    description: 'Orient to the eval loop before writing a suite.',
    Content: StartHere,
  },
  {
    id: '01-what-is',
    order: 1,
    title: 'What is a skill eval',
    description: 'Define the target behavior and the evidence an eval can produce.',
    Content: WhatIs,
  },
  {
    id: '02-progressive-disclosure',
    order: 2,
    title: 'Progressive disclosure',
    description: 'Load only the skill context needed for the case.',
    Content: ProgressiveDisclosure,
  },
  {
    id: '03-authoring-good-eval-suites',
    order: 3,
    title: 'Authoring good eval suites',
    description: 'Turn manual examples into focused evals.json cases.',
    Content: AuthoringGoodEvalSuites,
  },
  {
    id: '04-running-and-iterating',
    order: 4,
    title: 'Running and iterating',
    description: 'Use run artifacts to tighten prompts and assertions.',
    Content: RunningAndIterating,
  },
  {
    id: '05-cost-of-the-win',
    order: 5,
    title: 'Cost of the win',
    description: 'Read lift alongside cost, latency, and maintenance burden.',
    Content: CostOfTheWin,
  },
  {
    id: '06-advanced-trace-and-judges',
    order: 6,
    title: 'Advanced trace and judges',
    description: 'Inspect traces and judge prompts when failures need deeper evidence.',
    Content: AdvancedTraceAndJudges,
  },
] as const;

const getChapterNumber = (chapter: Chapter) => chapter.order.toString().padStart(2, '0');

export const LearnApp = () => {
  const { env } = useEnv();
  const contentRef = useRef<HTMLDivElement | null>(null);
  const {
    completedSteps,
    currentChapterId,
    hydrated,
    markCompleted,
    scrollPos,
    setCurrentChapterId,
    setScrollPos,
  } = useLearnProgress(chapters[0].id);
  const activeChapter = useMemo(
    () => chapters.find((chapter) => chapter.id === currentChapterId) ?? chapters[0],
    [currentChapterId],
  );
  const activeIndex = chapters.findIndex((chapter) => chapter.id === activeChapter.id);
  const ActiveContent = activeChapter.Content;
  const previousChapter = activeIndex > 0 ? chapters[activeIndex - 1] : null;
  const nextChapter = activeIndex < chapters.length - 1 ? chapters[activeIndex + 1] : null;

  useEffect(() => {
    if (!hydrated) {
      return;
    }

    contentRef.current?.scrollTo({ top: scrollPos });
  }, [activeChapter.id, hydrated, scrollPos]);

  const handleContentScroll = () => {
    const pane = contentRef.current;

    if (!pane) {
      return;
    }

    const nextScrollPos = Math.round(pane.scrollTop);
    setScrollPos(nextScrollPos);

    if (pane.scrollHeight - pane.scrollTop - pane.clientHeight <= 24) {
      markCompleted(activeChapter.id);
    }
  };

  const selectChapter = (chapterId: string) => {
    setCurrentChapterId(chapterId);
    contentRef.current?.scrollTo({ top: 0 });
  };

  return (
    <main
      className="app-main"
      data-screen-label={`learn (${env})`}
      data-testid="learn-app"
      style={{ minWidth: 0, overflow: 'hidden', padding: 16 }}
    >
      <div
        style={{
          display: 'grid',
          gap: 16,
          gridTemplateColumns: '238px minmax(0, 1fr)',
          height: '100%',
          minHeight: 0,
        }}
      >
        <aside
          aria-label="Learn chapters"
          style={{
            background: 'var(--tt-bg-dark)',
            border: '1px solid var(--tt-border)',
            minHeight: 0,
            overflowY: 'auto',
            padding: 14,
          }}
        >
          <Column gap={3}>
            <Kicker tone="neutral">chapters</Kicker>
            <div style={{ display: 'grid', gap: 4 }}>
              {chapters.map((chapter) => {
                const selected = chapter.id === activeChapter.id;
                const completed = completedSteps.includes(chapter.id);

                return (
                  <button
                    aria-current={selected ? 'page' : undefined}
                    data-chapter-id={chapter.id}
                    key={chapter.id}
                    onClick={() => selectChapter(chapter.id)}
                    style={{
                      alignItems: 'stretch',
                      background: selected ? 'var(--tt-selection)' : 'transparent',
                      border: '1px solid transparent',
                      color: selected ? 'var(--tt-fg)' : 'var(--tt-fg-dark)',
                      cursor: 'pointer',
                      display: 'grid',
                      gap: 8,
                      gridTemplateColumns: selected ? '4px 28px minmax(0, 1fr) 16px' : '0 28px minmax(0, 1fr) 16px',
                      minHeight: 44,
                      padding: '8px 6px',
                      textAlign: 'left',
                      width: '100%',
                    }}
                    type="button"
                  >
                    <span aria-hidden="true" style={{ background: selected ? 'var(--tt-cyan)' : 'transparent' }} />
                    <span
                      style={{
                        color: 'var(--tt-comment)',
                        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
                        fontSize: 12,
                        lineHeight: 1.4,
                      }}
                    >
                      {getChapterNumber(chapter)}
                    </span>
                    <span style={{ fontSize: 13, fontWeight: selected ? 700 : 500, lineHeight: 1.3 }}>
                      {chapter.title}
                    </span>
                    <span aria-label={completed ? 'Completed' : undefined} style={{ color: 'var(--tt-green)' }}>
                      {completed ? '*' : ''}
                    </span>
                  </button>
                );
              })}
            </div>
          </Column>
        </aside>

        <article
          aria-labelledby="learn-chapter-title"
          onScroll={handleContentScroll}
          ref={contentRef}
          style={{
            background: 'var(--tt-bg-dark)',
            border: '1px solid var(--tt-border)',
            minHeight: 0,
            overflow: 'auto',
            padding: '24px 28px',
          }}
        >
          <Column gap={4}>
            <header style={{ display: 'grid', gap: 8, maxWidth: 760 }}>
              <Kicker>chapter {getChapterNumber(activeChapter)}</Kicker>
              <h1
                id="learn-chapter-title"
                style={{ color: 'var(--tt-fg)', fontSize: 26, lineHeight: 1.15, margin: 0 }}
              >
                {activeChapter.title}
              </h1>
              <p style={{ color: 'var(--tt-comment)', lineHeight: 1.5, margin: 0 }}>
                {activeChapter.description}
              </p>
            </header>

            <LearnMDXProvider>
              <ActiveContent />
            </LearnMDXProvider>

            <footer
              style={{
                alignItems: 'center',
                borderTop: '1px solid var(--tt-border)',
                display: 'flex',
                gap: 10,
                justifyContent: 'space-between',
                maxWidth: 760,
                paddingTop: 16,
              }}
            >
              <button
                disabled={!previousChapter}
                onClick={() => previousChapter && selectChapter(previousChapter.id)}
                style={{
                  background: 'var(--tt-bg)',
                  border: '1px solid var(--tt-border)',
                  color: previousChapter ? 'var(--tt-fg-dark)' : 'var(--tt-comment)',
                  cursor: previousChapter ? 'pointer' : 'not-allowed',
                  padding: '8px 10px',
                }}
                type="button"
              >
                Previous
              </button>
              <button
                onClick={() => markCompleted(activeChapter.id)}
                style={{
                  background: completedSteps.includes(activeChapter.id) ? 'var(--tt-selection)' : 'var(--tt-bg)',
                  border: '1px solid var(--tt-border-active)',
                  color: 'var(--tt-fg)',
                  cursor: 'pointer',
                  padding: '8px 10px',
                }}
                type="button"
              >
                {completedSteps.includes(activeChapter.id) ? 'Complete' : 'Mark complete'}
              </button>
              <button
                disabled={!nextChapter}
                onClick={() => nextChapter && selectChapter(nextChapter.id)}
                style={{
                  background: 'var(--tt-bg)',
                  border: '1px solid var(--tt-border)',
                  color: nextChapter ? 'var(--tt-fg-dark)' : 'var(--tt-comment)',
                  cursor: nextChapter ? 'pointer' : 'not-allowed',
                  padding: '8px 10px',
                }}
                type="button"
              >
                Next
              </button>
            </footer>
          </Column>
        </article>
      </div>
    </main>
  );
};
