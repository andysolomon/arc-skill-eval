import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';

import { useRunLifecycle } from '@/state/runLifecycle';
import { useWorkspace } from '@/state/workspace';
import { readLastRunIdPreference } from './WorkspacePicker';
import { useSpinner } from './useSpinner';
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

const inputStyle: CSSProperties = {
  background: 'var(--tt-bg-dark)',
  border: '1px solid var(--tt-border)',
  borderRadius: 6,
  color: 'var(--tt-fg)',
  fontSize: 12.5,
  outline: 'none',
  padding: '7px 10px',
  width: '100%',
};

const FlagRow = ({
  label,
  value,
  valueColor,
  open,
  onToggle,
  children,
}: {
  label: string;
  value: string;
  valueColor: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) => (
  <div>
    <button
      aria-expanded={open}
      onClick={onToggle}
      type="button"
      style={{
        alignItems: 'center',
        background: open ? 'var(--tt-bg-hi)' : 'transparent',
        border: 0,
        cursor: 'pointer',
        display: 'flex',
        fontSize: 13,
        gap: 12,
        justifyContent: 'space-between',
        padding: '8px 14px',
        textAlign: 'left',
        width: '100%',
      }}
    >
      <span style={{ color: 'var(--tt-comment)', flex: 'none' }}>{label}</span>
      <span style={{ alignItems: 'center', display: 'flex', gap: 8, minWidth: 0 }}>
        <span
          style={{
            color: valueColor,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {value}
        </span>
        <span
          aria-hidden="true"
          style={{ color: open ? 'var(--tt-blue)' : 'var(--tt-dim)', flex: 'none', fontSize: 10 }}
        >
          {open ? '▴' : '▾'}
        </span>
      </span>
    </button>
    {open ? (
      <div
        style={{
          background: 'var(--tt-bg-dark)',
          borderBottom: '1px solid var(--tt-border)',
          borderTop: '1px solid var(--tt-border)',
          padding: '5px',
        }}
      >
        {children}
      </div>
    ) : null}
  </div>
);

const OptionList = <T extends string | number>({
  value,
  valueColor,
  options,
  onSelect,
}: {
  value: T;
  valueColor: string;
  options: readonly T[];
  onSelect: (value: T) => void;
}) => (
  <div style={{ display: 'grid' }}>
    {options.map((option) => {
      const selected = option === value;

      return (
        <button
          key={option}
          onClick={() => onSelect(option)}
          type="button"
          style={{
            alignItems: 'center',
            background: selected ? 'var(--tt-selection)' : 'transparent',
            border: 0,
            borderRadius: 6,
            color: selected ? valueColor : 'var(--tt-fg-dark)',
            cursor: 'pointer',
            display: 'flex',
            fontSize: 13,
            gap: 8,
            padding: '7px 10px',
            textAlign: 'left',
            width: '100%',
          }}
        >
          <span aria-hidden="true" style={{ color: 'var(--tt-green)', flex: 'none', width: 11 }}>
            {selected ? '✓' : ''}
          </span>
          <span
            style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
          >
            {option}
          </span>
        </button>
      );
    })}
  </div>
);

export const RunComposerLocalhost = ({ value, onChange }: RunComposerLocalhostProps) => {
  const [openField, setOpenField] = useState<FieldName | null>('skill');
  const [extraSkillDraft, setExtraSkillDraft] = useState('');
  const { skills, workspace } = useWorkspace();
  const { state } = useRunLifecycle();
  const { startRun, cancelRun, resetRun } = useRunDaemon();
  const spinner = useSpinner(state.status === 'running');
  const [lastRunId, setLastRunId] = useState<string>();

  useEffect(() => {
    let cancelled = false;
    void readLastRunIdPreference().then((id) => {
      if (!cancelled) {
        setLastRunId(id);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [state.status]);

  const selectedSkill = skills.find((skill) => skill.path === value.workspaceRoot);
  const skillLabel = selectedSkill?.id ?? (value.workspaceRoot ? value.workspaceRoot : 'choose a skill…');

  const update = (patch: Partial<RunComposerState>) => {
    onChange({ ...value, ...patch });
  };

  const toggleField = (field: FieldName) => {
    setOpenField((current) => (current === field ? null : field));
  };

  const selectField = <T,>(field: keyof RunComposerState) => (nextValue: T) => {
    update({ [field]: nextValue } as Partial<RunComposerState>);
    setOpenField(null);
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

  const runButton = (() => {
    if (state.status === 'running') {
      return {
        label: `${spinner} running…`,
        title: 'cancel run',
        style: {
          background: 'var(--tt-bg-dark)',
          border: '1px solid var(--tt-border)',
          color: 'var(--tt-cyan)',
        },
      };
    }

    if (state.status === 'done') {
      return {
        label: '↻ reset',
        title: 'reset run',
        style: {
          background: 'var(--tt-bg-dark)',
          border: '1px solid var(--tt-border)',
          color: 'var(--tt-fg-dark)',
        },
      };
    }

    return {
      label: `▶ run${value.compare === 'on' ? ' --compare' : ''}`,
      title: 'start run',
      style: {
        background: 'color-mix(in srgb, var(--tt-green) 14%, var(--tt-bg))',
        border: '1px solid var(--tt-green)',
        color: 'var(--tt-green)',
      },
    };
  })();

  return (
    <aside
      aria-label="Run composer localhost"
      style={{
        border: '1px solid var(--tt-border)',
        borderRadius: 8,
        display: 'flex',
        flex: 'none',
        flexDirection: 'column',
        overflow: 'hidden',
        width: 392,
      }}
    >
      <div
        style={{
          background: 'var(--tt-bg-dark)',
          borderBottom: '1px solid var(--tt-border)',
          color: 'var(--tt-fg-dark)',
          fontSize: 12,
          fontWeight: 700,
          padding: '7px 14px',
        }}
      >
        compose run
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: '6px 0' }}>
        <FlagRow
          label="skill"
          value={skillLabel}
          valueColor={value.workspaceRoot ? 'var(--tt-fg)' : 'var(--tt-comment)'}
          open={openField === 'skill'}
          onToggle={() => toggleField('skill')}
        >
          {skills.length > 0 ? (
            <div style={{ display: 'grid', marginBottom: 4 }}>
              <div
                style={{
                  color: 'var(--tt-comment)',
                  fontSize: 10.5,
                  letterSpacing: '.06em',
                  padding: '3px 10px',
                  textTransform: 'uppercase',
                }}
              >
                skills in {workspace}
              </div>
              <div style={{ display: 'grid', maxHeight: 260, overflowY: 'auto' }}>
              {skills.map((skill) => {
                const selected = skill.path === value.workspaceRoot;

                return (
                  <button
                    key={skill.path}
                    onClick={() => {
                      update({ workspaceRoot: skill.path ?? '' });
                      setOpenField(null);
                    }}
                    title={skill.path}
                    type="button"
                    style={{
                      alignItems: 'center',
                      background: selected ? 'var(--tt-selection)' : 'transparent',
                      border: 0,
                      borderRadius: 6,
                      cursor: 'pointer',
                      display: 'flex',
                      fontSize: 13,
                      gap: 8,
                      padding: '6px 10px',
                      textAlign: 'left',
                      width: '100%',
                    }}
                  >
                    <span
                      aria-hidden="true"
                      style={{ color: 'var(--tt-green)', flex: 'none', width: 11 }}
                    >
                      {selected ? '✓' : ''}
                    </span>
                    <span
                      style={{
                        color: selected ? 'var(--tt-fg)' : 'var(--tt-fg-dark)',
                        flex: 1,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {skill.id}
                    </span>
                    {skill.hasEvals ? (
                      <span style={{ color: 'var(--tt-green)', flex: 'none', fontSize: 11 }}>
                        evals
                      </span>
                    ) : (
                      <span style={{ color: 'var(--tt-dim)', flex: 'none', fontSize: 11 }}>
                        no evals
                      </span>
                    )}
                  </button>
                );
              })}
              </div>
            </div>
          ) : (
            <div
              style={{
                color: 'var(--tt-comment)',
                fontSize: 12,
                lineHeight: 1.5,
                padding: '6px 10px',
              }}
            >
              no skills found in this workspace — set the{' '}
              <span style={{ color: 'var(--tt-teal)' }}>dir</span> menu (top right) to a folder
              with skills.
            </div>
          )}
          <div
            style={{
              borderTop: '1px solid var(--tt-border)',
              color: 'var(--tt-fg-dark)',
              fontSize: 12,
              marginTop: 4,
              overflowWrap: 'anywhere',
              padding: '6px 10px 2px',
            }}
          >
            last run: {lastRunId ?? 'none'}
          </div>
        </FlagRow>
        <FlagRow
          label="--case"
          value={value.case}
          valueColor="var(--tt-fg-dark)"
          open={openField === 'case'}
          onToggle={() => toggleField('case')}
        >
          <OptionList
            value={value.case}
            valueColor="var(--tt-fg-dark)"
            options={caseOptions}
            onSelect={selectField('case')}
          />
        </FlagRow>
        <FlagRow
          label="--model"
          value={value.model}
          valueColor="var(--tt-blue)"
          open={openField === 'model'}
          onToggle={() => toggleField('model')}
        >
          <OptionList
            value={value.model}
            valueColor="var(--tt-blue)"
            options={models}
            onSelect={selectField('model')}
          />
        </FlagRow>
        <FlagRow
          label="--judge-model"
          value={value.judgeModel}
          valueColor="var(--tt-magenta)"
          open={openField === 'judgeModel'}
          onToggle={() => toggleField('judgeModel')}
        >
          <OptionList
            value={value.judgeModel}
            valueColor="var(--tt-magenta)"
            options={models}
            onSelect={selectField('judgeModel')}
          />
        </FlagRow>
        <FlagRow
          label="--compare"
          value={value.compare}
          valueColor={value.compare === 'off' ? 'var(--tt-comment)' : 'var(--tt-green)'}
          open={openField === 'compare'}
          onToggle={() => toggleField('compare')}
        >
          <OptionList
            value={value.compare}
            valueColor="var(--tt-green)"
            options={compareOptions}
            onSelect={selectField('compare')}
          />
        </FlagRow>
        <FlagRow
          label="--extra-skill"
          value={value.extraSkill.length > 0 ? value.extraSkill.join(', ') : '—'}
          valueColor={value.extraSkill.length > 0 ? 'var(--tt-fg-dark)' : 'var(--tt-comment)'}
          open={openField === 'extraSkill'}
          onToggle={() => toggleField('extraSkill')}
        >
          <div style={{ display: 'grid', gap: 8, padding: 5 }}>
            <input
              aria-label="Extra skill path"
              onChange={(event) => setExtraSkillDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  addExtraSkill();
                }
              }}
              placeholder="./path/to/extra-skill"
              value={extraSkillDraft}
              style={inputStyle}
            />
            <button
              onClick={addExtraSkill}
              type="button"
              style={{
                background: 'transparent',
                border: '1px dashed var(--tt-border)',
                borderRadius: 6,
                color: 'var(--tt-fg-dark)',
                cursor: 'pointer',
                fontSize: 12.5,
                padding: '7px 10px',
              }}
            >
              ＋ add distractor skill
            </button>
            {value.extraSkill.map((extraSkill) => (
              <button
                key={extraSkill}
                onClick={() => removeExtraSkill(extraSkill)}
                title="remove"
                type="button"
                style={{
                  alignItems: 'center',
                  background: 'var(--tt-selection)',
                  border: 0,
                  borderRadius: 6,
                  color: 'var(--tt-fg)',
                  cursor: 'pointer',
                  display: 'flex',
                  fontSize: 12.5,
                  gap: 8,
                  justifyContent: 'space-between',
                  padding: '7px 10px',
                }}
              >
                <span
                  style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                >
                  {extraSkill}
                </span>
                <span aria-hidden="true" style={{ color: 'var(--tt-comment)' }}>
                  ×
                </span>
              </button>
            ))}
          </div>
        </FlagRow>
        <FlagRow
          label="--iteration"
          value={String(value.iteration)}
          valueColor="var(--tt-yellow)"
          open={openField === 'iteration'}
          onToggle={() => toggleField('iteration')}
        >
          <OptionList
            value={value.iteration}
            valueColor="var(--tt-yellow)"
            options={iterationOptions}
            onSelect={selectField('iteration')}
          />
        </FlagRow>
        <FlagRow
          label="--context-mode"
          value={value.contextMode}
          valueColor="var(--tt-teal)"
          open={openField === 'contextMode'}
          onToggle={() => toggleField('contextMode')}
        >
          <OptionList
            value={value.contextMode}
            valueColor="var(--tt-teal)"
            options={contextModeOptions}
            onSelect={selectField('contextMode')}
          />
        </FlagRow>
        <FlagRow
          label="--sandbox"
          value={value.sandbox}
          valueColor={value.sandbox === 'none' ? 'var(--tt-fg-dark)' : 'var(--tt-teal)'}
          open={openField === 'sandbox'}
          onToggle={() => toggleField('sandbox')}
        >
          <OptionList
            value={value.sandbox}
            valueColor="var(--tt-teal)"
            options={sandboxOptions}
            onSelect={selectField('sandbox')}
          />
        </FlagRow>
      </div>
      <div style={{ borderTop: '1px solid var(--tt-border)', padding: '12px 14px' }}>
        <button
          onClick={handleRun}
          title={runButton.title}
          type="button"
          style={{
            alignItems: 'center',
            borderRadius: 7,
            cursor: 'pointer',
            display: 'flex',
            fontWeight: 700,
            gap: 8,
            height: 40,
            justifyContent: 'center',
            width: '100%',
            ...runButton.style,
          }}
        >
          {runButton.label}
        </button>
      </div>
    </aside>
  );
};
