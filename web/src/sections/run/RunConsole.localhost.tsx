import { sections, useSection } from '@/state/section';
import { useRunLifecycle, type ProgressRow } from '@/state/runLifecycle';
import { asciiBar, useSpinner } from './useSpinner';
import type { RunComposerState } from './useRunDaemon';

type RunConsoleLocalhostProps = {
  composerState: RunComposerState;
};

const commandFlags = (composerState: RunComposerState) => {
  const flags: string[] = [];

  if (composerState.case !== '*') {
    flags.push(`--case ${composerState.case}`);
  }

  flags.push(`--model ${composerState.model}`);
  flags.push(`--judge-model ${composerState.judgeModel}`);

  if (composerState.compare !== 'off') {
    flags.push('--compare');
  }

  composerState.extraSkill.forEach((extraSkill) => {
    flags.push(`--extra-skill ${extraSkill}`);
  });

  if (composerState.iteration !== 1) {
    flags.push(`--iteration ${composerState.iteration}`);
  }

  if (composerState.contextMode !== 'isolated') {
    flags.push(`--context-mode ${composerState.contextMode}`);
  }

  if (composerState.sandbox !== 'none') {
    flags.push(`--sandbox ${composerState.sandbox}`);
  }

  return flags;
};

const SectionKicker = ({ children }: { children: string }) => (
  <div
    style={{
      color: 'var(--tt-cyan)',
      fontSize: 12,
      fontWeight: 700,
      marginBottom: 5,
    }}
  >
    {children}
  </div>
);

const ProgressLine = ({
  row,
  running,
  spinner,
}: {
  row: ProgressRow;
  running: boolean;
  spinner: string;
}) => {
  const settled = row.totalAssertions > 0 && row.assertionsPassed + row.assertionsFailed >= row.totalAssertions;
  const failed = row.assertionsFailed > 0;
  const glyph = failed ? '✗' : settled ? '✓' : running ? spinner : '◐';
  const glyphColor = failed
    ? 'var(--tt-red)'
    : settled
      ? 'var(--tt-green)'
      : running
        ? 'var(--tt-cyan)'
        : 'var(--tt-orange)';

  return (
    <div style={{ alignItems: 'center', display: 'flex', gap: 12, height: 25 }}>
      <span aria-hidden="true" style={{ color: glyphColor, fontWeight: 700, width: 12 }}>
        {glyph}
      </span>
      <span
        style={{
          color: 'var(--tt-fg-dark)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          width: 280,
        }}
      >
        {row.caseId}
      </span>
      <span style={{ color: 'var(--tt-comment)', fontSize: 12 }}>
        {row.assertionsPassed}/{row.totalAssertions || '?'} assert
      </span>
    </div>
  );
};

