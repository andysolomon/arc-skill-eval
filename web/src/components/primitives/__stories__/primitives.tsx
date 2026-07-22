import { useState } from 'react';
import {
  CaseCard,
  Column,
  ComposerRow,
  EmptyState,
  ImportCard,
  Kicker,
  RunCard,
  StepRail,
} from '..';

const steps = [
  { id: 'behaviors', label: 'list behaviors' },
  { id: 'prompts', label: 'turn into prompts' },
  { id: 'assertions', label: 'attach assertions' },
  { id: 'review', label: 'review and run' },
];

export const PrimitivesStory = () => {
  const [open, setOpen] = useState(true);
  const [activeStep, setActiveStep] = useState(steps[0].id);

  if (!import.meta.env.DEV) {
    return null;
  }

  return (
    <main
      style={{
        background: 'var(--tt-bg)',
        color: 'var(--tt-fg)',
        minHeight: '100vh',
        padding: 20,
      }}
    >
      <div style={{ display: 'grid', gap: 'var(--tt-gap-5, 20px)' }}>
        <Kicker>primitive smoke page</Kicker>
        <div
          style={{
            alignItems: 'start',
            display: 'grid',
            gap: 'var(--tt-gap-4, 16px)',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          }}
        >
          <Column gap={3}>
            <RunCard
              runId="run_2026-07-22_demo"
              skillName="arc-demo-skill"
              finishedAt="2026-07-22T14:05:00.000Z"
              status="partial"
              counts={{ pass: 5, fail: 1, timeout: 1 }}
            />
            <CaseCard
              caseId="case_summarize_pr"
              deltaTag="FAIL"
              promptExcerpt="Summarize the pull request and identify the riskiest behavioral regression before suggesting follow-up tests."
              failureEvidenceBlock="Expected a regression risk, but the answer only restated changed files."
            />
          </Column>
          <Column gap={3}>
            <ComposerRow
              isOpen={open}
              label="--context-mode"
              onToggle={() => setOpen((value) => !value)}
              value="isolated"
            >
              isolated keeps only the selected skill context.
            </ComposerRow>
            <ImportCard onSample={() => undefined} onValidate={() => undefined} />
          </Column>
          <Column gap={3}>
            <EmptyState
              title="localhost only"
              body="This section needs imported artifacts before there is anything to inspect."
              action={{ label: 'reset hosted data', onClick: () => undefined }}
            />
            <StepRail activeId={activeStep} onSelect={setActiveStep} steps={steps} />
          </Column>
        </div>
      </div>
    </main>
  );
};
