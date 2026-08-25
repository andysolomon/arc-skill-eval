import type { ReactNode } from 'react';
import { ChapterHeader, pageStyle, SectionKicker } from './ui';

const artifactCards: {
  title: string;
  titleColor?: string;
  desc: string;
  snippet: ReactNode;
}[] = [
  {
    title: 'grading.json',
    desc: 'assertion results + evidence',
    snippet: (
      <>
        <span style={{ color: 'var(--tt-comment)' }}>{'{ '}</span>
        <span style={{ color: 'var(--tt-yellow)' }}>&quot;passed&quot;</span>
        <span style={{ color: 'var(--tt-comment)' }}>: </span>
        <span style={{ color: 'var(--tt-green)' }}>true</span>
        <span style={{ color: 'var(--tt-comment)' }}>, </span>
        <span style={{ color: 'var(--tt-yellow)' }}>&quot;type&quot;</span>
        <span style={{ color: 'var(--tt-comment)' }}>: </span>
        <span style={{ color: 'var(--tt-cyan)' }}>&quot;file-exists&quot;</span>
        <span style={{ color: 'var(--tt-comment)' }}>{' }'}</span>
      </>
    ),
  },
  {
    title: 'timing.json',
    desc: 'duration, tokens, cost',
    snippet: (
      <>
        <span style={{ color: 'var(--tt-comment)' }}>{'{ '}</span>
        <span style={{ color: 'var(--tt-yellow)' }}>&quot;duration_ms&quot;</span>
        <span style={{ color: 'var(--tt-comment)' }}>: </span>
        <span style={{ color: 'var(--tt-fg-dark)' }}>12420</span>
        <span style={{ color: 'var(--tt-comment)' }}>, </span>
        <span style={{ color: 'var(--tt-yellow)' }}>&quot;cost&quot;</span>
        <span style={{ color: 'var(--tt-comment)' }}>: </span>
        <span style={{ color: 'var(--tt-green)' }}>0.11</span>
        <span style={{ color: 'var(--tt-comment)' }}>{' }'}</span>
      </>
    ),
  },
  {
    title: 'trace.json',
    desc: 'ordered tool calls',
    snippet: (
      <>
        <span style={{ color: 'var(--tt-comment)' }}>{'[ { '}</span>
        <span style={{ color: 'var(--tt-yellow)' }}>&quot;tool&quot;</span>
        <span style={{ color: 'var(--tt-comment)' }}>: </span>
        <span style={{ color: 'var(--tt-cyan)' }}>&quot;bash&quot;</span>
        <span style={{ color: 'var(--tt-comment)' }}>, </span>
        <span style={{ color: 'var(--tt-yellow)' }}>&quot;ok&quot;</span>
        <span style={{ color: 'var(--tt-comment)' }}>: </span>
        <span style={{ color: 'var(--tt-green)' }}>true</span>
        <span style={{ color: 'var(--tt-comment)' }}>{' } … ]'}</span>
      </>
    ),
  },
  {
    title: 'tool-summary.json',
    desc: 'counts per tool',
    snippet: (
      <>
        <span style={{ color: 'var(--tt-comment)' }}>{'{ '}</span>
        <span style={{ color: 'var(--tt-yellow)' }}>&quot;read&quot;</span>
        <span style={{ color: 'var(--tt-comment)' }}>: </span>
        <span style={{ color: 'var(--tt-fg-dark)' }}>2</span>
        <span style={{ color: 'var(--tt-comment)' }}>, </span>
        <span style={{ color: 'var(--tt-yellow)' }}>&quot;bash&quot;</span>
        <span style={{ color: 'var(--tt-comment)' }}>: </span>
        <span style={{ color: 'var(--tt-fg-dark)' }}>3</span>
        <span style={{ color: 'var(--tt-comment)' }}>{' }'}</span>
      </>
    ),
  },
  {
    title: 'context-manifest.json',
    desc: 'what entered context',
    snippet: (
      <>
        <span style={{ color: 'var(--tt-comment)' }}>{'{ '}</span>
        <span style={{ color: 'var(--tt-yellow)' }}>&quot;skill_reads&quot;</span>
        <span style={{ color: 'var(--tt-comment)' }}>: </span>
        <span style={{ color: 'var(--tt-fg-dark)' }}>1</span>
        <span style={{ color: 'var(--tt-comment)' }}>, </span>
        <span style={{ color: 'var(--tt-yellow)' }}>&quot;files&quot;</span>
        <span style={{ color: 'var(--tt-comment)' }}>: </span>
        <span style={{ color: 'var(--tt-fg-dark)' }}>4</span>
        <span style={{ color: 'var(--tt-comment)' }}>{' }'}</span>
      </>
    ),
  },
  {
    title: 'benchmark.json',
    titleColor: 'var(--tt-magenta)',
    desc: 'the with / without delta',
    snippet: (
      <>
        <span style={{ color: 'var(--tt-comment)' }}>{'{ '}</span>
        <span style={{ color: 'var(--tt-yellow)' }}>&quot;with&quot;</span>
        <span style={{ color: 'var(--tt-comment)' }}>: </span>
        <span style={{ color: 'var(--tt-green)' }}>&quot;6/6&quot;</span>
        <span style={{ color: 'var(--tt-comment)' }}>, </span>
        <span style={{ color: 'var(--tt-yellow)' }}>&quot;delta&quot;</span>
        <span style={{ color: 'var(--tt-comment)' }}>: </span>
        <span style={{ color: 'var(--tt-green)' }}>&quot;+16.7%&quot;</span>
        <span style={{ color: 'var(--tt-comment)' }}>{' }'}</span>
      </>
    ),
  },
];

