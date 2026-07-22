import { useMemo, useState } from 'react';
import { useApplyPlan } from './useApplyPlan';
import { useProposePlan, type ProposedImprovePlan, type StagedImprovePlan } from './useProposePlan';
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

const inFlightStatuses = new Set(['proposing', 'staging', 'committing', 'cancelling']);

const renderPlanItems = (plan: ProposedImprovePlan) => (
  <div aria-label="proposed improve plan" style={{ display: 'grid', gap: 8 }}>
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

export const ReviewFeedbackImproveLocalhost = ({
  activeRunId,
  feedbackCount,
  improvePlans,
  run,
}: ReviewImproveVariantProps) => {
  const [stagedPlan, setStagedPlan] = useState<StagedImprovePlan | null>(null);
  const propose = useProposePlan();
  const apply = useApplyPlan();
  const isInFlight = useMemo(
    () => inFlightStatuses.has(propose.status) || inFlightStatuses.has(apply.status),
    [apply.status, propose.status],
  );
  const canPropose = feedbackCount > 0 && !isInFlight;

  const handlePropose = () => {
    void propose
      .proposePlan({
        evalsJson: run.evalsJson,
        runId: activeRunId,
        stageOnLocalhost: true,
        workspaceRoot: run.workspaceRoot,
      })
      .then((result) => {
        setStagedPlan(result.staged);
        apply.reset();
      })
      .catch(() => undefined);
  };

  const handleCommit = () => {
    if (!stagedPlan) {
      return;
    }

    void apply
      .commitPlan(stagedPlan)
      .then(() => {
        setStagedPlan(null);
      })
      .catch(() => undefined);
  };

  const handleCancel = () => {
    if (!stagedPlan) {
      return;
    }

    void apply
      .cancelPlan(stagedPlan)
      .then(() => {
        setStagedPlan(null);
        propose.reset();
      })
      .catch(() => undefined);
  };

  return (
    <section aria-label="improve from feedback localhost" style={panelStyle}>
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
        type="button"
        style={{
          ...buttonStyle,
          borderColor: 'var(--tt-magenta)',
          color: canPropose ? 'var(--tt-magenta)' : 'var(--tt-comment)',
          cursor: canPropose ? 'pointer' : 'not-allowed',
          opacity: canPropose ? 1 : 0.6,
        }}
      >
        {propose.status === 'proposing' || propose.status === 'staging'
          ? 'staging changes'
          : 'propose changes'}
      </button>

      {stagedPlan ? (
        <section
          aria-label="staged improve diff"
          style={{
            border: '1px solid var(--tt-green)',
            display: 'grid',
            gap: 10,
            padding: 10,
          }}
        >
          <span style={{ ...monoStyle, color: 'var(--tt-comment)', overflowWrap: 'anywhere' }}>
            staged {stagedPlan.planId} at {stagedPlan.stagingPath}
          </span>
          <pre
            aria-readonly="true"
            style={{
              background: 'var(--tt-bg)',
              border: '1px solid var(--tt-border)',
              color: 'var(--tt-fg-dark)',
              ...monoStyle,
              margin: 0,
              maxHeight: 220,
              overflow: 'auto',
              padding: 10,
              whiteSpace: 'pre-wrap',
            }}
          >
            {JSON.stringify(stagedPlan.diff, null, 2)}
          </pre>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button
              disabled={isInFlight}
              onClick={handleCommit}
              type="button"
              style={{
                ...buttonStyle,
                background: isInFlight ? 'var(--tt-selection)' : 'var(--tt-green)',
                color: isInFlight ? 'var(--tt-comment)' : 'var(--tt-bg)',
                fontWeight: 700,
              }}
            >
              commit
            </button>
            <button
              disabled={isInFlight}
              onClick={handleCancel}
              type="button"
              style={{
                ...buttonStyle,
                color: isInFlight ? 'var(--tt-comment)' : 'var(--tt-fg)',
              }}
            >
              cancel
            </button>
          </div>
        </section>
      ) : null}

      {apply.status === 'committed' ? (
        <span role="status" style={{ color: 'var(--tt-green)', fontSize: 13 }}>
          committed staged plan{apply.result?.path ? ` to ${apply.result.path}` : ''}
        </span>
      ) : null}
      {apply.status === 'cancelled' ? (
        <span role="status" style={{ color: 'var(--tt-comment)', fontSize: 13 }}>
          cancelled staged plan
        </span>
      ) : null}
      {propose.error || apply.error ? (
        <span role="alert" style={{ color: 'var(--tt-red)', fontSize: 13 }}>
          {propose.error ?? apply.error}
        </span>
      ) : null}
    </section>
  );
};
