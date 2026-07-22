import { useState } from 'react';
import { ComposerRow, Kicker } from '@/components/primitives';
import { useRunLifecycle } from '@/state/runLifecycle';
import { WorkspacePicker } from './WorkspacePicker';
import {
  useRunDaemon,
  type CompareMode,
  type ContextMode,
  type RunComposerState,
  type SandboxMode,
} from './useRunDaemon';

type RunComposerLocalhostProps = {
  value: RunComposerState;
  onChange: (nextState: RunComposerState) => void;
};

type FieldName =
  | 'skill'
  | 'case'
  | 'model'
  | 'judgeModel'
  | 'compare'
  | 'extraSkill'
  | 'iteration'
  | 'contextMode'
  | 'sandbox';

const models = [
  'anthropic/claude-sonnet-4',
  'anthropic/claude-opus-4',
  'openai/gpt-5',
  'openai/gpt-5-mini',
];

const caseOptions = ['*', 'all', 'case-pass', 'case-fail'];
const compareOptions: CompareMode[] = ['off', 'with', 'on'];
const contextModeOptions: ContextMode[] = ['isolated', 'ambient'];
const sandboxOptions: SandboxMode[] = ['none', 'just-bash'];
const iterationOptions = [1, 2, 3, 4, 5];

export const defaultRunComposerState: RunComposerState = {
  workspaceRoot: '',
  case: '*',
  model: 'anthropic/claude-sonnet-4',
  judgeModel: 'anthropic/claude-sonnet-4',
  compare: 'off',
  extraSkill: [],
  iteration: 1,
  contextMode: 'isolated',
  sandbox: 'none',
};

const buttonStyle = (selected: boolean) => ({
  background: selected ? 'var(--tt-selection)' : 'var(--tt-bg)',
  border: '1px solid var(--tt-border)',
  color: selected ? 'var(--tt-fg)' : 'var(--tt-fg-dark)',
  cursor: 'pointer',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  minHeight: 30,
  padding: '0 9px',
  textAlign: 'left' as const,
});

const OptionList = <T extends string | number>({
  value,
  options,
  onSelect,
}: {
  value: T;
  options: readonly T[];
  onSelect: (value: T) => void;
}) => (
  <div style={{ display: 'grid', gap: 6 }}>
    {options.map((option) => (
      <button
        key={option}
        onClick={() => onSelect(option)}
        type="button"
        style={buttonStyle(option === value)}
      >
        {option}
      </button>
    ))}
  </div>
);

