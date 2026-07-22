import { CaseCard, Column, Kicker } from '@/components/primitives';
import type { BrowseCase } from './useBrowseData';

type BrowseCaseListProps = {
  cases: BrowseCase[];
  selectedCaseId?: string;
  onSelectCase: (caseId: string) => void;
};

const selectedColorByTag: Record<BrowseCase['deltaTag'], string> = {
  FAIL: 'var(--tt-red)',
  PASS: 'var(--tt-cyan)',
  TIMEOUT: 'var(--tt-orange)',
};

export const BrowseCaseList = ({ cases, selectedCaseId, onSelectCase }: BrowseCaseListProps) => (
  <section aria-label="Case List" style={{ minWidth: 0, width: 280 }}>
    <Column gap={3} width={280}>
      <Kicker>case list</Kicker>
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
            style={{
              border: selected
                ? `1px solid ${selectedColorByTag[testCase.deltaTag]}`
                : '1px solid transparent',
              cursor: 'pointer',
              display: 'grid',
              gridTemplateColumns: selected ? '4px minmax(0, 1fr)' : '0 minmax(0, 1fr)',
              minWidth: 0,
            }}
          >
            <span
              aria-hidden="true"
              style={{ background: selected ? selectedColorByTag[testCase.deltaTag] : 'transparent' }}
            />
            <CaseCard
              caseId={testCase.id}
              deltaTag={testCase.deltaTag}
              failureEvidenceBlock={testCase.failureEvidence ?? testCase.response}
              promptExcerpt={testCase.prompt}
            />
          </div>
        );
      })}
    </Column>
  </section>
);