export const RunConsoleLocalhost = ({ composerState }: RunConsoleLocalhostProps) => {
  const { state } = useRunLifecycle();
  const { setActiveSection } = useSection();
  const spinner = useSpinner(state.status === 'running');

  const browseSection = sections.find((section) => section.name === 'browse') ?? sections[1];
  const benchmark = state.benchmark;
  const withPassed = benchmark?.withSkill ?? benchmark?.passed ?? 0;
  const withoutPassed =
    benchmark?.withoutSkill ?? Math.max(0, (benchmark?.total ?? 0) - (benchmark?.passed ?? 0));
  const total = benchmark?.total ?? 0;
  const withBar = asciiBar(withPassed, total, 16);
  const withoutBar = asciiBar(withoutPassed, total, 16);
  const delta =
    benchmark?.delta ?? (total > 0 ? ((withPassed - withoutPassed) / total) * 100 : 0);
  const deltaLabel = `${delta >= 0 ? '+' : ''}${delta.toFixed(1)}%`;
  const exitOk = (benchmark?.exitCode ?? 0) === 0;

  return (
    <section
      aria-label="Run console localhost"
      style={{
        border: '1px solid var(--tt-border)',
        borderRadius: 8,
        display: 'flex',
        flex: 1,
        flexDirection: 'column',
        minWidth: 0,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          background: 'var(--tt-bg-dark)',
          borderBottom: '1px solid var(--tt-border)',
          color: 'var(--tt-comment)',
          fontSize: 12,
          padding: '7px 14px',
        }}
      >
        <span style={{ color: 'var(--tt-fg-dark)', fontWeight: 700 }}>console</span>
        {': '}
        {state.runId ?? 'no run yet'}
      </div>
      <div style={{ flex: 1, lineHeight: 1.6, overflow: 'auto', padding: '16px 20px' }}>
        <SectionKicker>COMMAND</SectionKicker>
        <div style={{ marginBottom: 14 }}>
          <span style={{ color: 'var(--tt-green)' }}>$ </span>
          <span style={{ color: 'var(--tt-fg)' }}>
            arc-skill-eval run {composerState.workspaceRoot || './skills/<pick a workspace>'}
          </span>
          <div style={{ color: 'var(--tt-fg-dark)', paddingLeft: 16 }}>
            {commandFlags(composerState).join('  ')}
          </div>
        </div>

        {state.status === 'idle' ? (
          <div style={{ color: 'var(--tt-comment)', padding: '6px 0' }}>
            Select <span style={{ color: 'var(--tt-green)' }}>▶ Run</span> to start. Comparison
            mode grades <span style={{ color: 'var(--tt-cyan)' }}>with_skill</span> and{' '}
            <span style={{ color: 'var(--tt-orange)' }}>without_skill</span>, then reports the
            difference.
          </div>
        ) : null}

        {state.status === 'running' ? (
          <div style={{ color: 'var(--tt-cyan)', marginBottom: 10 }}>
            {spinner} running with_skill · without_skill{' '}
            <span style={{ color: 'var(--tt-comment)' }}>
              · elapsed {state.elapsedSec.toFixed(1)}s
            </span>
          </div>
        ) : null}

        {state.status === 'done' && benchmark ? (
          <div style={{ color: 'var(--tt-green)', fontWeight: 700, marginBottom: 10 }}>
            ✓ run complete&nbsp;&nbsp;&nbsp;{benchmark.passed}/{benchmark.total} passed&nbsp;&nbsp;&nbsp;
            {state.elapsedSec.toFixed(1)}s
          </div>
        ) : null}

        {state.error ? (
          <div style={{ color: 'var(--tt-red)', marginBottom: 10 }}>✗ {state.error}</div>
        ) : null}

        <div aria-label="run progress">
          {state.progressRows.map((row) => (
            <ProgressLine
              key={row.caseId}
              row={row}
              running={state.status === 'running'}
              spinner={spinner}
            />
          ))}
        </div>

        {state.status === 'done' && benchmark ? (
          <>
            <div style={{ background: 'var(--tt-border)', height: 1, margin: '18px 0' }} />
            <div
              style={{ alignItems: 'baseline', display: 'flex', gap: 10, marginBottom: 7 }}
            >
              <span style={{ color: 'var(--tt-cyan)', fontSize: 12, fontWeight: 700 }}>
                BENCHMARK
              </span>
              <span style={{ color: 'var(--tt-comment)', fontSize: 12 }}>
                without → with_skill
              </span>
            </div>
            <div style={{ lineHeight: 2 }}>
              <div>
                <span
                  style={{ color: 'var(--tt-fg-dark)', display: 'inline-block', width: '15ch' }}
                >
                  with_skill
                </span>
                <span style={{ color: 'var(--tt-green)' }}>{withBar.fill}</span>
                <span style={{ color: 'var(--tt-dim)' }}>{withBar.rest}</span>
                <span style={{ color: 'var(--tt-green)' }}>
                  &nbsp;{withPassed}/{total}
                </span>
              </div>
              <div>
                <span
                  style={{ color: 'var(--tt-fg-dark)', display: 'inline-block', width: '15ch' }}
                >
                  without_skill
                </span>
                <span style={{ color: 'var(--tt-orange)' }}>{withoutBar.fill}</span>
                <span style={{ color: 'var(--tt-dim)' }}>{withoutBar.rest}</span>
                <span style={{ color: 'var(--tt-orange)' }}>
                  &nbsp;{withoutPassed}/{total}
                </span>
              </div>
            </div>
            <div style={{ margin: '14px 0' }}>
              <span style={{ color: 'var(--tt-comment)' }}>delta&nbsp;&nbsp;&nbsp;</span>
              <span
                style={{
                  color: delta > 0 ? 'var(--tt-green)' : 'var(--tt-comment)',
                  fontSize: 24,
                  fontWeight: 700,
                }}
              >
                Δ {deltaLabel}
              </span>
            </div>
            <div>
              <span style={{ color: 'var(--tt-comment)' }}>exit code&nbsp;&nbsp;</span>
              <span
                style={{
                  color: exitOk ? 'var(--tt-green)' : 'var(--tt-red)',
                  fontWeight: 700,
                }}
              >
                {benchmark.exitCode}
              </span>
              <span style={{ color: 'var(--tt-dim)' }}>
                &nbsp;&nbsp;{exitOk ? 'all assertions passed' : '≥1 assertion failed'}
              </span>
            </div>
            <div style={{ color: 'var(--tt-comment)', fontSize: 12, marginTop: 16 }}>
              wrote <span style={{ color: 'var(--tt-teal)' }}>{benchmark.artifactPath}</span>
              {' · '}
              <a
                href="#"
                onClick={(event) => {
                  event.preventDefault();
                  setActiveSection(browseSection);
                }}
              >
                inspect in browse →
              </a>
            </div>
          </>
        ) : null}
      </div>
    </section>
  );
};
