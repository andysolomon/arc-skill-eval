import { useState } from 'react';
import { useProposePlan, type ProposedImprovePlan } from './useProposePlan';
import type { ReviewImproveVariantProps } from './ReviewFeedbackImprove';

const safeFilePart = (value: string): string =>
  value.trim().replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'review';

const downloadImprovePlan = (plan: ProposedImprovePlan, skill: string) => {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const blob = new Blob([`${JSON.stringify(plan, null, 2)}\n`], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');

  anchor.href = url;
  anchor.download = `improve-plan-${safeFilePart(skill)}-${safeFilePart(plan.runId)}-${timestamp}.json`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
};

const renderPlanItems = (plan: ProposedImprovePlan) => (
  <div aria-label="Downloaded change plan">
    {plan.items.map((item, index) => (
      <div key={`${item.path}-${index}`} style={{ marginBottom: 12 }}>
        <div
          style={{
            color: 'var(--tt-magenta)',
            fontSize: 11,
            fontWeight: 700,
            marginBottom: 3,
            overflowWrap: 'anywhere',
          }}
        >
          {item.path}
        </div>
        <div style={{ fontSize: 12.5, whiteSpace: 'pre-wrap' }}>
          <span style={{ color: 'var(--tt-red)' }}>- {item.before}</span>
          <br />
          <span style={{ color: 'var(--tt-green)' }}>+ {item.after}</span>
        </div>
        <div style={{ color: 'var(--tt-comment)', fontSize: 12, marginTop: 3 }}>
          {item.rationale}
        </div>
      </div>
    ))}
  </div>
);

export const ReviewFeedbackImproveHosted = ({
  activeRunId,
  feedbackCount,
  improvePlans,
  run,
}: ReviewImproveVariantProps) => {
  const [downloaded, setDownloaded] = useState(false);
  const propose = useProposePlan();
  const canPropose = feedbackCount > 0 && propose.status !== 'proposing';

  const handlePropose = () => {
    void propose
      .proposePlan({
        evalsJson: run.evalsJson,
        runId: activeRunId,
        stageOnLocalhost: false,
        workspaceRoot: run.workspaceRoot,
      })
      .then(({ plan }) => {
        downloadImprovePlan(plan, run.skill);
        setDownloaded(true);
      })
      .catch(() => undefined);
  };

  return (
    <section
      aria-label="Download changes proposed from feedback"
      data-env="hosted"
      style={{
        border: '1px solid var(--tt-border)',
        borderRadius: 8,
        display: 'flex',
        flex: 1,
        flexDirection: 'column',
        minHeight: 0,
        overflow: 'hidden',
      }}
    >
      <header
        style={{
          background: 'var(--tt-bg-dark)',
          borderBottom: '1px solid var(--tt-border)',
          color: 'var(--tt-fg-dark)',
          fontSize: 12,
          fontWeight: 700,
          padding: '6px 12px',
        }}
      >
        Download a change plan
      </header>
      <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: 12 }}>
        {!propose.plan ? (
          <div style={{ color: 'var(--tt-comment)', fontSize: 12.5, lineHeight: 1.6 }}>
            Use review notes and failed assertions to propose changes to prompts, assertions,
            fixtures, or adjacent-negative cases. The hosted app downloads the plan as JSON and does not
            write files.
          </div>
        ) : null}

        {improvePlans.length > 0 ? (
          <div style={{ marginTop: propose.plan ? 0 : 10 }}>
            {improvePlans.map((plan) => (
              <div
                key={plan.planId}
                style={{
                  color: 'var(--tt-comment)',
                  fontSize: 11,
                  overflowWrap: 'anywhere',
                  padding: '2px 0',
                }}
              >
                {plan.status} · {plan.planId}
              </div>
            ))}
          </div>
        ) : null}

        {propose.plan ? renderPlanItems(propose.plan) : null}

        {downloaded ? (
          <div role="status" style={{ color: 'var(--tt-green)', fontSize: 12.5, marginTop: 10 }}>
            ✓ Change plan download started
          </div>
        ) : null}
        {propose.error ? (
          <div role="alert" style={{ color: 'var(--tt-red)', fontSize: 12.5, marginTop: 10 }}>
            ✗ {propose.error}
          </div>
        ) : null}
      </div>
      <footer
        style={{
          borderTop: '1px solid var(--tt-border)',
          display: 'flex',
          gap: 8,
          padding: '10px 12px',
        }}
      >
        <button
          disabled={!canPropose}
          onClick={handlePropose}
          title={canPropose ? 'Download change plan' : 'Add feedback to download a change plan'}
          type="button"
          style={{
            alignItems: 'center',
            background: 'transparent',
            border: '1px solid var(--tt-magenta)',
            borderRadius: 6,
            color: 'var(--tt-magenta)',
            cursor: canPropose ? 'pointer' : 'not-allowed',
            display: 'flex',
            flex: 1,
            fontSize: 13,
            height: 34,
            justifyContent: 'center',
            opacity: canPropose ? 1 : 0.6,
          }}
        >
          {propose.status === 'proposing' ? 'Preparing change plan…' : 'Download change plan'}
        </button>
      </footer>
    </section>
  );
};
