import { useEffect, useRef, useState } from 'react';
import type { EnvName } from '@/persistence/preferences';
import { useSuggest } from './useSuggest';
import {
  dimensionColors,
  dimensions,
  type BehaviorDimension,
  type BehaviorRow,
  type CreateDraft,
} from './useDraft';
import { cardStyle, inputStyle, kickerStyle, legendBoxStyle, introStyle, removeGlyphStyle, titleStyle } from './stepStyles';

type StepListBehaviorsProps = {
  assistModel: string;
  draft: CreateDraft;
  env: EnvName;
  onAddBehavior: () => void;
  onRemoveBehavior: (id: string) => void;
  onSkill: (skill: string) => void;
  onUpdateBehavior: (id: string, patch: Partial<Omit<BehaviorRow, 'id'>>) => void;
};

const dimensionLegend: Array<{ dim: string; copy: string }> = [
  { dim: 'outcome', copy: "the task completes and the right artifact exists — the one you can't skip" },
  { dim: 'process', copy: 'it triggered the skill and took the intended steps, not a lucky shortcut' },
  { dim: 'style', copy: 'the output follows the conventions the skill promises' },
  { dim: 'efficiency', copy: 'it got there without thrashing — tool calls and tokens in bounds' },
];

export const StepListBehaviors = ({
  assistModel,
  draft,
  env,
  onAddBehavior,
  onRemoveBehavior,
  onSkill,
  onUpdateBehavior,
}: StepListBehaviorsProps) => {
  const { error, pendingKey, suggestBehavior, suggestDimension } = useSuggest(
    env === 'localhost',
    assistModel,
  );
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const [pendingInsert, setPendingInsert] = useState<{
    before: string[];
    dim: BehaviorDimension;
    text: string;
  } | null>(null);

  useEffect(() => {
    if (!pendingInsert) {
      return;
    }

    const inserted = draft.behaviors.find(
      (behavior) => !pendingInsert.before.includes(behavior.id),
    );
    if (inserted) {
      onUpdateBehavior(inserted.id, {
        text: pendingInsert.text,
        dim: pendingInsert.dim,
      });
      setPendingInsert(null);
    }
  }, [draft.behaviors, onUpdateBehavior, pendingInsert]);

  const handleSuggest = () => {
    void suggestBehavior({
      existing: draft.behaviors.map((behavior) => behavior.text).filter(Boolean),
      skill: draft.skill,
    })
      .then((suggestion) => {
        setPendingInsert({
          before: draftRef.current.behaviors.map((behavior) => behavior.id),
          ...suggestion,
        });
        onAddBehavior();
      })
      .catch(() => undefined);
  };

  return (
    <div>
    <div style={kickerStyle}>step 01</div>
    <h1 style={titleStyle}>List the behaviors that matter</h1>
    <p style={introStyle}>
      start from what the skill promises. write each must-pass behavior in plain language, and
      tag the dimension it lives in. you'll turn these into test cases next — no eval syntax
      yet.
    </p>

    <div aria-label="behavior dimensions" style={legendBoxStyle}>
      {dimensionLegend.map((entry) => (
        <div key={entry.dim} style={{ display: 'flex', gap: 10 }}>
          <span
            style={{
              color: dimensionColors[entry.dim as keyof typeof dimensionColors],
              flex: 'none',
              fontWeight: 700,
              width: 76,
            }}
          >
            {entry.dim}
          </span>
          <span style={{ color: 'var(--tt-comment)' }}>{entry.copy}</span>
        </div>
      ))}
    </div>

    <div style={{ alignItems: 'center', display: 'flex', gap: 10, marginBottom: 22 }}>
      <span style={{ color: 'var(--tt-comment)', fontSize: 12 }}>skill</span>
      <span style={{ color: 'var(--tt-teal)', fontSize: 13 }}>./skills/</span>
      <input
        aria-label="skill name"
        onChange={(event) => onSkill(event.target.value)}
        style={{ ...inputStyle, flex: 1 }}
        value={draft.skill}
      />
    </div>

    <div
      style={{
        color: 'var(--tt-cyan)',
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: '.05em',
        marginBottom: 10,
        textTransform: 'uppercase',
      }}
    >
      behaviors
    </div>

    {draft.behaviors.map((behavior) => (
      <div key={behavior.id} style={{ ...cardStyle, marginBottom: 10 }}>
        <div style={{ alignItems: 'center', display: 'flex', gap: 10, marginBottom: 10 }}>
          <input
            aria-label="behavior description"
            onChange={(event) => onUpdateBehavior(behavior.id, { text: event.target.value })}
            placeholder="e.g. configures semantic-release with the conventional preset"
            style={{ ...inputStyle, flex: 1, minWidth: 0 }}
            value={behavior.text}
          />
          {draft.behaviors.length > 1 ? (
            <button
              aria-label="remove behavior"
              onClick={() => onRemoveBehavior(behavior.id)}
              style={removeGlyphStyle}
              type="button"
            >
              ×
            </button>
          ) : null}
        </div>
        <div style={{ alignItems: 'center', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {dimensions.map((dim) => {
            const active = behavior.dim === dim;
            const color = dimensionColors[dim];

            return (
              <button
                aria-pressed={active}
                key={dim}
                onClick={() => onUpdateBehavior(behavior.id, { dim })}
                type="button"
                style={{
                  background: active ? color : 'transparent',
                  border: `1px solid ${color}`,
                  borderRadius: 5,
                  color: active ? 'var(--tt-bg-dark)' : color,
                  cursor: 'pointer',
                  fontSize: 11.5,
                  padding: '3px 10px',
                }}
              >
                {dim}
              </button>
            );
          })}
          {env === 'localhost' && behavior.text.trim() ? (
            <button
              disabled={pendingKey !== null}
              onClick={() => {
                void suggestDimension({
                  behavior: behavior.text,
                  rowId: behavior.id,
                  skill: draft.skill,
                })
                  .then((dim) => onUpdateBehavior(behavior.id, { dim }))
                  .catch(() => undefined);
              }}
              type="button"
              style={{
                background: 'transparent',
                border: 0,
                color: 'var(--tt-yellow)',
                cursor: pendingKey === `dimension:${behavior.id}` ? 'wait' : 'pointer',
                fontSize: 12,
                marginLeft: 4,
                padding: 0,
              }}
              title="classify dimension with LLM"
            >
              {pendingKey === `dimension:${behavior.id}` ? '◌' : '✦'}
            </button>
          ) : null}
        </div>
      </div>
    ))}

    {draft.behaviors.length === 0 ? (
      <div
        style={{
          border: '1px dashed var(--tt-border)',
          borderRadius: 8,
          color: 'var(--tt-comment)',
          fontSize: 12.5,
          lineHeight: 1.55,
          marginBottom: 10,
          padding: 16,
          textAlign: 'center',
        }}
      >
        no behaviors yet —{' '}
        {env === 'localhost' ? 'generate from a skill above, or ' : ''}
        add your first below.
      </div>
    ) : null}

      <div style={{ alignItems: 'center', display: 'flex', flexWrap: 'wrap', gap: 14 }}>
        <button
          onClick={onAddBehavior}
          type="button"
          style={{
            alignItems: 'center',
            background: 'transparent',
            border: '1px dashed var(--tt-border)',
            borderRadius: 7,
            color: 'var(--tt-fg-dark)',
            cursor: 'pointer',
            display: 'inline-flex',
            fontSize: 12.5,
            gap: 7,
            padding: '8px 13px',
          }}
        >
          ＋ add behavior
        </button>
        {env === 'localhost' ? (
          <button
            disabled={pendingKey === 'behavior' || Boolean(pendingInsert)}
            onClick={handleSuggest}
            type="button"
            style={{
              background: 'transparent',
              border: 0,
              color: 'var(--tt-yellow)',
              cursor: pendingKey === 'behavior' || pendingInsert ? 'wait' : 'pointer',
              fontSize: 12,
              padding: 0,
            }}
          >
            {pendingKey === 'behavior' || pendingInsert
              ? '◌ generating…'
              : '✦ suggest a behavior'}
          </button>
        ) : null}
      </div>

      {error ? (
        <div role="alert" style={{ color: 'var(--tt-red)', fontSize: 12, marginTop: 8 }}>
          {error}
        </div>
      ) : null}
    </div>
  );
};
