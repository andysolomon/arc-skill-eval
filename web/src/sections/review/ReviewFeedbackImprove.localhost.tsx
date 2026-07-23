import { useMemo, useState } from 'react';
import { useApplyPlan } from './useApplyPlan';
import { useProposePlan, type ProposedImprovePlan, type StagedImprovePlan } from './useProposePlan';
import type { ReviewImproveVariantProps } from './ReviewFeedbackImprove';

const inFlightStatuses = new Set(['proposing', 'staging', 'committing', 'cancelling']);

const renderPlanItems = (plan: ProposedImprovePlan) => (
  <div aria-label="proposed improve plan">
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
    <section
      aria-label="improve from feedback localhost"
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
        improve --from-feedback
      </header>
      <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: 12 }}>
        {!propose.plan ? (
          <div style={{ color: 'var(--tt-comment)', fontSize: 12.5, lineHeight: 1.6 }}>
            turn review notes + failing assertions into a focused plan — prompt, assertion,
            fixture, or adjacent-negative changes with rationale. nothing is written without{' '}
            <span style={{ color: 'var(--tt-yellow)' }}>--apply</span>.
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

        {stagedPlan ? (
          <section
            aria-label="staged improve diff"
            style={{
              border: '1px solid var(--tt-green)',
              borderRadius: 7,
              display: 'grid',
              gap: 10,
              marginTop: 12,
              padding: 10,
            }}
          >
            <span
              style={{ color: 'var(--tt-comment)', fontSize: 12, overflowWrap: 'anywhere' }}
            >
              staged {stagedPlan.planId} at {stagedPlan.stagingPath}
            </span>
            <pre
              aria-readonly="true"
              style={{
                background: 'var(--tt-bg-dark)',
                border: '1px solid var(--tt-border)',
                borderRadius: 6,
                color: 'var(--tt-fg-dark)',
                fontSize: 12,
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
                  background: 'color-mix(in srgb, var(--tt-green) 14%, var(--tt-bg))',
                  border: '1px solid var(--tt-green)',
                  borderRadius: 6,
                  color: 'var(--tt-green)',
                  cursor: isInFlight ? 'wait' : 'pointer',
                  fontWeight: 700,
                  padding: '6px 13px',
                }}
              >
                commit
              </button>
              <button
                disabled={isInFlight}
                onClick={handleCancel}
                type="button"
                style={{
                  background: 'transparent',
                  border: '1px solid var(--tt-border)',
                  borderRadius: 6,
                  color: 'var(--tt-fg-dark)',
                  cursor: isInFlight ? 'wait' : 'pointer',
                  padding: '6px 13px',
                }}
              >
                cancel
              </button>
            </div>
          </section>
        ) : null}

        {apply.status === 'committed' ? (
          <div role="status" style={{ color: 'var(--tt-green)', fontSize: 12.5, marginTop: 10 }}>
            ✓ committed staged plan{apply.result?.path ? ` to ${apply.result.path}` : ''}
          </div>
        ) : null}
        {apply.status === 'cancelled' ? (
          <div
            role="status"
            style={{ color: 'var(--tt-comment)', fontSize: 12.5, marginTop: 10 }}
          >
            cancelled staged plan
          </div>
        ) : null}
        {propose.error || apply.error ? (
          <div role="alert" style={{ color: 'var(--tt-red)', fontSize: 12.5, marginTop: 10 }}>
            ✗ {propose.error ?? apply.error}
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
          title={canPropose ? 'propose an improve plan' : 'locked until feedback exists'}
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
          {isInFlight ? 'improving…' : 'improve'}
        </button>
      </footer>
    </section>
  );
};
