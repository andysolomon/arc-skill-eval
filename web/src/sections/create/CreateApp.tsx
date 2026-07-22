import { StepRail, type StepRailStep } from '@/components/primitives';
import { useEnv } from '@/state/env';
import { LivePreview } from './LivePreview';
import { StepAssertions } from './StepAssertions';
import { StepListBehaviors } from './StepListBehaviors';
import { StepPrompts } from './StepPrompts';
import { StepReview } from './StepReview';
import { type CreateStepId, useDraft } from './useDraft';

const railSteps: StepRailStep[] = [
  { id: 'behaviors', label: 'behaviors' },
  { id: 'prompts', label: 'prompts' },
  { id: 'assertions', label: 'assertions' },
  { id: 'review', label: 'review' },
];

const isCreateStepId = (value: string): value is CreateStepId =>
  railSteps.some((step) => step.id === value);

const buttonStyle = {
  background: 'var(--tt-bg-dark)',
  border: '1px solid var(--tt-border)',
  color: 'var(--tt-fg)',
  cursor: 'pointer',
  padding: '8px 10px',
};

export const CreateApp = () => {
  const { env } = useEnv();
  const {
    activeStep,
    activeStepIndex,
    addAssertion,
    addPrompt,
    assertionCount,
    behaviorCount,
    draft,
    evalsJson,
    promptCount,
    removeAssertion,
    removePrompt,
    setActiveStep,
    updateAssertion,
    updateDraft,
    updatePrompt,
  } = useDraft();

  const canContinueByStep: Record<CreateStepId, boolean> = {
    behaviors: behaviorCount > 0,
    prompts: promptCount > 0,
    assertions: assertionCount > 0,
    review: evalsJson.evals.length > 0 && assertionCount > 0,
  };
  const canGoBack = activeStepIndex > 0;
  const canGoNext = activeStepIndex < railSteps.length - 1 && canContinueByStep[activeStep];
  const nextStep = railSteps[activeStepIndex + 1]?.id;
  const previousStep = railSteps[activeStepIndex - 1]?.id;

  return (
    <main
      className="app-main"
      data-screen-label={`create (${env})`}
      data-testid="create-app"
      style={{ minWidth: 0, overflow: 'auto', padding: 16 }}
    >
      <section
        aria-label="Create eval suite workspace"
        data-env={env}
        style={{
          alignItems: 'stretch',
          display: 'grid',
          gap: 14,
          gridTemplateColumns: '214px minmax(520px, 700px) 344px',
          minHeight: 'calc(100vh - 116px)',
          minWidth: 1100,
        }}
      >
        <StepRail
          activeId={activeStep}
          onSelect={(id) => {
            if (isCreateStepId(id)) {
              setActiveStep(id);
            }
          }}
          steps={railSteps}
        />

        <section
          aria-label="Create wizard step"
          style={{
            border: '1px solid var(--tt-border)',
            display: 'grid',
            gap: 14,
            gridTemplateRows: 'minmax(0, 1fr) auto',
            minHeight: 0,
            padding: 16,
          }}
        >
          <div style={{ minHeight: 0, overflow: 'auto' }}>
            {activeStep === 'behaviors' ? (
              <StepListBehaviors draft={draft} env={env} onChange={updateDraft} />
            ) : null}
            {activeStep === 'prompts' ? (
              <StepPrompts
                behaviorCount={behaviorCount}
                draft={draft}
                env={env}
                onAdd={addPrompt}
                onGoToBehaviors={() => setActiveStep('behaviors')}
                onRemove={removePrompt}
                onUpdate={updatePrompt}
              />
            ) : null}
            {activeStep === 'assertions' ? (
              <StepAssertions
                draft={draft}
                env={env}
                onAdd={addAssertion}
                onRemove={removeAssertion}
                onUpdate={updateAssertion}
              />
            ) : null}
            {activeStep === 'review' ? (
              <StepReview
                assertionCount={assertionCount}
                draft={draft}
                env={env}
                evalsJson={evalsJson}
              />
            ) : null}
          </div>

          <footer
            aria-label="Create wizard navigation"
            style={{
              borderTop: '1px solid var(--tt-border)',
              display: 'flex',
              gap: 8,
              justifyContent: 'space-between',
              paddingTop: 12,
            }}
          >
            <button
              disabled={!canGoBack}
              onClick={() => {
                if (previousStep && isCreateStepId(previousStep)) {
                  setActiveStep(previousStep);
                }
              }}
              type="button"
              style={{
                ...buttonStyle,
                color: canGoBack ? 'var(--tt-fg)' : 'var(--tt-comment)',
                cursor: canGoBack ? 'pointer' : 'not-allowed',
              }}
            >
              back
            </button>
            {activeStep === 'review' ? null : (
              <button
                disabled={!canGoNext}
                onClick={() => {
                  if (nextStep && isCreateStepId(nextStep)) {
                    setActiveStep(nextStep);
                  }
                }}
                type="button"
                style={{
                  ...buttonStyle,
                  background: canGoNext ? 'var(--tt-selection)' : 'var(--tt-bg-dark)',
                  color: canGoNext ? 'var(--tt-fg)' : 'var(--tt-comment)',
                  cursor: canGoNext ? 'pointer' : 'not-allowed',
                }}
              >
                next
              </button>
            )}
          </footer>
        </section>

        <LivePreview evalsJson={evalsJson} />
      </section>
    </main>
  );
};
