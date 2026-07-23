import { useEffect, useMemo, useRef } from 'react';
import type { ComponentType } from 'react';
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

const chromeStyles = `
.learn-chapter-row:not([aria-current]):hover { background: var(--tt-bg-hi); }
`;

const pagerButtonStyle = (enabled: boolean) => ({
  background: 'transparent',
  border: '1px solid var(--tt-border)',
  borderRadius: 7,
  color: enabled ? 'var(--tt-fg-dark)' : 'var(--tt-dim)',
  cursor: enabled ? 'pointer' : 'not-allowed',
  fontSize: 12.5,
  padding: '7px 13px',
});

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
      style={{ display: 'flex', minHeight: 0, minWidth: 0, overflow: 'hidden', padding: 0 }}
    >
      <style>{chromeStyles}</style>

      <aside
        aria-label="Learn chapters"
        style={{
          background: 'var(--tt-bg-dark)',
          borderRight: '1px solid var(--tt-border)',
          display: 'flex',
          flexDirection: 'column',
          flex: 'none',
          minHeight: 0,
          width: 238,
        }}
      >
        <div
          style={{
            color: 'var(--tt-comment)',
            fontSize: 11,
            letterSpacing: '0.08em',
            padding: '13px 16px 7px',
            textTransform: 'uppercase',
          }}
        >
          chapters
        </div>
        <nav style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: '0 8px 8px' }}>
          {chapters.map((chapter) => {
            const selected = chapter.id === activeChapter.id;
            const completed = completedSteps.includes(chapter.id);

            return (
              <button
                aria-current={selected ? 'page' : undefined}
                className="learn-chapter-row"
                data-chapter-id={chapter.id}
                key={chapter.id}
                onClick={() => selectChapter(chapter.id)}
                style={{
                  alignItems: 'center',
                  background: selected ? 'var(--tt-selection)' : 'transparent',
                  border: 'none',
                  borderLeft: `2px solid ${selected ? 'var(--tt-blue)' : 'transparent'}`,
                  borderRadius: 6,
                  cursor: 'pointer',
                  display: 'flex',
                  gap: 10,
                  margin: '1px 0',
                  padding: '8px 9px',
                  textAlign: 'left',
                  width: '100%',
                }}
                type="button"
              >
                <span
                  style={{
                    color: selected ? 'var(--tt-blue)' : 'var(--tt-dim)',
                    flex: 'none',
                    fontSize: 11,
                    fontWeight: 700,
                    width: 16,
                  }}
                >
                  {getChapterNumber(chapter)}
                </span>
                <span
                  style={{
                    color: selected ? 'var(--tt-fg)' : 'var(--tt-fg-dark)',
                    fontSize: 12.5,
                    minWidth: 0,
                  }}
                >
                  {chapter.title}
                </span>
                {completed ? (
                  <span
                    aria-label="Completed"
                    style={{ color: 'var(--tt-green)', flex: 'none', marginLeft: 'auto' }}
                  >
                    *
                  </span>
                ) : null}
              </button>
            );
          })}
        </nav>
        <div
          style={{
            borderTop: '1px solid var(--tt-border)',
            color: 'var(--tt-comment)',
            fontSize: 11,
            lineHeight: 1.9,
            padding: '12px 16px',
          }}
        >
          format · Anthropic evals.json
          <br />
          method · OpenAI eval-skills
          <br />
          runtime · <span style={{ color: 'var(--tt-teal)' }}>Pi</span>
        </div>
      </aside>

      <div
        onScroll={handleContentScroll}
        ref={contentRef}
        style={{ flex: 1, minHeight: 0, minWidth: 0, overflow: 'auto' }}
      >
        <article
          aria-labelledby="learn-chapter-title"
          style={{ margin: '0 auto', maxWidth: 960, padding: '32px 34px' }}
        >
          <header>
            <div
              style={{
                color: 'var(--tt-comment)',
                fontSize: 11,
                letterSpacing: '0.08em',
                marginBottom: 6,
                textTransform: 'uppercase',
              }}
            >
              chapter {getChapterNumber(activeChapter)}
            </div>
            <h1
              id="learn-chapter-title"
              style={{ color: 'var(--tt-fg)', fontSize: 22, fontWeight: 700, margin: '0 0 10px' }}
            >
              {activeChapter.title}
            </h1>
            <p
              style={{
                color: 'var(--tt-fg-dark)',
                lineHeight: 1.7,
                margin: '0 0 24px',
                maxWidth: 820,
              }}
            >
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
              marginTop: 34,
              paddingTop: 14,
            }}
          >
            <button
              disabled={!previousChapter}
              onClick={() => previousChapter && selectChapter(previousChapter.id)}
              style={pagerButtonStyle(Boolean(previousChapter))}
              type="button"
            >
              Previous
            </button>
            <button
              onClick={() => markCompleted(activeChapter.id)}
              style={{
                background: completedSteps.includes(activeChapter.id)
                  ? 'var(--tt-selection)'
                  : 'transparent',
                border: '1px solid var(--tt-border-active)',
                borderRadius: 7,
                color: 'var(--tt-fg)',
                cursor: 'pointer',
                fontSize: 12.5,
                fontWeight: 700,
                padding: '7px 13px',
              }}
              type="button"
            >
              {completedSteps.includes(activeChapter.id) ? 'Complete' : 'Mark complete'}
            </button>
            <button
              disabled={!nextChapter}
              onClick={() => nextChapter && selectChapter(nextChapter.id)}
              style={pagerButtonStyle(Boolean(nextChapter))}
              type="button"
            >
              Next
            </button>
          </footer>
        </article>
      </div>
    </main>
  );
};
