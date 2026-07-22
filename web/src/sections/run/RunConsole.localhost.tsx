import { useEffect, useState } from 'react';
import { Kicker } from '@/components/primitives';
import { sections, useSection } from '@/state/section';
import { useRunLifecycle, type ProgressRow } from '@/state/runLifecycle';
import type { RunComposerState } from './useRunDaemon';

type RunConsoleLocalhostProps = {
  composerState: RunComposerState;
};

const spinnerFrames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

const assembledCommand = (composerState: RunComposerState) => {
  const extraSkillFlags = composerState.extraSkill.map((extraSkill) => `  --extra-skill "${extraSkill}" \\`);

  return [
    '# COMMAND',
    `arc-skill-eval run "${composerState.workspaceRoot || '<workspace picker>'}" \\`,
    `  --case "${composerState.case}" \\`,
    `  --model "${composerState.model}" \\`,
    `  --judge-model "${composerState.judgeModel}" \\`,
    `  --compare "${composerState.compare}" \\`,
    ...extraSkillFlags,
    `  --iteration ${composerState.iteration} \\`,
    `  --context-mode ${composerState.contextMode} \\`,
    `  --sandbox ${composerState.sandbox}`,
  ].join('\n');
};

const ProgressLine = ({ row, spinner }: { row: ProgressRow; spinner: string }) => (
  <div
    style={{
      alignItems: 'center',
      borderBottom: '1px solid var(--tt-border)',
      display: 'grid',
      gap: 10,
      gridTemplateColumns: '24px minmax(0, 1fr) auto',
      minHeight: 34,
    }}
  >
    <span aria-hidden="true" style={{ color: 'var(--tt-yellow)' }}>
      {spinner}
    </span>
    <span style={{ color: 'var(--tt-fg)', overflow: 'hidden', textOverflow: 'ellipsis' }}>
      {row.caseId}
    </span>
    <span style={{ color: 'var(--tt-fg-dark)' }}>
      assertions {row.assertionsPassed} ✓ / {row.assertionsFailed} ✗
    </span>
  </div>
);

export const RunConsoleLocalhost = ({ composerState }: RunConsoleLocalhostProps) => {
  const { state } = useRunLifecycle();
  const { setActiveSection } = useSection();
  const [frameIndex, setFrameIndex] = useState(0);

  useEffect(() => {
    if (state.status !== 'running') {
      return undefined;
    }

    const interval = window.setInterval(() => {
      setFrameIndex((current) => (current + 1) % spinnerFrames.length);
    }, 100);

    return () => window.clearInterval(interval);
  }, [state.status]);

  const browseSection = sections.find((section) => section.name === 'browse') ?? sections[1];

  return (
    <section
      aria-label="Run console localhost"
      style={{
        background: 'var(--tt-bg-dark)',
        border: '1px solid var(--tt-border)',
        color: 'var(--tt-fg)',
        minHeight: 320,
        minWidth: 0,
        padding: 16,
      }}
    >
      <div style={{ display: 'grid', gap: 12 }}>
        <Kicker>console</Kicker>
        <pre
          aria-label="assembled CLI command"
          aria-readonly="true"
          style={{
            background: 'var(--tt-bg)',
            border: '1px solid var(--tt-border)',
            color: 'var(--tt-fg-dark)',
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
            fontSize: 12,
            lineHeight: 1.6,
            margin: 0,
            minHeight: 132,
            overflow: 'auto',
            padding: 12,
            whiteSpace: 'pre-wrap',
          }}
        >
          {assembledCommand(composerState)}
        </pre>
        {state.status === 'idle' ? (
          <p style={{ color: 'var(--tt-fg-dark)', lineHeight: 1.5, margin: 0 }}>
            Select a workspace, then start a daemon-backed localhost run.
          </p>
        ) : null}
        {state.progressRows.length > 0 ? (
          <div
            aria-label="run progress"
            style={{
              background: 'var(--tt-bg)',
              border: '1px solid var(--tt-border)',
              display: 'grid',
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
              fontSize: 12,
              padding: '0 12px',
            }}
          >
            {state.progressRows.map((row) => (
              <ProgressLine
                key={row.caseId}
                row={row}
                spinner={state.status === 'running' ? spinnerFrames[frameIndex] : '✓'}
              />
            ))}
          </div>
        ) : null}
        {state.status === 'done' && state.benchmark ? (
          <section
            aria-label="BENCHMARK"
            style={{
              background: 'var(--tt-bg)',
              border: '1px solid var(--tt-green)',
              display: 'grid',
              gap: 8,
              padding: 12,
            }}
          >
            <Kicker>benchmark</Kicker>
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 8,
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
                fontSize: 12,
              }}
            >
              <span style={{ color: 'var(--tt-green)' }}>
                with_skill {state.benchmark.withSkill ?? state.benchmark.passed}
              </span>
              <span style={{ color: 'var(--tt-orange)' }}>
                without_skill {state.benchmark.withoutSkill ?? Math.max(0, state.benchmark.total - state.benchmark.passed)}
              </span>
            </div>
            <strong style={{ color: 'var(--tt-fg)', fontSize: 24, lineHeight: 1.1 }}>
              Δ {state.benchmark.delta ?? 0}%
            </strong>
            <div
              style={{
                color: 'var(--tt-fg-dark)',
                display: 'grid',
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
                fontSize: 12,
                gap: 4,
              }}
            >
              <span>
                passed {state.benchmark.passed}/{state.benchmark.total} · cost ${state.benchmark.cost.toFixed(4)}
              </span>
              <span>exit code {String(state.benchmark.exitCode).padStart(2, '0')}</span>
              <span>{state.benchmark.artifactPath}</span>
            </div>
            <button
              onClick={() => setActiveSection(browseSection)}
              type="button"
              style={{
                background: 'var(--tt-bg-dark)',
                border: '1px solid var(--tt-border)',
                color: 'var(--tt-yellow)',
                cursor: 'pointer',
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
                minHeight: 34,
                padding: '0 10px',
                textAlign: 'left',
              }}
            >
              inspect in browse →
            </button>
          </section>
        ) : null}
      </div>
    </section>
  );
};
