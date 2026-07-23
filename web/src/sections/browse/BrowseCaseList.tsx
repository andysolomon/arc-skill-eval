import type { BrowseCase } from './useBrowseData';

type BrowseCaseListProps = {
  cases: BrowseCase[];
  selectedCaseId?: string;
  onSelectCase: (caseId: string) => void;
};

const statusGlyph = (status: BrowseCase['status']) =>
  status === 'pass' ? '✓' : status === 'fail' ? '✗' : status === 'partial' ? '◐' : '◌';

const statusColor = (status: BrowseCase['status']) =>
  status === 'pass'
    ? 'var(--tt-green)'
    : status === 'fail'
      ? 'var(--tt-red)'
      : status === 'partial'
        ? 'var(--tt-orange)'
        : 'var(--tt-comment)';

export const BrowseCaseList = ({ cases, selectedCaseId, onSelectCase }: BrowseCaseListProps) => {
  const passed = cases.filter((testCase) => testCase.status === 'pass').length;

  return (
    <section
      aria-label="Case List"
      style={{
        border: '1px solid var(--tt-border)',
        borderRadius: 8,
        display: 'flex',
        flex: 1,
        flexDirection: 'column',
        minHeight: 0,
        minWidth: 0,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          background: 'var(--tt-bg-dark)',
          borderBottom: '1px solid var(--tt-border)',
          display: 'flex',
          fontSize: 12,
          justifyContent: 'space-between',
          padding: '4px 10px',
        }}
      >
        <span style={{ color: 'var(--tt-fg-dark)' }}>Cases</span>
        <span style={{ color: 'var(--tt-dim)' }}>
          {passed}/{cases.length}
        </span>
      </div>
      <div style={{ overflow: 'auto' }}>
        {cases.map((testCase) => {
          const selected = testCase.id === selectedCaseId;

          return (
            <div
              aria-label={`select case ${testCase.id}`}
              aria-pressed={selected}
              key={testCase.id}
              onClick={() => onSelectCase(testCase.id)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  onSelectCase(testCase.id);
                }
              }}
              role="button"
              tabIndex={0}
              title={testCase.prompt}
              style={{
                alignItems: 'center',
                background: selected ? 'var(--tt-selection)' : 'transparent',
                cursor: 'pointer',
                display: 'flex',
                gap: 6,
                height: 24,
                minWidth: 0,
                padding: '0 8px',
              }}
            >
              <span
                aria-hidden="true"
                style={{ color: selected ? 'var(--tt-blue)' : 'transparent', width: 6 }}
              >
                ▌
              </span>
              <span
                aria-hidden="true"
                style={{ color: statusColor(testCase.status), fontWeight: 700, width: 12 }}
              >
                {statusGlyph(testCase.status)}
              </span>
              <span
                style={{
                  color: selected
                    ? 'var(--tt-fg)'
                    : testCase.status === 'fail'
                      ? 'var(--tt-red)'
                      : 'var(--tt-fg-dark)',
                  flex: 1,
                  fontSize: 13,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {testCase.id}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
};
