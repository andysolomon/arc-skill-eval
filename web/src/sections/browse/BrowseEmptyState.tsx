import type { EnvName } from '@/persistence/preferences';
import { sections, useSection } from '@/state/section';

type BrowseEmptyStateProps = {
  env: EnvName;
};

export const BrowseEmptyState = ({ env }: BrowseEmptyStateProps) => {
  const { setActiveSection } = useSection();
  const reviewSection = sections.find((section) => section.name === 'review');

  return (
    <section
      data-screen-label={`browse (${env})`}
      data-testid="browse-empty-state"
      style={{
        alignItems: 'center',
        display: 'flex',
        flex: 1,
        justifyContent: 'center',
        minHeight: 0,
        padding: 40,
      }}
    >
      <div
        style={{
          background: 'var(--tt-bg-dark)',
          border: '1px solid var(--tt-border)',
          borderRadius: 10,
          maxWidth: 560,
          padding: '24px 26px',
        }}
      >
        <div
          style={{
            alignItems: 'center',
            display: 'flex',
            flexWrap: 'wrap',
            gap: 9,
            marginBottom: 10,
          }}
        >
          <span
            data-testid="browse-empty-state-kicker"
            style={{
              border: '1px solid var(--tt-cyan)',
              borderRadius: 5,
              color: 'var(--tt-cyan)',
              fontSize: 11,
              fontWeight: 700,
              padding: '2px 7px',
            }}
          >
            {env === 'hosted' ? 'Hosted mode' : 'Localhost'}
          </span>
          <span style={{ color: 'var(--tt-fg)', fontSize: 17, fontWeight: 700 }}>
            {env === 'hosted' ? 'Import a run to browse results' : 'No local run artifacts found'}
          </span>
        </div>
        <div
          style={{
            color: 'var(--tt-fg-dark)',
            fontSize: 13,
            lineHeight: 1.65,
            marginBottom: 16,
          }}
        >
          {env === 'hosted' ? (
            <>Browse shows run artifacts that you import in Review.</>
          ) : (
            <>
              Browse reads run artifacts from{' '}
              <span style={{ color: 'var(--tt-teal)' }}>./evals-runs</span>. Create them by
              running an eval locally:
            </>
          )}
        </div>
        {env === 'localhost' ? (
          <div
            style={{
              background: 'var(--tt-bg)',
              border: '1px solid var(--tt-border)',
              borderRadius: 8,
              fontSize: 13,
              lineHeight: 1.9,
              marginBottom: 16,
              padding: '12px 14px',
            }}
          >
            <div>
              <span style={{ color: 'var(--tt-green)' }}>$ </span>
              <span style={{ color: 'var(--tt-fg)' }}>
                arc-skill-eval run ./skills/my-skill --compare
              </span>
            </div>
            <div>
              <span style={{ color: 'var(--tt-green)' }}>$ </span>
              <span style={{ color: 'var(--tt-fg)' }}>arc-skill-eval browse</span>
            </div>
          </div>
        ) : null}
        <div style={{ color: 'var(--tt-comment)', fontSize: 12.5, lineHeight: 1.6 }}>
          {env === 'hosted' ? 'To add a run, ' : 'To inspect a JSON artifact, '}
          <a
            href="#"
            onClick={(event) => {
              event.preventDefault();
              if (reviewSection) {
                setActiveSection(reviewSection);
              }
            }}
          >
            import run JSON in Review
          </a>
          .
        </div>
      </div>
    </section>
  );
};