export const RunComposerLocalhost = ({ value, onChange }: RunComposerLocalhostProps) => {
  const [openField, setOpenField] = useState<FieldName | null>('skill');
  const [extraSkillDraft, setExtraSkillDraft] = useState('');
  const { state } = useRunLifecycle();
  const { startRun, cancelRun, resetRun } = useRunDaemon();

  const update = (patch: Partial<RunComposerState>) => {
    onChange({ ...value, ...patch });
  };

  const toggleField = (field: FieldName) => {
    setOpenField((current) => (current === field ? null : field));
  };

  const addExtraSkill = () => {
    const nextExtraSkill = extraSkillDraft.trim();

    if (!nextExtraSkill || value.extraSkill.includes(nextExtraSkill)) {
      return;
    }

    update({ extraSkill: [...value.extraSkill, nextExtraSkill] });
    setExtraSkillDraft('');
  };

  const removeExtraSkill = (extraSkill: string) => {
    update({ extraSkill: value.extraSkill.filter((candidate) => candidate !== extraSkill) });
  };

  const handleRun = () => {
    if (state.status === 'running') {
      void cancelRun();
      return;
    }

    if (state.status === 'done') {
      resetRun();
      return;
    }

    if (!value.workspaceRoot) {
      setOpenField('skill');
      window.alert('Pick a workspace before running.');
      return;
    }

    void startRun(value).catch((error: unknown) => {
      window.alert(error instanceof Error ? error.message : 'Run failed.');
    });
  };

  const runButtonLabel =
    state.status === 'running' ? '↻ reset' : state.status === 'done' ? '↻ reset' : `▶ run${value.compare === 'on' ? ' --compare' : ''}`;

  return (
    <aside
      aria-label="Run composer localhost"
      style={{
        background: 'var(--tt-bg-dark)',
        border: '1px solid var(--tt-border)',
        color: 'var(--tt-fg)',
        display: 'grid',
        gap: 10,
        gridTemplateRows: 'auto minmax(0, 1fr) auto',
        minHeight: 320,
        padding: 16,
      }}
    >
      <Kicker>composer (localhost)</Kicker>
      <div style={{ display: 'grid', gap: 8, alignContent: 'start' }}>
        <ComposerRow
          label="--skill"
          value={value.workspaceRoot || '<workspace picker>'}
          isOpen={openField === 'skill'}
          onToggle={() => toggleField('skill')}
        >
          <WorkspacePicker
            value={value.workspaceRoot}
            onChange={(workspaceRoot) => update({ workspaceRoot })}
          />
        </ComposerRow>
        <ComposerRow
          label="--case"
          value={value.case}
          isOpen={openField === 'case'}
          onToggle={() => toggleField('case')}
        >
          <OptionList value={value.case} options={caseOptions} onSelect={(nextCase) => update({ case: nextCase })} />
        </ComposerRow>
        <ComposerRow
          label="--model"
          value={value.model}
          isOpen={openField === 'model'}
          onToggle={() => toggleField('model')}
        >
          <OptionList value={value.model} options={models} onSelect={(model) => update({ model })} />
        </ComposerRow>
        <ComposerRow
          label="--judge-model"
          value={value.judgeModel}
          isOpen={openField === 'judgeModel'}
          onToggle={() => toggleField('judgeModel')}
        >
          <OptionList
            value={value.judgeModel}
            options={models}
            onSelect={(judgeModel) => update({ judgeModel })}
          />
        </ComposerRow>
        <ComposerRow
          label="--compare"
          value={value.compare}
          isOpen={openField === 'compare'}
          onToggle={() => toggleField('compare')}
        >
          <OptionList
            value={value.compare}
            options={compareOptions}
            onSelect={(compare) => update({ compare })}
          />
        </ComposerRow>
        <ComposerRow
          label="--extra-skill"
          value={value.extraSkill.length > 0 ? value.extraSkill.join(', ') : 'none'}
          isOpen={openField === 'extraSkill'}
          onToggle={() => toggleField('extraSkill')}
        >
          <div style={{ display: 'grid', gap: 8 }}>
            <input
              aria-label="Extra skill path"
              onChange={(event) => setExtraSkillDraft(event.target.value)}
              placeholder="./path/to/extra-skill"
              value={extraSkillDraft}
              style={{
                background: 'var(--tt-bg)',
                border: '1px solid var(--tt-border)',
                color: 'var(--tt-fg)',
                font: 'inherit',
                minHeight: 32,
                padding: '0 10px',
              }}
            />
            <button onClick={addExtraSkill} type="button" style={buttonStyle(false)}>
              Pick workspace
            </button>
            {value.extraSkill.map((extraSkill) => (
              <button
                key={extraSkill}
                onClick={() => removeExtraSkill(extraSkill)}
                type="button"
                style={buttonStyle(true)}
              >
                {extraSkill} remove
              </button>
            ))}
          </div>
        </ComposerRow>
        <ComposerRow
          label="--iteration"
          value={String(value.iteration)}
          isOpen={openField === 'iteration'}
          onToggle={() => toggleField('iteration')}
        >
          <OptionList
            value={value.iteration}
            options={iterationOptions}
            onSelect={(iteration) => update({ iteration })}
          />
        </ComposerRow>
        <ComposerRow
          label="--context-mode"
          value={value.contextMode}
          isOpen={openField === 'contextMode'}
          onToggle={() => toggleField('contextMode')}
        >
          <OptionList
            value={value.contextMode}
            options={contextModeOptions}
            onSelect={(contextMode) => update({ contextMode })}
          />
        </ComposerRow>
        <ComposerRow
          label="--sandbox"
          value={value.sandbox}
          isOpen={openField === 'sandbox'}
          onToggle={() => toggleField('sandbox')}
        >
          <OptionList
            value={value.sandbox}
            options={sandboxOptions}
            onSelect={(sandbox) => update({ sandbox })}
          />
        </ComposerRow>
      </div>
      <button
        onClick={handleRun}
        type="button"
        style={{
          background: value.compare === 'on' && state.status === 'idle' ? 'var(--tt-green)' : 'var(--tt-bg)',
          border: '1px solid var(--tt-border)',
          color: value.compare === 'on' && state.status === 'idle' ? 'var(--tt-bg)' : 'var(--tt-fg)',
          cursor: 'pointer',
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
          fontSize: 14,
          fontWeight: 700,
          minHeight: 42,
          padding: '0 12px',
          textAlign: 'left',
        }}
      >
        {runButtonLabel}
      </button>
    </aside>
  );
};
