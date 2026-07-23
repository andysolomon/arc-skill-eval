import { useEffect, useRef } from 'react';
import { useEnv } from '@/state/env';
import { chapterNumber, learnChapters, type LearnChapterId } from './chapterList';
import { ChapterAssert } from './chapters/ChapterAssert';
import { ChapterCreate } from './chapters/ChapterCreate';
import { ChapterOverview } from './chapters/ChapterOverview';
import { ChapterPi } from './chapters/ChapterPi';
import { ChapterRun } from './chapters/ChapterRun';
import { ChapterSignal } from './chapters/ChapterSignal';
import { ChapterSkill } from './chapters/ChapterSkill';
import { useLearnProgress } from './useLearnProgress';

const chromeStyles = `
.learn-chapter-row:not([aria-current]):hover { background: var(--tt-bg-hi); }
.learn-deep-dive:hover { border-color: var(--tt-border-active) !important; }
`;

const isChapterId = (value: string): value is LearnChapterId =>
  learnChapters.some((chapter) => chapter.id === value);

const deepDives = learnChapters
  .filter((chapter) => chapter.id !== 'overview')
  .map((chapter) => ({
    id: chapter.id,
    num: chapterNumber(chapter.id),
    label: chapter.label,
    desc: chapter.desc ?? '',
  }));

export const LearnApp = () => {
  const { env } = useEnv();
  const contentRef = useRef<HTMLDivElement | null>(null);
  const { currentChapterId, setCurrentChapterId } = useLearnProgress('overview');
  const activeId: LearnChapterId = isChapterId(currentChapterId) ? currentChapterId : 'overview';

  useEffect(() => {
    contentRef.current?.scrollTo({ top: 0 });
  }, [activeId]);

  const selectChapter = (chapterId: LearnChapterId) => {
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
          {learnChapters.map((chapter) => {
            const selected = chapter.id === activeId;

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
                  {chapterNumber(chapter.id)}
                </span>
                <span
                  style={{
                    color: selected ? 'var(--tt-fg)' : 'var(--tt-fg-dark)',
                    fontSize: 12.5,
                    minWidth: 0,
                  }}
                >
                  {chapter.label}
                </span>
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
        id="learn-scroll"
        ref={contentRef}
        style={{ flex: 1, minHeight: 0, minWidth: 0, overflow: 'auto' }}
      >
        {activeId === 'overview' ? (
          <ChapterOverview deepDives={deepDives} onNavigate={selectChapter} />
        ) : null}
        {activeId === 'skill' ? <ChapterSkill /> : null}
        {activeId === 'create' ? <ChapterCreate /> : null}
        {activeId === 'assert' ? <ChapterAssert /> : null}
        {activeId === 'signal' ? <ChapterSignal /> : null}
        {activeId === 'run' ? <ChapterRun /> : null}
        {activeId === 'pi' ? <ChapterPi /> : null}
      </div>
    </main>
  );
};
