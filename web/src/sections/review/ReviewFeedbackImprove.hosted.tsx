import { useState } from 'react';
import { useProposePlan, type ProposedImprovePlan } from './useProposePlan';
import type { ReviewImproveVariantProps } from './ReviewFeedbackImprove';

const panelStyle = {
  background: 'var(--tt-bg-dark)',
  border: '1px solid var(--tt-border)',
  color: 'var(--tt-fg)',
  display: 'grid',
  gap: 12,
  padding: 14,
};

const buttonStyle = {
  background: 'var(--tt-selection)',
  border: '1px solid var(--tt-border-active)',
  color: 'var(--tt-fg)',
  cursor: 'pointer',
  padding: '8px 10px',
};

const monoStyle = {
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  fontSize: 12,
};

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
  <div aria-label="downloaded improve plan" style={{ display: 'grid', gap: 8 }}>
    {plan.items.map((item, index) => (
      <article
        key={`${item.path}-${index}`}
        style={{
          border: '1px solid var(--tt-border)',
          display: 'grid',
          gap: 6,
          padding: 8,
        }}
      >
        <strong style={{ ...monoStyle, color: 'var(--tt-yellow)', overflowWrap: 'anywhere' }}>
          {item.path}
        </strong>
        <p style={{ color: 'var(--tt-fg-dark)', lineHeight: 1.45, margin: 0 }}>
          {item.before} -&gt; {item.after}
        </p>
        <span style={{ ...monoStyle, color: 'var(--tt-comment)', overflowWrap: 'anywhere' }}>
          {item.rationale}
        </span>
      </article>
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
    <section aria-label="improve from feedback hosted" data-env="hosted" style={panelStyle}>
      <header style={{ display: 'grid', gap: 4 }}>
        <h2 style={{ fontSize: 15, lineHeight: 1.2, margin: 0 }}>improve --from-feedback</h2>
        {!propose.plan ? (
          <p style={{ color: 'var(--tt-fg-dark)', lineHeight: 1.45, margin: 0 }}>
            We'll derive a proposed plan from your feedback notes against the eval suite +
            grading.json. Nothing is written without --apply.
          </p>
        ) : null}
      </header>

      {improvePlans.length > 0 ? (
        <div style={{ display: 'grid', gap: 8 }}>
          {improvePlans.map((plan) => (
            <div
              key={plan.planId}
              style={{
                border: '1px solid var(--tt-border)',
                color: 'var(--tt-comment)',
                ...monoStyle,
                overflowWrap: 'anywhere',
                padding: 8,
              }}
            >
              {plan.status} · {plan.planId}
            </div>
          ))}
        </div>
      ) : null}

      {propose.plan ? renderPlanItems(propose.plan) : null}

      <button
        disabled={!canPropose}
        onClick={handlePropose}
        title={canPropose ? 'download proposed improve plan' : 'locked until feedback exists'}
        type="button"
        style={{
          ...buttonStyle,
          borderColor: 'var(--tt-magenta)',
          color: canPropose ? 'var(--tt-magenta)' : 'var(--tt-comment)',
          cursor: canPropose ? 'pointer' : 'not-allowed',
          opacity: canPropose ? 1 : 0.6,
        }}
      >
        {propose.status === 'proposing' ? 'proposing changes' : 'propose changes'}
      </button>

      {downloaded ? (
        <span role="status" style={{ color: 'var(--tt-green)', fontSize: 13 }}>
          improve plan download started
        </span>
      ) : null}
      {propose.error ? (
        <span role="alert" style={{ color: 'var(--tt-red)', fontSize: 13 }}>
          {propose.error}
        </span>
      ) : null}
    </section>
  );
};
