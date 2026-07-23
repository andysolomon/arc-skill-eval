import { useState } from 'react';
import { useEnv } from '@/state/env';
import { useWorkspace, workspaceSkills } from '@/state/workspace';
import { LivePreview } from './LivePreview';
import { StepAssertions } from './StepAssertions';
import { StepListBehaviors } from './StepListBehaviors';
import { StepPrompts } from './StepPrompts';
import { StepReview } from './StepReview';
import { useGenerateEvals } from './useGenerateEvals';
import { makeBehaviorRow, type CreateStepId, useDraft } from './useDraft';

const railSteps: Array<{ id: CreateStepId; num: string; label: string }> = [
  { id: 'behaviors', num: '01', label: 'List behaviors' },
  { id: 'prompts', num: '02', label: 'Write prompts' },
  { id: 'assertions', num: '03', label: 'Attach assertions' },
  { id: 'review', num: '04', label: 'Review & run' },
];

const HostedBanner = () => (
  <div
    style={{
      background: 'var(--tt-bg-dark)',
      border: '1px solid var(--tt-border)',
      borderLeft: '2px solid var(--tt-cyan)',
      borderRadius: 8,
      marginBottom: 20,
      padding: '11px 14px',
    }}
  >
    <span style={{ color: 'var(--tt-cyan)', fontSize: 12.5, fontWeight: 700 }}>
      building on the hosted site
    </span>
    <div style={{ color: 'var(--tt-comment)', fontSize: 12, lineHeight: 1.55, marginTop: 4 }}>
      assemble your suite here by hand — it exports as{' '}
      <span style={{ color: 'var(--tt-fg-dark)' }}>evals.json</span> to run. on{' '}
      <span style={{ color: 'var(--tt-fg-dark)' }}>localhost</span>,{' '}
      <span style={{ color: 'var(--tt-fg-dark)' }}>create --guided</span> can auto-draft one from
      an existing SKILL.md with an LLM.
    </div>
  </div>
);

type GenerateBannerProps = {
  onGenerated: (skill: string, behaviors: string[]) => void;
  workspaceRoot: string;
};