const browserPanelStyle = {
  border: '1px solid var(--tt-border)',
  borderRadius: 6,
  overflow: 'hidden',
} as const;

const browserPanelHeaderStyle = {
  background: 'var(--tt-bg)',
  borderBottom: '1px solid var(--tt-border)',
  color: 'var(--tt-fg-dark)',
  padding: '2px 8px',
} as const;

export const ChapterRun = () => (
  <div style={pageStyle}>
    <ChapterHeader num="06" title="Anatomy of a run" />
    <div
      style={{ color: 'var(--tt-fg-dark)', lineHeight: 1.7, marginBottom: 28, maxWidth: 820 }}
    >
      every run writes a self-contained folder under{' '}
      <span style={{ color: 'var(--tt-teal)' }}>evals-runs/</span>. diff two folders to see what
      changed between iterations; open one in{' '}
      <span style={{ color: 'var(--tt-fg)' }}>browse</span> to inspect it case by case.
    </div>

    <SectionKicker>on disk</SectionKicker>
    <div
      style={{
        background: 'var(--tt-bg-dark)',
        border: '1px solid var(--tt-border)',
        borderRadius: 8,
        fontSize: 12.5,
        lineHeight: 1.9,
        marginBottom: 30,
        padding: '14px 16px',
      }}
    >
      <div>
        <span style={{ color: 'var(--tt-teal)' }}>evals-runs/run-7af3/</span>
      </div>
      <div>
        <span style={{ color: 'var(--tt-dim)' }}>├─ </span>
        <span style={{ color: 'var(--tt-magenta)' }}>benchmark.json</span>
        <span style={{ color: 'var(--tt-comment)' }}>
          {'         '}with vs without · the delta
        </span>
      </div>
      <div>
        <span style={{ color: 'var(--tt-dim)' }}>├─ </span>
        <span style={{ color: 'var(--tt-fg)' }}>trigger-explicit/</span>
      </div>
      <div>
        <span style={{ color: 'var(--tt-dim)' }}>│{'  '}├─ </span>
        <span style={{ color: 'var(--tt-fg-dark)' }}>grading.json</span>
        <span style={{ color: 'var(--tt-comment)' }}>
          {'       '}per-assertion pass/fail + evidence
        </span>
      </div>
      <div>
        <span style={{ color: 'var(--tt-dim)' }}>│{'  '}├─ </span>
        <span style={{ color: 'var(--tt-fg-dark)' }}>timing.json</span>
        <span style={{ color: 'var(--tt-comment)' }}>{'        '}duration · tokens · cost</span>
      </div>
      <div>
        <span style={{ color: 'var(--tt-dim)' }}>│{'  '}├─ </span>
        <span style={{ color: 'var(--tt-fg-dark)' }}>trace.json</span>
        <span style={{ color: 'var(--tt-comment)' }}>{'         '}every tool call, in order</span>
      </div>
      <div>
        <span style={{ color: 'var(--tt-dim)' }}>│{'  '}├─ </span>
        <span style={{ color: 'var(--tt-fg-dark)' }}>tool-summary.json</span>
        <span style={{ color: 'var(--tt-comment)' }}>{'  '}counts per tool</span>
      </div>
      <div>
        <span style={{ color: 'var(--tt-dim)' }}>│{'  '}└─ </span>
        <span style={{ color: 'var(--tt-fg-dark)' }}>context-manifest.json</span>
      </div>
      <div>
        <span style={{ color: 'var(--tt-dim)' }}>└─ </span>
        <span style={{ color: 'var(--tt-comment)' }}>…one directory per case</span>
      </div>
    </div>

    <SectionKicker>the artifacts</SectionKicker>
    <div
      style={{
        display: 'grid',
        gap: 12,
        gridTemplateColumns: 'repeat(2, 1fr)',
        marginBottom: 30,
      }}
    >
      {artifactCards.map((card) => (
        <div
          key={card.title}
          style={{ border: '1px solid var(--tt-border)', borderRadius: 8, padding: '12px 14px' }}
        >
          <div
            style={{
              color: card.titleColor ?? 'var(--tt-fg)',
              fontSize: 12.5,
              fontWeight: 700,
              marginBottom: 5,
            }}
          >
            {card.title}
          </div>
          <div
            style={{
              color: 'var(--tt-comment)',
              fontSize: 12,
              lineHeight: 1.5,
              marginBottom: 7,
            }}
          >
            {card.desc}
          </div>
          <div
            style={{
              background: 'var(--tt-bg-dark)',
              borderRadius: 5,
              fontSize: 11.5,
              padding: '6px 9px',
            }}
          >
            {card.snippet}
          </div>
        </div>
      ))}
    </div>

    <SectionKicker style={{ marginBottom: 10 }}>the run browser</SectionKicker>
    <div
      style={{
        background: 'var(--tt-bg-dark)',
        border: '1px solid var(--tt-border)',
        borderRadius: 8,
        marginBottom: 8,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          alignItems: 'center',
          borderBottom: '1px solid var(--tt-border)',
          display: 'flex',
          fontSize: 11,
          gap: 8,
          padding: '7px 12px',
        }}
      >
        <span style={{ color: 'var(--tt-teal)', fontWeight: 700 }}>browse</span>
        <span style={{ color: 'var(--tt-comment)' }}>run-7af3 · arc-conventional-commits</span>
      </div>
      <div style={{ display: 'flex', fontSize: 11, gap: 8, padding: 10 }}>
        <div
          style={{
            display: 'flex',
            flex: 'none',
            flexDirection: 'column',
            gap: 6,
            width: 184,
          }}
        >
          <div style={browserPanelStyle}>
            <div style={browserPanelHeaderStyle}>Skills</div>
            <div style={{ padding: '3px 8px' }}>
              <div>
                <span style={{ color: 'var(--tt-green)' }}>✓ </span>
                <span style={{ color: 'var(--tt-fg-dark)' }}>arc-conventional-commits</span>
              </div>
            </div>
          </div>
          <div
            style={{
              border: '1px solid var(--tt-border-active)',
              borderRadius: 6,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                background: 'var(--tt-bg)',
                borderBottom: '1px solid var(--tt-border)',
                color: 'var(--tt-blue)',
                padding: '2px 8px',
              }}
            >
              Cases
            </div>
            <div style={{ padding: '3px 8px' }}>
              <div
                style={{ background: 'var(--tt-selection)', borderRadius: 3, padding: '0 3px' }}
              >
                <span style={{ color: 'var(--tt-green)' }}>✓ </span>
                <span style={{ color: 'var(--tt-fg)' }}>trigger-explicit</span>
              </div>
              <div>
                <span style={{ color: 'var(--tt-green)' }}>✓ </span>
                <span style={{ color: 'var(--tt-comment)' }}>execution-golden-path</span>
              </div>
            </div>
          </div>
          <div style={browserPanelStyle}>
            <div style={browserPanelHeaderStyle}>Assertions</div>
            <div style={{ padding: '3px 8px' }}>
              <div>
                <span style={{ color: 'var(--tt-green)' }}>✓ </span>
                <span style={{ color: 'var(--tt-cyan)' }}>file-exists</span>
              </div>
              <div>
                <span style={{ color: 'var(--tt-green)' }}>✓ </span>
                <span style={{ color: 'var(--tt-magenta)' }}>llm-judge</span>
              </div>
            </div>
          </div>
          <div style={browserPanelStyle}>
            <div style={browserPanelHeaderStyle}>Runs</div>
            <div style={{ padding: '3px 8px' }}>
              <div>
                <span style={{ color: 'var(--tt-yellow)' }}>dogfood-1 </span>
                <span style={{ color: 'var(--tt-magenta)' }}>⇄</span>
              </div>
            </div>
          </div>
        </div>
        <div
          style={{
            border: '1px solid var(--tt-border)',
            borderRadius: 6,
            flex: 1,
            lineHeight: 1.7,
            minWidth: 0,
            padding: '10px 12px',
          }}
        >
          <div style={{ color: 'var(--tt-cyan)', fontSize: 10, fontWeight: 700 }}>PROMPT</div>
          <div style={{ color: 'var(--tt-fg)', marginBottom: 8 }}>
            Set up semantic-release in this repo.
          </div>
          <div style={{ color: 'var(--tt-cyan)', fontSize: 10, fontWeight: 700 }}>
            GRADING{'  '}
            <span style={{ color: 'var(--tt-green)', fontWeight: 400 }}>3/3 passed</span>
          </div>
          <div>
            <span style={{ color: 'var(--tt-green)' }}>✓ </span>
            <span style={{ color: 'var(--tt-cyan)' }}>file-exists</span>
            <span style={{ color: 'var(--tt-comment)' }}> .releaserc.json</span>
          </div>
          <div>
            <span style={{ color: 'var(--tt-green)' }}>✓ </span>
            <span style={{ color: 'var(--tt-cyan)' }}>regex-match</span>
            <span style={{ color: 'var(--tt-comment)' }}> conventionalcommits</span>
          </div>
          <div>
            <span style={{ color: 'var(--tt-green)' }}>✓ </span>
            <span style={{ color: 'var(--tt-magenta)' }}>llm-judge</span>
            <span style={{ color: 'var(--tt-comment)' }}> summarizes plugins</span>
          </div>
          <div style={{ marginTop: 8 }}>
            <span style={{ color: 'var(--tt-fg-dark)' }}>with </span>
            <span style={{ color: 'var(--tt-green)' }}>▓▓▓▓▓▓</span>
            <span style={{ color: 'var(--tt-fg-dark)' }}> 3/3{'  '}</span>
            <span style={{ color: 'var(--tt-green)', fontWeight: 700 }}>Δ +16.7%</span>
          </div>
        </div>
      </div>
    </div>
    <div style={{ color: 'var(--tt-comment)', fontSize: 11.5, lineHeight: 1.6 }}>
      <span style={{ color: 'var(--tt-fg-dark)' }}>browse</span> reads these files into the
      four-panel viewer. <span style={{ color: 'var(--tt-fg-dark)' }}>review</span> renders the
      same run as a static report and captures your notes in{' '}
      <span style={{ color: 'var(--tt-teal)' }}>feedback.json</span>. the input to{' '}
      <span style={{ color: 'var(--tt-fg-dark)' }}>improve</span>.
    </div>
  </div>
);
