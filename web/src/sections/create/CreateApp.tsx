import { useState } from 'react';
import { useEnv } from '@/state/env';
import { useWorkspace } from '@/state/workspace';
import { LivePreview } from './LivePreview';
import { StepAssertions } from './StepAssertions';
import { StepListBehaviors } from './StepListBehaviors';
import { StepPrompts } from './StepPrompts';
import { StepReview } from './StepReview';
import { useGenerateEvals } from './useGenerateEvals';
import {
  behaviorsFromEvalsJson,
  makeBehaviorRow,
  type BehaviorRow,
  type CreateStepId,
  useDraft,
} from './useDraft';

const railSteps: Array<{ id: CreateStepId; num: string; label: string }> = [
  { id: 'behaviors', num: '01', label: 'List behaviors' },
  { id: 'prompts', num: '02', label: 'Write prompts' },
  { id: 'assertions', num: '03', label: 'Attach assertions' },
  { id: 'review', num: '04', label: 'Review & run' },
];

const ASSIST_MODEL_OPTIONS = [
  'minimax/MiniMax-M3',
  'minimax/MiniMax-M2.7',
  'anthropic/claude-sonnet-4',
  'openai/gpt-5-mini',
  'moonshot/kimi-k2-0905-preview',
] as const;

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
      Create on the hosted site
    </span>
    <div style={{ color: 'var(--tt-comment)', fontSize: 12, lineHeight: 1.55, marginTop: 4 }}>
      Build the suite below, then download{' '}
      <span style={{ color: 'var(--tt-fg-dark)' }}>evals.json</span>. On{' '}
      <span style={{ color: 'var(--tt-fg-dark)' }}>localhost</span>,{' '}
      <span style={{ color: 'var(--tt-fg-dark)' }}>create --guided</span> can draft a suite from an
      existing SKILL.md.
    </div>
  </div>
);

type GenerateBannerProps = {
  assistModel: string;
  onAssistModelChange: (value: string) => void;
  onGenerated: (skill: string, behaviors: string[]) => void;
  onLoadEvals: (skill: string, rows: BehaviorRow[], path: string) => void;
  workspaceRoot: string;
};