const GenerateBanner = ({ onGenerated, workspaceRoot }: GenerateBannerProps) => {
  const { error, generateEvals, isGenerating } = useGenerateEvals();
  const [selected, setSelected] = useState('');
  const [generated, setGenerated] = useState<{ skill: string; count: number } | null>(null);
  const active = Boolean(selected) && !isGenerating;

  const handleGenerate = () => {
    if (!selected) {
      return;
    }

    void generateEvals({ workspaceRoot: `${workspaceRoot}/${selected}`, behaviors: [] })
      .then((result) => {
        setGenerated({ skill: selected, count: result.behaviors.length });
        onGenerated(selected, result.behaviors);
      })
      .catch(() => undefined);
  };

  return (
    <div
      style={{
        background: 'var(--tt-bg-dark)',
        border: '1px solid var(--tt-border)',
        borderLeft: '2px solid var(--tt-green)',
        borderRadius: 8,
        marginBottom: 20,
        padding: '12px 14px',
      }}
    >
      <div
        style={{
          alignItems: 'center',
          display: 'flex',
          flexWrap: 'wrap',
          gap: 8,
          marginBottom: 10,
        }}
      >
        <span style={{ color: 'var(--tt-green)', fontSize: 12.5, fontWeight: 700 }}>
          generate starter evals
        </span>
        <span style={{ color: 'var(--tt-comment)', fontSize: 11.5, lineHeight: 1.5 }}>
          choose a skill, then draft its behaviors, prompts &amp; assertions with an LLM (
          <span style={{ color: 'var(--tt-fg-dark)' }}>create --guided</span>). optional — build
          by hand instead.
        </span>
      </div>
      <div style={{ alignItems: 'center', display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <span style={{ color: 'var(--tt-comment)', fontSize: 12 }}>skill:</span>
        {workspaceSkills.map((skill) => {
          const isSelected = selected === skill.id;

          return (
            <button
              aria-pressed={isSelected}
              key={skill.id}
              onClick={() => setSelected(isSelected ? '' : skill.id)}
              type="button"
              style={{
                alignItems: 'center',
                background: isSelected
                  ? 'color-mix(in srgb, var(--tt-green) 14%, var(--tt-bg))'
                  : 'transparent',
                border: `1px solid ${isSelected ? 'var(--tt-green)' : 'var(--tt-border)'}`,
                borderRadius: 6,
                color: isSelected ? 'var(--tt-green)' : 'var(--tt-fg-dark)',
                cursor: 'pointer',
                display: 'inline-flex',
                fontSize: 12,
                gap: 6,
                padding: '5px 11px',
              }}
            >
              {skill.id}
            </button>
          );
        })}
        <span style={{ flex: 1 }} />
        <button
          disabled={!active}
          onClick={handleGenerate}
          type="button"
          style={{
            alignItems: 'center',
            background: 'transparent',
            border: `1px solid ${active ? 'var(--tt-green)' : 'var(--tt-border)'}`,
            borderRadius: 6,
            color: active ? 'var(--tt-green)' : 'var(--tt-dim)',
            cursor: active ? 'pointer' : 'default',
            display: 'inline-flex',
            fontSize: 12.5,
            fontWeight: 700,
            gap: 6,
            padding: '6px 13px',
          }}
        >
          {isGenerating ? '✦ generating…' : '✦ generate evals'}
        </button>
      </div>
      {generated ? (
        <div style={{ color: 'var(--tt-green)', fontSize: 12, marginTop: 10 }}>
          ✓ drafted {generated.count} behaviors from{' '}
          <span style={{ color: 'var(--tt-teal)' }}>{generated.skill}</span> — step through to
          refine each. add more by hand anytime.
        </div>
      ) : null}
      {error ? (
        <div role="alert" style={{ color: 'var(--tt-red)', fontSize: 12, marginTop: 10 }}>
          ✗ {error}
        </div>
      ) : null}
    </div>
  );
};

export const CreateApp = () => {
  const { env } = useEnv();
  const { workspace } = useWorkspace();
  const {
    activeStep,
    activeStepIndex,
    addAssertion,
    addBehavior,
    assertionCount,
    deterministicCount,
    draft,
    evalsJson,
    judgeCount,
    markWritten,
    removeAssertion,
    removeBehavior,
    seedBehaviors,
    setActiveStep,
    setAssertionValue,
    setSkill,
    updateBehavior,
    wrote,
  } = useDraft();

  const canGoBack = activeStepIndex > 0;
  const canGoNext = activeStepIndex < railSteps.length - 1;

  return (
    <main
      className="app-main"
      data-screen-label={`create (${env})`}
      data-testid="create-app"
      style={{ display: 'flex', minHeight: 0, minWidth: 1100, padding: 0 }}
    >
      <aside
        aria-label="Create wizard steps"
        style={{
          background: 'var(--tt-bg-dark)',
          borderRight: '1px solid var(--tt-border)',
          display: 'flex',
          flex: 'none',
          flexDirection: 'column',
          width: 214,
        }}
      >
        <div
          style={{
            color: 'var(--tt-comment)',
            fontSize: 11,
            letterSpacing: '.08em',
            padding: '13px 16px 7px',
            textTransform: 'uppercase',
          }}
        >
          new eval suite
        </div>
        <nav style={{ flex: 1, overflow: 'auto', padding: '0 8px 8px' }}>
          {railSteps.map((step) => {
            const active = step.id === activeStep;

            return (
              <button
                aria-current={active ? 'step' : undefined}
                key={step.id}
                onClick={() => setActiveStep(step.id)}
                type="button"
                style={{
                  alignItems: 'center',
                  background: active ? 'var(--tt-selection)' : 'transparent',
                  border: 0,
                  borderLeft: `2px solid ${active ? 'var(--tt-blue)' : 'transparent'}`,
                  borderRadius: 6,
                  cursor: 'pointer',
                  display: 'flex',
                  gap: 10,
                  margin: '1px 0',
                  padding: '9px 9px',
                  textAlign: 'left',
                  width: '100%',
                }}
              >
                <span
                  style={{
                    color: active ? 'var(--tt-blue)' : 'var(--tt-dim)',
                    flex: 'none',
                    fontSize: 11,
                    fontWeight: 700,
                    width: 16,
                  }}
                >
                  {step.num}
                </span>
                <span
                  style={{
                    color: active ? 'var(--tt-fg)' : 'var(--tt-fg-dark)',
                    fontSize: 12.5,
                  }}
                >
                  {step.label}
                </span>
              </button>
            );
          })}
        </nav>
        <div
          style={{
            borderTop: '1px solid var(--tt-border)',
            color: 'var(--tt-comment)',
            fontSize: 11,
            lineHeight: 1.65,
            padding: '12px 16px',
          }}
        >
          mirrors the <span style={{ color: 'var(--tt-fg-dark)' }}>learn</span> flow — one step
          per chapter. no eval experience needed.
        </div>
      </aside>

      <section
        aria-label="Create wizard step"
        data-env={env}
        style={{
          display: 'flex',
          flex: 1,
          flexDirection: 'column',
          minHeight: 0,
          minWidth: 0,
        }}
      >
        <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: '26px 32px' }}>
          <div style={{ maxWidth: 700 }}>
            {env === 'localhost' ? (
              <GenerateBanner
                onGenerated={(skill, behaviors) =>
                  seedBehaviors(
                    skill,
                    behaviors.map((text) =>
                      makeBehaviorRow({ text: text.replace(/\.$/, ''), flavor: 'implicit' }),
                    ),
                  )
                }
                workspaceRoot={workspace}
              />
            ) : (
              <HostedBanner />
            )}

            {activeStep === 'behaviors' ? (
              <StepListBehaviors
                draft={draft}
                env={env}
                onAddBehavior={addBehavior}
                onRemoveBehavior={removeBehavior}
                onSkill={setSkill}
                onUpdateBehavior={updateBehavior}
              />
            ) : null}
            {activeStep === 'prompts' ? (
              <StepPrompts
                draft={draft}
                env={env}
                onUpdateBehavior={updateBehavior}
                workspaceRoot={workspace}
              />
            ) : null}
            {activeStep === 'assertions' ? (
              <StepAssertions
                draft={draft}
                onAddAssertion={addAssertion}
                onRemoveAssertion={removeAssertion}
                onSetAssertionValue={setAssertionValue}
              />
            ) : null}
            {activeStep === 'review' ? (
              <StepReview
                assertionCount={assertionCount}
                deterministicCount={deterministicCount}
                draft={draft}
                env={env}
                evalsJson={evalsJson}
                judgeCount={judgeCount}
                onWritten={markWritten}
                workspaceRoot={workspace}
                wrote={wrote}
              />
            ) : null}
          </div>
        </div>

        <footer
          aria-label="Create wizard navigation"
          style={{
            alignItems: 'center',
            borderTop: '1px solid var(--tt-border)',
            display: 'flex',
            flex: 'none',
            gap: 10,
            padding: '12px 32px',
          }}
        >
          {canGoBack ? (
            <button
              onClick={() => setActiveStep(railSteps[activeStepIndex - 1].id)}
              type="button"
              style={{
                background: 'transparent',
                border: '1px solid var(--tt-border)',
                borderRadius: 7,
                color: 'var(--tt-fg-dark)',
                cursor: 'pointer',
                fontSize: 13,
                padding: '8px 15px',
              }}
            >
              ← back
            </button>
          ) : null}
          <span style={{ flex: 1 }} />
          {canGoNext ? (
            <button
              onClick={() => setActiveStep(railSteps[activeStepIndex + 1].id)}
              type="button"
              style={{
                background: 'transparent',
                border: '1px solid var(--tt-border-active)',
                borderRadius: 7,
                color: 'var(--tt-blue)',
                cursor: 'pointer',
                fontSize: 13,
                fontWeight: 700,
                padding: '8px 18px',
              }}
            >
              next →
            </button>
          ) : null}
        </footer>
      </section>

      <LivePreview evalsJson={evalsJson} />
    </main>
  );
};
