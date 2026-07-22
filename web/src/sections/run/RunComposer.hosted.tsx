import { Column, Kicker } from '@/components/primitives';
import { InstallCommandPill } from './RunEmptyState';

const WORKSPACE_PICKER_DECISION_URL =
  'https://github.com/andysolomon/arc-skill-eval/blob/main/docs/web-app/decisions/workspace-picker.md';

export const RunComposerHosted = () => (
  <aside
    aria-disabled="true"
    aria-label="Run composer hosted stub"
    style={{
      background: 'var(--tt-bg-dark)',
      border: '1px solid var(--tt-border)',
      color: 'var(--tt-fg)',
      minHeight: 320,
      padding: 16,
    }}
  >
    <Column gap={4}>
      <Kicker>composer (hosted)</Kicker>
      <div style={{ display: 'grid', gap: 8 }}>
        <h2 style={{ fontSize: 20, lineHeight: 1.2, margin: 0 }}>
          Composer is available on localhost
        </h2>
        <p style={{ color: 'var(--tt-fg-dark)', lineHeight: 1.5, margin: 0 }}>
          Hosted cannot read a workspace or launch local evals. Run the CLI command from a local
          checkout to compose and execute a compare run.
        </p>
      </div>
      <InstallCommandPill />
      <a
        href={WORKSPACE_PICKER_DECISION_URL}
        rel="noreferrer"
        target="_blank"
        style={{
          color: 'var(--tt-yellow)',
          fontSize: 12,
          lineHeight: 1.4,
          textUnderlineOffset: 3,
        }}
      >
        what is localhost mode? ↗
      </a>
    </Column>
  </aside>
);
