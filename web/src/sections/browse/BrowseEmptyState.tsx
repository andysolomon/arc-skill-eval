import { EmptyState, Kicker } from '@/components/primitives';
import type { EnvName } from '@/persistence/preferences';
import { sections, useSection } from '@/state/section';

type BrowseEmptyStateProps = {
  env: EnvName;
};

export const BrowseEmptyState = ({ env }: BrowseEmptyStateProps) => {
  const { setActiveSection } = useSection();
  const reviewSection = sections.find((section) => section.name === 'review');

  return (
    <main
      className="app-main"
      data-screen-label={`browse (${env})`}
      data-testid="browse-empty-state"
      style={{ alignItems: 'center', display: 'grid', justifyItems: 'center', padding: 16 }}
    >
      <div style={{ display: 'grid', gap: 12, width: 'min(100%, 560px)' }}>
        <Kicker tone="warning">localhost only</Kicker>
        <EmptyState
          title="browse reads local run artifacts"
          body="Browsing a run means reading the files an eval writes to disk: assistant.md, grading.json, trace and tool summaries. The hosted app has no filesystem, so import an artifact bundle in review first."
          action={
            reviewSection
              ? {
                  label: 'import in review',
                  onClick: () => setActiveSection(reviewSection),
                }
              : undefined
          }
          env={env}
        />
        <pre
          aria-label="browse local commands"
          style={{
            background: 'var(--tt-bg-dark)',
            border: '1px solid var(--tt-border)',
            color: 'var(--tt-fg-dark)',
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
            fontSize: 12,
            lineHeight: 1.5,
            margin: 0,
            overflow: 'auto',
            padding: 12,
            whiteSpace: 'pre-wrap',
          }}
        >
          {'$ npm i -g arc-skill-eval\n$ arc-skill-eval run ./path/to/skill\n$ arc-skill-eval browse'}
        </pre>
      </div>
    </main>
  );
};