const GenerateBanner = ({
  assistModel,
  onAssistModelChange,
  onGenerated,
  onLoadEvals,
  workspaceRoot,
}: GenerateBannerProps) => {
  const { skills } = useWorkspace();
  const { error, generateEvals, isGenerating } = useGenerateEvals();
  const [selected, setSelected] = useState('');
  const [generated, setGenerated] = useState<{ skill: string; count: number } | null>(null);
  const [loaded, setLoaded] = useState<{ skill: string; count: number } | null>(null);
  const [loadError, setLoadError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const selectedSkill = skills.find((skill) => skill.id === selected);
  const isEdit = Boolean(selectedSkill?.hasEvals);
  const active = Boolean(selected) && !isGenerating && !isLoading;

  const handleGenerate = () => {
    if (!selected) {
      return;
    }

    setLoaded(null);
    setLoadError('');

    const skillPath =
      skills.find((skill) => skill.id === selected)?.path ?? `${workspaceRoot}/${selected}`;

    void generateEvals({ workspaceRoot: skillPath, behaviors: [], model: assistModel })
      .then((result) => {
        setGenerated({ skill: selected, count: result.behaviors.length });
        onGenerated(selected, result.behaviors);
      })
      .catch(() => undefined);
  };

  const handleEdit = () => {
    if (!selectedSkill?.path) {
      setLoadError('could not resolve the selected skill path');
      return;
    }

    const skillPath = selectedSkill.path;
    setIsLoading(true);
    setGenerated(null);
    setLoadError('');

    void fetch(
      `http://localhost:7357/skill-evals?root=${encodeURIComponent(skillPath)}`,
    )
      .then(async (response) => {
        const data = (await response.json()) as {
          ok?: boolean;
          evals?: unknown;
          error?: string;
        };

        if (!data.ok) {
          throw new Error(data.error || 'could not load evals.json');
        }

        const { skill, rows } = behaviorsFromEvalsJson(data.evals);
        const loadedSkill = skill || selected;
        setLoaded({ skill: loadedSkill, count: rows.length });
        onLoadEvals(loadedSkill, rows, skillPath);
      })
      .catch((loadFailure: unknown) => {
        setLoaded(null);
        setLoadError(
          loadFailure instanceof Error ? loadFailure.message : 'could not load evals.json',
        );
      })
      .finally(() => setIsLoading(false));
  };

  const accent = isEdit ? 'var(--tt-blue)' : 'var(--tt-green)';

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
          Draft an eval suite
        </span>
        <span style={{ color: 'var(--tt-comment)', fontSize: 11.5, lineHeight: 1.5 }}>
          Choose a skill to draft behaviors, prompts, and assertions with an LLM (
          <span style={{ color: 'var(--tt-fg-dark)' }}>create --guided</span>). You can also build
          the suite by hand.
        </span>
      </div>
      <div style={{ alignItems: 'center', display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <span style={{ color: 'var(--tt-comment)', fontSize: 12 }}>Skill:</span>
        {skills.map((skill) => {
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
              title={skill.hasEvals ? 'already has an eval suite; you can edit it' : undefined}
            >
              {skill.hasEvals ? (
                <span
                  aria-label="has evals"
                  style={{ color: 'var(--tt-green)', flex: 'none', fontSize: 8 }}
                >
                  ●
                </span>
              ) : null}
              {skill.id}
            </button>
          );
        })}
        <span style={{ flex: 1 }} />
        <button
          disabled={!active}
          onClick={isEdit ? handleEdit : handleGenerate}
          type="button"
          style={{
            alignItems: 'center',
            background: 'transparent',
            border: `1px solid ${active ? accent : 'var(--tt-border)'}`,
            borderRadius: 6,
            color: active ? accent : 'var(--tt-dim)',
            cursor: active ? 'pointer' : 'default',
            display: 'inline-flex',
            fontSize: 12.5,
            fontWeight: 700,
            gap: 6,
            padding: '6px 13px',
          }}
        >
          {isLoading
            ? '✎ loading…'
            : isGenerating
              ? '✦ generating…'
              : isEdit
                ? '✎ Edit existing evals'
                : '✦ Draft evals'}
        </button>
      </div>
      {generated ? (
        <div style={{ color: 'var(--tt-green)', fontSize: 12, marginTop: 10 }}>
          ✓ Drafted {generated.count} behaviors from{' '}
          <span style={{ color: 'var(--tt-teal)' }}>{generated.skill}</span>. Review each behavior,
          or add more by hand.
        </div>
      ) : null}
      {loaded ? (
        <div style={{ color: 'var(--tt-green)', fontSize: 12, marginTop: 10 }}>
          ✓ Loaded {loaded.count} cases from{' '}
          <span style={{ color: 'var(--tt-teal)' }}>{loaded.skill}</span>'s evals.json. Edit the
          cases, then write the file again.
        </div>
      ) : null}
      {error ? (
        <div role="alert" style={{ color: 'var(--tt-red)', fontSize: 12, marginTop: 10 }}>
          ✗ {error}
        </div>
      ) : null}
      {loadError ? (
        <div role="alert" style={{ color: 'var(--tt-red)', fontSize: 12, marginTop: 10 }}>
          ✗ {loadError}
        </div>
      ) : null}
      <div
        style={{
          alignItems: 'center',
          display: 'flex',
          flexWrap: 'wrap',
          gap: 8,
          marginTop: 10,
        }}
      >
        <span style={{ color: 'var(--tt-comment)', fontSize: 12 }}>✦ Assist model:</span>
        <select
          aria-label="assist model"
          onChange={(event) => onAssistModelChange(event.target.value)}
          value={assistModel}
          style={{
            background: 'var(--tt-bg)',
            border: '1px solid var(--tt-border)',
            borderRadius: 6,
            color: 'var(--tt-fg-dark)',
            cursor: 'pointer',
            fontSize: 12,
            maxWidth: '100%',
            padding: '5px 8px',
          }}
        >
          {ASSIST_MODEL_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
};

export const CreateApp = () => {
  const { env } = useEnv();
  const { workspace } = useWorkspace();
  const [assistModel, setAssistModel] = useState('minimax/MiniMax-M3');
  const [editTargetPath, setEditTargetPath] = useState<string>();
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
      style={{ display: 'flex', minHeight: 0, minWidth: 0, padding: 0 }}
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
          Create an eval suite
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
          Complete each step to define cases and write evals/evals.json.
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
                assistModel={assistModel}
                onAssistModelChange={setAssistModel}
                onGenerated={(skill, behaviors) => {
                  setEditTargetPath(undefined);
                  seedBehaviors(
                    skill,
                    behaviors.map((text) =>
                      makeBehaviorRow({ text: text.replace(/\.$/, ''), flavor: 'implicit' }),
                    ),
                  );
                }}
                onLoadEvals={(skill, rows, path) => {
                  seedBehaviors(skill, rows);
                  setEditTargetPath(path);
                }}
                workspaceRoot={workspace}
              />
            ) : (
              <HostedBanner />
            )}

            {activeStep === 'behaviors' ? (
              <StepListBehaviors
                assistModel={assistModel}
                draft={draft}
                env={env}
                onAddBehavior={addBehavior}
                onRemoveBehavior={removeBehavior}
                onSkill={(skill) => {
                  setEditTargetPath(undefined);
                  setSkill(skill);
                }}
                onUpdateBehavior={updateBehavior}
              />
            ) : null}
            {activeStep === 'prompts' ? (
              <StepPrompts
                assistModel={assistModel}
                draft={draft}
                env={env}
                onUpdateBehavior={updateBehavior}
              />
            ) : null}
            {activeStep === 'assertions' ? (
              <StepAssertions
                assistModel={assistModel}
                draft={draft}
                env={env}
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
                workspaceRoot={editTargetPath ?? workspace}
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
